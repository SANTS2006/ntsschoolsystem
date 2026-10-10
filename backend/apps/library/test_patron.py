import pytest

from apps.authorization.models import Role, RolePermission
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from apps.library.models import BookCopy, BookLoan
from apps.notifications.models import Notification
from tests.factories import DEFAULT_TEST_PASSWORD, SchoolFactory, StaffFactory, StudentFactory, UserFactory

pytestmark = pytest.mark.django_db

BASE = "/api/v1/library"


def _login(api_client, user):
    return api_client.post("/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json")


@pytest.fixture
def world(settings):
    settings.BACKGROUND_TASKS_ASYNC = False
    seed_permission_catalog()
    school = SchoolFactory()
    seed_default_roles_for_school(school)
    principal = UserFactory(school=school)
    assign_role(user=principal, role=Role.unscoped_objects.get(school=school, slug="principal"))
    student = StudentFactory(school=school, status="active")
    student.user = UserFactory(school=school)
    student.save(update_fields=["user"])
    assign_role(user=student.user, role=Role.unscoped_objects.get(school=school, slug="student"))
    teacher = StaffFactory(school=school)
    assign_role(user=teacher.user, role=Role.unscoped_objects.get(school=school, slug="teacher"))
    return dict(school=school, principal=principal, student=student, teacher=teacher)


def _add_book(api_client, w, **extra):
    _login(api_client, w["principal"])
    r = api_client.post(f"{BASE}/books/", {"title": "Physics 101", **extra}, format="json")
    assert r.status_code == 201, r.data
    return r.data["id"]


def test_adding_a_book_creates_its_copies_with_custom_and_generated_numbers(api_client, world):
    book = _add_book(api_client, world, copy_count=3, copy_numbers=["PH-A", "PH-B"])
    numbers = sorted(BookCopy.unscoped_objects.filter(book_id=book).values_list("copy_number", flat=True))
    assert len(numbers) == 3 and "PH-A" in numbers and "PH-B" in numbers
    dup = api_client.post(f"{BASE}/books/", {"title": "X", "copy_numbers": ["A", "a"]}, format="json")
    assert dup.status_code == 400


def test_student_browses_reserves_once_and_librarian_approves_with_a_notification(api_client, world):
    book = _add_book(api_client, world, copy_count=1)
    _login(api_client, world["student"].user)
    books = api_client.get(f"{BASE}/catalog/?search=physics").data["books"]
    assert books[0]["available_copies"] == 1 and books[0]["my_reservation"] is None
    first = api_client.post(f"{BASE}/catalog/{book}/reserve/")
    assert first.status_code == 200, first.data
    assert api_client.post(f"{BASE}/catalog/{book}/reserve/").status_code == 400  # one open request per book

    _login(api_client, world["principal"])
    reservation = api_client.get(f"{BASE}/reservations/").data["results"][0]
    assert reservation["requester_name"] == world["student"].full_name
    ok = api_client.post(f"{BASE}/reservations/{reservation['id']}/approve/", {"note": "Collect on Monday"}, format="json")
    assert ok.status_code == 200, ok.data
    assert Notification.unscoped_objects.filter(recipient=world["student"].user, title__startswith="Reservation approved").exists()
    again = api_client.post(f"{BASE}/reservations/{reservation['id']}/reject/", {}, format="json")
    assert again.status_code == 400  # already decided


def test_rejection_is_sent_with_the_reason(api_client, world):
    book = _add_book(api_client, world, copy_count=1)
    _login(api_client, world["teacher"].user)
    api_client.post(f"{BASE}/catalog/{book}/reserve/")
    _login(api_client, world["principal"])
    rid = api_client.get(f"{BASE}/reservations/").data["results"][0]["id"]
    api_client.post(f"{BASE}/reservations/{rid}/reject/", {"note": "Reference copy"}, format="json")
    note = Notification.unscoped_objects.get(recipient=world["teacher"].user, title__startswith="Reservation not approved")
    assert "Reference copy" in note.message


def test_borrowing_takes_a_copy_and_is_limited(api_client, world):
    book = _add_book(api_client, world, copy_count=5)
    _login(api_client, world["student"].user)
    for _ in range(3):
        assert api_client.post(f"{BASE}/catalog/{book}/borrow/").status_code == 200
    assert api_client.post(f"{BASE}/catalog/{book}/borrow/").status_code == 400  # three at a time
    assert BookLoan.unscoped_objects.filter(student=world["student"]).count() == 3
    mine = api_client.get(f"{BASE}/my/").data
    assert len(mine["loans"]) == 3


def test_people_only_see_their_own_library_activity_and_need_the_permission(api_client, world):
    book = _add_book(api_client, world, copy_count=2)
    _login(api_client, world["student"].user)
    api_client.post(f"{BASE}/catalog/{book}/reserve/")
    _login(api_client, world["teacher"].user)
    assert api_client.get(f"{BASE}/my/").data["reservations"] == []
    role = Role.unscoped_objects.get(school=world["school"], slug="teacher")
    RolePermission.unscoped_objects.filter(role=role, permission__code="library.borrow").delete()
    assert api_client.get(f"{BASE}/catalog/").status_code == 403
