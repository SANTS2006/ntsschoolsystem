import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import { useItemList } from "@/features/inventory/useInventoryCrud";
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";

import {
  useCreatePurchaseOrderItem,
  usePurchaseOrder,
  usePurchaseOrderItem,
  useUpdatePurchaseOrderItem,
} from "./useProcurementCrud";

const schema = z.object({
  inventory_item: z.string(),
  description: z.string().min(1, "Description is required"),
  quantity_ordered: z.coerce.number().int().gt(0, "Quantity must be greater than zero"),
  unit_price: z.coerce.number().min(0, "Unit price cannot be negative"),
});

type FormValues = z.infer<typeof schema>;
const EMPTY_VALUES: FormValues = { inventory_item: "", description: "", quantity_ordered: 1, unit_price: 0 };
const FIELD_KEYS = new Set(["inventory_item", "description", "quantity_ordered", "unit_price"]);

export function PurchaseOrderItemFormPage() {
  const { id: orderId, itemId } = useParams<{ id: string; itemId: string }>();
  const isEditMode = !!itemId;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: order } = usePurchaseOrder(orderId);
  const { data: item, isLoading: isLoadingItem } = usePurchaseOrderItem(itemId);
  const { data: inventoryItems } = useItemList({ page_size: 100, is_active: true });
  const createItem = useCreatePurchaseOrderItem();
  const updateItem = useUpdatePurchaseOrderItem(itemId ?? "");
  const mutation = isEditMode ? updateItem : createItem;
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<z.input<typeof schema>, unknown, FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  useEffect(() => {
    if (item) {
      reset({
        inventory_item: item.inventory_item ?? "",
        description: item.description,
        quantity_ordered: item.quantity_ordered,
        unit_price: Number(item.unit_price),
      });
    }
  }, [item, inventoryItems, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    mutation.mutate(
      {
        order: orderId as string,
        inventory_item: values.inventory_item || undefined,
        description: values.description,
        quantity_ordered: values.quantity_ordered,
        unit_price: String(values.unit_price),
      },
      {
        onSuccess: () => {
          showToast({ title: isEditMode ? "Item updated" : "Item added" });
          navigate(`/procurement/orders/${orderId}/items`);
        },
        onError: (err: ApiError) => {
          if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
            const message = generalErrorMessage(err);
            setGeneralError(message);
            showToast({ title: "Could not save item", description: message, tone: "danger" });
          }
        },
      },
    );
  };

  if (isEditMode && isLoadingItem) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">{isEditMode ? "Edit item" : "New item"}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{order ? `For ${order.order_number}` : "Item details"}</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Select
              label="Inventory item"
              hint="Optional — links this line so receiving it restocks the item automatically."
              error={errors.inventory_item?.message}
              {...register("inventory_item")}
            >
              <option value="">Not set (free text)</option>
              {inventoryItems?.results.map((invItem) => (
                <option key={invItem.id} value={invItem.id}>
                  {invItem.name}
                </option>
              ))}
            </Select>
            <Input label="Description" error={errors.description?.message} {...register("description")} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                type="number"
                label="Quantity ordered"
                error={errors.quantity_ordered?.message}
                {...register("quantity_ordered")}
              />
              <Input
                type="number"
                step="0.01"
                label="Unit price"
                error={errors.unit_price?.message}
                {...register("unit_price")}
              />
            </div>

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate(`/procurement/orders/${orderId}/items`)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={mutation.isPending}>
                {!mutation.isPending && <Save className="size-4" aria-hidden="true" />}
                Save
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
