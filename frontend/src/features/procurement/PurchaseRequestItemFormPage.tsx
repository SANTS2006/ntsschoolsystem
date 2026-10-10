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
  useCreatePurchaseRequestItem,
  usePurchaseRequest,
  usePurchaseRequestItem,
  useUpdatePurchaseRequestItem,
} from "./useProcurementCrud";

const schema = z.object({
  inventory_item: z.string(),
  description: z.string().min(1, "Description is required"),
  quantity: z.coerce.number().int().gt(0, "Quantity must be greater than zero"),
  estimated_unit_price: z.string(),
});

type FormValues = z.infer<typeof schema>;
const EMPTY_VALUES: FormValues = { inventory_item: "", description: "", quantity: 1, estimated_unit_price: "" };
const FIELD_KEYS = new Set(["inventory_item", "description", "quantity", "estimated_unit_price"]);

export function PurchaseRequestItemFormPage() {
  const { id: requestId, itemId } = useParams<{ id: string; itemId: string }>();
  const isEditMode = !!itemId;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: request } = usePurchaseRequest(requestId);
  const { data: item, isLoading: isLoadingItem } = usePurchaseRequestItem(itemId);
  const { data: inventoryItems } = useItemList({ page_size: 100, is_active: true });
  const createItem = useCreatePurchaseRequestItem();
  const updateItem = useUpdatePurchaseRequestItem(itemId ?? "");
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
        quantity: item.quantity,
        estimated_unit_price: item.estimated_unit_price ?? "",
      });
    }
  }, [item, inventoryItems, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    mutation.mutate(
      {
        request: requestId as string,
        inventory_item: values.inventory_item || undefined,
        description: values.description,
        quantity: values.quantity,
        estimated_unit_price: values.estimated_unit_price || undefined,
      },
      {
        onSuccess: () => {
          showToast({ title: isEditMode ? "Item updated" : "Item added" });
          navigate(`/procurement/requests/${requestId}/items`);
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
          <CardTitle>{request ? `For ${request.title}` : "Item details"}</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Select label="Inventory item" hint="Optional — links this line to restock an existing item." error={errors.inventory_item?.message} {...register("inventory_item")}>
              <option value="">Not set (free text)</option>
              {inventoryItems?.results.map((invItem) => (
                <option key={invItem.id} value={invItem.id}>
                  {invItem.name}
                </option>
              ))}
            </Select>
            <Input label="Description" error={errors.description?.message} {...register("description")} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input type="number" label="Quantity" error={errors.quantity?.message} {...register("quantity")} />
              <Input
                type="number"
                step="0.01"
                label="Est. unit price"
                error={errors.estimated_unit_price?.message}
                {...register("estimated_unit_price")}
              />
            </div>

            <div className="mt-2 flex justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate(`/procurement/requests/${requestId}/items`)}
              >
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
