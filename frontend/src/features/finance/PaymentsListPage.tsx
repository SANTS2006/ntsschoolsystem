import { Printer, Receipt } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
import { Pagination } from "@/components/ui/Pagination";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { Select } from "@/components/ui/Select";
import { FullPageSpinner, Spinner } from "@/components/ui/Spinner";
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
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";

import { paymentStatusTone, statusLabel } from "./statusTone";
import type { PaymentMethod, PaymentStatus } from "./types";
import { usePaymentList } from "./usePaymentsCrud";

const PAGE_SIZE = 25;
const METHOD_OPTIONS: PaymentMethod[] = ["cash", "bank_transfer", "card", "mobile_money", "cheque", "other"];
const STATUS_OPTIONS: PaymentStatus[] = ["completed", "partially_refunded", "refunded"];

export function PaymentsListPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const [status, setStatus] = useState<PaymentStatus | "">("");

  const filterParams = { method: method || undefined, status: status || undefined };
  const { data, isLoading, isError, error, isFetching } = usePaymentList({
    page,
    page_size: PAGE_SIZE,
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("finance/payments", filterParams);

  return (
    <div className="flex flex-col gap-4">
      {stats && (
        <ScrollReveal>
          <StatRow items={[{ key: "total", label: "Total payments", value: stats.total as number, icon: Receipt }]} />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
        <div className="w-full max-w-[200px]">
          <Select
            value={method}
            onChange={(e) => {
              setMethod(e.target.value as PaymentMethod | "");
              setPage(1);
            }}
          >
            <option value="">All methods</option>
            {METHOD_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {statusLabel(option)}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full max-w-[180px]">
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as PaymentStatus | "");
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {statusLabel(option)}
              </option>
            ))}
          </Select>
        </div>
        </div>
        <ExportCsvButton path="/finance/payments/" params={filterParams} filename="payments.csv" />
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={Receipt} title="No payments found" description="Try adjusting your filters." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Receipt #</TableHeaderCell>
                <TableHeaderCell>Invoice #</TableHeaderCell>
                <TableHeaderCell>Student</TableHeaderCell>
                <TableHeaderCell>Amount</TableHeaderCell>
                <TableHeaderCell>Method</TableHeaderCell>
                <TableHeaderCell>Paid at</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell className="text-right">Receipt</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((payment) => (
                <TableRowLink key={payment.id} onClick={() => navigate(`/finance/payments/${payment.id}/refund`)}>
                  <TableCell className="font-medium">{payment.receipt_number}</TableCell>
                  <TableCell>{payment.invoice_number}</TableCell>
                  <TableCell>{payment.student_name}</TableCell>
                  <TableCell>{payment.amount}</TableCell>
                  <TableCell>{statusLabel(payment.method)}</TableCell>
                  <TableCell>{new Date(payment.paid_at).toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge tone={paymentStatusTone(payment.status)}>{statusLabel(payment.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/finance/payments/${payment.id}/receipt`);
                      }}
                      aria-label={`View receipt for ${payment.receipt_number}`}
                      className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)]"
                    >
                      <Printer className="size-4" aria-hidden="true" />
                    </button>
                  </TableCell>
                </TableRowLink>
              ))}
            </TableBody>
          </Table>
          <div className="border-t border-[var(--color-border)]">
            <Pagination page={page} pageSize={PAGE_SIZE} count={data.count} onPageChange={setPage} />
          </div>
        </TableContainer>
        </ScrollReveal>
      ) : null}

      {isFetching && !isLoading && (
        <div className="flex justify-center">
          <Spinner />
        </div>
      )}
    </div>
  );
}
