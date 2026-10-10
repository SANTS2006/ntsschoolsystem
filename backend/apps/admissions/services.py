from django.db import IntegrityError, transaction
from django.utils import timezone

from apps.audit.services import log_action
from apps.authorization.services import assign_role
from apps.tenants.services import generate_default_password

from .emails import (
    send_application_accepted_staff_email,
    send_application_accepted_student_email,
    send_application_rejected_email,
    send_interview_invite_email,
)
from .models import Application, ApplicationDocument


class ApplicationAcceptError(Exception):
    """Raised when one application in a bulk-accept batch can't be accepted as submitted (missing
    a required applied-for class/role, or its email collides with an existing account) — the
    caller (ApplicationViewSet.bulk_accept) catches this per-application and keeps processing the
    rest of the batch, the same skip-and-report shape as
    apps.finance.services.generate_invoices_from_structure."""


def apply_url(school, request=None) -> str:
    """The link to hand out for this school's public application form."""
    from apps.common.email import frontend_base_url

    return f"{frontend_base_url(request).rstrip('/')}/{school.slug}/apply"


def submit_application(*, school, kind, documents=None, custom_files=None, **fields) -> Application:
    """The public, unauthenticated entry point — `school` is resolved explicitly by the view (see
    PublicApplyView), never read off a request.user, since there isn't one."""
    application = Application.objects.create(school=school, kind=kind, **fields)
    for upload in documents or []:
        ApplicationDocument.objects.create(
            school=school, application=application, title=upload.name, file=upload
        )
    # Files answering the school's own "file upload" questions: titled by the question they answer.
    for key, (label, uploads) in (custom_files or {}).items():
        for upload in uploads:
            ApplicationDocument.objects.create(
                school=school, application=application, title=f"{label}: {upload.name}"[:200],
                question_key=key, file=upload,
            )
    return application


def shortlist_applications(application_ids, *, school):
    applications = list(Application.unscoped_objects.filter(school=school, pk__in=application_ids))
    for application in applications:
        application.status = Application.Status.SHORTLISTED
        application.save(update_fields=["status"])
    return applications


def invite_applications_to_interview(application_ids, *, school, interview_datetime, location, notes, request=None):
    applications = list(Application.unscoped_objects.filter(school=school, pk__in=application_ids))
    for application in applications:
        application.interview_datetime = interview_datetime
        application.interview_location = location
        application.interview_notes = notes
        application.status = Application.Status.INTERVIEW_SCHEDULED
        application.save(
            update_fields=["interview_datetime", "interview_location", "interview_notes", "status"]
        )
        send_interview_invite_email(application=application, request=request)
    return applications


def reject_applications(application_ids, *, school, reason, actor):
    applications = list(Application.unscoped_objects.filter(school=school, pk__in=application_ids))
    for application in applications:
        application.status = Application.Status.REJECTED
        application.rejection_reason = reason
        application.reviewed_by = actor
        application.decided_at = timezone.now()
        application.save(update_fields=["status", "rejection_reason", "reviewed_by", "decided_at"])
        send_application_rejected_email(application=application, request=None)
    return applications


def _create_user_without_email(*, email, first_name, last_name, school):
    """Mirrors the account-creation half of apps.users.services.invite_user, deliberately without
    calling it directly — invite_user sends its own "your account is ready" email, but the
    acceptance flow needs ONE combined "you're accepted, here are your sign-in details" email
    (see apps.admissions.emails), not two separate emails for the same event."""
    from apps.users.models import User

    password = generate_default_password(school)
    user = User.objects.create(
        email=email, first_name=first_name, last_name=last_name, school=school,
        user_type=User.UserType.SCHOOL_USER, is_active=True,
    )
    user.set_password(password)
    user.must_change_password = True
    user.save(update_fields=["password", "must_change_password"])
    return user, password


def _link_guardian(application, student):
    """Turns the guardian details a student applicant gave into a Guardian record linked to the new
    student — done at acceptance, never at submission, so a rejected or abandoned application leaves
    nothing behind in the parents module. An existing guardian (same email, or same name and phone)
    is reused rather than duplicated, so a parent of two accepted siblings stays one person."""
    from apps.parents.models import Guardian, StudentGuardian

    name = (application.guardian_name or "").strip()
    email = (application.guardian_email or "").strip()
    phone = (application.guardian_phone or "").strip()
    if not (name or email or phone):
        return None

    school = application.school
    guardian = None
    if email:
        guardian = Guardian.unscoped_objects.filter(school=school, email__iexact=email).first()
    if guardian is None and name and phone:
        first, _, last = name.partition(" ")
        guardian = Guardian.unscoped_objects.filter(
            school=school, first_name__iexact=first, last_name__iexact=last.strip(), phone_number=phone
        ).first()
    if guardian is None:
        first, _, last = (name or email or "Guardian").partition(" ")
        guardian = Guardian.unscoped_objects.create(
            school=school, first_name=first[:150], last_name=last.strip()[:150], email=email, phone_number=phone[:32],
        )
    StudentGuardian.unscoped_objects.get_or_create(
        school=school, student=student, guardian=guardian,
        defaults={"relationship": StudentGuardian.Relationship.GUARDIAN, "is_primary": True},
    )
    return guardian


def _clean_number(value, label):
    number = (value or "").strip()
    if not number:
        raise ApplicationAcceptError(f"Enter the {label} first.")
    if len(number) > 50:
        raise ApplicationAcceptError(f"The {label} can be at most 50 characters.")
    return number


@transaction.atomic
def accept_student_application(application, *, actor, request=None, admission_number=None):
    from apps.students.models import Student
    from apps.students.services import provision_student_account

    if application.applying_for_class_id is None:
        raise ApplicationAcceptError("No class was specified on this application.")
    admission_number = _clean_number(admission_number, "admission number")
    taken = Student.unscoped_objects.filter(school=application.school, admission_number__iexact=admission_number).first()
    if taken is not None:
        raise ApplicationAcceptError(f'Admission number "{admission_number}" already belongs to {taken.full_name}.')

    student = Student.objects.create(
        school=application.school,
        admission_number=admission_number,
        first_name=application.first_name,
        middle_name=application.middle_name,
        last_name=application.last_name,
        date_of_birth=application.date_of_birth,
        gender=application.gender,
        address=application.address,
        previous_school=application.previous_school,
        admission_date=timezone.now().date(),
        status=Student.Status.ADMITTED,
        current_class=application.applying_for_class,
    )
    try:
        user = provision_student_account(student)
    except IntegrityError as exc:
        raise ApplicationAcceptError(
            "Could not create a sign-in account — a school-issued address for this student "
            "already exists."
        ) from exc

    _link_guardian(application, student)

    if user is not None:
        password = generate_default_password(application.school)
        send_application_accepted_student_email(
            application=application, user=user, password=password, request=request
        )

    application.status = Application.Status.ACCEPTED
    application.reviewed_by = actor
    application.decided_at = timezone.now()
    application.created_student = student
    application.save(update_fields=["status", "reviewed_by", "decided_at", "created_student"])
    log_action(
        action="admissions.application_accepted",
        actor=actor,
        school=application.school,
        entity_type="Application",
        entity_id=str(application.id),
        after={"created_student": str(student.id)},
    )
    return student


@transaction.atomic
def accept_staff_application(application, *, actor, request=None, staff_number=None):
    from apps.staff.models import Staff

    if application.applying_for_role_id is None:
        raise ApplicationAcceptError("No role was specified on this application.")
    staff_number = _clean_number(staff_number, "staff number")
    taken = Staff.unscoped_objects.filter(school=application.school, staff_id__iexact=staff_number).select_related("user").first()
    if taken is not None:
        raise ApplicationAcceptError(f'Staff number "{staff_number}" already belongs to {taken.user.full_name}.')

    try:
        user, password = _create_user_without_email(
            email=application.email,
            first_name=application.first_name,
            last_name=application.last_name,
            school=application.school,
        )
    except IntegrityError as exc:
        raise ApplicationAcceptError(
            f'An account with the email "{application.email}" already exists.'
        ) from exc

    assign_role(user=user, role=application.applying_for_role, assigned_by=actor)
    staff = Staff.objects.create(
        school=application.school,
        user=user,
        staff_id=staff_number,
        job_title=application.job_title,
        qualification=application.qualification,
        hire_date=timezone.now().date(),
        employment_status=Staff.EmploymentStatus.ACTIVE,
    )
    send_application_accepted_staff_email(
        application=application,
        user=user,
        password=password,
        role_label=application.applying_for_role.name,
        request=request,
    )

    application.status = Application.Status.ACCEPTED
    application.reviewed_by = actor
    application.decided_at = timezone.now()
    application.created_staff = staff
    application.save(update_fields=["status", "reviewed_by", "decided_at", "created_staff"])
    log_action(
        action="admissions.application_accepted",
        actor=actor,
        school=application.school,
        entity_type="Application",
        entity_id=str(application.id),
        after={"created_staff": str(staff.id)},
    )
    return staff


def accept_application(application, *, actor, request=None, number=None):
    """`number` is the admission number (student) or staff number (staff) the admin entered."""
    if application.kind == Application.Kind.STUDENT:
        return accept_student_application(application, actor=actor, request=request, admission_number=number)
    return accept_staff_application(application, actor=actor, request=request, staff_number=number)
