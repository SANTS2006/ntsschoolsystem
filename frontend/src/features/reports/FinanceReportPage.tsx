import { Download, Wallet } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import { useAcademicYears } from "@/features/academics/useAcademicsLookups";
import { useHasPermission } from "@/features/auth/useAuth";
import type { ApiError } from "@/lib/api-client";

import { StatCard } from "../dashboard/StatCard";
import { reportStatusLabel, reportStatusTone } from "./statusTone";
import { useDownloadReportCsv, useFinanceReport } from "./useReportsCrud";

function formatCurrency(value: string): string {
  return Number(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function FinanceReportPage() {
  const [academicYearId, setAcademicYearId] = useState("");

  const { data: years } = useAcademicYears();
  const canExport = useHasPermission("reports.export");
  const downloadCsv = useDownloadReportCsv();

  const { data, isLoading, isError, error } = useFinanceReport(academicYearId || undefined);

  if (isLoading) return <FullPageSpinner />;
  if (isError || !data) return <Alert tone="danger">{(error as ApiError)?.message ?? "Failed to load the finance report."}</Alert>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-xs">
          <Select value={academicYearId} onChange={(e) => setAcademicYearId(e.target.value)}>
            <option value="">All academic years</option>
            {years?.map((year) => (
              <option key={year.id} value={year.id}>
                {year.name}
              </option>
            ))}
          </Select>
        </div>
        {canExport && (
          <Button
            variant="secondary"
            isLoading={downloadCsv.isPending}
            onClick={() =>
              downloadCsv.mutate([
                "finance",
                { academic_year_id: academicYearId || undefined },
                "finance_report.csv",
              ])
            }
          >
            {!downloadCsv.isPending && <Download className="size-4" aria-hidden="true" />}
            Export CSV
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard icon={Wallet} label="Total invoiced" value={formatCurrency(data.total_invoiced)} />
        <StatCard icon={Wallet} label="Total collected" value={formatCurrency(data.total_collected)} tone="success" />
        <StatCard
          icon={Wallet}
          label="Total outstanding"
          value={formatCurrency(data.total_outstanding)}
          tone={Number(data.total_outstanding) > 0 ? "warning" : "neutral"}
        />
        <StatCard
          icon={Wallet}
          label="Overdue invoices"
          value={data.overdue_count}
          tone={data.overdue_count > 0 ? "danger" : "neutral"}
        />
        <StatCard
          icon={Wallet}
          label="Overdue amount"
          value={formatCurrency(data.overdue_amount)}
          tone={Number(data.overdue_amount) > 0 ? "danger" : "neutral"}
        />
      </div>

      <TableContainer>
        <Table>
          <TableHead>
            <tr>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell className="text-right">Invoices</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {data.by_status.map((row) => (
              <TableRow key={row.status}>
                <TableCell>
                  <Badge tone={reportStatusTone(row.status)}>{reportStatusLabel(row.status)}</Badge>
                </TableCell>
                <TableCell className="text-right">{row.count}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
}
