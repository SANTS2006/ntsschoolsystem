import { CalendarClock } from "lucide-react";

import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import type { ApiError } from "@/lib/api-client";

import { useMyExamTimetable } from "./useExaminationsCrud";

const hhmm = (value: string | null) => (value ? value.slice(0, 5) : "—");
const day = (value: string | null) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "—";

/** A student's own exam timetable (date, time, room, seat, invigilators) or a staff member's invigilation duties —
 * only for exams whose timetable the Exams Director has published. */
export function MyExamTimetablePage() {
  const { data, isLoading, isError, error } = useMyExamTimetable();
  if (isLoading) return <Spinner />;
  if (isError || !data) return <Alert tone="danger">{(error as ApiError | null)?.message ?? "Could not load your exam timetable."}</Alert>;
  const staff = data.kind === "staff";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">{staff ? "Invigilation duties" : "Exam timetable"}</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          {staff ? "The papers you supervise, and where." : "When and where you sit each paper, and who invigilates."}
        </p>
      </div>
      {data.rows.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title="Nothing published yet"
          description="Your exam timetable appears here as soon as it is published."
        />
      ) : (
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Date</TableHeaderCell>
                <TableHeaderCell>Time</TableHeaderCell>
                <TableHeaderCell>Subject</TableHeaderCell>
                {staff && <TableHeaderCell>Class</TableHeaderCell>}
                <TableHeaderCell>Room</TableHeaderCell>
                {staff ? <TableHeaderCell>Students</TableHeaderCell> : <TableHeaderCell>Seat</TableHeaderCell>}
                <TableHeaderCell>Invigilators</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {data.rows.map((row, i) => (
                <TableRow key={`${row.exam}-${row.subject}-${row.date}-${i}`}>
                  <TableCell className="whitespace-nowrap font-medium">{day(row.date)}</TableCell>
                  <TableCell className="whitespace-nowrap">
                    {hhmm(row.start_time)}–{hhmm(row.end_time)}
                  </TableCell>
                  <TableCell>
                    {row.subject}
                    <span className="block text-xs text-[var(--color-text-muted)]">{row.exam}</span>
                  </TableCell>
                  {staff && <TableCell>{row.class}</TableCell>}
                  <TableCell>{row.room}</TableCell>
                  <TableCell>{staff ? row.students : (row.seat_number ?? "—")}</TableCell>
                  <TableCell className="whitespace-normal">{row.invigilators.join(", ") || "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </div>
  );
}
