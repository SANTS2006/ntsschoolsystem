import os

from cloudinary_storage.storage import RawMediaCloudinaryStorage
from django.core.files.storage import FileSystemStorage

# A FileField column is varchar(100) by default and holds "<upload_to>/<name>". Phone cameras and
# messaging apps produce names of 100+ random characters, and Cloudinary then appends its own
# random suffix to whatever it is given — so a perfectly valid photo could overflow the column and
# fail the whole save (the symptom: the Save/Upload spinner stops with nothing stored, or "Upload
# failed"). Shortening the stored name up front keeps every upload comfortably inside the column.
MAX_STEM_LENGTH = 40


def shorten_filename(name: str, max_stem: int = MAX_STEM_LENGTH) -> str:
    stem, ext = os.path.splitext(name)
    return f"{stem[:max_stem]}{ext[:12]}"


class ShortFilenameMixin:
    def get_valid_name(self, name):
        return shorten_filename(super().get_valid_name(name))


class ShortNameFileSystemStorage(ShortFilenameMixin, FileSystemStorage):
    pass


class ShortNameRawMediaCloudinaryStorage(ShortFilenameMixin, RawMediaCloudinaryStorage):
    pass
