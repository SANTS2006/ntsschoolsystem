import { AlertTriangle, BookMarked, BookOpen, RotateCw, Undo2 } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { useConfirm } from "@/components/ui/confirmContext";
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
  TableRow,
} from "@/components/ui/Table";
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";
import { generalErrorMessage } from "@/lib/formErrors";

import { loanStatusTone, statusLabel } from "./statusTone";
import type { LoanStatus } from "./types";
import { useLoanList, useRenewLoan, useReturnLoan } from "./useLibraryCrud";

const PAGE_SIZE = 25;
const STATUS_OPTIONS: LoanStatus[] = ["borrowed", "returned", "lost"];
const MAX_RENEWALS = 2;

export function LoansListPage() {
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canUpdate = useHasPermission("library.update");

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<LoanStatus | "">("");

  const filterParams = { status: status || undefined };
  const { data, isLoading, isError, error, isFetching } = useLoanList({
    page,
    page_size: PAGE_SIZE,
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("library/loans", filterParams);
  const returnLoan = useReturnLoan();
  const renewLoan = useRenewLoan();

  const handleReturn = async (id: string, borrower: string) => {
    const ok = await confirm({
      title: `Mark this book as returned by ${borrower}?`,
      tone: "neutral",
    });
    if (!ok) return;
    returnLoan.mutate(id, {
      onSuccess: () => showToast({ title: "Book returned" }),
      onError: (err: ApiError) =>
        showToast({ title: "Could not return book", description: generalErrorMessage(err), tone: "danger" }),
    });
  };

  const handleRenew = (id: string) => {
    renewLoan.mutate(id, {
      onSuccess: () => showToast({ title: "Loan renewed" }),
      onError: (err: ApiError) =>
        showToast({ title: "Could not renew loan", description: generalErrorMessage(err), tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {stats && (
        <ScrollReveal>
          <StatRow
            items={[
              { key: "total", label: "Total loans", value: stats.total as number, icon: BookMarked },
              { key: "borrowed", label: "Borrowed", value: stats.borrowed as number, icon: BookOpen },
              { key: "overdue", label: "Overdue", value: stats.overdue as number, tone: "danger", icon: AlertTriangle },
            ]}
          />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-[180px]">
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as LoanStatus | "");
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
        <ExportCsvButton path="/library/loans/" params={filterParams} filename="library_loans.csv" />
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={BookMarked} title="No loans found" description="Try adjusting your filters." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Book</TableHeaderCell>
                <TableHeaderCell>Borrower</TableHeaderCell>
                <TableHeaderCell>Due date</TableHeaderCell>
                <TableHeaderCell>Fine</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                {canUpdate && <TableHeaderCell className="text-right">Actions</TableHeaderCell>}
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((loan) => (
                <TableRow key={loan.id}>
                  <TableCell className="font-medium">
                    {loan.book_title} ({loan.copy_number})
                  </TableCell>
                  <TableCell>{loan.borrower_name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      {loan.due_date}
                      {loan.is_overdue && <AlertTriangle className="size-3.5 text-[var(--color-danger)]" aria-label="Overdue" />}
                    </div>
                  </TableCell>
                  <TableCell>{loan.fine_amount !== "0.00" ? loan.fine_amount : <span className="text-[var(--color-text-muted)]">—</span>}</TableCell>
                  <TableCell>
                    <Badge tone={loanStatusTone(loan.status)}>{statusLabel(loan.status)}</Badge>
                  </TableCell>
                  {canUpdate && (
                    <TableCell className="text-right">
                      {loan.status === "borrowed" && (
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleRenew(loan.id)}
                            disabled={loan.renewal_count >= MAX_RENEWALS || renewLoan.isPending}
                            aria-label="Renew loan"
                            title={loan.renewal_count >= MAX_RENEWALS ? "Maximum renewals reached" : "Renew"}
                            className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <RotateCw className="size-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReturn(loan.id, loan.borrower_name)}
                            disabled={returnLoan.isPending}
                            aria-label="Return book"
                            className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-success)] disabled:opacity-40"
                          >
                            <Undo2 className="size-4" aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
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
