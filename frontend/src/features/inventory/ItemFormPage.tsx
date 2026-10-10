import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";

import { useCategoryList, useCreateItem, useItem, useUpdateItem } from "./useInventoryCrud";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  category: z.string(),
  sku: z.string(),
  unit: z.string(),
  reorder_level: z.coerce.number().int().min(0, "Reorder level cannot be negative"),
  location: z.string(),
  is_active: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = {
  name: "",
  category: "",
  sku: "",
  unit: "",
  reorder_level: 0,
  location: "",
  is_active: true,
};
const FIELD_KEYS = new Set(["name", "category", "sku", "unit", "reorder_level", "location", "is_active"]);

export function ItemFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: item, isLoading: isLoadingItem } = useItem(id);
  const { data: categories } = useCategoryList({ page_size: 100 });
  const createItem = useCreateItem();
  const updateItem = useUpdateItem(id ?? "");
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
    // Re-fires once `categories` finishes loading, not just when `item` does — a native <select>
    // silently ignores a value assigned before its matching <option> exists in the DOM (see
    // Documents/Assignments/Communications for the full root-cause writeup), so `category` needs
    // this dependency to populate reliably on a fresh, cold page load.
    if (item) {
      reset({
        name: item.name,
        category: item.category ?? "",
        sku: item.sku,
        unit: item.unit,
        reorder_level: item.reorder_level,
        location: item.location,
        is_active: item.is_active,
      });
    }
  }, [item, categories, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    mutation.mutate(
      {
        name: values.name,
        category: values.category || undefined,
        sku: values.sku || undefined,
        unit: values.unit || undefined,
        reorder_level: values.reorder_level,
        location: values.location || undefined,
        is_active: values.is_active,
      },
      {
        onSuccess: () => {
          showToast({ title: isEditMode ? "Item updated" : "Item created" });
          navigate("/inventory/items");
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
      <h1 className="text-xl font-semibold text-[var(--color-text)]">
        {isEditMode ? "Edit item" : "New item"}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>
            Item details
            {isEditMode && item && (
              <span className="ml-2 text-sm font-normal text-[var(--color-text-muted)]">
                {item.quantity_in_stock} {item.unit} in stock
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input label="Name" error={errors.name?.message} {...register("name")} />
            <Select label="Category" error={errors.category?.message} {...register("category")}>
              <option value="">Not set</option>
              {categories?.results.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="SKU" error={errors.sku?.message} {...register("sku")} />
              <Input label="Unit" placeholder="pcs, box, litre" error={errors.unit?.message} {...register("unit")} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                type="number"
                label="Reorder level"
                hint="Marked low-stock at or below this quantity."
                error={errors.reorder_level?.message}
                {...register("reorder_level")}
              />
              <Input label="Location" error={errors.location?.message} {...register("location")} />
            </div>
            <Checkbox label="Active" {...register("is_active")} />

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/inventory/items")}>
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
