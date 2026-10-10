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

import { salaryPaymentStatusTone, statusLabel } from "./statusTone";
import { useSalaryPayment } from "./useSalaryCrud";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function SalaryPaymentReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const { data: payment, isLoading, isError, error } = useSalaryPayment(id);
  const { data: user } = useCurrentUser();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError || !payment) {
    return <Alert tone="danger">{(error as ApiError)?.message ?? "Salary payment not found."}</Alert>;
  }

  return (
    <PrintableDocument
      title="Salary payment receipt"
      filename={`Salary receipt ${payment.payment_number}.pdf`}
    >
      <Card>
        <CardHeader className="flex-row items-center gap-3">
          <LogoBadge logoUrl={user?.school?.logo} className="size-12" />
          <div className="min-w-0">
            <CardTitle className="truncate text-base font-semibold text-[var(--color-text)]">
              {user?.school?.name ?? "Salary Payment Receipt"}
            </CardTitle>
            <p className="truncate text-sm text-[var(--color-text-muted)]">Official salary payment receipt</p>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--color-border)] pb-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Payment #</p>
              <p className="mt-0.5 text-lg font-semibold text-[var(--color-text)]">
                <Receipt className="mr-1.5 inline size-4" aria-hidden="true" />
                {payment.payment_number}
              </p>
            </div>
            <Badge tone={salaryPaymentStatusTone(payment.status)}>{statusLabel(payment.status)}</Badge>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Staff</p>
              <p className="mt-0.5 text-sm text-[var(--color-text)]">{payment.staff_name}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Period</p>
              <p className="mt-0.5 text-sm text-[var(--color-text)]">
                {MONTH_NAMES[payment.period_month - 1]} {payment.period_year}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Salary structure</p>
              <p className="mt-0.5 text-sm text-[var(--color-text)]">
                {payment.salary_structure_name || <span className="text-[var(--color-text-muted)]">—</span>}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Paid at</p>
              <p className="mt-0.5 text-sm text-[var(--color-text)]">
                {payment.paid_at ? new Date(payment.paid_at).toLocaleString() : <span className="text-[var(--color-text-muted)]">—</span>}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Method</p>
              <p className="mt-0.5 text-sm text-[var(--color-text)]">
                {payment.method ? statusLabel(payment.method) : <span className="text-[var(--color-text-muted)]">—</span>}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Reference</p>
              <p className="mt-0.5 text-sm text-[var(--color-text)]">
                {payment.reference || <span className="text-[var(--color-text-muted)]">—</span>}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Gross</p>
              <p className="mt-1 text-lg font-semibold text-[var(--color-text)]">{payment.gross_amount}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Deductions</p>
              <p className="mt-1 text-lg font-semibold text-[var(--color-text)]">{payment.deductions_total}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Net paid</p>
              <p className="mt-1 text-2xl font-semibold text-[var(--color-text)]">{payment.net_amount}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </PrintableDocument>
  );
}
