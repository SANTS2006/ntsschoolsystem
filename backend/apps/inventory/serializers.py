from rest_framework import serializers

from .models import InventoryCategory, InventoryItem, InventoryTransaction


class InventoryCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryCategory
        fields = ["id", "name", "description", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]

    def validate_name(self, value):
        # `school` is never a serializer field (set server-side in perform_create), so DRF's
        # automatic unique-together validator never fires for
        # unique_inventory_category_name_per_school. Same recurring gap as every other
        # (school, X)-only UniqueConstraint in this backend.
        school = self.context["request"].user.school
        qs = InventoryCategory.objects.filter(school=school, name=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("An inventory category with this name already exists.")
        return value


class InventoryItemSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source="category.name", read_only=True, default=None)
    is_low_stock = serializers.BooleanField(read_only=True)

    class Meta:
        model = InventoryItem
        fields = [
            "id", "name", "category", "category_name", "sku", "unit", "quantity_in_stock",
            "reorder_level", "location", "is_active", "is_low_stock", "created_at", "updated_at",
        ]
        # quantity_in_stock only ever changes through record_stock_in/record_stock_out — see
        # the model's own comment. A brand-new item starts at 0 and gets its opening balance
        # via a stock_in action (reason="Initial stock"), keeping the transaction ledger
        # authoritative for every change, not just the ones made after creation.
        read_only_fields = ["id", "quantity_in_stock", "created_at", "updated_at"]

    def validate_category(self, value):
        request = self.context["request"]
        if value is not None and value.school_id != request.user.school_id:
            raise serializers.ValidationError("Category must belong to your own school.")
        return value

    def validate_sku(self, value):
        # unique_inventory_sku_per_school is a partial unique index (only when sku != ""), and
        # like every (school, X)-only constraint DRF never auto-validates it since `school` isn't
        # a serializer field. Blank SKUs are exempt on the database side too, so skip the check here.
        if not value:
            return value
        school = self.context["request"].user.school
        qs = InventoryItem.objects.filter(school=school, sku=value)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("An inventory item with this SKU already exists.")
        return value


class InventoryTransactionSerializer(serializers.ModelSerializer):
    item_name = serializers.CharField(source="item.name", read_only=True)
    recorded_by_name = serializers.CharField(source="recorded_by.full_name", read_only=True, default=None)

    class Meta:
        model = InventoryTransaction
        fields = [
            "id", "item", "item_name", "transaction_type", "quantity", "reason",
            "recorded_by", "recorded_by_name", "created_at",
        ]
        read_only_fields = fields


class StockActionSerializer(serializers.Serializer):
    quantity = serializers.IntegerField(min_value=1)
    reason = serializers.CharField(required=False, allow_blank=True, default="")
