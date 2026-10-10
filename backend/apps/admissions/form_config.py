"""What the public application form asks for, per school and per kind of applicant.

A school's admin picks which of the standard questions appear and which are mandatory, and can add
questions of their own; what isn't customised behaves exactly as the form always has (see
`DEFAULT_REQUIRED`). The first/last name, email and the class/role being applied for are *locked*:
every application needs them to be reviewed and, on acceptance, turned into a student/staff record."""

import secrets

from .models import Application, ApplicationFormConfig

_BASE = [
    {"key": "first_name", "label": "First name", "type": "text", "locked": True},
    {"key": "middle_name", "label": "Middle name", "type": "text"},
    {"key": "last_name", "label": "Last name", "type": "text", "locked": True},
    {"key": "email", "label": "Email", "type": "email", "locked": True},
    {"key": "phone", "label": "Phone", "type": "text"},
    {"key": "date_of_birth", "label": "Date of birth", "type": "date"},
    {"key": "gender", "label": "Gender", "type": "gender"},
    {"key": "address", "label": "Address", "type": "textarea"},
]

STANDARD_FIELDS: dict[str, list[dict]] = {
    Application.Kind.STUDENT: _BASE + [
        {"key": "applying_for_class", "label": "Applying for class", "type": "class", "locked": True},
        {"key": "previous_school", "label": "Previous school", "type": "text"},
        {"key": "guardian_name", "label": "Guardian name", "type": "text"},
        {"key": "guardian_phone", "label": "Guardian phone", "type": "text"},
        {"key": "guardian_email", "label": "Guardian email", "type": "email"},
        {"key": "documents", "label": "Supporting documents", "type": "files"},
    ],
    Application.Kind.STAFF: _BASE + [
        {"key": "applying_for_role", "label": "Applying for role", "type": "role", "locked": True},
        {"key": "job_title", "label": "Job title", "type": "text"},
        {"key": "qualification", "label": "Qualification", "type": "text"},
        {"key": "years_of_experience", "label": "Years of experience", "type": "number"},
        {"key": "documents", "label": "Supporting documents", "type": "files"},
    ],
}

# Mandatory unless the school says otherwise — and for the locked fields, always.
DEFAULT_REQUIRED = {"first_name", "last_name", "email", "applying_for_class", "applying_for_role"}

# What an admin can ask for beyond the standard questions. "select" is a dropdown, "radio" shows all
# the choices at once for picking one, "multiselect" lets the applicant tick several, "checkbox" is a
# single yes/no tick (e.g. "I agree"), and "file" asks for an upload.
CUSTOM_TYPES = {"text", "textarea", "number", "date", "email", "phone", "select", "radio", "multiselect", "checkbox", "file"}
CHOICE_TYPES = {"select", "radio", "multiselect"}
MAX_CUSTOM_FIELDS = 20


class FormConfigError(ValueError):
    pass


def _stored(school, kind) -> ApplicationFormConfig | None:
    return ApplicationFormConfig.unscoped_objects.filter(school=school, kind=kind).first()


def effective_config(school, kind: str) -> dict:
    """The full form definition for one kind of applicant, with the school's choices applied:
    `fields` is every standard question with `enabled`/`required`, `custom_fields` the extra ones."""
    stored = _stored(school, kind)
    choices = stored.fields if stored else {}
    fields = []
    for definition in STANDARD_FIELDS[kind]:
        chosen = choices.get(definition["key"], {})
        locked = definition.get("locked", False)
        fields.append({
            **definition,
            "locked": locked,
            "enabled": True if locked else bool(chosen.get("enabled", True)),
            "required": True if locked else bool(chosen.get("required", definition["key"] in DEFAULT_REQUIRED)),
        })
    return {"kind": kind, "fields": fields, "custom_fields": list(stored.custom_fields) if stored else []}


def save_config(school, kind: str, *, fields: dict, custom_fields: list) -> dict:
    known = {d["key"]: d for d in STANDARD_FIELDS[kind]}
    cleaned_fields = {}
    for key, chosen in (fields or {}).items():
        if key not in known:
            raise FormConfigError(f'"{key}" is not a field on this form.')
        if known[key].get("locked"):
            continue  # always shown and required; nothing to store
        enabled = bool(chosen.get("enabled", True))
        cleaned_fields[key] = {"enabled": enabled, "required": bool(chosen.get("required", False)) and enabled}

    custom_fields = custom_fields or []
    if len(custom_fields) > MAX_CUSTOM_FIELDS:
        raise FormConfigError(f"A form can have at most {MAX_CUSTOM_FIELDS} extra questions.")
    cleaned_custom, seen_keys = [], set()
    for item in custom_fields:
        label = (item.get("label") or "").strip()
        field_type = item.get("type", "text")
        if not label or len(label) > 150:
            raise FormConfigError("Every extra question needs a label of up to 150 characters.")
        if field_type not in CUSTOM_TYPES:
            raise FormConfigError(f'Unknown question type "{field_type}".')
        options = []
        if field_type in CHOICE_TYPES:
            options = [str(o).strip() for o in item.get("options", []) if str(o).strip()]
            if len(options) < 2 or len(options) > 30:
                raise FormConfigError(f'"{label}" needs between 2 and 30 choices.')
        key = item.get("key") or f"q_{secrets.token_hex(4)}"
        if not key.startswith("q_") or key in seen_keys or len(key) > 20:
            raise FormConfigError("Invalid question id.")
        seen_keys.add(key)
        cleaned_custom.append({
            "key": key, "label": label, "type": field_type, "required": bool(item.get("required", False)),
            "options": options,
        })

    config, _ = ApplicationFormConfig.unscoped_objects.get_or_create(school=school, kind=kind)
    config.fields = cleaned_fields
    config.custom_fields = cleaned_custom
    config.save()
    return effective_config(school, kind)
