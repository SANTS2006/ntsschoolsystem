import { CalendarCheck } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import type { ApiError } from "@/lib/api-client";

import { attendanceStatusLabel } from "./statusTone";
import { useMyAttendance } from "./useAttendanceCrud";

/** Student self-service: read-only — a student sees their own attendance once a teacher has
 * marked and saved it, and never adds/edits/deletes it themselves. */
export function MyAttendancePage() {
  const { data: records, isLoading, isError, error } = useMyAttendance();

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
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Your attendance record, as marked by your teachers.</p>
      </div>

      {!records || records.length === 0 ? (
        <EmptyState icon={CalendarCheck} title="No attendance recorded yet" />
      ) : (
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Date</TableHeaderCell>
                <TableHeaderCell>Subject</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Notes</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {records.map((record) => (
                <TableRow key={record.id}>
                  <TableCell>{record.date}</TableCell>
                  <TableCell>{record.subject_name ?? <span className="text-[var(--color-text-muted)]">—</span>}</TableCell>
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
