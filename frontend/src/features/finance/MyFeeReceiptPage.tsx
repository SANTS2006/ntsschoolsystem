import { useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { PrintableDocument } from "@/components/ui/PrintableDocument";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useCurrentUser } from "@/features/auth/useAuth";
import { LogoBadge } from "@/layouts/AppShell";
import type { ApiError } from "@/lib/api-client";
import { money } from "@/lib/money";

import { useMyFeeReceipt } from "./myFees";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-0.5 break-words text-sm text-[var(--color-text)]">{value || "—"}</p>
    </div>
  );
}

export function MyFeeReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const { data: r, isLoading, isError, error } = useMyFeeReceipt(id);
  const { data: user } = useCurrentUser();
  if (isLoading) return <FullPageSpinner />;
  if (isError || !r) return <Alert tone="danger">{(error as ApiError | undefined)?.message ?? "Receipt not found."}</Alert>;

  return (
    <PrintableDocument title="Payment receipt" filename={`Receipt ${r.receipt_number}.pdf`}>
      <Card>
        <CardHeader className="flex-row items-center gap-3">
          <LogoBadge logoUrl={user?.school?.logo} className="size-12" />
          <div className="min-w-0">
            <CardTitle className="truncate text-base font-semibold">{r.school_name}</CardTitle>
            <p className="truncate text-sm text-[var(--color-text-muted)]">Official fees payment receipt</p>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Receipt #" value={r.receipt_number} />
            <Field label="Student" value={`${r.student_name} (${r.admission_number})`} />
            <Field label="Invoice" value={r.invoice_number} />
            <Field label="Academic year" value={r.academic_year} />
            <Field label="Term" value={r.term} />
            <Field label="Paid at" value={new Date(r.paid_at).toLocaleString()} />
            <Field label="Method" value={r.method} />
            <Field label="Reference" value={r.reference} />
          </div>
          <div className="grid grid-cols-2 gap-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-4 sm:grid-cols-4">
            <Field label="Amount paid" value={money(r.amount)} />
            <Field label="Invoice total" value={money(r.invoice_total)} />
            <Field label="Total paid so far" value={money(r.invoice_paid)} />
            <Field label="Balance" value={money(r.invoice_balance)} />
          </div>
        </CardContent>
      </Card>
    </PrintableDocument>
  );
}
