import { Archive, CheckCircle2, Plus, Search, Users } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
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
import { Alert } from "@/components/ui/Alert";
import { useConfirm } from "@/components/ui/confirmContext";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";

import { studentStatusTone } from "./statusTone";
import type { StudentStatus } from "./types";
import { useArchiveStudent, useBulkUpdateStudentStatus, useStudents } from "./useStudents";

const PAGE_SIZE = 25;

const STATUS_OPTIONS: StudentStatus[] = [
  "applicant",
  "admitted",
  "active",
  "transferred",
  "graduated",
  "withdrawn",
  "archived",
];

export function StudentsListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("students.create");
  const canDelete = useHasPermission("students.delete");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StudentStatus | "">("");
  const debouncedSearch = useDebounce(search);

  const filterParams = { search: debouncedSearch || undefined, status: status || undefined };
  const { data, isLoading, isError, error, isFetching } = useStudents({
    page,
    page_size: PAGE_SIZE,
    ordering: "last_name",
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("students", filterParams);
  const archiveStudent = useArchiveStudent();
  const bulkUpdateStatus = useBulkUpdateStudentStatus();
  const canUpdate = useHasPermission("students.update");

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const pageIds = data?.results.map((student) => student.id) ?? [];
  const allSelectedOnPage = pageIds.length > 0 && pageIds.every((id) => selectedIds.includes(id));

  const toggleOne = (id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  };

  const toggleAllOnPage = () => {
    setSelectedIds((current) =>
      allSelectedOnPage ? current.filter((id) => !pageIds.includes(id)) : [...new Set([...current, ...pageIds])],
    );
  };

  const handleBulkStatusChange = async (newStatus: StudentStatus) => {
    const ok = await confirm({
      title: `Change status for ${selectedIds.length} student(s)?`,
      description: `They will be marked as "${newStatus}".`,
      tone: newStatus === "archived" || newStatus === "withdrawn" ? "danger" : "neutral",
    });
    if (!ok) return;
    bulkUpdateStatus.mutate(
      { studentIds: selectedIds, status: newStatus },
      {
        onSuccess: ({ updated }) => {
          showToast({ title: `Updated ${updated} student(s)` });
          setSelectedIds([]);
        },
        onError: (err) => showToast({ title: "Could not update status", description: err.message, tone: "danger" }),
      },
    );
  };

  const handleArchive = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Archive ${name}?`,
      description: "They will no longer appear in the active student list.",
      tone: "danger",
    });
    if (!ok) return;
    archiveStudent.mutate(id, {
      onSuccess: () => showToast({ title: `${name} archived` }),
      onError: (err) => showToast({ title: "Failed to archive student", description: err.message, tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">Students</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Manage your school's student records.</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/students/" params={filterParams} filename="students.csv" />
          {canCreate && (
            <Button onClick={() => navigate("/students/new")}>
              <Plus className="size-4" aria-hidden="true" />
              New student
            </Button>
          )}
        </div>
      </div>

      {stats && (
        <ScrollReveal>
          <StatRow
            items={[
              { key: "total", label: "Total students", value: stats.total as number, icon: Users },
              { key: "active", label: "Active", value: stats.active as number, tone: "success", icon: CheckCircle2 },
            ]}
          />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="w-full max-w-xs">
          <Input
            icon={Search}
            placeholder="Search by name or admission number"
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
              setStatus(e.target.value as StudentStatus | "");
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option[0].toUpperCase() + option.slice(1)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {canUpdate && selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-4 py-2.5">
          <span className="text-sm font-medium text-[var(--color-text)]">
            {selectedIds.length} selected
          </span>
          <div className="w-full max-w-[180px]">
            <Select
              value=""
              disabled={bulkUpdateStatus.isPending}
              onChange={(e) => {
                if (e.target.value) handleBulkStatusChange(e.target.value as StudentStatus);
              }}
            >
              <option value="">Change status to&hellip;</option>
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option[0].toUpperCase() + option.slice(1)}
                </option>
              ))}
            </Select>
          </div>
          <Button variant="secondary" onClick={() => setSelectedIds([])}>
            Clear selection
          </Button>
        </div>
      )}

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No students found"
          description="Try adjusting your search or filters."
        />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                {canUpdate && (
                  <TableHeaderCell className="w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all students on this page"
                      checked={allSelectedOnPage}
                      onChange={toggleAllOnPage}
                      className="size-4 rounded border-[var(--color-border)]"
                    />
                  </TableHeaderCell>
                )}
                <TableHeaderCell>Admission #</TableHeaderCell>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Class</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                {canDelete && <TableHeaderCell className="text-right">Actions</TableHeaderCell>}
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((student) => (
                <TableRowLink key={student.id} onClick={() => navigate(`/students/${student.id}`)}>
                  {canUpdate && (
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        aria-label={`Select ${student.full_name}`}
                        checked={selectedIds.includes(student.id)}
                        onChange={() => toggleOne(student.id)}
                        className="size-4 rounded border-[var(--color-border)]"
                      />
                    </TableCell>
                  )}
                  <TableCell className="font-medium">{student.admission_number}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2.5">
                      <Avatar src={student.photo} />
                      {student.full_name}
                    </div>
                  </TableCell>
                  <TableCell>
                    {student.current_class_name ?? <span className="text-[var(--color-text-muted)]">—</span>}
                    {student.current_section_name && ` - ${student.current_section_name}`}
                  </TableCell>
                  <TableCell>
                    <Badge tone={studentStatusTone(student.status)}>{student.status}</Badge>
                  </TableCell>
                  {canDelete && (
                    <TableCell className="text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleArchive(student.id, student.full_name);
                        }}
                        disabled={student.status === "archived"}
                        aria-label={`Archive ${student.full_name}`}
                        className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Archive className="size-4" aria-hidden="true" />
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
