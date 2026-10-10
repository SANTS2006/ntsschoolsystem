import pytest

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from tests.factories import (
    DEFAULT_TEST_PASSWORD,
    AcademicYearFactory,
    AssessmentFactory,
    SchoolClassFactory,
    SchoolFactory,
    StaffFactory,
    SubjectFactory,
    SubjectOfferingFactory,
    TermFactory,
)

pytestmark = pytest.mark.django_db

BASE = "/api/v1/academics"


def _login(api_client, user):
    return api_client.post("/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json")


@pytest.fixture
def world():
    """One person who is both a teacher (of this subject) and the exams director."""
    seed_permission_catalog()
    school = SchoolFactory()
    seed_default_roles_for_school(school)
    year = AcademicYearFactory(school=school)
    term = TermFactory(school=school, academic_year=year)
    person = StaffFactory(school=school)
    assign_role(user=person.user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
    assign_role(user=person.user, role=Role.unscoped_objects.get(school=school, slug="exams-director"))
    offering = SubjectOfferingFactory(
        school=school, subject=SubjectFactory(school=school), academic_year=year, term=term,
        school_class=SchoolClassFactory(school=school), main_teacher=person,
    )
    assessment = AssessmentFactory(school=school, subject_offering=offering, weight=20, allow_file_uploads=True)
    return {"person": person, "offering": offering, "assessment": assessment}


def _as(api_client, user, role):
    _login(api_client, user)
    api_client.credentials(HTTP_X_ACTIVE_ROLE=role)


def test_working_as_teacher_they_own_the_subjects_assessments(api_client, world):
    _as(api_client, world["person"].user, "teacher")
    assert api_client.get(f"{BASE}/subject-offerings/{world['offering'].id}/").data["is_my_subject"] is True
    assert api_client.get(f"{BASE}/assessments/{world['assessment'].id}/submissions/").status_code == 200


def test_working_as_exams_director_they_have_no_teacher_powers_over_it(api_client, world):
    _as(api_client, world["person"].user, "exams-director")
    assert api_client.get(f"{BASE}/subject-offerings/{world['offering'].id}/").data["is_my_subject"] is False
    assert api_client.get(f"{BASE}/assessments/{world['assessment'].id}/submissions/").status_code == 403
    created = api_client.post(
        f"{BASE}/assessments/",
        {"subject_offering": str(world["offering"].id), "name": "Sneaky", "weight": 5, "max_score": "100"},
        format="json",
    )
    assert created.status_code == 403
    scores = api_client.post(f"{BASE}/assessments/{world['assessment'].id}/scores/", {"entries": [], "submit": False}, format="json")
    assert scores.status_code == 403
    assert api_client.patch(f"{BASE}/assessments/{world['assessment'].id}/", {"name": "x"}, format="json").status_code == 403
    assert api_client.delete(f"{BASE}/assessments/{world['assessment'].id}/").status_code == 403
    # ...but, like the school administrator, they can still see the subject's assessments and open/close its CA.
    assert api_client.get(f"{BASE}/assessments/{world['assessment'].id}/").status_code == 200
    assert api_client.post(f"{BASE}/subject-offerings/{world['offering'].id}/close-ca/").status_code == 200
