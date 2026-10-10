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
  useCreateInvoiceLineItem,
  useFeeCategoryList,
  useInvoice,
  useInvoiceLineItem,
  useUpdateInvoiceLineItem,
} from "./useFeesCrud";

const LINE_TYPE_OPTIONS = ["charge", "discount", "scholarship", "waiver"] as const;

const schema = z.object({
  fee_category: z.string(),
  line_type: z.enum(LINE_TYPE_OPTIONS),
  description: z.string(),
  amount: z.coerce.number().refine((value) => value !== 0, "Amount cannot be zero"),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = { fee_category: "", line_type: "charge", description: "", amount: 0 };
const FIELD_KEYS = new Set(["fee_category", "line_type", "description", "amount"]);

export function InvoiceLineItemFormPage() {
  const { invoiceId, id } = useParams<{ invoiceId: string; id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: invoice } = useInvoice(invoiceId);
  const { data: item, isLoading: isLoadingItem } = useInvoiceLineItem(id);
  const { data: categories } = useFeeCategoryList({ page_size: 100 });
  const createItem = useCreateInvoiceLineItem();
  const updateItem = useUpdateInvoiceLineItem(id ?? "");
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
        fee_category: item.fee_category ?? "",
        line_type: item.line_type,
        description: item.description,
        amount: Number(item.amount),
      });
    }
  }, [item, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    mutation.mutate(
      {
        invoice: invoiceId as string,
        fee_category: values.fee_category || undefined,
        line_type: values.line_type,
        description: values.description || undefined,
        amount: String(values.amount),
      },
      {
        onSuccess: () => {
          showToast({ title: isEditMode ? "Line item updated" : "Line item added" });
          navigate(`/finance/invoices/${invoiceId}/line-items`);
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
          <CardTitle>{invoice ? `For ${invoice.invoice_number}` : "Line item details"}</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Select label="Category" error={errors.fee_category?.message} {...register("fee_category")}>
              <option value="">Not set</option>
              {categories?.results.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
            <Select label="Type" error={errors.line_type?.message} {...register("line_type")}>
              {LINE_TYPE_OPTIONS.map((type) => (
                <option key={type} value={type}>
                  {type[0].toUpperCase() + type.slice(1)}
                </option>
              ))}
            </Select>
            <Input label="Description" error={errors.description?.message} {...register("description")} />
            <Input
              type="number"
              step="0.01"
              label="Amount"
              hint="Negative for a discount/scholarship/waiver."
              error={errors.amount?.message}
              {...register("amount")}
            />

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate(`/finance/invoices/${invoiceId}/line-items`)}>
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
