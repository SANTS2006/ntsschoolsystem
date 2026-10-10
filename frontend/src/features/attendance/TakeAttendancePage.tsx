import { useQuery } from "@tanstack/react-query";
import { CheckCheck, User, Users } from "lucide-react";
import { useMemo, useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FullPageSpinner, Spinner } from "@/components/ui/Spinner";
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
import { useSubjectList, useSubjectOfferingList } from "@/features/academics/useAcademicsCrud";
import { useAllSections } from "@/features/academics/useAcademicsLookups";
import { useHasPermission, useHasRole } from "@/features/auth/useAuth";
import { listStudents } from "@/features/students/api";
import type { Student } from "@/features/students/types";
import type { ApiError } from "@/lib/api-client";
import type { PaginatedResponse } from "@/types/pagination";

import { fetchStudentAttendance } from "./api";
import { attendanceStatusLabel } from "./statusTone";
import type { AttendanceStatus, StudentAttendance } from "./types";
import { useBulkMarkAttendance } from "./useAttendanceCrud";

const STATUS_OPTIONS: AttendanceStatus[] = ["present", "absent", "late", "excused", "early_departure"];

interface RosterEntry {
  status: AttendanceStatus;
  notes: string;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function initialEntries(
  roster: PaginatedResponse<Student>,
  existing: PaginatedResponse<StudentAttendance> | undefined,
): Record<string, RosterEntry> {
  const existingByStudent = new Map((existing?.results ?? []).map((record) => [record.student, record]));
  const entries: Record<string, RosterEntry> = {};
  for (const student of roster.results) {
    const record = existingByStudent.get(student.id);
    entries[student.id] = { status: record?.status ?? "present", notes: record?.notes ?? "" };
  }
  return entries;
}

/** Keyed by the scope (section/date/subject) it was initialized for, so switching that scope
 * remounts this component with freshly-derived state instead of needing an effect to re-sync
 * local state from newly-fetched data. */
function RosterEditor({
  roster,
  existing,
  date,
  sectionId,
  subjectId,
  canCreate,
  onSaved,
}: {
  roster: PaginatedResponse<Student>;
  existing: PaginatedResponse<StudentAttendance> | undefined;
  date: string;
  sectionId: string;
  subjectId: string;
  canCreate: boolean;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const bulkMark = useBulkMarkAttendance();
  const [entries, setEntries] = useState<Record<string, RosterEntry>>(() => initialEntries(roster, existing));
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<AttendanceStatus | "">("");

  const summary = STATUS_OPTIONS.reduce(
    (acc, status) => {
      acc[status] = Object.values(entries).filter((entry) => entry.status === status).length;
      return acc;
    },
    {} as Record<AttendanceStatus, number>,
  );

  const allSelected = roster.results.length > 0 && roster.results.every((s) => selectedIds.has(s.id));
  const toggleAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(roster.results.map((s) => s.id)));
  };
  const toggleOne = (studentId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  };

  const setEntry = (studentId: string, patch: Partial<RosterEntry>) => {
    setEntries((prev) => ({ ...prev, [studentId]: { ...prev[studentId], ...patch } }));
  };

  const applyBulkStatus = (status: AttendanceStatus) => {
    setEntries((prev) => {
      const next = { ...prev };
      for (const studentId of selectedIds) {
        next[studentId] = { ...next[studentId], status };
      }
      return next;
    });
    setBulkStatus("");
  };

  const markAllPresent = () => {
    setEntries((prev) => {
      const next = { ...prev };
      for (const studentId of Object.keys(next)) {
        next[studentId] = { ...next[studentId], status: "present" };
      }
      return next;
    });
  };

  const handleSubmit = () => {
    bulkMark.mutate(
      {
        date,
        section: sectionId,
        subject: subjectId,
        entries: roster.results.map((student) => ({
          student_id: student.id,
          status: entries[student.id]?.status ?? "present",
          notes: entries[student.id]?.notes || undefined,
        })),
      },
      {
        onSuccess: (results) => {
          showToast({ title: `Marked attendance for ${results.length} student(s).` });
          onSaved();
        },
        onError: (err: ApiError) => showToast({ title: "Could not save attendance", description: err.message, tone: "danger" }),
      },
    );
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((status) => (
            <Badge key={status} tone="neutral">
              {attendanceStatusLabel(status)}: {summary[status]}
            </Badge>
          ))}
        </div>
        {canCreate && (
          <Button variant="secondary" size="sm" onClick={markAllPresent}>
            <CheckCheck className="size-4" aria-hidden="true" />
            Mark all present
          </Button>
        )}
      </div>

      {bulkMark.isError && <Alert tone="danger">{(bulkMark.error as ApiError).message}</Alert>}

      {canCreate && selectedIds.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-4 py-2.5">
          <span className="text-sm font-medium text-[var(--color-text)]">{selectedIds.size} selected</span>
          <div className="w-full max-w-[180px]">
            <Select
              value={bulkStatus}
              onChange={(e) => e.target.value && applyBulkStatus(e.target.value as AttendanceStatus)}
            >
              <option value="">Change status to&hellip;</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {attendanceStatusLabel(status)}
                </option>
              ))}
            </Select>
          </div>
          <Button variant="secondary" onClick={() => setSelectedIds(new Set())}>
            Clear selection
          </Button>
        </div>
      )}

      <TableContainer>
        <Table>
          <TableHead>
            <tr>
              {canCreate && (
                <TableHeaderCell className="w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all students"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="size-4 rounded border-[var(--color-border)]"
                  />
                </TableHeaderCell>
              )}
              <TableHeaderCell>Student</TableHeaderCell>
              <TableHeaderCell>Admission #</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Notes</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {roster.results.map((student) => (
              <TableRow key={student.id}>
                {canCreate && (
                  <TableCell>
                    <input
                      type="checkbox"
                      aria-label={`Select ${student.full_name}`}
                      checked={selectedIds.has(student.id)}
                      onChange={() => toggleOne(student.id)}
                      className="size-4 rounded border-[var(--color-border)]"
                    />
                  </TableCell>
                )}
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--color-border)] bg-[var(--color-bg-subtle)]">
                      {student.photo ? (
                        <img src={student.photo} alt="" className="size-full object-cover" />
                      ) : (
                        <User className="size-4 text-[var(--color-text-muted)]" aria-hidden="true" />
                      )}
                    </span>
                    {student.full_name}
                  </div>
                </TableCell>
                <TableCell>{student.admission_number}</TableCell>
                <TableCell>
                  <Select
                    value={entries[student.id]?.status ?? "present"}
                    disabled={!canCreate}
                    onChange={(e) => setEntry(student.id, { status: e.target.value as AttendanceStatus })}
                    className="min-w-[160px]"
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {attendanceStatusLabel(status)}
                      </option>
                    ))}
                  </Select>
                </TableCell>
                <TableCell>
                  <Input
                    placeholder="Notes (optional)"
                    disabled={!canCreate}
                    value={entries[student.id]?.notes ?? ""}
                    onChange={(e) => setEntry(student.id, { notes: e.target.value })}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {canCreate && (
        <div className="flex justify-end">
          <Button onClick={handleSubmit} isLoading={bulkMark.isPending}>
            Save attendance
          </Button>
        </div>
      )}
    </>
  );
}

/** The records saved for the current date/section/subject, shown underneath the roster editor
 * once something has actually been saved for it — a teacher sees what they just recorded without
 * navigating away to the separate Records page. */
function SavedRecordsTable({ date, sectionId, subjectId }: { date: string; sectionId: string; subjectId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["attendance", "students", "saved", sectionId, date, subjectId],
    queryFn: () => fetchStudentAttendance({ section: sectionId, date, subject: subjectId, page_size: 100 }),
    enabled: !!sectionId && !!date && !!subjectId,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Spinner />
      </div>
    );
  }

  if (!data || data.results.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold text-[var(--color-text)]">Saved for this date</h2>
      <TableContainer>
        <Table>
          <TableHead>
            <tr>
              <TableHeaderCell>Student</TableHeaderCell>
              <TableHeaderCell>Section</TableHeaderCell>
              <TableHeaderCell>Subject</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Recorded by</TableHeaderCell>
            </tr>
          </TableHead>
          <TableBody>
            {data.results.map((record) => (
              <TableRow key={record.id}>
                <TableCell className="font-medium">{record.student_name}</TableCell>
                <TableCell>{record.section_name ?? "—"}</TableCell>
                <TableCell>{record.subject_name ?? "—"}</TableCell>
                <TableCell>
                  <Badge tone="neutral">{attendanceStatusLabel(record.status)}</Badge>
                </TableCell>
                <TableCell>{record.recorded_by_name ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </div>
  );
}

export function TakeAttendancePage() {
  const canCreate = useHasPermission("attendance.create");
  const isTeacher = useHasRole("teacher");

  const [date, setDate] = useState(todayIsoDate);
  const [sectionId, setSectionId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [justSaved, setJustSaved] = useState(false);

  const { data: allSections } = useAllSections();
  const { data: allSubjects } = useSubjectList({ page_size: 100 });
  // A teacher only ever takes attendance for classes/subjects they actually teach — the
  // offerings list is already scoped to "my own" server-side for a teacher (see
  // apps.academics.services.scope_subject_offerings_for_teacher), so its distinct classes and
  // subjects are exactly the right narrower set. A non-teacher (principal, school
  // administrator) sees every section/subject in the school, same as before.
  const { data: myOfferings } = useSubjectOfferingList({ page_size: 200 });

  const sections = useMemo(() => {
    if (!isTeacher) return allSections;
    const myClassIds = new Set((myOfferings?.results ?? []).map((o) => o.school_class));
    return allSections?.filter((section) => myClassIds.has(section.school_class));
  }, [allSections, isTeacher, myOfferings]);

  const subjects = useMemo(() => {
    if (!isTeacher) return allSubjects?.results;
    const mySubjectIds = new Set((myOfferings?.results ?? []).map((o) => o.subject));
    return allSubjects?.results.filter((subject) => mySubjectIds.has(subject.id));
  }, [allSubjects, isTeacher, myOfferings]);

  const {
    data: roster,
    isLoading: isLoadingRoster,
    isError: isRosterError,
    error: rosterError,
  } = useQuery<Awaited<ReturnType<typeof listStudents>>, ApiError>({
    queryKey: ["students", "roster", sectionId],
    queryFn: () => listStudents({ current_section: sectionId, status: "active", page_size: 100, ordering: "last_name" }),
    enabled: !!sectionId,
  });

  const { data: existing, isLoading: isLoadingExisting } = useQuery({
    queryKey: ["attendance", "students", "existing", sectionId, date, subjectId],
    queryFn: () => fetchStudentAttendance({ section: sectionId, date, subject: subjectId, page_size: 100 }),
    enabled: !!sectionId && !!date && !!subjectId,
  });

  const isLoadingRosterData = isLoadingRoster || isLoadingExisting;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-3">
        <div className="w-full max-w-[180px]">
          <Input
            type="date"
            label="Date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setJustSaved(false);
            }}
          />
        </div>
        <div className="w-full max-w-xs">
          <Select
            label="Section"
            value={sectionId}
            onChange={(e) => {
              setSectionId(e.target.value);
              setJustSaved(false);
            }}
          >
            <option value="">Choose a section</option>
            {sections?.map((section) => (
              <option key={section.id} value={section.id}>
                {section.school_class_name} - {section.name} ({section.academic_year_name})
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full max-w-[200px]">
          <Select
            label="Subject"
            value={subjectId}
            onChange={(e) => {
              setSubjectId(e.target.value);
              setJustSaved(false);
            }}
          >
            <option value="">Choose a subject</option>
            {subjects?.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {isRosterError && <Alert tone="danger">{(rosterError as ApiError).message}</Alert>}

      {!sectionId || !subjectId ? (
        <EmptyState
          icon={Users}
          title="Pick a section and subject"
          description="Choose both above to load the roster and take attendance."
        />
      ) : isLoadingRosterData ? (
        <FullPageSpinner />
      ) : !roster || roster.results.length === 0 ? (
        <EmptyState icon={Users} title="No active students in this section" />
      ) : (
        <>
          <RosterEditor
            key={`${sectionId}|${date}|${subjectId}`}
            roster={roster}
            existing={existing}
            date={date}
            sectionId={sectionId}
            subjectId={subjectId}
            canCreate={canCreate}
            onSaved={() => setJustSaved(true)}
          />
          {justSaved && <SavedRecordsTable date={date} sectionId={sectionId} subjectId={subjectId} />}
        </>
      )}
    </div>
  );
}
