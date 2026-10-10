import { CalendarX2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/confirmContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Pagination } from "@/components/ui/Pagination";
import { Select } from "@/components/ui/Select";
import { FullPageSpinner, Spinner } from "@/components/ui/Spinner";
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
import { useSubjectList } from "@/features/academics/useAcademicsCrud";
import { useAllSections } from "@/features/academics/useAcademicsLookups";
import { useHasPermission } from "@/features/auth/useAuth";
import type { ApiError } from "@/lib/api-client";

import { attendanceStatusLabel, attendanceStatusTone } from "./statusTone";
import type { AttendanceStatus } from "./types";
import { useDeleteStudentAttendance, useStudentAttendanceList } from "./useAttendanceCrud";

const PAGE_SIZE = 25;
const STATUS_OPTIONS: AttendanceStatus[] = ["present", "absent", "late", "excused", "early_departure"];

export function AttendanceRecordsPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("attendance.create");
  const canDelete = useHasPermission("attendance.delete");

  const [page, setPage] = useState(1);
  const [date, setDate] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [subjectId, setSubjectId] = useState("");
  const [status, setStatus] = useState<AttendanceStatus | "">("");

  const { data: sections } = useAllSections();
  const { data: subjects } = useSubjectList({ page_size: 100 });

  const { data, isLoading, isError, error, isFetching } = useStudentAttendanceList({
    page,
    page_size: PAGE_SIZE,
    date: date || undefined,
    section: sectionId || undefined,
    subject: subjectId || undefined,
    status: status || undefined,
    ordering: "-date",
  });
  const deleteRecord = useDeleteStudentAttendance();

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Delete this attendance record for ${name}?`,
      description: "This cannot be undone.",
      tone: "danger",
    });
    if (!ok) return;
    deleteRecord.mutate(id, {
      onSuccess: () => showToast({ title: "Record deleted" }),
      onError: (err) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="w-full max-w-[160px]">
            <Input
              type="date"
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="w-full max-w-xs">
            <Select
              value={sectionId}
              onChange={(e) => {
                setSectionId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All sections</option>
              {sections?.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.school_class_name} - {section.name} ({section.academic_year_name})
                </option>
              ))}
            </Select>
          </div>
          <div className="w-full max-w-[180px]">
            <Select
              value={subjectId}
              onChange={(e) => {
                setSubjectId(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All subjects</option>
              {subjects?.results.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-full max-w-[180px]">
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as AttendanceStatus | "");
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {attendanceStatusLabel(option)}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {canCreate && (
          <Button onClick={() => navigate("/attendance/records/new")}>
            <Plus className="size-4" aria-hidden="true" />
            New record
          </Button>
        )}
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={CalendarX2} title="No attendance records found" description="Try adjusting your filters." />
      ) : data ? (
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Date</TableHeaderCell>
                <TableHeaderCell>Student</TableHeaderCell>
                <TableHeaderCell>Section</TableHeaderCell>
                <TableHeaderCell>Subject</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Recorded by</TableHeaderCell>
                {canDelete && <TableHeaderCell className="text-right">Actions</TableHeaderCell>}
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((record) => (
                <TableRowLink key={record.id} onClick={() => navigate(`/attendance/records/${record.id}/edit`)}>
                  <TableCell className="font-medium">{record.date}</TableCell>
                  <TableCell>{record.student_name}</TableCell>
                  <TableCell>{record.section_name ?? <span className="text-[var(--color-text-muted)]">—</span>}</TableCell>
                  <TableCell>{record.subject_name ?? <span className="text-[var(--color-text-muted)]">—</span>}</TableCell>
                  <TableCell>
                    <Badge tone={attendanceStatusTone(record.status)}>{attendanceStatusLabel(record.status)}</Badge>
                  </TableCell>
                  <TableCell>
                    {record.recorded_by_name ?? <span className="text-[var(--color-text-muted)]">—</span>}
                  </TableCell>
                  {canDelete && (
                    <TableCell className="text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(record.id, record.student_name);
                        }}
                        aria-label={`Delete attendance record for ${record.student_name}`}
                        className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-danger)]"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
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
      ) : null}

      {isFetching && !isLoading && (
        <div className="flex justify-center">
          <Spinner />
        </div>
      )}
    </div>
  );
}
