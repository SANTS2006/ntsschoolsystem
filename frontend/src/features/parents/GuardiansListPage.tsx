import { KeyRound, Plus, Search, Trash2, Users } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/confirmContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
import { Input } from "@/components/ui/Input";
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
  TableRowLink,
} from "@/components/ui/Table";
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";

import { useDeleteGuardian, useGuardianList, useResetGuardianPassword } from "./useParentsCrud";

const PAGE_SIZE = 25;

export function GuardiansListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("parents.create");
  const canDelete = useHasPermission("parents.delete");
  const canResetPassword = useHasPermission("users.reset_password");

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);

  const filterParams = { search: debouncedSearch || undefined };
  const { data, isLoading, isError, error, isFetching } = useGuardianList({
    page,
    page_size: PAGE_SIZE,
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("parents", filterParams);
  const deleteGuardian = useDeleteGuardian();
  const resetPassword = useResetGuardianPassword();

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Delete guardian "${name}"?`,
      description: "This also removes them from every student they're linked to.",
      tone: "danger",
    });
    if (!ok) return;
    deleteGuardian.mutate(id, {
      onSuccess: () => showToast({ title: `"${name}" deleted` }),
      onError: (err: ApiError) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
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
      onError: (err: ApiError) => showToast({ title: "Failed to reset password", description: err.message, tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Parents &amp; guardians</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Contact records for students' parents and guardians.
        </p>
      </div>

      {stats && (
        <ScrollReveal>
          <StatRow items={[{ key: "total", label: "Total guardians", value: stats.total as number, icon: Users }]} />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-xs">
          <Input
            icon={Search}
            placeholder="Search by name, email, or phone"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/parents/" params={filterParams} filename="guardians.csv" />
          {canCreate && (
            <Button onClick={() => navigate("/parents/new")}>
              <Plus className="size-4" aria-hidden="true" />
              New guardian
            </Button>
          )}
        </div>
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={Users} title="No guardians found" description="Try adjusting your search." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Email</TableHeaderCell>
                <TableHeaderCell>Phone</TableHeaderCell>
                <TableHeaderCell>Occupation</TableHeaderCell>
                {(canDelete || canResetPassword) && (
                  <TableHeaderCell className="text-right">Actions</TableHeaderCell>
                )}
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((guardian) => (
                <TableRowLink key={guardian.id} onClick={() => navigate(`/parents/${guardian.id}/edit`)}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2.5">
                      <Avatar src={guardian.photo} />
                      {guardian.full_name}
                    </div>
                  </TableCell>
                  <TableCell>{guardian.email || <span className="text-[var(--color-text-muted)]">—</span>}</TableCell>
                  <TableCell>
                    {guardian.phone_number || <span className="text-[var(--color-text-muted)]">—</span>}
                  </TableCell>
                  <TableCell>
                    {guardian.occupation || <span className="text-[var(--color-text-muted)]">—</span>}
                  </TableCell>
                  {(canDelete || canResetPassword) && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {canResetPassword && guardian.user && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleResetPassword(guardian.id, guardian.full_name);
                            }}
                            aria-label={`Reset ${guardian.full_name}'s password`}
                            className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)]"
                          >
                            <KeyRound className="size-4" aria-hidden="true" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(guardian.id, guardian.full_name);
                            }}
                            aria-label={`Delete ${guardian.full_name}`}
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
    </div>
  );
}
