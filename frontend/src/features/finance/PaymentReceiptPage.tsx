import { Receipt } from "lucide-react";
import { useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { PrintableDocument } from "@/components/ui/PrintableDocument";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useCurrentUser } from "@/features/auth/useAuth";
import { LogoBadge } from "@/layouts/AppShell";
import type { ApiError } from "@/lib/api-client";

import { paymentStatusTone, statusLabel } from "./statusTone";
import { usePayment } from "./usePaymentsCrud";

export function PaymentReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const { data: payment, isLoading, isError, error } = usePayment(id);
  const { data: user } = useCurrentUser();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError || !payment) {
    return <Alert tone="danger">{(error as ApiError)?.message ?? "Payment not found."}</Alert>;
  }

  return (
    <PrintableDocument
      title="Payment receipt"
      filename={`Receipt ${payment.receipt_number}.pdf`}
    >
      <Card>
        <CardHeader className="flex-row items-center gap-3">
          <LogoBadge logoUrl={user?.school?.logo} className="size-12" />
          <div className="min-w-0">
            <CardTitle className="truncate text-base font-semibold text-[var(--color-text)]">
              {user?.school?.name ?? "Payment Receipt"}
            </CardTitle>
            <p className="truncate text-sm text-[var(--color-text-muted)]">Official payment receipt</p>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--color-border)] pb-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Receipt #</p>
              <p className="mt-0.5 text-lg font-semibold text-[var(--color-text)]">
                <Receipt className="mr-1.5 inline size-4" aria-hidden="true" />
                {payment.receipt_number}
              </p>
            </div>
            <Badge tone={paymentStatusTone(payment.status)}>{statusLabel(payment.status)}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Student</p>
              <p className="mt-0.5 text-sm text-[var(--color-text)]">{payment.student_name}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Invoice #</p>
              <p className="mt-0.5 text-sm text-[var(--color-text)]">{payment.invoice_number}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Paid at</p>
              <p className="mt-0.5 text-sm text-[var(--color-text)]">{new Date(payment.paid_at).toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Method</p>
              <p className="mt-0.5 text-sm text-[var(--color-text)]">{statusLabel(payment.method)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Reference</p>
              <p className="mt-0.5 text-sm text-[var(--color-text)]">
                {payment.reference || <span className="text-[var(--color-text-muted)]">—</span>}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Recorded by</p>
              <p className="mt-0.5 text-sm text-[var(--color-text)]">
                {payment.recorded_by_name || <span className="text-[var(--color-text-muted)]">—</span>}
              </p>
            </div>
          </div>

          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Amount paid</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--color-text)]">{payment.amount}</p>
          </div>
        </CardContent>
      </Card>
    </PrintableDocument>
  );
}
