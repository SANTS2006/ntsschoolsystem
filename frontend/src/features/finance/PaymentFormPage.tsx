import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useState } from "react";
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

import { useInvoice } from "./useFeesCrud";
import { useRecordPayment } from "./usePaymentsCrud";
import type { PaymentMethod } from "./types";

const METHOD_OPTIONS: PaymentMethod[] = ["cash", "bank_transfer", "card", "mobile_money", "cheque", "other"];

function methodLabel(method: PaymentMethod): string {
  return method
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

const schema = z.object({
  amount: z.coerce.number().gt(0, "Amount must be greater than zero"),
  method: z.enum(["cash", "bank_transfer", "card", "mobile_money", "cheque", "other"]),
  reference: z.string(),
  notes: z.string(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = { amount: 0, method: "cash", reference: "", notes: "" };
const FIELD_KEYS = new Set(["invoice", "amount", "method", "reference", "notes"]);

export function PaymentFormPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: invoice, isLoading: isLoadingInvoice } = useInvoice(invoiceId);
  const recordPayment = useRecordPayment();
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<z.input<typeof schema>, unknown, FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    recordPayment.mutate(
      {
        invoice: invoiceId as string,
        amount: String(values.amount),
        method: values.method,
        reference: values.reference || undefined,
        notes: values.notes || undefined,
      },
      {
        onSuccess: () => {
          showToast({ title: "Payment recorded" });
          navigate(`/finance/invoices/${invoiceId}`);
        },
        onError: (err: ApiError) => {
          if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
            const message = generalErrorMessage(err);
            setGeneralError(message);
            showToast({ title: "Could not record payment", description: message, tone: "danger" });
          }
        },
      },
    );
  };

  if (isLoadingInvoice) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">Record payment</h1>

      <Card>
        <CardHeader>
          <CardTitle>
            {invoice ? `${invoice.invoice_number} — ${invoice.student_name}` : "Payment details"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {invoice && (
            <p className="mb-4 text-sm text-[var(--color-text-muted)]">
              Outstanding balance: <strong className="text-[var(--color-text)]">{invoice.balance}</strong>
            </p>
          )}
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input type="number" step="0.01" label="Amount" error={errors.amount?.message} {...register("amount")} />
            <Select label="Method" error={errors.method?.message} {...register("method")}>
              {METHOD_OPTIONS.map((method) => (
                <option key={method} value={method}>
                  {methodLabel(method)}
                </option>
              ))}
            </Select>
            <Input
              label="Reference"
              hint="Optional — a transaction ID, cheque number, etc."
              error={errors.reference?.message}
              {...register("reference")}
            />
            <Input label="Notes" error={errors.notes?.message} {...register("notes")} />

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate(`/finance/invoices/${invoiceId}`)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={recordPayment.isPending}>
                {!recordPayment.isPending && <Save className="size-4" aria-hidden="true" />}
                Record payment
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
