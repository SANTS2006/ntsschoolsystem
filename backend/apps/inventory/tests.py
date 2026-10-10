import pytest

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from tests.factories import (
    DEFAULT_TEST_PASSWORD,
    InventoryCategoryFactory,
    InventoryItemFactory,
    SchoolFactory,
    UserFactory,
)

from .models import InventoryTransaction
from .services import InventoryError, record_stock_in, record_stock_out

pytestmark = pytest.mark.django_db


def _login(api_client, user):
    return api_client.post(
        "/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json"
    )


def _principal():
    seed_permission_catalog()
    school = SchoolFactory()
    seed_default_roles_for_school(school)
    principal = UserFactory(school=school)
    assign_role(user=principal, role=Role.unscoped_objects.get(school=school, slug="principal"))
    return school, principal


class TestInventoryPermissions:
    def test_principal_can_create_item(self, api_client):
        school, principal = _principal()
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/inventory/items/", {"name": "Whiteboard Markers", "unit": "box"}, format="json"
        )
        assert response.status_code == 201
        assert response.data["quantity_in_stock"] == 0

    def test_teacher_cannot_view_inventory(self, api_client):
        """inventory.* stays off every seeded role's default prefix list except principal/
        school-administrator, same as library/transport/hostel — no seeded store-keeper role."""
        school, _ = _principal()
        teacher = UserFactory(school=school)
        assign_role(user=teacher, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher)

        response = api_client.get("/api/v1/inventory/items/")
        assert response.status_code == 403


class TestInventoryItemCreation:
    def test_quantity_in_stock_is_not_client_settable(self, api_client):
        school, principal = _principal()
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/inventory/items/",
            {"name": "Chalk", "unit": "box", "quantity_in_stock": 500},
            format="json",
        )
        assert response.status_code == 201
        assert response.data["quantity_in_stock"] == 0

    def test_cannot_reference_another_schools_category(self, api_client):
        school, principal = _principal()
        other_school = SchoolFactory()
        foreign_category = InventoryCategoryFactory(school=other_school)
        _login(api_client, principal)

        response = api_client.post(
            "/api/v1/inventory/items/",
            {"name": "x", "category": str(foreign_category.id)},
            format="json",
        )
        assert response.status_code == 400


class TestStockMovements:
    def test_stock_in_increases_quantity_and_creates_transaction(self, api_client):
        school, principal = _principal()
        item = InventoryItemFactory(school=school, quantity_in_stock=10)
        _login(api_client, principal)

        response = api_client.post(
            f"/api/v1/inventory/items/{item.id}/stock_in/",
            {"quantity": 20, "reason": "Purchased new stock"},
            format="json",
        )

        assert response.status_code == 200
        assert response.data["item"]["quantity_in_stock"] == 30
        item.refresh_from_db()
        assert item.quantity_in_stock == 30
        assert InventoryTransaction.unscoped_objects.filter(
            item=item, transaction_type=InventoryTransaction.TransactionType.STOCK_IN, quantity=20
        ).exists()

    def test_stock_out_decreases_quantity_and_creates_transaction(self, api_client):
        school, principal = _principal()
        item = InventoryItemFactory(school=school, quantity_in_stock=10)
        _login(api_client, principal)

        response = api_client.post(
            f"/api/v1/inventory/items/{item.id}/stock_out/",
            {"quantity": 4, "reason": "Issued to Science Lab"},
            format="json",
        )

        assert response.status_code == 200
        assert response.data["item"]["quantity_in_stock"] == 6
        item.refresh_from_db()
        assert item.quantity_in_stock == 6

    def test_stock_out_rejects_insufficient_stock(self, api_client):
        school, principal = _principal()
        item = InventoryItemFactory(school=school, quantity_in_stock=3)
        _login(api_client, principal)

        response = api_client.post(
            f"/api/v1/inventory/items/{item.id}/stock_out/", {"quantity": 10}, format="json"
        )

        assert response.status_code == 400
        assert "Insufficient stock" in response.data["message"]
        item.refresh_from_db()
        assert item.quantity_in_stock == 3

    def test_low_stock_action_filters_correctly(self, api_client):
        school, principal = _principal()
        low_item = InventoryItemFactory(school=school, quantity_in_stock=2, reorder_level=5)
        healthy_item = InventoryItemFactory(school=school, quantity_in_stock=50, reorder_level=5)
        _login(api_client, principal)

        response = api_client.get("/api/v1/inventory/items/low_stock/")

        assert response.status_code == 200
        ids_seen = {row["id"] for row in response.data["items"]}
        assert str(low_item.id) in ids_seen
        assert str(healthy_item.id) not in ids_seen


class TestInventoryServicesDirect:
    """Mirrors the Phase 9/10 regression-test pattern: the service functions must work
    when called directly, outside any request context — they use unscoped_objects
    throughout for exactly this reason."""

    def test_record_stock_in_directly(self):
        school = SchoolFactory()
        item = InventoryItemFactory(school=school, quantity_in_stock=0)

        record_stock_in(item=item, quantity=15, reason="Initial stock")

        item.refresh_from_db()
        assert item.quantity_in_stock == 15

    def test_record_stock_out_raises_on_insufficient_stock(self):
        school = SchoolFactory()
        item = InventoryItemFactory(school=school, quantity_in_stock=2)

        with pytest.raises(InventoryError):
            record_stock_out(item=item, quantity=5)

        item.refresh_from_db()
        assert item.quantity_in_stock == 2


class TestInventoryTenantIsolation:
    def test_cannot_list_another_schools_items(self, api_client):
        school_a, principal_a = _principal()
        school_b, _ = _principal()
        InventoryItemFactory(school=school_b)
        item_a = InventoryItemFactory(school=school_a)

        _login(api_client, principal_a)
        response = api_client.get("/api/v1/inventory/items/")

        assert response.status_code == 200
        ids_seen = {row["id"] for row in response.data["results"]}
        assert str(item_a.id) in ids_seen
        assert len(ids_seen) == 1
