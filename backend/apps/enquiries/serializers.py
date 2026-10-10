from rest_framework import serializers

from .models import Enquiry

SCHOOL_TYPES = ["nursery_primary", "secondary", "tertiary", "vocational", "group", "other"]
INTERESTS = [
    "students", "admissions", "academics", "attendance", "exams", "finance", "communication", "library_hostel_transport",
    "reports", "administration", "other",
]
CONTACT_METHODS = ["email", "phone", "whatsapp"]
TOPICS = ["general", "pricing", "support", "partnership", "other"]


class EnquirySerializer(serializers.ModelSerializer):
    # A honeypot: real people never see or fill it, bots usually do.
    website = serializers.CharField(write_only=True, required=False, allow_blank=True)
    interests = serializers.ListField(child=serializers.ChoiceField(choices=INTERESTS), required=False, max_length=len(INTERESTS))
    school_type = serializers.ChoiceField(choices=SCHOOL_TYPES, required=False, allow_blank=True)
    preferred_contact = serializers.ChoiceField(choices=CONTACT_METHODS, required=False, allow_blank=True)
    topic = serializers.ChoiceField(choices=TOPICS, required=False, allow_blank=True)

    class Meta:
        model = Enquiry
        fields = [
            "kind", "name", "email", "phone", "organization", "school_type", "student_count", "interests",
            "preferred_contact", "topic", "message", "consent", "website",
        ]
        extra_kwargs = {
            "name": {"max_length": 150},
            "message": {"max_length": 4000, "allow_blank": True, "required": False},
            "phone": {"max_length": 40, "allow_blank": True, "required": False},
            "organization": {"allow_blank": True, "required": False},
            "student_count": {"allow_blank": True, "required": False},
        }

    def validate_name(self, value):
        value = " ".join(value.split())
        if len(value) < 2:
            raise serializers.ValidationError("Please enter your name.")
        return value

    def validate_consent(self, value):
        if not value:
            raise serializers.ValidationError("Please agree to the privacy notice so we can reply to you.")
        return value

    def validate_phone(self, value):
        cleaned = value.strip()
        if cleaned and not all(c.isdigit() or c in "+()- ." for c in cleaned):
            raise serializers.ValidationError("Use digits, spaces and + only.")
        return cleaned

    def validate(self, attrs):
        if attrs.get("kind") == Enquiry.Kind.DEMO and not attrs.get("organization", "").strip():
            raise serializers.ValidationError({"organization": "Tell us the name of your school or organisation."})
        if attrs.get("kind") == Enquiry.Kind.CONTACT and len(attrs.get("message", "").strip()) < 10:
            raise serializers.ValidationError({"message": "Please tell us a little more (at least a sentence)."})
        return attrs
