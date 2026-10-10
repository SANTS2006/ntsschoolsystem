import pytest

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from tests.factories import DEFAULT_TEST_PASSWORD, SchoolFactory, UserFactory

from . import services
from .models import FormOption

pytestmark = pytest.mark.django_db


def _login(api_client, user):
    return api_client.post(
        "/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json"
    )


def _world():
    seed_permission_catalog()
    school = SchoolFactory()
    seed_default_roles_for_school(school)
    teacher = UserFactory(school=school)
    assign_role(user=teacher, role=Role.unscoped_objects.get(school=school, slug="teacher"))
    return school, teacher


class TestAddOption:
    def test_adds_a_new_choice(self):
        school = SchoolFactory()
        value, label = services.add_option(school=school, field_key="complaints.category", label="  noise   levels ")
        assert (value, label) == ("noise_levels", "Noise levels")
        assert FormOption.unscoped_objects.filter(school=school, value="noise_levels").exists()

    def test_typing_an_existing_choice_does_not_duplicate_it(self):
        school = SchoolFactory()
        assert services.add_option(school=school, field_key="complaints.category", label="facility") == ("facility", "Facility")
        first = services.add_option(school=school, field_key="events.category", label="Open Day")
        second = services.add_option(school=school, field_key="events.category", label="open  day")
        assert first == second
        assert FormOption.unscoped_objects.filter(school=school, field_key="events.category").count() == 1

    def test_other_cannot_be_added_as_a_choice(self):
        school = SchoolFactory()
        with pytest.raises(services.FormOptionError):
            services.add_option(school=school, field_key="events.category", label="Other")

    def test_unknown_field_is_rejected(self):
        with pytest.raises(services.FormOptionError):
            services.add_option(school=SchoolFactory(), field_key="students.gender", label="Whatever")

    def test_options_belong_to_one_school(self):
        a, b = SchoolFactory(), SchoolFactory()
        services.add_option(school=a, field_key="events.category", label="Open Day")
        assert "open_day" in services.allowed_values(a, "events.category")
        assert "open_day" not in services.allowed_values(b, "events.category")


class TestEndpointAndSerializers:
    def test_added_category_can_be_used_on_a_complaint_and_is_labelled(self, api_client):
        _, teacher = _world()
        _login(api_client, teacher)

        added = api_client.post("/api/v1/form-options/", {"field": "complaints.category", "label": "Canteen food"}, format="json")
        assert added.status_code == 201, added.data
        assert added.data["option"] == {"value": "canteen_food", "label": "Canteen food"}

        listed = api_client.get("/api/v1/form-options/?field=complaints.category")
        assert listed.data["options"] == [{"value": "canteen_food", "label": "Canteen food"}]

        complaint = api_client.post(
            "/api/v1/complaints/",
            {"category": "canteen_food", "subject": "Cold lunch", "description": "It was cold."},
            format="json",
        )
        assert complaint.status_code == 201, complaint.data
        assert complaint.data["category"] == "canteen_food"
        assert complaint.data["category_label"] == "Canteen food"

    def test_a_value_nobody_added_is_rejected(self, api_client):
        _, teacher = _world()
        _login(api_client, teacher)
        response = api_client.post(
            "/api/v1/complaints/", {"category": "made_up", "subject": "x", "description": "y"}, format="json"
        )
        assert response.status_code == 400
        assert "category" in str(response.data)

    def test_built_in_categories_still_work_and_show_their_label(self, api_client):
        _, teacher = _world()
        _login(api_client, teacher)
        response = api_client.post(
            "/api/v1/complaints/", {"category": "facility", "subject": "x", "description": "y"}, format="json"
        )
        assert response.status_code == 201, response.data
        assert response.data["category_label"] == "Facility"

    def test_unknown_field_key_is_a_400(self, api_client):
        _, teacher = _world()
        _login(api_client, teacher)
        assert api_client.get("/api/v1/form-options/?field=nope").status_code == 400
