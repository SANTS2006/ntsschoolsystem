"""Where backup files live. One small interface, three providers.

Backups hold every school's data, so they are never put anywhere the web can serve: not under the static or media
folders, and not as public files. The files themselves are also encrypted (see `crypto.py`) before they get here."""

import os
import shutil
from abc import ABC, abstractmethod
from collections.abc import Iterator
from pathlib import Path

from django.conf import settings

CHUNK = 1024 * 1024


class BackupStorageError(Exception):
    pass


class BackupStorageProvider(ABC):
    name: str

    @abstractmethod
    def put(self, key: str, path: Path) -> None:
        """Store the local file at `path` under `key`."""

    @abstractmethod
    def stream(self, key: str) -> Iterator[bytes]:
        """The stored file's bytes, in chunks."""

    @abstractmethod
    def exists(self, key: str) -> bool: ...

    @abstractmethod
    def delete(self, key: str) -> None: ...

    def download_to(self, key: str, path: Path) -> None:
        with open(path, "wb") as out:
            for chunk in self.stream(key):
                out.write(chunk)


class LocalBackupStorage(BackupStorageProvider):
    """A folder on the server's disk. Fine for development and for a server with a persistent disk; on an ephemeral
    container (Render's free plan) the files vanish with the container, so production should use cloud storage."""

    name = "local"

    def __init__(self, root: str | Path):
        self.root = Path(root)

    def _path(self, key: str) -> Path:
        target = (self.root / key).resolve()
        if self.root.resolve() not in target.parents:
            raise BackupStorageError("Invalid backup key.")
        return target

    def put(self, key, path):
        target = self._path(key)
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, target)
        try:
            os.chmod(target, 0o600)
        except OSError:
            pass

    def stream(self, key):
        with open(self._path(key), "rb") as handle:
            while chunk := handle.read(CHUNK):
                yield chunk

    def exists(self, key):
        return self._path(key).is_file()

    def delete(self, key):
        self._path(key).unlink(missing_ok=True)


class CloudinaryBackupStorage(BackupStorageProvider):
    """Cloudinary's 'authenticated' delivery type: the file is private and can only be fetched with a signed link
    made server-side — it is never reachable from a public URL."""

    name = "cloudinary"

    def _configure(self):
        import cloudinary

        creds = settings.CLOUDINARY_STORAGE
        if not creds.get("CLOUD_NAME"):
            raise BackupStorageError("Cloudinary is not configured.")
        cloudinary.config(
            cloud_name=creds["CLOUD_NAME"], api_key=creds["API_KEY"], api_secret=creds["API_SECRET"], secure=True
        )

    def put(self, key, path):
        import cloudinary.uploader

        self._configure()
        try:
            cloudinary.uploader.upload_large(
                str(path), resource_type="raw", type="authenticated", public_id=key, overwrite=True, chunk_size=6_000_000
            )
        except Exception as exc:  # noqa: BLE001 - surfaced as a failed backup, with the reason
            raise BackupStorageError(f"Cloudinary upload failed: {exc}") from exc

    def stream(self, key):
        import cloudinary.utils
        import requests

        self._configure()
        url = cloudinary.utils.private_download_url(key, "", resource_type="raw", type="authenticated")
        response = requests.get(url, stream=True, timeout=60)
        if response.status_code != 200:
            response.close()
            raise BackupStorageError(f"Cloudinary download failed (HTTP {response.status_code}).")
        yield from response.iter_content(CHUNK)

    def exists(self, key):
        import cloudinary.api

        self._configure()
        try:
            cloudinary.api.resource(key, resource_type="raw", type="authenticated")
            return True
        except Exception:  # noqa: BLE001
            return False

    def delete(self, key):
        import cloudinary.uploader

        self._configure()
        cloudinary.uploader.destroy(key, resource_type="raw", type="authenticated", invalidate=True)


class _S3CompatibleStorage(BackupStorageProvider):
    """Shared code for any storage that speaks the S3 API: AWS S3, Cloudflare R2, Backblaze B2, MinIO. Subclasses say
    where the bucket is and which credentials to use (always from settings/environment, never from code)."""

    def _config(self) -> dict:
        raise NotImplementedError

    def _bucket(self) -> str:
        cfg = self._config()
        if not cfg["bucket"] or not cfg["access_key_id"] or not cfg["secret_access_key"]:
            raise BackupStorageError(f"{self.name} backup storage is not fully configured.")
        return cfg["bucket"]

    def _client(self):
        try:
            import boto3
            from botocore.config import Config
        except ImportError as exc:
            raise BackupStorageError("boto3 is not installed.") from exc
        cfg = self._config()
        self._bucket()
        return boto3.client(
            "s3",
            endpoint_url=cfg["endpoint_url"] or None,
            region_name=cfg["region"] or None,
            aws_access_key_id=cfg["access_key_id"],
            aws_secret_access_key=cfg["secret_access_key"],
            config=Config(
                signature_version="s3v4",
                retries={"max_attempts": 5, "mode": "standard"},
                connect_timeout=10,
                read_timeout=120,
                # Only add checksum headers where the API requires them: R2 and other S3-compatible stores reject
                # the extra trailing-checksum headers newer boto3 versions send by default.
                request_checksum_calculation="when_required",
                response_checksum_validation="when_required",
            ),
        )

    def put(self, key, path):
        from boto3.s3.transfer import TransferConfig

        try:
            # Multipart for anything large, so a big backup is uploaded in parts and retried part by part.
            self._client().upload_file(
                str(path),
                self._bucket(),
                key,
                Config=TransferConfig(multipart_threshold=16 * 1024 * 1024, multipart_chunksize=16 * 1024 * 1024),
            )
        except BackupStorageError:
            raise
        except Exception as exc:  # noqa: BLE001 - surfaced as a failed backup, with the reason
            raise BackupStorageError(f"Upload to {self.name} failed: {_short(exc)}") from exc

    def stream(self, key):
        try:
            body = self._client().get_object(Bucket=self._bucket(), Key=key)["Body"]
            yield from body.iter_chunks(CHUNK)
        except BackupStorageError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise BackupStorageError(f"Download from {self.name} failed: {_short(exc)}") from exc

    def exists(self, key):
        from botocore.exceptions import ClientError

        try:
            self._client().head_object(Bucket=self._bucket(), Key=key)
            return True
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
                return False
            raise BackupStorageError(f"Could not check {self.name}: {_short(exc)}") from exc

    def delete(self, key):
        try:
            self._client().delete_object(Bucket=self._bucket(), Key=key)
        except BackupStorageError:
            raise
        except Exception as exc:  # noqa: BLE001
            raise BackupStorageError(f"Delete from {self.name} failed: {_short(exc)}") from exc


def _short(exc: Exception) -> str:
    return " ".join(str(exc).split())[:200]


class R2BackupStorage(_S3CompatibleStorage):
    """Cloudflare R2: S3-compatible, no download fees, private by default. Needs the account id, a bucket, and an R2 API
    token (Access Key ID + Secret) with Object Read & Write on that bucket."""

    name = "r2"

    def _config(self):
        account = settings.BACKUP_R2_ACCOUNT_ID
        return {
            "bucket": settings.BACKUP_R2_BUCKET,
            "endpoint_url": f"https://{account}.r2.cloudflarestorage.com" if account else "",
            "region": "auto",
            "access_key_id": settings.BACKUP_R2_ACCESS_KEY_ID,
            "secret_access_key": settings.BACKUP_R2_SECRET_ACCESS_KEY,
        }

    def _bucket(self):
        if not settings.BACKUP_R2_ACCOUNT_ID:
            raise BackupStorageError("Cloudflare R2 backup storage is not fully configured (account id missing).")
        return super()._bucket()


class S3BackupStorage(_S3CompatibleStorage):
    """Any other S3-compatible bucket (AWS S3, Backblaze B2, MinIO) via the BACKUP_S3_* settings."""

    name = "s3"

    def _config(self):
        return {
            "bucket": settings.BACKUP_S3_BUCKET,
            "endpoint_url": settings.BACKUP_S3_ENDPOINT_URL,
            "region": settings.BACKUP_S3_REGION,
            "access_key_id": settings.BACKUP_S3_ACCESS_KEY_ID,
            "secret_access_key": settings.BACKUP_S3_SECRET_ACCESS_KEY,
        }


def get_storage(name: str | None = None) -> BackupStorageProvider:
    name = name or settings.BACKUP_STORAGE
    if name == "local":
        return LocalBackupStorage(settings.BACKUP_LOCAL_DIR)
    if name == "cloudinary":
        return CloudinaryBackupStorage()
    if name == "r2":
        return R2BackupStorage()
    if name == "s3":
        return S3BackupStorage()
    raise BackupStorageError(f"Unknown backup storage '{name}'.")
