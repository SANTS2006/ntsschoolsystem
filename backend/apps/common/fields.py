import os

from rest_framework import serializers

from .storage import shorten_filename


class ShortNameFileField(serializers.FileField):
    """DRF's FileField rejects an upload whose *filename* is longer than the model column
    ("Ensure this filename has at most 100 characters") — and phone cameras, messaging apps and
    cloud-drive downloads routinely produce names of 100+ random characters. The name is irrelevant
    to the stored file (storage shortens it anyway, see apps.common.storage), so it is shortened
    here, before validation, instead of turning a perfectly good photo into a failed save."""

    def to_internal_value(self, data):
        name = getattr(data, "name", None)
        if name:
            data.name = shorten_filename(os.path.basename(name))
        return super().to_internal_value(data)
