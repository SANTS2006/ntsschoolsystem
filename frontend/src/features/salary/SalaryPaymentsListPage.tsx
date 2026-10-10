import { Banknote, Printer, Wand2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
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
import { useHasPermission } from "@/features/auth/useAuth";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";

import { salaryPaymentStatusTone, statusLabel } from "./statusTone";
import type { SalaryPaymentStatus } from "./types";
import { useSalaryPaymentList } from "./useSalaryCrud";

const STATUS_OPTIONS: SalaryPaymentStatus[] = ["pending", "paid", "cancelled"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function SalaryPaymentsListPage() {
  const navigate = useNavigate();
  const canCreate = useHasPermission("salary.create");
  const [status, setStatus] = useState<SalaryPaymentStatus | "">("");

  const filterParams = { status: status || undefined };
  const { data, isLoading, isError, error, isFetching } = useSalaryPaymentList({
    page_size: 100,
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("salary/payments", filterParams);

  return (
    <div className="flex flex-col gap-4">
      {stats && (
        <ScrollReveal>
          <StatRow items={[{ key: "total", label: "Total salary payments", value: stats.total as number, icon: Banknote }]} />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-[180px]">
          <Select value={status} onChange={(e) => setStatus(e.target.value as SalaryPaymentStatus | "")}>
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {statusLabel(option)}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/salary/payments/" params={filterParams} filename="salary_payments.csv" />
          {canCreate && (
            <Button onClick={() => navigate("/salary/generate")}>
              <Wand2 className="size-4" aria-hidden="true" />
              Generate this month's payments
            </Button>
          )}
        </div>
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={Banknote} title="No salary payments found" description="Generate this month's payments, or adjust your filters." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Payment #</TableHeaderCell>
                <TableHeaderCell>Staff</TableHeaderCell>
                <TableHeaderCell>Period</TableHeaderCell>
                <TableHeaderCell>Gross</TableHeaderCell>
                <TableHeaderCell>Deductions</TableHeaderCell>
                <TableHeaderCell>Net</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell className="text-right">Receipt</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((payment) => (
                <TableRowLink
                  key={payment.id}
                  onClick={() => payment.status === "pending" && navigate(`/salary/payments/${payment.id}/pay`)}
                >
                  <TableCell className="font-medium">{payment.payment_number}</TableCell>
                  <TableCell>{payment.staff_name}</TableCell>
                  <TableCell>
                    {MONTH_NAMES[payment.period_month - 1]} {payment.period_year}
                  </TableCell>
                  <TableCell>{payment.gross_amount}</TableCell>
                  <TableCell>{payment.deductions_total}</TableCell>
                  <TableCell className="font-medium">{payment.net_amount}</TableCell>
                  <TableCell>
                    <Badge tone={salaryPaymentStatusTone(payment.status)}>{statusLabel(payment.status)}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/salary/payments/${payment.id}/receipt`);
                      }}
                      aria-label={`View receipt for ${payment.payment_number}`}
                      className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)]"
                    >
                      <Printer className="size-4" aria-hidden="true" />
                    </button>
                  </TableCell>
                </TableRowLink>
              ))}
            </TableBody>
          </Table>
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
