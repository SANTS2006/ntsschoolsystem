import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import type { ApiError } from "@/lib/api-client";

import { salaryPaymentStatusTone, statusLabel } from "./statusTone";
import type { SalaryPaymentMethod } from "./types";
import { usePaySalaryPayment, useSalaryPayment } from "./useSalaryCrud";

const METHOD_OPTIONS: SalaryPaymentMethod[] = ["cash", "bank_transfer", "card", "mobile_money", "cheque", "other"];

const schema = z.object({
  method: z.enum(["cash", "bank_transfer", "card", "mobile_money", "cheque", "other"]),
  reference: z.string(),
});

type FormValues = z.infer<typeof schema>;

export function PaySalaryPaymentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const canUpdate = useHasPermission("salary.update");

  const { data: payment, isLoading } = useSalaryPayment(id);
  const payPayment = usePaySalaryPayment(id ?? "");
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { method: "cash", reference: "" } });

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    payPayment.mutate(
      { method: values.method, reference: values.reference || undefined },
      {
        onSuccess: () => {
          showToast({ title: "Salary payment recorded" });
          navigate("/salary/payments");
        },
        onError: (err: ApiError) => {
          setGeneralError(err.message);
          showToast({ title: "Could not record payment", description: err.message, tone: "danger" });
        },
      },
    );
  };

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (!payment) {
    return <Alert tone="danger">Salary payment not found.</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">Salary payment</h1>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-[var(--color-text)]">{payment.payment_number}</CardTitle>
            <p className="text-sm text-[var(--color-text-muted)]">{payment.staff_name}</p>
          </div>
          <Badge tone={salaryPaymentStatusTone(payment.status)}>{statusLabel(payment.status)}</Badge>
        </CardHeader>
        <CardContent className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Gross</p>
            <p className="mt-0.5 text-sm text-[var(--color-text)]">{payment.gross_amount}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Deductions</p>
            <p className="mt-0.5 text-sm text-[var(--color-text)]">{payment.deductions_total}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Net</p>
            <p className="mt-0.5 text-sm font-medium text-[var(--color-text)]">{payment.net_amount}</p>
          </div>
        </CardContent>
      </Card>

      {canUpdate && payment.status === "pending" && (
        <Card>
          <CardHeader>
            <CardTitle>Record payment</CardTitle>
          </CardHeader>
          <CardContent>
            {generalError && (
              <Alert tone="danger" className="mb-4">
                {generalError}
              </Alert>
            )}
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
              <Select label="Method" error={errors.method?.message} {...register("method")}>
                {METHOD_OPTIONS.map((method) => (
                  <option key={method} value={method}>
                    {statusLabel(method)}
                  </option>
                ))}
              </Select>
              <Input
                label="Reference"
                hint="Optional — a transaction ID, cheque number, etc."
                error={errors.reference?.message}
                {...register("reference")}
              />

              <div className="mt-2 flex justify-end gap-3">
                <Button type="button" variant="secondary" onClick={() => navigate("/salary/payments")}>
                  Cancel
                </Button>
                <Button type="submit" isLoading={payPayment.isPending}>
                  {!payPayment.isPending && <Save className="size-4" aria-hidden="true" />}
                  Record payment
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
