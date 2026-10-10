import { Ban, CheckCircle2, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { PageHeader } from "@/components/ui/PageHeader";
import { Badge } from "@/components/ui/Badge";
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
  TableRow,
} from "@/components/ui/Table";
import { useToast } from "@/components/ui/toastContext";
import { useCurrentUser } from "@/features/auth/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import { useSummaryStats } from "@/hooks/useSummaryStats";
import type { ApiError } from "@/lib/api-client";
import { generalErrorMessage } from "@/lib/formErrors";

import { useDeletePlatformAdmin, useDisablePlatformAdmin, useEnablePlatformAdmin, usePlatformAdminList } from "./usePlatformCrud";

const PAGE_SIZE = 25;

export function PlatformAdminsListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { data: currentUser } = useCurrentUser();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);

  const filterParams = { search: debouncedSearch || undefined };
  const { data, isLoading, isError, error, isFetching } = usePlatformAdminList({
    page,
    page_size: PAGE_SIZE,
    ...filterParams,
  });
  const { data: stats } = useSummaryStats("platform/admins", filterParams);
  const disableAdmin = useDisablePlatformAdmin();
  const enableAdmin = useEnablePlatformAdmin();
  const deleteAdmin = useDeletePlatformAdmin();

  const handleDisable = async (id: string, name: string) => {
    const ok = await confirm({
      title: `Disable ${name}'s platform admin access?`,
      tone: "danger",
    });
    if (!ok) return;
    disableAdmin.mutate(id, {
      onSuccess: () => showToast({ title: "Platform admin disabled" }),
      onError: (err: ApiError) =>
        showToast({ title: "Could not disable admin", description: generalErrorMessage(err), tone: "danger" }),
    });
  };

  const handleDelete = async (id: string, name: string, email: string) => {
    const ok = await confirm({
      title: `Delete ${name} permanently?`,
      description: `${email}'s account, sign-in sessions and two-factor setup are removed from the system for good. This cannot be undone.`,
      tone: "danger",
    });
    if (!ok) return;
    deleteAdmin.mutate(id, {
      onSuccess: () => showToast({ title: "Platform admin deleted" }),
      onError: (err: ApiError) =>
        showToast({ title: "Could not delete admin", description: generalErrorMessage(err), tone: "danger" }),
    });
  };

  const handleEnable = (id: string) => {
    enableAdmin.mutate(id, {
      onSuccess: () => showToast({ title: "Platform admin enabled" }),
      onError: (err: ApiError) =>
        showToast({ title: "Could not enable admin", description: generalErrorMessage(err), tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Platform admins"
        description="Accounts that can manage schools and other platform admins."
        actions={
          <>
            <ExportCsvButton path="/platform/admins/" params={filterParams} filename="platform_admins.csv" />
            <Button onClick={() => navigate("/platform/admins/new")}>
              <Plus className="size-4" aria-hidden="true" />
              Invite admin
            </Button>
          </>
        }
      />

      {stats && (
        <ScrollReveal>
          <StatRow
            items={[
              { key: "total", label: "Total admins", value: stats.total as number, icon: ShieldCheck },
              { key: "active", label: "Active", value: stats.active as number, tone: "success", icon: CheckCircle2 },
            ]}
          />
        </ScrollReveal>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="w-full max-w-xs">
          <Input
            icon={Search}
            placeholder="Search by name or email"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No platform admins found" description="Try adjusting your search." />
      ) : data ? (
        <ScrollReveal>
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Email</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Invited</TableHeaderCell>
                <TableHeaderCell className="text-right">Actions</TableHeaderCell>
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((admin) => {
                const isSelf = admin.id === currentUser?.id;
                return (
                  <TableRow key={admin.id}>
                    <TableCell className="font-medium">
                      {admin.full_name}
                      {isSelf && <span className="ml-1.5 text-xs text-[var(--color-text-muted)]">(you)</span>}
                    </TableCell>
                    <TableCell>{admin.email}</TableCell>
                    <TableCell>
                      <Badge tone={admin.is_active ? "success" : "neutral"}>
                        {admin.is_active ? "Active" : "Disabled"}
                      </Badge>
                    </TableCell>
                    <TableCell>{new Date(admin.created_at).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      {admin.is_active ? (
                        <button
                          type="button"
                          onClick={() => handleDisable(admin.id, admin.full_name)}
                          disabled={isSelf || disableAdmin.isPending}
                          aria-label={`Disable ${admin.full_name}`}
                          title={isSelf ? "You cannot disable your own account" : "Disable"}
                          className="ml-auto flex items-center gap-1.5 rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Ban className="size-4" aria-hidden="true" />
                        </button>
                      ) : (
                        <div className="ml-auto flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleEnable(admin.id)}
                            disabled={enableAdmin.isPending}
                            aria-label={`Enable ${admin.full_name}`}
                            title="Enable"
                            className="flex items-center gap-1.5 rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-success)]"
                          >
                            <CheckCircle2 className="size-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(admin.id, admin.full_name, admin.email)}
                            disabled={deleteAdmin.isPending}
                            aria-label={`Delete ${admin.full_name} permanently`}
                            title="Delete permanently"
                            className="flex items-center gap-1.5 rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-danger)]"
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                          </button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
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
