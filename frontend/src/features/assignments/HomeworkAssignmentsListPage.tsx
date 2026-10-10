import { CheckCircle2, ClipboardList, FileCheck, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/confirmContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
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
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";

import { useAssignmentList, useDeleteAssignment } from "./useAssignmentsCrud";

const PAGE_SIZE = 25;

export function HomeworkAssignmentsListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("assignments.create");
  const canDelete = useHasPermission("assignments.delete");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [isActive, setIsActive] = useState<"" | "true" | "false">("");
  const debouncedSearch = useDebounce(search);

  const filterParams = {
    search: debouncedSearch || undefined,
    is_active: isActive === "" ? undefined : isActive === "true",
  };
  const { data, isLoading, isError, error, isFetching } = useAssignmentList({
    page,
    page_size: PAGE_SIZE,
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("assignments", filterParams);
  const deleteAssignment = useDeleteAssignment();

  const handleDelete = async (id: string, title: string) => {
    const ok = await confirm({
      title: `Delete assignment "${title}"?`,
      description: "This also removes its submissions.",
      tone: "danger",
    });
    if (!ok) return;
    deleteAssignment.mutate(id, {
      onSuccess: () => showToast({ title: `"${title}" deleted` }),
      onError: (err) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="mb-2">
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Assignments</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Homework, due dates, and submissions.</p>
      </div>

      {stats && (
        <ScrollReveal>
          <StatRow
            items={[
              { key: "total", label: "Total assignments", value: stats.total as number, icon: ClipboardList },
              { key: "active", label: "Active", value: stats.active as number, tone: "success", icon: CheckCircle2 },
            ]}
          />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <div className="w-full max-w-xs">
            <Input
              icon={Search}
              placeholder="Search by title or description"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="w-full max-w-[160px]">
            <Select
              value={isActive}
              onChange={(e) => {
                setIsActive(e.target.value as "" | "true" | "false");
                setPage(1);
              }}
            >
              <option value="">All</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/assignments/" params={filterParams} filename="assignments.csv" />
          {canCreate && (
            <Button onClick={() => navigate("/assignments/new")}>
              <Plus className="size-4" aria-hidden="true" />
              New assignment
            </Button>
          )}
        </div>
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No assignments found" description="Try adjusting your filters." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Title</TableHeaderCell>
                <TableHeaderCell>Class</TableHeaderCell>
                <TableHeaderCell>Subject</TableHeaderCell>
                <TableHeaderCell>Due date</TableHeaderCell>
                <TableHeaderCell>Submissions</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell className="text-right">Actions</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((assignment) => (
                <TableRowLink key={assignment.id} onClick={() => navigate(`/assignments/${assignment.id}/edit`)}>
                  <TableCell className="font-medium">{assignment.title}</TableCell>
                  <TableCell>
                    {assignment.school_class_name}
                    {assignment.section_name && ` — ${assignment.section_name}`}
                  </TableCell>
                  <TableCell>{assignment.subject_name}</TableCell>
                  <TableCell>{new Date(assignment.due_date).toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge tone={assignment.submission_count > 0 ? "primary" : "neutral"}>
                      {assignment.submission_count}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge tone={assignment.is_active ? "success" : "neutral"}>
                      {assignment.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/assignments/${assignment.id}/submissions`);
                        }}
                        aria-label={`View submissions for ${assignment.title}`}
                        className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)]"
                      >
                        <FileCheck className="size-4" aria-hidden="true" />
                      </button>
                      {canDelete && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(assignment.id, assignment.title);
                          }}
                          aria-label={`Delete ${assignment.title}`}
                          className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-danger)]"
                        >
                          <Trash2 className="size-4" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </TableCell>
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
