import { ListChecks, Plus, Trash2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/confirmContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { StatRow } from "@/components/ui/StatRow";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
  TableRowLink,
} from "@/components/ui/Table";
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";
import { generalErrorMessage } from "@/lib/formErrors";

import { statusLabel } from "./statusTone";
import { useDeleteInvoiceLineItem, useInvoice, useInvoiceLineItemList } from "./useFeesCrud";
import { usePaymentList } from "./usePaymentsCrud";

export function InvoiceLineItemsListPage() {
  const { invoiceId } = useParams<{ invoiceId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("fees.create");
  const canDelete = useHasPermission("fees.delete");

  const { data: invoice, isLoading: isLoadingInvoice } = useInvoice(invoiceId);
  const { data, isLoading, isError, error } = useInvoiceLineItemList({
    invoice: invoiceId as string,
    page_size: 100,
  });
  const { data: payments } = usePaymentList({ invoice: invoiceId, page_size: 1 });
  const { data: stats } = useSummaryStats("finance/invoice-line-items", { invoice: invoiceId });
  const deleteItem = useDeleteInvoiceLineItem();

  // The backend rejects any add/edit/delete once a payment exists against this invoice —
  // hiding the actions here is a courtesy, not the real enforcement (that stays server-side).
  const isLocked = (payments?.count ?? 0) > 0;

  const handleDelete = async (id: string, description: string) => {
    const ok = await confirm({
      title: `Remove this line item (${description})?`,
      description: "This cannot be undone.",
      tone: "danger",
    });
    if (!ok) return;
    deleteItem.mutate(id, {
      onSuccess: () => showToast({ title: "Line item removed" }),
      onError: (err: ApiError) =>
        showToast({ title: "Failed to remove", description: generalErrorMessage(err), tone: "danger" }),
    });
  };

  if (isLoadingInvoice) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={() => navigate(`/finance/invoices/${invoiceId}`)}
        className="back-button"
      >
        <BackArrowIcon className="size-4" />
        Back to invoice
      </button>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">
          Line items for {invoice?.invoice_number ?? "this invoice"}
        </h2>
        <div className="flex items-center gap-2">
          <ExportCsvButton
            path="/finance/invoice-line-items/"
            params={{ invoice: invoiceId }}
            filename="invoice_line_items.csv"
          />
          {canCreate && !isLocked && (
            <Button onClick={() => navigate(`/finance/invoices/${invoiceId}/line-items/new`)}>
              <Plus className="size-4" aria-hidden="true" />
              New line item
            </Button>
          )}
        </div>
      </div>

      {stats && (
        <ScrollReveal>
          <StatRow items={[{ key: "total", label: "Total line items", value: stats.total as number, icon: ListChecks }]} />
        </ScrollReveal>
      )}

      {isLocked && (
        <Alert tone="warning">
          A payment has already been recorded against this invoice — line items can no longer be added, edited, or
          removed.
        </Alert>
      )}

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={ListChecks} title="No line items yet" />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Category</TableHeaderCell>
                <TableHeaderCell>Type</TableHeaderCell>
                <TableHeaderCell>Description</TableHeaderCell>
                <TableHeaderCell>Amount</TableHeaderCell>
                {canDelete && !isLocked && <TableHeaderCell className="text-right">Actions</TableHeaderCell>}
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((item) => (
                <TableRowLink
                  key={item.id}
                  onClick={() => {
                    if (!isLocked) navigate(`/finance/invoices/${invoiceId}/line-items/${item.id}/edit`);
                  }}
                >
                  <TableCell className="font-medium">
                    {item.fee_category_name ?? <span className="text-[var(--color-text-muted)]">—</span>}
                  </TableCell>
                  <TableCell>{statusLabel(item.line_type)}</TableCell>
                  <TableCell>{item.description || <span className="text-[var(--color-text-muted)]">—</span>}</TableCell>
                  <TableCell>{item.amount}</TableCell>
                  {canDelete && !isLocked && (
                    <TableCell className="text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(item.id, item.description || item.fee_category_name || "line item");
                        }}
                        aria-label="Remove line item"
                        className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-danger)]"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </TableCell>
                  )}
                </TableRowLink>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        </ScrollReveal>
      ) : null}
    </div>
  );
}
