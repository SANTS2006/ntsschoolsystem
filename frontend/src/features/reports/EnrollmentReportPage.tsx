import { Download, GraduationCap, Users } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import { useHasPermission } from "@/features/auth/useAuth";
import type { ApiError } from "@/lib/api-client";

import { StatCard } from "../dashboard/StatCard";
import { reportStatusLabel, reportStatusTone } from "./statusTone";
import { useDownloadReportCsv, useEnrollmentReport } from "./useReportsCrud";

export function EnrollmentReportPage() {
  const { data, isLoading, isError, error } = useEnrollmentReport();
  const canExport = useHasPermission("reports.export");
  const downloadCsv = useDownloadReportCsv();

  if (isLoading) return <FullPageSpinner />;
  if (isError || !data) return <Alert tone="danger">{(error as ApiError)?.message ?? "Failed to load the enrollment report."}</Alert>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Enrollment</h2>
        {canExport && (
          <Button
            variant="secondary"
            isLoading={downloadCsv.isPending}
            onClick={() =>
              downloadCsv.mutate(["enrollment", {}, "enrollment_report.csv"])
            }
          >
            {!downloadCsv.isPending && <Download className="size-4" aria-hidden="true" />}
            Export CSV
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatCard icon={GraduationCap} label="Total students" value={data.total_students} />
        <StatCard icon={Users} label="Classes represented" value={data.by_class.length} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell className="text-right">Students</TableHeaderCell>
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

        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Class</TableHeaderCell>
                <TableHeaderCell className="text-right">Students</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {data.by_class.map((row) => (
                <TableRow key={row.current_class__name ?? "unassigned"}>
                  <TableCell>{row.current_class__name ?? <span className="text-[var(--color-text-muted)]">Unassigned</span>}</TableCell>
                  <TableCell className="text-right">{row.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Gender</TableHeaderCell>
                <TableHeaderCell className="text-right">Students</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {data.by_gender.map((row) => (
                <TableRow key={row.gender}>
                  <TableCell className="capitalize">
                    {row.gender || <span className="text-[var(--color-text-muted)]">Unspecified</span>}
                  </TableCell>
                  <TableCell className="text-right">{row.count}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </div>
    </div>
  );
}
