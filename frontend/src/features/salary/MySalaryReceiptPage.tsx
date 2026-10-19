import { useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { PrintableDocument } from "@/components/ui/PrintableDocument";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useCurrentUser } from "@/features/auth/useAuth";
import { LogoBadge } from "@/layouts/AppShell";
import type { ApiError } from "@/lib/api-client";
import { money } from "@/lib/money";

import { useMyReceipt } from "./mySalary";

const TONE = { pending: "warning", paid: "success", cancelled: "neutral" } as const;
const LABEL = { pending: "Being prepared", paid: "Paid", cancelled: "Cancelled" } as const;

export function MySalaryReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const { data: p, isLoading, isError, error } = useMyReceipt(id);
  const { data: user } = useCurrentUser();
  if (isLoading) return <FullPageSpinner />;
  if (isError || !p) return <Alert tone="danger">{(error as ApiError | undefined)?.message ?? "Salary payment not found."}</Alert>;

  return (
    <PrintableDocument title="Salary payslip" filename={`Salary receipt ${p.payment_number}.pdf`}>
      <Card>
        <CardHeader className="flex-row items-center gap-3">
          <LogoBadge logoUrl={user?.school?.logo} className="size-12" />
          <div className="min-w-0">
            <CardTitle className="truncate text-base font-semibold">{p.school_name}</CardTitle>
            <p className="truncate text-sm text-[var(--color-text-muted)]">Salary payslip · {p.month_label}</p>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm text-[var(--color-text-muted)]">{p.staff_name}</p>
              <p className="font-semibold text-[var(--color-text)]">{p.payment_number}</p>
              {p.paid_at && <p className="text-xs text-[var(--color-text-muted)]">Paid {new Date(p.paid_at).toLocaleString()}{p.method ? ` · ${p.method}` : ""}</p>}
              {p.reference && <p className="text-xs text-[var(--color-text-muted)]">Ref {p.reference}</p>}
            </div>
            <Badge tone={TONE[p.status]}>{LABEL[p.status]}</Badge>
          </div>

          {p.has_breakdown ? (
            <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
              {p.lines.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <span className="min-w-0 truncate">
                    {l.description}
                    {l.source === "adjustment" && <span className="ml-1.5 text-xs text-[var(--color-text-muted)]">(one-off)</span>}
                  </span>
                  <span className={l.line_type === "deduction" ? "shrink-0 font-semibold text-[var(--color-danger)]" : "shrink-0 font-semibold"}>
                    {l.line_type === "deduction" ? "−" : "+"} {money(l.amount)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">A line-by-line breakdown is not available for this older payment.</p>
          )}

          <div className="grid grid-cols-3 gap-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-4">
            {[
              ["Gross", p.gross_amount],
              ["Deductions", p.deductions_total],
              ["Net", p.net_amount],
            ].map(([label, value]) => (
              <div key={String(label)} className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">{String(label)}</p>
                <p className="mt-1 break-words text-lg font-semibold">{money(value as number | string)}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </PrintableDocument>
  );
}
