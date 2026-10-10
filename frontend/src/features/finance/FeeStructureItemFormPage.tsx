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
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";

import {
  useCreateFeeStructureItem,
  useFeeCategoryList,
  useFeeStructure,
  useFeeStructureItem,
  useUpdateFeeStructureItem,
} from "./useFeesCrud";

const schema = z.object({
  fee_category: z.string().min(1, "Category is required"),
  amount: z.coerce.number().gt(0, "Amount must be greater than zero"),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = { fee_category: "", amount: 0 };
const FIELD_KEYS = new Set(["fee_category", "amount"]);

export function FeeStructureItemFormPage() {
  const { structureId, id } = useParams<{ structureId: string; id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: structure } = useFeeStructure(structureId);
  const { data: item, isLoading: isLoadingItem } = useFeeStructureItem(id);
  const { data: categories } = useFeeCategoryList({ page_size: 100 });
  const createItem = useCreateFeeStructureItem();
  const updateItem = useUpdateFeeStructureItem(id ?? "");
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
      reset({ fee_category: item.fee_category, amount: Number(item.amount) });
    }
  }, [item, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    mutation.mutate(
      { fee_structure: structureId as string, fee_category: values.fee_category, amount: String(values.amount) },
      {
        onSuccess: () => {
          showToast({ title: isEditMode ? "Line item updated" : "Line item added" });
          navigate(`/finance/structures/${structureId}/items`);
        },
        onError: (err: ApiError) => {
          if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
            const message = generalErrorMessage(err);
            setGeneralError(message);
            showToast({ title: "Could not save line item", description: message, tone: "danger" });
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
        {isEditMode ? "Edit line item" : "New line item"}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>{structure ? `For ${structure.name}` : "Line item details"}</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Select label="Category" error={errors.fee_category?.message} {...register("fee_category")}>
              <option value="">Select a category</option>
              {categories?.results.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
            <Input type="number" step="0.01" label="Amount" error={errors.amount?.message} {...register("amount")} />

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate(`/finance/structures/${structureId}/items`)}>
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
