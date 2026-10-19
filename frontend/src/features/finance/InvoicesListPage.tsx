import { AlertTriangle, BellRing, CheckCircle2, Clock, FileText, Plus, Search } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { useConfirm } from "@/components/ui/confirmContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
import { Input } from "@/components/ui/Input";
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
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";

import { useRemindInvoice, useSendReminders } from "./reminders";
import { invoiceStatusTone, statusLabel } from "./statusTone";
import type { InvoiceStatus } from "./types";
import { useInvoiceList, useOutstandingInvoiceList } from "./useFeesCrud";

const PAGE_SIZE = 25;
const STATUS_OPTIONS: InvoiceStatus[] = ["unpaid", "partially_paid", "paid", "cancelled"];

export function InvoicesListPage() {
  const navigate = useNavigate();
  const canCreate = useHasPermission("fees.create");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<InvoiceStatus | "">("");
  const [outstandingOnly, setOutstandingOnly] = useState(false);
  const debouncedSearch = useDebounce(search);

  const filterParams = {
    search: debouncedSearch || undefined,
    status: status || undefined,
  };
  const params = {
    page,
    page_size: PAGE_SIZE,
    ...filterParams,
  };
  const listQuery = useInvoiceList(params, { enabled: !outstandingOnly });
  const outstandingQuery = useOutstandingInvoiceList(params, { enabled: outstandingOnly });
  const { data, isLoading, isError, error, isFetching } = outstandingOnly ? outstandingQuery : listQuery;
  const { data: stats } = useSummaryStats("finance/invoices", filterParams);
  const canRemind = useHasPermission("fees.update");
  const { showToast } = useToast();
  const confirm = useConfirm();
  const sendReminders = useSendReminders();
  const remindOne = useRemindInvoice();

  const handleRemindAll = async () => {
    const ok = await confirm({
      title: "Remind every student with an unpaid balance?",
      description: "Each student (and their guardians) is notified about their outstanding fees. Anyone reminded in the last 24 hours is skipped.",
    });
    if (!ok) return;
    sendReminders.mutate(
      {},
      {
        onSuccess: (r) => showToast({ title: r.message }),
        onError: (err) => showToast({ title: "Could not send reminders", description: err.message, tone: "danger" }),
      },
    );
  };

  const handleRemindOne = (id: string, name: string) => {
    remindOne.mutate(id, {
      onSuccess: () => showToast({ title: `Reminder sent to ${name}` }),
      onError: (err) => showToast({ title: "Not sent", description: err.message, tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {stats && (
        <ScrollReveal>
          <StatRow
            items={[
              { key: "total", label: "Total invoices", value: stats.total as number, icon: FileText },
              {
                key: "unpaid",
                label: "Unpaid",
                value: (stats.by_status as Record<string, number>)?.unpaid ?? 0,
                icon: AlertTriangle,
              },
              {
                key: "partially_paid",
                label: "Partially paid",
                value: (stats.by_status as Record<string, number>)?.partially_paid ?? 0,
                icon: Clock,
              },
              {
                key: "paid",
                label: "Paid",
                value: (stats.by_status as Record<string, number>)?.paid ?? 0,
                tone: "success",
                icon: CheckCircle2,
              },
            ]}
          />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-full max-w-xs">
            <Input
              icon={Search}
              placeholder="Search by invoice number"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="w-full max-w-[180px]">
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as InvoiceStatus | "");
                setPage(1);
              }}
              disabled={outstandingOnly}
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {statusLabel(option)}
                </option>
              ))}
            </Select>
          </div>
          <Checkbox
            label="Outstanding only"
            checked={outstandingOnly}
            onChange={(e) => {
              setOutstandingOnly(e.target.checked);
              setPage(1);
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canRemind && (
            <Button variant="secondary" onClick={handleRemindAll} isLoading={sendReminders.isPending}>
              {!sendReminders.isPending && <BellRing className="size-4" aria-hidden="true" />}
              Remind unpaid
            </Button>
          )}
          <ExportCsvButton path="/finance/invoices/" params={filterParams} filename="invoices.csv" />
          {canCreate && (
            <Button onClick={() => navigate("/finance/invoices/new")}>
              <Plus className="size-4" aria-hidden="true" />
              New invoice
            </Button>
          )}
        </div>
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={FileText} title="No invoices found" description="Try adjusting your search or filters." />
      ) : data ? (
        <ScrollReveal>
          <TableContainer>
            <Table>
              <TableHead>
                <tr>
                  <TableHeaderCell>Invoice #</TableHeaderCell>
                  <TableHeaderCell>Student</TableHeaderCell>
                  <TableHeaderCell>Total</TableHeaderCell>
                  <TableHeaderCell>Balance</TableHeaderCell>
                  <TableHeaderCell>Due date</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  {canRemind && <TableHeaderCell className="text-right">Remind</TableHeaderCell>}
                </tr>
              </TableHead>
              <TableBody>
                {data.results.map((invoice) => (
                  <TableRowLink key={invoice.id} onClick={() => navigate(`/finance/invoices/${invoice.id}`)}>
                    <TableCell className="font-medium">{invoice.invoice_number}</TableCell>
                    <TableCell>{invoice.student_name}</TableCell>
                    <TableCell>{invoice.total}</TableCell>
                    <TableCell>{invoice.balance}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {invoice.due_date ?? <span className="text-[var(--color-text-muted)]">—</span>}
                        {invoice.is_overdue && <AlertTriangle className="size-3.5 text-[var(--color-danger)]" aria-label="Overdue" />}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge tone={invoiceStatusTone(invoice.status)}>{statusLabel(invoice.status)}</Badge>
                    </TableCell>
                    {canRemind && (
                      <TableCell className="text-right">
                        {Number(invoice.balance) > 0 && invoice.status !== "cancelled" && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemindOne(invoice.id, invoice.student_name);
                            }}
                            disabled={remindOne.isPending}
                            aria-label={`Remind ${invoice.student_name}`}
                            className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)] disabled:opacity-50"
                          >
                            <BellRing className="size-4" aria-hidden="true" />
                          </button>
                        )}
                      </TableCell>
                    )}
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
