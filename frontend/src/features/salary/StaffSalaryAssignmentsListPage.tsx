import { Plus, Search, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/confirmContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
import { Input } from "@/components/ui/Input";
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
  TableRowLink,
} from "@/components/ui/Table";
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";

import { useDeleteStaffSalaryAssignment, useStaffSalaryAssignmentList } from "./useSalaryCrud";

export function StaffSalaryAssignmentsListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("salary.create");
  const canDelete = useHasPermission("salary.delete");

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);

  const filterParams = { search: debouncedSearch || undefined };
  const { data, isLoading, isError, error, isFetching } = useStaffSalaryAssignmentList({
    page_size: 100,
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("salary/staff-salary-assignments", filterParams);
  const deleteAssignment = useDeleteStaffSalaryAssignment();

  const handleDelete = async (id: string, staffName: string) => {
    const ok = await confirm({
      title: `Remove ${staffName}'s salary assignment?`,
      description: "This does not affect any salary payments already generated.",
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
      {stats && (
        <ScrollReveal>
          <StatRow items={[{ key: "total", label: "Staff on payroll", value: stats.total as number, icon: Users }]} />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-xs">
          <Input icon={Search} placeholder="Search by staff name" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton
            path="/salary/staff-salary-assignments/"
            params={filterParams}
            filename="staff_salary_assignments.csv"
          />
          {canCreate && (
            <Button onClick={() => navigate("/salary/assignments/new")}>
              <Plus className="size-4" aria-hidden="true" />
              Assign a structure
            </Button>
          )}
        </div>
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No salary assignments yet"
          description="Assign a salary structure to a staff member so they're included when payments are generated."
        />
      ) : data ? (
        <ScrollReveal>
          <TableContainer>
            <Table>
              <TableHead>
                <tr>
                  <TableHeaderCell>Staff</TableHeaderCell>
                  <TableHeaderCell>Salary structure</TableHeaderCell>
                  <TableHeaderCell>Effective from</TableHeaderCell>
                  {canDelete && <TableHeaderCell className="text-right">Actions</TableHeaderCell>}
                </tr>
              </TableHead>
              <TableBody>
                {data.results.map((assignment) => (
                  <TableRowLink key={assignment.id} onClick={() => navigate(`/salary/assignments/${assignment.id}/edit`)}>
                    <TableCell className="font-medium">{assignment.staff_name}</TableCell>
                    <TableCell>{assignment.salary_structure_name}</TableCell>
                    <TableCell>{assignment.effective_from}</TableCell>
                    {canDelete && (
                      <TableCell className="text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(assignment.id, assignment.staff_name);
                          }}
                          aria-label={`Remove ${assignment.staff_name}'s assignment`}
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
