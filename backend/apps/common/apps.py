from django.apps import AppConfig


class CommonConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.common'
    label = 'common'

    def ready(self):
        # Every ModelSerializer that exposes a model FileField gets the filename-shortening
        # behaviour in apps.common.fields — one place, rather than editing each serializer.
        from django.db import models
        from rest_framework.serializers import ModelSerializer

        from .fields import ShortNameFileField

        ModelSerializer.serializer_field_mapping[models.FileField] = ShortNameFileField
