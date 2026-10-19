"""Every list endpoint's `search_fields` must be real lookups on its model — a typo only fails when someone types in the search box."""
import importlib
import inspect

import pytest
from rest_framework import viewsets

APPS = [
    "academics", "assignments", "attendance", "discipline", "documents", "examinations", "finance", "hostel", "inventory", "library",
    "live_sessions", "medical", "notifications", "procurement", "salary", "transport", "quizzes",
]


def _viewsets():
    for app in APPS:
        module = importlib.import_module(f"apps.{app}.views")
        for name, cls in inspect.getmembers(module, inspect.isclass):
            if cls.__module__ != module.__name__ or not issubclass(cls, viewsets.GenericViewSet):
                continue
            fields = getattr(cls, "search_fields", None)
            serializer = getattr(cls, "serializer_class", None)
            model = getattr(getattr(serializer, "Meta", None), "model", None)
            if fields and model is not None:
                yield pytest.param(cls, model, id=f"{app}.{name}")


@pytest.mark.django_db
@pytest.mark.parametrize("view_class, model", list(_viewsets()))
def test_search_fields_are_valid_lookups(view_class, model):
    manager = getattr(model, "unscoped_objects", model._default_manager)
    for field in view_class.search_fields:
        lookup = field.lstrip("^=@$")
        manager.filter(**{f"{lookup}__icontains": "x"}).exists()
