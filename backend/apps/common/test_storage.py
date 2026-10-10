from apps.common.storage import ShortNameFileSystemStorage, ShortNameRawMediaCloudinaryStorage, shorten_filename

LONG_NAME = "c5LbKLbAGDZN4rjtRnVY6E1OcF8EbDVGYMFOabcdefghijklmnopqrstuvwxyz0123456789Q4fDakpSSs64NhExFKCqgINbVYu1uplYJI.jpg"


def test_shorten_keeps_the_extension_and_caps_the_stem():
    short = shorten_filename(LONG_NAME)
    assert short.endswith(".jpg")
    assert len(short) == 40 + len(".jpg")


def test_short_names_are_untouched():
    assert shorten_filename("report.pdf") == "report.pdf"


def test_both_storage_backends_keep_stored_paths_well_inside_a_varchar_100_column():
    for storage_class in (ShortNameFileSystemStorage, ShortNameRawMediaCloudinaryStorage):
        stored = storage_class().generate_filename("event_media/" + LONG_NAME)
        # leaves room for Cloudinary's own random suffix on top of the 100-char default column
        assert len(stored) < 70
        assert stored.endswith(".jpg")


def test_a_model_file_field_accepts_an_upload_with_a_very_long_filename():
    """Regression: the API answered 400 'Ensure this filename has at most 100 characters (it has 137)'
    for a phone-camera photo, which the forms surfaced as 'Upload failed' / a save that did nothing."""
    from django.core.files.uploadedfile import SimpleUploadedFile
    from rest_framework import serializers

    from apps.communications.models import Announcement

    class _S(serializers.ModelSerializer):
        class Meta:
            model = Announcement
            fields = ["image"]

    long_name = "IEVR40XVGzzFF5nZ9FapM8kTVrqxKBzC0Z" + "x" * 70 + "0kQBslg-vjMpogHWZWfoDHO3wHOdU.jpg"
    upload = SimpleUploadedFile(long_name, b"fake jpg bytes", content_type="image/jpeg")

    serializer = _S(data={"image": upload})

    assert serializer.is_valid(), serializer.errors
    assert serializer.validated_data["image"].name.endswith(".jpg")
    assert len(serializer.validated_data["image"].name) < 60
