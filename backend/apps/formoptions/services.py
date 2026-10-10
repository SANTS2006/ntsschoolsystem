import re

from django.db import IntegrityError

from .models import FormOption
from .registry import FIELDS, OTHER_VALUE


class FormOptionError(ValueError):
    pass


def builtin_choices(field_key: str) -> list[tuple[str, str]]:
    if field_key not in FIELDS:
        raise FormOptionError("Unknown field.")
    return FIELDS[field_key]


def custom_options(school, field_key: str):
    return FormOption.unscoped_objects.filter(school=school, field_key=field_key)


def allowed_values(school, field_key: str) -> set[str]:
    return {value for value, _ in builtin_choices(field_key)} | set(
        custom_options(school, field_key).values_list("value", flat=True)
    )


def label_for(school, field_key: str, value: str) -> str:
    for builtin_value, label in builtin_choices(field_key):
        if builtin_value == value:
            return label
    option = custom_options(school, field_key).filter(value=value).first()
    return option.label if option else value.replace("_", " ").title()


def _clean_label(label: str) -> str:
    cleaned = re.sub(r"\s+", " ", label or "").strip()
    return cleaned[:1].upper() + cleaned[1:]


def _slug(label: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_")[:60]


def add_option(*, school, field_key: str, label: str, user=None) -> tuple[str, str]:
    """Adds a choice to a school's dropdown and returns its `(value, label)`. Typing something that
    already exists (a built-in, or an earlier addition — compared ignoring case and spacing) just
    returns that existing choice rather than creating a near-duplicate."""
    builtins = builtin_choices(field_key)
    label = _clean_label(label)
    if not label or len(label) > 100:
        raise FormOptionError("Enter a name of up to 100 characters.")
    value = _slug(label)
    if not value:
        raise FormOptionError("Use letters or numbers in the name.")

    for builtin_value, builtin_label in builtins:
        if builtin_value != OTHER_VALUE and value in (builtin_value, _slug(builtin_label)):
            return builtin_value, builtin_label
    if value == OTHER_VALUE:
        raise FormOptionError('"Other" is already an option — enter a more specific name.')

    existing = custom_options(school, field_key).filter(value=value).first()
    if existing:
        return existing.value, existing.label
    try:
        option = FormOption.unscoped_objects.create(
            school=school, field_key=field_key, value=value, label=label, created_by=user
        )
    except IntegrityError:  # two people added the same one at the same moment
        option = custom_options(school, field_key).get(value=value)
    return option.value, option.label
