import { CalendarCheck } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import type { ApiError } from "@/lib/api-client";

import { attendanceStatusLabel } from "./statusTone";
import { useMyStaffAttendance } from "./useAttendanceCrud";

/** Staff self-service: read-only — a staff member sees their own attendance once a
 * Principal/School Administrator has marked and saved it, and never adds/edits/deletes it
 * themselves (they hold no staff_attendance.* permission for that at all). */
export function MyStaffAttendancePage() {
  const { data: records, isLoading, isError, error } = useMyStaffAttendance();

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError) {
    return <Alert tone="danger">{(error as ApiError).message}</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">My Attendance</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Your own attendance record, as marked by your school administrator.
        </p>
      </div>

      {!records || records.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="No attendance recorded yet" />
      ) : (
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Date</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Notes</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {records.map((record) => (
                <TableRow key={record.id}>
                  <TableCell>{record.date}</TableCell>
                  <TableCell>
                    <Badge tone="neutral">{attendanceStatusLabel(record.status)}</Badge>
                  </TableCell>
                  <TableCell>{record.notes || <span className="text-[var(--color-text-muted)]">—</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </div>
  );
}
