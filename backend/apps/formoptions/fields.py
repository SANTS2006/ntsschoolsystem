from rest_framework import serializers

from .services import allowed_values, builtin_choices, custom_options


class OptionValueField(serializers.CharField):
    """A serializer field for a dropdown that accepts the built-in choices *and* the ones the
    school added through "Other" — which a plain model `choices` field would reject. Pair it with
    `OptionLabelField` to send the human-readable name alongside the stored value."""

    def __init__(self, field_key: str, **kwargs):
        self.field_key = field_key
        kwargs.setdefault("max_length", 60)
        super().__init__(**kwargs)

    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        request = self.context.get("request")
        school = getattr(request.user, "school", None) if request else None
        if school is None or value not in allowed_values(school, self.field_key):
            raise serializers.ValidationError(f'"{value}" is not a valid choice.')
        return value


class OptionLabelField(serializers.Field):
    """`<name>_label` for an `OptionValueField`: the readable name for the stored value, resolved for
    the object's school. The school's custom labels are looked up once per request, not once per row."""

    def __init__(self, field_key: str, source_field: str, **kwargs):
        self.field_key = field_key
        self.source_field = source_field
        kwargs["source"] = "*"
        kwargs["read_only"] = True
        super().__init__(**kwargs)

    def to_representation(self, obj):
        value = getattr(obj, self.source_field, "") or ""
        cache = self.context.setdefault("_option_labels", {})
        key = (self.field_key, obj.school_id)
        if key not in cache:
            labels = dict(builtin_choices(self.field_key))
            labels.update({o.value: o.label for o in custom_options(obj.school, self.field_key)})
            cache[key] = labels
        return cache[key].get(value) or value.replace("_", " ").title()
