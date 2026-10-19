import { AlertTriangle, BellRing, ListChecks, Wallet, XCircle } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/confirmContext";
import { FullPageSpinner } from "@/components/ui/Spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/ui/Table";
import { useToast } from "@/components/ui/toastContext";
import { useTermList } from "@/features/academics/useAcademicsCrud";
import { useAcademicYears } from "@/features/academics/useAcademicsLookups";
import { useHasPermission } from "@/features/auth/useAuth";
import type { ApiError } from "@/lib/api-client";
import { generalErrorMessage } from "@/lib/formErrors";

import { invoiceStatusTone, paymentStatusTone, statusLabel } from "./statusTone";
import { useRemindInvoice } from "./reminders";
import { useCancelInvoice, useInvoice, useInvoiceLineItemList } from "./useFeesCrud";
import { usePaymentList } from "./usePaymentsCrud";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-0.5 break-words text-sm text-[var(--color-text)]">
        {value || <span className="text-[var(--color-text-muted)]">—</span>}
      </p>
    </div>
  );
}

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canUpdate = useHasPermission("fees.update");
  const canRecordPayment = useHasPermission("payments.record");

  const { data: invoice, isLoading, isError, error } = useInvoice(id);
  const { data: lineItems } = useInvoiceLineItemList({ invoice: id as string, page_size: 100 });
  const { data: payments } = usePaymentList({ invoice: id, page_size: 100 });
  const cancelInvoice = useCancelInvoice();
  const remind = useRemindInvoice();

  // InvoiceSerializer doesn't expose academic_year_name/term_name companions (unlike every
  // other domain's raw-FK pattern) — resolved here from the same lookups every other form
  // already uses, rather than adding a backend field for two read-only display labels.
  const { data: academicYears } = useAcademicYears();
  const { data: terms } = useTermList({ page_size: 100 });
  const academicYearName = academicYears?.find((year) => year.id === invoice?.academic_year)?.name;
  const termName = terms?.results.find((term) => term.id === invoice?.term)?.name;

  const handleCancel = async () => {
    if (!invoice) return;
    const ok = await confirm({
      title: `Cancel invoice ${invoice.invoice_number}?`,
      description: "This cannot be undone.",
      tone: "danger",
    });
    if (!ok) return;
    cancelInvoice.mutate(invoice.id, {
      onSuccess: () => showToast({ title: "Invoice cancelled" }),
      onError: (err: ApiError) =>
        showToast({ title: "Could not cancel invoice", description: generalErrorMessage(err), tone: "danger" }),
    });
  };

  const handleRemind = () => {
    if (!invoice) return;
    remind.mutate(invoice.id, {
      onSuccess: () => showToast({ title: `Reminder sent to ${invoice.student_name}` }),
      onError: (err: ApiError) => showToast({ title: "Reminder not sent", description: generalErrorMessage(err), tone: "danger" }),
    });
  };

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError || !invoice) {
    return <Alert tone="danger">{(error as ApiError)?.message ?? "Invoice not found."}</Alert>;
  }

  const canCancel = invoice.status !== "cancelled" && Number(invoice.amount_paid) === 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate("/finance/invoices")}
          className="back-button"
        >
          <BackArrowIcon className="size-4" />
          Back to invoices
        </button>
        <div className="flex flex-wrap gap-2">
          {canUpdate && Number(invoice.balance) > 0 && invoice.status !== "cancelled" && (
            <Button variant="secondary" size="sm" onClick={handleRemind} isLoading={remind.isPending}>
              <BellRing className="size-4" aria-hidden="true" />
              Send reminder
            </Button>
          )}
          {canUpdate && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate(`/finance/invoices/${invoice.id}/line-items`)}
            >
              <ListChecks className="size-4" aria-hidden="true" />
              Line items
            </Button>
          )}
          {canRecordPayment && invoice.status !== "cancelled" && Number(invoice.balance) > 0 && (
            <Button size="sm" onClick={() => navigate(`/finance/invoices/${invoice.id}/pay`)}>
              <Wallet className="size-4" aria-hidden="true" />
              Record payment
            </Button>
          )}
          {canUpdate && canCancel && (
            <Button variant="danger" size="sm" onClick={handleCancel} isLoading={cancelInvoice.isPending}>
              <XCircle className="size-4" aria-hidden="true" />
              Cancel
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <CardTitle className="break-words text-base font-semibold text-[var(--color-text)]">{invoice.invoice_number}</CardTitle>
            <p className="break-words text-sm text-[var(--color-text-muted)]">{invoice.student_name}</p>
          </div>
          <div className="flex items-center gap-2">
            {invoice.is_overdue && (
              <span className="flex items-center gap-1 text-xs font-medium text-[var(--color-danger)]">
                <AlertTriangle className="size-3.5" aria-hidden="true" />
                Overdue
              </span>
            )}
            <Badge tone={invoiceStatusTone(invoice.status)}>{statusLabel(invoice.status)}</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 sm:grid-cols-3">
          <Field label="Academic year" value={academicYearName} />
          <Field label="Term" value={termName} />
          <Field label="Due date" value={invoice.due_date} />
          <Field label="Subtotal" value={invoice.subtotal} />
          <Field label="Discount total" value={invoice.discount_total} />
          <Field label="Total" value={invoice.total} />
          <Field label="Amount paid" value={invoice.amount_paid} />
          <Field label="Balance" value={invoice.balance} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Line items</CardTitle>
        </CardHeader>
        <CardContent>
          <TableContainer>
            <Table>
              <TableHead>
                <tr>
                  <TableHeaderCell>Category</TableHeaderCell>
                  <TableHeaderCell>Type</TableHeaderCell>
                  <TableHeaderCell>Description</TableHeaderCell>
                  <TableHeaderCell>Amount</TableHeaderCell>
                </tr>
              </TableHead>
              <TableBody>
                {lineItems?.results.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.fee_category_name ?? <span className="text-[var(--color-text-muted)]">—</span>}</TableCell>
                    <TableCell>{statusLabel(item.line_type)}</TableCell>
                    <TableCell>{item.description || <span className="text-[var(--color-text-muted)]">—</span>}</TableCell>
                    <TableCell>{item.amount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Payments</CardTitle>
        </CardHeader>
        <CardContent>
          {payments && payments.results.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)]">No payments recorded yet.</p>
          ) : (
            <TableContainer>
              <Table>
                <TableHead>
                  <tr>
                    <TableHeaderCell>Receipt #</TableHeaderCell>
                    <TableHeaderCell>Amount</TableHeaderCell>
                    <TableHeaderCell>Method</TableHeaderCell>
                    <TableHeaderCell>Paid at</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                  </tr>
                </TableHead>
                <TableBody>
                  {payments?.results.map((payment) => (
                    <TableRow
                      key={payment.id}
                      className="cursor-pointer hover:bg-[var(--color-bg-subtle)]"
                      onClick={() => navigate(`/finance/payments/${payment.id}/refund`)}
                    >
                      <TableCell className="font-medium">{payment.receipt_number}</TableCell>
                      <TableCell>{payment.amount}</TableCell>
                      <TableCell>{statusLabel(payment.method)}</TableCell>
                      <TableCell>{new Date(payment.paid_at).toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge tone={paymentStatusTone(payment.status)}>{statusLabel(payment.status)}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
