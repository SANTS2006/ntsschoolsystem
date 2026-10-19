"""Whether an account has been blocked from the system by the school (a student whose login access was revoked)."""


def student_access_revoked(user) -> bool:
    if user is None or getattr(user, "school_id", None) is None:
        return False
    from apps.students.models import Student

    return Student.unscoped_objects.filter(user_id=user.pk, access_revoked=True).exists()
