import { CheckCircle2, KeyRound, Plus, RotateCcw, Search, Trash2, UserCog, Users, UserX } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Avatar } from "@/components/ui/Avatar";
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
import { useDepartmentList } from "@/features/academics/useAcademicsCrud";
import { useHasPermission } from "@/features/auth/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";

import { employmentStatusTone } from "./employmentStatusTone";
import { ManageRolesModal } from "./ManageRolesModal";
import type { EmploymentStatus, Staff } from "./types";
import {
  useDeleteStaffPermanently,
  useReactivateStaff,
  useResetStaffPassword,
  useStaffList,
  useTerminateStaff,
} from "./useStaffCrud";

const PAGE_SIZE = 25;

const STATUS_OPTIONS: EmploymentStatus[] = ["active", "on_leave", "terminated"];

export function StaffListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("staff.create");
  const canUpdate = useHasPermission("staff.update");
  const canDelete = useHasPermission("staff.delete");
  const canResetPassword = useHasPermission("users.reset_password");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState<EmploymentStatus | "">("");
  const debouncedSearch = useDebounce(search);
  const { data: departments } = useDepartmentList({ page_size: 100 });

  const filterParams = {
    search: debouncedSearch || undefined,
    department: department || undefined,
    employment_status: status || undefined,
  };
  const { data, isLoading, isError, error, isFetching } = useStaffList({
    page,
    page_size: PAGE_SIZE,
    ordering: "user__first_name",
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("staff", filterParams);
  const terminateStaff = useTerminateStaff();
  const reactivateStaff = useReactivateStaff();
  const resetPassword = useResetStaffPassword();
  const deletePermanently = useDeleteStaffPermanently();
  const [managingRolesFor, setManagingRolesFor] = useState<Staff | null>(null);

  const handleTerminate = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Terminate ${name}'s staff profile?`,
      description: 'This can be reversed with "Reactivate."',
      tone: "danger",
    });
    if (!ok) return;
    terminateStaff.mutate(id, {
      onSuccess: () => showToast({ title: `${name} terminated` }),
      onError: (err) => showToast({ title: "Failed to terminate", description: err.message, tone: "danger" }),
    });
  };

  const handleDeletePermanently = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Permanently delete ${name}?`,
      description:
        "This removes their account and every record tied to them (assignments, attendance, lessons, salary records, ...) and cannot be undone.",
      tone: "danger",
    });
    if (!ok) return;
    deletePermanently.mutate(id, {
      onSuccess: () => showToast({ title: `${name} was permanently deleted` }),
      onError: (err) => showToast({ title: "Could not delete", description: err.message, tone: "danger" }),
    });
  };

  const handleReactivate = (id: string, name: string) => {
    reactivateStaff.mutate(id, {
      onSuccess: () => showToast({ title: `${name} reactivated` }),
      onError: (err) => showToast({ title: "Failed to reactivate", description: err.message, tone: "danger" }),
    });
  };

  const handleResetPassword = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Reset ${name}'s password back to the school default?`,
      tone: "danger",
    });
    if (!ok) return;
    resetPassword.mutate(id, {
      onSuccess: (defaultPassword) =>
        showToast({ title: `${name}'s password was reset`, description: `New password: ${defaultPassword}` }),
      onError: (err) => showToast({ title: "Failed to reset password", description: err.message, tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">Staff</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">Manage your school's staff directory.</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/staff/" params={filterParams} filename="staff.csv" />
          {canCreate && (
            <Button onClick={() => navigate("/staff/new")}>
              <Plus className="size-4" aria-hidden="true" />
              New staff member
            </Button>
          )}
        </div>
      </div>

      {stats && (
        <ScrollReveal>
          <StatRow
            items={[
              { key: "total", label: "Total staff", value: stats.total as number, icon: Users },
              { key: "active", label: "Active", value: stats.active as number, tone: "success", icon: CheckCircle2 },
            ]}
          />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap gap-3">
        <div className="w-full max-w-xs">
          <Input
            icon={Search}
            placeholder="Search by name or staff ID"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="w-full max-w-[200px]">
          <Select
            value={department}
            onChange={(e) => {
              setDepartment(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All departments</option>
            {departments?.results.map((dept) => (
              <option key={dept.id} value={dept.id}>
                {dept.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-full max-w-[180px]">
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as EmploymentStatus | "");
              setPage(1);
            }}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option === "on_leave" ? "On leave" : option[0].toUpperCase() + option.slice(1)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={Users} title="No staff found" description="Try adjusting your search or filters." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Staff ID</TableHeaderCell>
                <TableHeaderCell>Job title</TableHeaderCell>
                <TableHeaderCell>Department</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                {(canUpdate || canDelete || canResetPassword) && (
                  <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                )}
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((member) => (
                <TableRowLink key={member.id} onClick={() => navigate(`/staff/${member.id}`)}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2.5">
                      <Avatar src={member.photo} isOnline={member.is_online} />
                      {member.full_name}
                    </div>
                  </TableCell>
                  <TableCell>{member.staff_id || <span className="text-[var(--color-text-muted)]">—</span>}</TableCell>
                  <TableCell>{member.job_title || <span className="text-[var(--color-text-muted)]">—</span>}</TableCell>
                  <TableCell>
                    {member.department_name ?? <span className="text-[var(--color-text-muted)]">—</span>}
                  </TableCell>
                  <TableCell>
                    <Badge tone={employmentStatusTone(member.employment_status)}>
                      {member.employment_status === "on_leave" ? "On leave" : member.employment_status}
                    </Badge>
                  </TableCell>
                  {(canUpdate || canDelete || canResetPassword) && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {canUpdate && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setManagingRolesFor(member);
                            }}
                            aria-label={`Manage ${member.full_name}'s roles`}
                            title="Manage roles"
                            className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)]"
                          >
                            <UserCog className="size-4" aria-hidden="true" />
                          </button>
                        )}
                        {canResetPassword && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResetPassword(member.id, member.full_name);
                            }}
                            aria-label={`Reset ${member.full_name}'s password`}
                            className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)]"
                          >
                            <KeyRound className="size-4" aria-hidden="true" />
                          </button>
                        )}
                        {member.employment_status === "terminated"
                          ? canUpdate && (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleReactivate(member.id, member.full_name);
                                  }}
                                  aria-label={`Reactivate ${member.full_name}`}
                                  className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-success)]"
                                >
                                  <RotateCcw className="size-4" aria-hidden="true" />
                                </button>
                                {canDelete && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleDeletePermanently(member.id, member.full_name);
                                    }}
                                    aria-label={`Permanently delete ${member.full_name}`}
                                    title="Delete permanently"
                                    className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-danger)]"
                                  >
                                    <UserX className="size-4" aria-hidden="true" />
                                  </button>
                                )}
                              </>
                            )
                          : canDelete && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTerminate(member.id, member.full_name);
                                }}
                                aria-label={`Terminate ${member.full_name}`}
                                className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-danger)]"
                              >
                                <Trash2 className="size-4" aria-hidden="true" />
                              </button>
                            )}
                      </div>
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

      <ManageRolesModal
        open={!!managingRolesFor}
        onClose={() => setManagingRolesFor(null)}
        staff={managingRolesFor}
      />
    </div>
  );
}
