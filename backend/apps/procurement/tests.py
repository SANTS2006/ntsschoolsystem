import pytest

from apps.authorization.models import Role
from apps.authorization.services import assign_role, seed_default_roles_for_school, seed_permission_catalog
from apps.inventory.models import InventoryTransaction
from tests.factories import (
    DEFAULT_TEST_PASSWORD,
    InventoryItemFactory,
    PurchaseOrderFactory,
    PurchaseOrderItemFactory,
    PurchaseRequestFactory,
    PurchaseRequestItemFactory,
    SchoolFactory,
    SupplierFactory,
    UserFactory,
)

from .models import PurchaseOrder, PurchaseRequest
from .services import (
    ProcurementError,
    approve_request,
    cancel_request,
    receive_order_items,
    reject_request,
    submit_request,
)

pytestmark = pytest.mark.django_db


def _login(api_client, user):
    return api_client.post(
        "/api/v1/auth/login/", {"email": user.email, "password": DEFAULT_TEST_PASSWORD}, format="json"
    )


def _accountant():
    seed_permission_catalog()
    school = SchoolFactory()
    seed_default_roles_for_school(school)
    accountant = UserFactory(school=school)
    assign_role(user=accountant, role=Role.unscoped_objects.get(school=school, slug="accountant"))
    return school, accountant


class TestProcurementPermissions:
    def test_accountant_can_create_supplier(self, api_client):
        school, accountant = _accountant()
        _login(api_client, accountant)

        response = api_client.post("/api/v1/procurement/suppliers/", {"name": "Acme Supplies"}, format="json")
        assert response.status_code == 201

    def test_teacher_cannot_view_procurement(self, api_client):
        school, _ = _accountant()
        teacher = UserFactory(school=school)
        assign_role(user=teacher, role=Role.unscoped_objects.get(school=school, slug="teacher"))
        _login(api_client, teacher)

        response = api_client.get("/api/v1/procurement/requests/")
        assert response.status_code == 403


class TestPurchaseRequestLifecycle:
    def test_cannot_submit_empty_request(self, api_client):
        school, accountant = _accountant()
        request_obj = PurchaseRequestFactory(school=school)
        _login(api_client, accountant)

        response = api_client.post(f"/api/v1/procurement/requests/{request_obj.id}/submit/")
        assert response.status_code == 400

    def test_submit_then_approve_sets_approver_and_timestamp(self, api_client):
        school, accountant = _accountant()
        request_obj = PurchaseRequestFactory(school=school)
        PurchaseRequestItemFactory(school=school, request=request_obj)
        _login(api_client, accountant)

        submit_response = api_client.post(f"/api/v1/procurement/requests/{request_obj.id}/submit/")
        assert submit_response.status_code == 200
        assert submit_response.data["request"]["status"] == "submitted"

        approve_response = api_client.post(f"/api/v1/procurement/requests/{request_obj.id}/approve/")
        assert approve_response.status_code == 200
        assert approve_response.data["request"]["status"] == "approved"
        assert approve_response.data["request"]["approved_by_name"] == accountant.full_name
        assert approve_response.data["request"]["approved_at"] is not None

    def test_reject_requires_reason(self, api_client):
        school, accountant = _accountant()
        request_obj = PurchaseRequestFactory(school=school, status=PurchaseRequest.Status.SUBMITTED)
        _login(api_client, accountant)

        response = api_client.post(f"/api/v1/procurement/requests/{request_obj.id}/reject/", {}, format="json")
        assert response.status_code == 400

        response = api_client.post(
            f"/api/v1/procurement/requests/{request_obj.id}/reject/",
            {"reason": "Not in budget this term"},
            format="json",
        )
        assert response.status_code == 200
        assert response.data["request"]["status"] == "rejected"

    def test_cannot_approve_a_draft_request(self, api_client):
        school, accountant = _accountant()
        request_obj = PurchaseRequestFactory(school=school)  # still draft
        _login(api_client, accountant)

        response = api_client.post(f"/api/v1/procurement/requests/{request_obj.id}/approve/")
        assert response.status_code == 400

    def test_cannot_cancel_an_approved_request(self, api_client):
        school, accountant = _accountant()
        request_obj = PurchaseRequestFactory(school=school, status=PurchaseRequest.Status.APPROVED)
        _login(api_client, accountant)

        response = api_client.post(f"/api/v1/procurement/requests/{request_obj.id}/cancel/")
        assert response.status_code == 400


class TestPurchaseOrderCreation:
    def test_cannot_reference_another_schools_supplier(self, api_client):
        school, accountant = _accountant()
        other_school = SchoolFactory()
        foreign_supplier = SupplierFactory(school=other_school)
        _login(api_client, accountant)

        response = api_client.post(
            "/api/v1/procurement/orders/",
            {"order_number": "PO-0001", "supplier": str(foreign_supplier.id)},
            format="json",
        )
        assert response.status_code == 400

    def test_source_request_must_be_approved(self, api_client):
        school, accountant = _accountant()
        supplier = SupplierFactory(school=school)
        draft_request = PurchaseRequestFactory(school=school)  # not approved
        _login(api_client, accountant)

        response = api_client.post(
            "/api/v1/procurement/orders/",
            {"order_number": "PO-0001", "supplier": str(supplier.id), "source_request": str(draft_request.id)},
            format="json",
        )
        assert response.status_code == 400


class TestPurchaseOrderItemsAndTotal:
    def test_adding_items_recalculates_order_total(self, api_client):
        school, accountant = _accountant()
        order = PurchaseOrderFactory(school=school)
        _login(api_client, accountant)

        api_client.post(
            "/api/v1/procurement/order-items/",
            {"order": str(order.id), "description": "Chairs", "quantity_ordered": 10, "unit_price": "15.00"},
            format="json",
        )
        api_client.post(
            "/api/v1/procurement/order-items/",
            {"order": str(order.id), "description": "Tables", "quantity_ordered": 2, "unit_price": "80.00"},
            format="json",
        )

        response = api_client.get(f"/api/v1/procurement/orders/{order.id}/")
        assert response.data["total_amount"] == "310.00"

    def test_cannot_add_items_to_a_sent_order(self, api_client):
        school, accountant = _accountant()
        order = PurchaseOrderFactory(school=school, status=PurchaseOrder.Status.SENT)
        _login(api_client, accountant)

        response = api_client.post(
            "/api/v1/procurement/order-items/",
            {"order": str(order.id), "description": "Chairs", "quantity_ordered": 10, "unit_price": "15.00"},
            format="json",
        )
        assert response.status_code == 400


class TestReceivingOrders:
    def test_receive_updates_quantities_inventory_and_status(self, api_client):
        school, accountant = _accountant()
        inventory_item = InventoryItemFactory(school=school, quantity_in_stock=0)
        order = PurchaseOrderFactory(school=school, status=PurchaseOrder.Status.SENT)
        line_item = PurchaseOrderItemFactory(
            school=school, order=order, inventory_item=inventory_item, quantity_ordered=10
        )
        _login(api_client, accountant)

        response = api_client.post(
            f"/api/v1/procurement/orders/{order.id}/receive/",
            {"receipts": [{"item_id": str(line_item.id), "quantity": 6}]},
            format="json",
        )

        assert response.status_code == 200
        assert response.data["order"]["status"] == "partially_received"
        inventory_item.refresh_from_db()
        assert inventory_item.quantity_in_stock == 6
        assert InventoryTransaction.unscoped_objects.filter(
            item=inventory_item, transaction_type=InventoryTransaction.TransactionType.STOCK_IN, quantity=6
        ).exists()

        response = api_client.post(
            f"/api/v1/procurement/orders/{order.id}/receive/",
            {"receipts": [{"item_id": str(line_item.id), "quantity": 4}]},
            format="json",
        )
        assert response.status_code == 200
        assert response.data["order"]["status"] == "received"
        inventory_item.refresh_from_db()
        assert inventory_item.quantity_in_stock == 10

    def test_cannot_receive_more_than_ordered(self, api_client):
        school, accountant = _accountant()
        order = PurchaseOrderFactory(school=school, status=PurchaseOrder.Status.SENT)
        line_item = PurchaseOrderItemFactory(school=school, order=order, quantity_ordered=5)
        _login(api_client, accountant)

        response = api_client.post(
            f"/api/v1/procurement/orders/{order.id}/receive/",
            {"receipts": [{"item_id": str(line_item.id), "quantity": 10}]},
            format="json",
        )
        assert response.status_code == 400
        assert "only 5 remaining" in response.data["message"]


class TestProcurementServicesDirect:
    """Mirrors the Phase 9-13 regression-test pattern: the service functions must work
    when called directly, outside any request context."""

    def test_submit_approve_reject_cancel_transitions(self):
        school = SchoolFactory()
        approver = UserFactory(school=school)

        request_obj = PurchaseRequestFactory(school=school)
        PurchaseRequestItemFactory(school=school, request=request_obj)
        submit_request(request_obj)
        assert request_obj.status == PurchaseRequest.Status.SUBMITTED

        approve_request(request_obj, approved_by=approver)
        assert request_obj.status == PurchaseRequest.Status.APPROVED
        assert request_obj.approved_by_id == approver.id

        other_request = PurchaseRequestFactory(school=school, status=PurchaseRequest.Status.SUBMITTED)
        reject_request(other_request, rejected_by=approver, reason="Too expensive")
        assert other_request.status == PurchaseRequest.Status.REJECTED

        draft_request = PurchaseRequestFactory(school=school)
        cancel_request(draft_request)
        assert draft_request.status == PurchaseRequest.Status.CANCELLED

    def test_receive_order_items_raises_on_over_receipt(self):
        school = SchoolFactory()
        order = PurchaseOrderFactory(school=school, status=PurchaseOrder.Status.SENT)
        line_item = PurchaseOrderItemFactory(school=school, order=order, quantity_ordered=3)

        with pytest.raises(ProcurementError):
            receive_order_items(order, receipts=[{"item_id": line_item.id, "quantity": 5}])

        line_item.refresh_from_db()
        assert line_item.quantity_received == 0


class TestProcurementTenantIsolation:
    def test_cannot_list_another_schools_requests(self, api_client):
        school_a, accountant_a = _accountant()
        school_b, _ = _accountant()
        PurchaseRequestFactory(school=school_b)
        request_a = PurchaseRequestFactory(school=school_a)

        _login(api_client, accountant_a)
        response = api_client.get("/api/v1/procurement/requests/")

        assert response.status_code == 200
        ids_seen = {row["id"] for row in response.data["results"]}
        assert str(request_a.id) in ids_seen
        assert len(ids_seen) == 1
