import { Banknote, Receipt } from "lucide-react";
import { Link } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import type { ApiError } from "@/lib/api-client";
import { money, monthLabel } from "@/lib/money";

import { type LineType, useMySalary } from "./mySalary";

const LINE_LABEL: Record<LineType, string> = { basic: "Basic pay", allowance: "Allowance", deduction: "Deduction" };
const STATUS_TONE = { pending: "warning", paid: "success", cancelled: "neutral" } as const;
const STATUS_LABEL = { pending: "Being prepared", paid: "Paid", cancelled: "Cancelled" } as const;

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">{label}</p>
      <p className={strong ? "mt-0.5 break-words text-2xl font-semibold text-[var(--color-text)]" : "mt-0.5 break-words text-lg font-semibold text-[var(--color-text)]"}>{value}</p>
    </div>
  );
}

/** A staff member's own pay: what their plan gives them line by line, anything waiting for an upcoming month, and every salary
 * payment with its receipt. Changes made by the accountant show up here (and arrive as notifications). */
export function MySalaryPage() {
  const { data, isLoading, isError, error } = useMySalary();
  if (isLoading) return <FullPageSpinner />;
  if (isError || !data) return <Alert tone="danger">{(error as ApiError | undefined)?.message ?? "Could not load your salary."}</Alert>;

  if (!data.has_plan && data.payments.length === 0) {
    return <EmptyState icon={Banknote} title="No pay plan yet" description="When the accountant places you on a pay plan, your salary and its breakdown appear here." />;
  }

  const plan = data.plan;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">My salary</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">What you earn, how it is made up, and your payment receipts.</p>
      </div>

      {plan && (
        <Card>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base font-semibold">Your pay plan: {plan.name}</CardTitle>
            <span className="text-xs text-[var(--color-text-muted)]">Since {plan.effective_from}</span>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-4 sm:grid-cols-3">
              <Figure label="Gross per month" value={money(plan.gross)} />
              <Figure label="Deductions" value={money(plan.deductions)} />
              <Figure label="Net per month" value={money(plan.net)} strong />
            </div>
            <ul className="divide-y divide-[var(--color-border)] rounded-[var(--radius-md)] border border-[var(--color-border)]">
              {plan.lines.map((line, i) => (
                <li key={`${line.description}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-[var(--color-text)]">{line.description}</span>
                    <span className="text-xs text-[var(--color-text-muted)]">{LINE_LABEL[line.line_type]}</span>
                  </span>
                  <span className={line.line_type === "deduction" ? "shrink-0 font-semibold text-[var(--color-danger)]" : "shrink-0 font-semibold text-[var(--color-text)]"}>
                    {line.line_type === "deduction" ? "−" : "+"} {money(line.amount)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {data.pending_adjustments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Coming up</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p className="text-sm text-[var(--color-text-muted)]">One-off changes that will be applied when that month&apos;s salary is prepared.</p>
            {data.pending_adjustments.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{a.kind === "deduction" ? "Deduction" : "Addition"}</span> for {monthLabel(a.period_year, a.period_month)} — {a.reason}
                </span>
                <span className={a.kind === "deduction" ? "font-semibold text-[var(--color-danger)]" : "font-semibold text-[var(--color-success)]"}>
                  {a.kind === "deduction" ? "−" : "+"} {money(a.amount)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Salary payments</CardTitle>
        </CardHeader>
        <CardContent>
          {data.payments.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">No salary has been prepared for you yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.payments.map((p) => (
                <li key={p.id} className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-[var(--color-text)]">{monthLabel(p.period_year, p.period_month)}</p>
                      <p className="text-xs text-[var(--color-text-muted)]">{p.payment_number}</p>
                    </div>
                    <Badge tone={STATUS_TONE[p.status]}>{STATUS_LABEL[p.status]}</Badge>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-3 text-sm">
                    <Figure label="Gross" value={money(p.gross_amount)} />
                    <Figure label="Deductions" value={money(p.deductions_total)} />
                    <Figure label="Net" value={money(p.net_amount)} />
                  </div>
                  <Link
                    to={`/my-salary/receipts/${p.id}`}
                    className="mt-3 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-[var(--color-primary)] hover:text-[var(--color-text)]"
                  >
                    <Receipt className="size-4" aria-hidden="true" />
                    {p.status === "paid" ? "View receipt" : "View breakdown"}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {data.adjustments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Changes made to your pay</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {data.adjustments.map((a) => (
              <div key={a.id} className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--color-border)] pb-2 text-sm last:border-0 last:pb-0">
                <span className="min-w-0">
                  <span className="font-medium">{a.kind === "deduction" ? "Deduction" : "Addition"}</span> · {monthLabel(a.period_year, a.period_month)}
                  <span className="block text-[var(--color-text-muted)]">{a.reason}</span>
                </span>
                <span className={a.kind === "deduction" ? "shrink-0 font-semibold text-[var(--color-danger)]" : "shrink-0 font-semibold text-[var(--color-success)]"}>
                  {a.kind === "deduction" ? "−" : "+"} {money(a.amount)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
