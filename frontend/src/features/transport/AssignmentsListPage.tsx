import { Plus, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/confirmContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
import { Pagination } from "@/components/ui/Pagination";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
import { FullPageSpinner, Spinner } from "@/components/ui/Spinner";
import { StatRow } from "@/components/ui/StatRow";
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
import { useHasPermission } from "@/features/auth/useAuth";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";

import { useAssignmentList, useDeleteAssignment } from "./useTransportCrud";

const PAGE_SIZE = 25;

export function AssignmentsListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("transport.create");
  const canDelete = useHasPermission("transport.delete");

  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error, isFetching } = useAssignmentList({ page, page_size: PAGE_SIZE });
  const { data: stats } = useSummaryStats("transport/assignments");
  const deleteAssignment = useDeleteAssignment();

  const handleDelete = async (id: string, student: string) => {
    const ok = await confirm({
      title: `Remove ${student}'s transport assignment?`,
      tone: "danger",
    });
    if (!ok) return;
    deleteAssignment.mutate(id, {
      onSuccess: () => showToast({ title: "Assignment removed" }),
      onError: (err) => showToast({ title: "Failed to remove", description: err.message, tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">Student assignments</h2>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/transport/assignments/" params={{}} filename="transport_assignments.csv" />
          {canCreate && (
            <Button onClick={() => navigate("/transport/assignments/new")}>
              <Plus className="size-4" aria-hidden="true" />
              New assignment
            </Button>
          )}
        </div>
      </div>

      {stats && (
        <ScrollReveal>
          <StatRow items={[{ key: "total", label: "Total assignments", value: stats.total as number, icon: Users }]} />
        </ScrollReveal>
      )}

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={Users} title="No assignments yet" description="Assign a student to a route and stop." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Student</TableHeaderCell>
                <TableHeaderCell>Route</TableHeaderCell>
                <TableHeaderCell>Stop</TableHeaderCell>
                {canDelete && <TableHeaderCell className="text-right">Actions</TableHeaderCell>}
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((assignment) => (
                <TableRow key={assignment.id}>
                  <TableCell className="font-medium">{assignment.student_name}</TableCell>
                  <TableCell>{assignment.route_name}</TableCell>
                  <TableCell>{assignment.stop_name}</TableCell>
                  {canDelete && (
                    <TableCell className="text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(assignment.id, assignment.student_name)}
                        aria-label={`Remove assignment for ${assignment.student_name}`}
                        className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-danger)]"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </TableCell>
                  )}
                </TableRow>
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
