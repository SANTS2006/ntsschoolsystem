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
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import type { ApiError } from "@/lib/api-client";

import { paymentStatusTone, statusLabel } from "./statusTone";
import { usePayment, useRefundPayment } from "./usePaymentsCrud";

const schema = z.object({
  amount: z.coerce.number().gt(0, "Amount must be greater than zero"),
  reason: z.string().min(1, "A reason is required"),
});

type FormValues = z.infer<typeof schema>;

export function RefundFormPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const canRefund = useHasPermission("payments.refund");

  const { data: payment, isLoading } = usePayment(id);
  const refundPayment = useRefundPayment(id ?? "");
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.input<typeof schema>, unknown, FormValues>({ resolver: zodResolver(schema), defaultValues: { amount: 0, reason: "" } });

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    refundPayment.mutate(
      { amount: String(values.amount), reason: values.reason },
      {
        onSuccess: () => {
          showToast({ title: "Refund issued" });
          navigate(payment ? `/finance/invoices/${payment.invoice}` : "/finance/payments");
        },
        onError: (err: ApiError) => {
          setGeneralError(err.message);
          showToast({ title: "Could not issue refund", description: err.message, tone: "danger" });
        },
      },
    );
  };

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (!payment) {
    return <Alert tone="danger">Payment not found.</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">Payment</h1>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-[var(--color-text)]">
              {payment.receipt_number}
            </CardTitle>
            <p className="text-sm text-[var(--color-text-muted)]">
              {payment.student_name} — {payment.invoice_number}
            </p>
          </div>
          <Badge tone={paymentStatusTone(payment.status)}>{statusLabel(payment.status)}</Badge>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Amount</p>
            <p className="mt-0.5 text-sm text-[var(--color-text)]">{payment.amount}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Method</p>
            <p className="mt-0.5 text-sm text-[var(--color-text)]">{statusLabel(payment.method)}</p>
          </div>
        </CardContent>
      </Card>

      {canRefund && payment.status !== "refunded" && (
        <Card>
          <CardHeader>
            <CardTitle>Issue a refund</CardTitle>
          </CardHeader>
          <CardContent>
            {generalError && (
              <Alert tone="danger" className="mb-4">
                {generalError}
              </Alert>
            )}
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
              <Input type="number" step="0.01" label="Amount" error={errors.amount?.message} {...register("amount")} />
              <Input
                label="Reason"
                hint="Required — recorded as an audit note for this refund."
                error={errors.reason?.message}
                {...register("reason")}
              />

              <div className="mt-2 flex justify-end gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => navigate(`/finance/invoices/${payment.invoice}`)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="danger" isLoading={refundPayment.isPending}>
                  {!refundPayment.isPending && <Save className="size-4" aria-hidden="true" />}
                  Issue refund
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
