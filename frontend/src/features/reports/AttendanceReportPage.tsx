import { CalendarCheck2, Download } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FullPageSpinner, Spinner } from "@/components/ui/Spinner";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import { useSchoolClasses } from "@/features/academics/useAcademicsLookups";
import { useHasPermission } from "@/features/auth/useAuth";
import type { ApiError } from "@/lib/api-client";

import { StatCard } from "../dashboard/StatCard";
import { reportStatusLabel, reportStatusTone } from "./statusTone";
import { useAttendanceReport, useDownloadReportCsv } from "./useReportsCrud";

function attendanceRateTone(rate: number | null): "neutral" | "success" | "warning" | "danger" {
  if (rate === null) return "neutral";
  if (rate >= 90) return "success";
  if (rate >= 75) return "warning";
  return "danger";
}

export function AttendanceReportPage() {
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = `${today.slice(0, 7)}-01`;

  const [startDate, setStartDate] = useState(monthStart);
  const [endDate, setEndDate] = useState(today);
  const [schoolClass, setSchoolClass] = useState("");

  const { data: classes } = useSchoolClasses();
  const canExport = useHasPermission("reports.export");
  const downloadCsv = useDownloadReportCsv();

  const params = { start_date: startDate, end_date: endDate, school_class: schoolClass || undefined };
  const { data, isLoading, isFetching, isError, error } = useAttendanceReport(params, {
    enabled: !!startDate && !!endDate && startDate <= endDate,
  });

  const dateRangeInvalid = !!startDate && !!endDate && startDate > endDate;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="w-full max-w-[160px]">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className="w-full max-w-[160px]">
            <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="w-full max-w-xs">
            <Select value={schoolClass} onChange={(e) => setSchoolClass(e.target.value)}>
              <option value="">All classes</option>
              {classes?.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {canExport && (
          <Button
            variant="secondary"
            isLoading={downloadCsv.isPending}
            disabled={dateRangeInvalid}
            onClick={() => downloadCsv.mutate(["attendance", params, "attendance_report.csv"])}
          >
            {!downloadCsv.isPending && <Download className="size-4" aria-hidden="true" />}
            Export CSV
          </Button>
        )}
      </div>

      {dateRangeInvalid && <Alert tone="danger">End date must be on or after the start date.</Alert>}
      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data ? (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard icon={CalendarCheck2} label="Total records" value={data.total_records} />
            <StatCard
              icon={CalendarCheck2}
              label="Attendance rate"
              value={data.attendance_rate_percent === null ? "No data" : `${data.attendance_rate_percent}%`}
              tone={attendanceRateTone(data.attendance_rate_percent)}
            />
          </div>

          <TableContainer>
            <Table>
              <TableHead>
                <tr>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell className="text-right">Records</TableHeaderCell>
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
        </>
      ) : null}

      {isFetching && !isLoading && (
        <div className="flex justify-center">
          <Spinner />
        </div>
      )}
    </div>
  );
}
