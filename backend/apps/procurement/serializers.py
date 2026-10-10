from rest_framework import serializers

from .models import PurchaseOrder, PurchaseOrderItem, PurchaseRequest, PurchaseRequestItem, Supplier


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = [
            "id", "name", "contact_person", "email", "phone_number", "address", "is_active",
            "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_name(self, value):
        # unique_supplier_name_per_school is a (school, X)-only UniqueConstraint — `school` is
        # never a serializer field, so DRF's automatic validator never fires. Same recurring gap
        # as every other domain's same-shaped constraint in this backend.
        school = self.context["request"].user.school
        qs = Supplier.objects.filter(school=school, name=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A supplier with this name already exists.")
        return value


def _same_school(context, value, label):
    request = context["request"]
    if value is not None and value.school_id != request.user.school_id:
        raise serializers.ValidationError(f"{label} must belong to your own school.")
    return value


class PurchaseRequestSerializer(serializers.ModelSerializer):
    requested_by_name = serializers.CharField(source="requested_by.full_name", read_only=True, default=None)
    approved_by_name = serializers.CharField(source="approved_by.full_name", read_only=True, default=None)
    item_count = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseRequest
        fields = [
            "id", "title", "notes", "requested_by", "requested_by_name", "status", "approved_by",
            "approved_by_name", "approved_at", "rejection_reason", "item_count", "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "requested_by", "status", "approved_by", "approved_at", "rejection_reason",
            "created_at", "updated_at",
        ]

    def get_item_count(self, obj):
        return obj.items.count()


class PurchaseRequestItemSerializer(serializers.ModelSerializer):
    inventory_item_name = serializers.CharField(source="inventory_item.name", read_only=True, default=None)

    class Meta:
        model = PurchaseRequestItem
        fields = [
            "id", "request", "inventory_item", "inventory_item_name", "description", "quantity",
            "estimated_unit_price",
        ]
        read_only_fields = ["id"]

    def validate_request(self, value):
        _same_school(self.context, value, "Request")
        if value.status != PurchaseRequest.Status.DRAFT:
            raise serializers.ValidationError("Items can only be added to a draft request.")
        return value

    def validate_inventory_item(self, value):
        return _same_school(self.context, value, "Inventory item")


class PurchaseOrderSerializer(serializers.ModelSerializer):
    supplier_name = serializers.CharField(source="supplier.name", read_only=True)
    created_by_name = serializers.CharField(source="created_by.full_name", read_only=True, default=None)
    item_count = serializers.SerializerMethodField()

    class Meta:
        model = PurchaseOrder
        fields = [
            "id", "order_number", "supplier", "supplier_name", "source_request", "status",
            "total_amount", "created_by", "created_by_name", "ordered_at", "item_count",
            "created_at", "updated_at",
        ]
        read_only_fields = [
            "id", "status", "total_amount", "created_by", "ordered_at", "created_at", "updated_at",
        ]

    def get_item_count(self, obj):
        return obj.items.count()

    def validate_supplier(self, value):
        return _same_school(self.context, value, "Supplier")

    def validate_source_request(self, value):
        if value is not None and value.status != PurchaseRequest.Status.APPROVED:
            raise serializers.ValidationError("source_request must be an approved request.")
        return _same_school(self.context, value, "Source request")

    def validate_order_number(self, value):
        # unique_order_number_per_school is a (school, X)-only UniqueConstraint, same recurring
        # gap as Supplier.name/InventoryCategory.name/InventoryItem.sku above.
        school = self.context["request"].user.school
        qs = PurchaseOrder.objects.filter(school=school, order_number=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("A purchase order with this number already exists.")
        return value


class PurchaseOrderItemSerializer(serializers.ModelSerializer):
    inventory_item_name = serializers.CharField(source="inventory_item.name", read_only=True, default=None)
    is_fully_received = serializers.BooleanField(read_only=True)

    class Meta:
        model = PurchaseOrderItem
        fields = [
            "id", "order", "inventory_item", "inventory_item_name", "description", "quantity_ordered",
            "quantity_received", "unit_price", "is_fully_received",
        ]
        read_only_fields = ["id", "quantity_received"]

    def validate_order(self, value):
        _same_school(self.context, value, "Order")
        if value.status != PurchaseOrder.Status.DRAFT:
            raise serializers.ValidationError("Items can only be added to a draft order.")
        return value

    def validate_inventory_item(self, value):
        return _same_school(self.context, value, "Inventory item")


class RejectRequestSerializer(serializers.Serializer):
    reason = serializers.CharField()


class ReceiptLineSerializer(serializers.Serializer):
    item_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1)


class ReceiveOrderSerializer(serializers.Serializer):
    receipts = ReceiptLineSerializer(many=True)
