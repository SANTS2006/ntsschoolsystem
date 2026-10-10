"""Backup encryption at rest.

A backup file is a sequence of independently encrypted 1 MB chunks (Fernet: AES-128-CBC + HMAC-SHA256), so a large
database is encrypted and decrypted as a stream instead of being held in memory. The key comes only from the
BACKUP_ENCRYPTION_KEY environment variable — never from code and never from the database — and without it a
production server refuses to create a backup at all."""

import base64
import struct
from collections.abc import Iterable, Iterator
from pathlib import Path

from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from django.conf import settings

MAGIC = b"NTSBK1"
PLAIN_CHUNK = 1024 * 1024


class BackupCryptoError(Exception):
    pass


def _fernet() -> Fernet:
    secret = settings.BACKUP_ENCRYPTION_KEY
    if not secret:
        if settings.DEBUG:
            # Development/tests only: derive a key so the feature can be tried without setup.
            secret = settings.SECRET_KEY
        else:
            raise BackupCryptoError("BACKUP_ENCRYPTION_KEY is not set, so backups cannot be created or read.")
    key = HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=b"nts-backup-encryption").derive(secret.encode())
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt_file(source: Path, destination: Path) -> None:
    fernet = _fernet()
    with open(source, "rb") as src, open(destination, "wb") as out:
        out.write(MAGIC)
        while chunk := src.read(PLAIN_CHUNK):
            token = fernet.encrypt(chunk)
            out.write(struct.pack(">I", len(token)))
            out.write(token)


def decrypt_stream(chunks: Iterable[bytes]) -> Iterator[bytes]:
    """Decrypts an encrypted backup arriving in arbitrary-sized pieces. Raises BackupCryptoError on a wrong key, a
    tampered or truncated file."""
    fernet = _fernet()
    buffer = bytearray()
    header_checked = False
    for piece in chunks:
        buffer.extend(piece)
        if not header_checked:
            if len(buffer) < len(MAGIC):
                continue
            if bytes(buffer[: len(MAGIC)]) != MAGIC:
                raise BackupCryptoError("This is not a recognised backup file.")
            del buffer[: len(MAGIC)]
            header_checked = True
        while len(buffer) >= 4:
            (length,) = struct.unpack(">I", bytes(buffer[:4]))
            if len(buffer) < 4 + length:
                break
            token = bytes(buffer[4 : 4 + length])
            del buffer[: 4 + length]
            try:
                yield fernet.decrypt(token)
            except InvalidToken as exc:
                raise BackupCryptoError("The backup could not be decrypted (wrong key, or the file was altered).") from exc
    if not header_checked or buffer:
        raise BackupCryptoError("The backup file is incomplete.")
