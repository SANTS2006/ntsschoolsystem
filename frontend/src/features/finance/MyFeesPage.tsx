import { Receipt, Wallet } from "lucide-react";
import { Link } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import type { ApiError } from "@/lib/api-client";
import { money } from "@/lib/money";

import { type FeeTotals, type MyFeeInvoice, useMyFees } from "./myFees";

const OVERALL = {
  paid: { tone: "success", label: "Fully paid" },
  overdue: { tone: "danger", label: "Overdue" },
  outstanding: { tone: "warning", label: "Balance to pay" },
  none: { tone: "neutral", label: "No fees yet" },
} as const;

function invoiceBadge(inv: MyFeeInvoice) {
  if (Number(inv.balance) <= 0) return <Badge tone="success">Paid</Badge>;
  if (inv.is_overdue) return <Badge tone="danger">Overdue</Badge>;
  if (Number(inv.amount_paid) > 0) return <Badge tone="warning">Part paid</Badge>;
  return <Badge tone="neutral">Not paid</Badge>;
}

function Totals({ totals }: { totals: FeeTotals }) {
  return (
    <div className="grid grid-cols-3 gap-3 text-sm">
      {[
        ["Required", totals.billed],
        ["Paid", totals.paid],
        ["Outstanding", totals.outstanding],
      ].map(([label, value]) => (
        <div key={String(label)} className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">{String(label)}</p>
          <p className="mt-0.5 break-words font-semibold text-[var(--color-text)]">{money(value as number | string)}</p>
        </div>
      ))}
    </div>
  );
}

/** The student's own fees: what is required, paid and outstanding, grouped by academic year then term, with each invoice's
 * breakdown and receipts. Increments and payments are reflected here and arrive as notifications. */
export function MyFeesPage() {
  const { data, isLoading, isError, error } = useMyFees();
  if (isLoading) return <FullPageSpinner />;
  if (isError || !data) return <Alert tone="danger">{(error as ApiError | undefined)?.message ?? "Could not load your fees."}</Alert>;
  if (!data.summary || data.summary.invoice_count === 0) {
    return <EmptyState icon={Wallet} title="No fees yet" description="When the school bills you, the fees and what you have paid will show here." />;
  }

  const overall = OVERALL[data.summary.status];
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">My fees</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">What is required, what you have paid and what is left, by academic year and term.</p>
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base font-semibold">Overall</CardTitle>
          <Badge tone={overall.tone}>{overall.label}</Badge>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Totals totals={data.summary} />
          {Number(data.summary.overdue) > 0 && (
            <Alert tone="danger">{money(data.summary.overdue)} of your balance is past its due date.</Alert>
          )}
        </CardContent>
      </Card>

      {data.years.map((year) => (
        <section key={year.academic_year_id} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">{year.academic_year}</h2>
            <span className="text-sm text-[var(--color-text-muted)]">Outstanding {money(year.totals.outstanding)}</span>
          </div>
          {year.terms.map((term) => (
            <Card key={term.term_id ?? "year"}>
              <CardHeader>
                <CardTitle className="text-base font-semibold">{term.term}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <Totals totals={term.totals} />
                {term.invoices.map((inv) => (
                  <div key={inv.id} className="rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-[var(--color-text)]">{inv.invoice_number}</p>
                        {inv.due_date && <p className="text-xs text-[var(--color-text-muted)]">Due {inv.due_date}</p>}
                      </div>
                      {invoiceBadge(inv)}
                    </div>
                    <ul className="mt-3 divide-y divide-[var(--color-border)] text-sm">
                      {inv.line_items.map((line, i) => (
                        <li key={i} className="flex items-center justify-between gap-3 py-1.5">
                          <span className="min-w-0 truncate">{line.description}</span>
                          <span className="shrink-0">{money(line.amount)}</span>
                        </li>
                      ))}
                      {Number(inv.discount_total) > 0 && (
                        <li className="flex items-center justify-between gap-3 py-1.5 text-[var(--color-success)]">
                          <span>Discount</span>
                          <span>− {money(inv.discount_total)}</span>
                        </li>
                      )}
                      <li className="flex items-center justify-between gap-3 py-1.5 font-semibold">
                        <span>Total</span>
                        <span>{money(inv.total)}</span>
                      </li>
                      <li className="flex items-center justify-between gap-3 py-1.5">
                        <span>Paid</span>
                        <span>{money(inv.amount_paid)}</span>
                      </li>
                      <li className="flex items-center justify-between gap-3 py-1.5 font-semibold">
                        <span>Balance</span>
                        <span>{money(inv.balance)}</span>
                      </li>
                    </ul>
                    {inv.payments.length > 0 && (
                      <div className="mt-3 flex flex-col gap-1">
                        <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Payments</p>
                        {inv.payments.map((p) => (
                          <Link
                            key={p.id}
                            to={`/my-fees/receipts/${p.id}`}
                            className="flex min-h-10 flex-wrap items-center justify-between gap-2 text-sm text-[var(--color-primary)]"
                          >
                            <span className="inline-flex items-center gap-1.5">
                              <Receipt className="size-4" aria-hidden="true" />
                              {p.receipt_number} · {new Date(p.paid_at).toLocaleDateString()}
                            </span>
                            <span className="font-semibold">{money(p.amount)}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </section>
      ))}
    </div>
  );
}
