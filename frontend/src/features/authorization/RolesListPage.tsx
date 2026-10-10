import { Lock, Pencil, Plus, Power, Search, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/confirmContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
import { Input } from "@/components/ui/Input";
import { FullPageSpinner, Spinner } from "@/components/ui/Spinner";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeaderCell, TableRowLink } from "@/components/ui/Table";
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import type { ApiError } from "@/lib/api-client";

import { RoleEditModal } from "./RoleEditModal";
import type { Role } from "./types";
import { useDeleteRole, useRoleList } from "./useRolesCrud";

const PAGE_SIZE = 25;

export function RolesListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("roles.create");
  const canDelete = useHasPermission("roles.delete");
  const canUpdate = useHasPermission("roles.update");
  const [editing, setEditing] = useState<Role | null>(null);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const { data, isLoading, isError, error, isFetching } = useRoleList({
    page_size: PAGE_SIZE,
    search: debouncedSearch || undefined,
  });
  const deleteRole = useDeleteRole();

  const handleDelete = async (role: Role) => {
    const ok = await confirm({
      title: `Delete "${role.name}"?`,
      description:
        `${role.user_count > 0 ? `${role.user_count} ${role.user_count === 1 ? "person holds" : "people hold"} this role and will lose it. ` : ""}` +
        (role.is_system ? "This is a standard role; it stays deleted when the app updates. " : "") +
        "This cannot be undone.",
      tone: "danger",
    });
    if (!ok) return;
    deleteRole.mutate(role.id, {
      onSuccess: () => showToast({ title: `${role.name} deleted` }),
      onError: (err: ApiError) => showToast({ title: "Could not delete role", description: err.message, tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">Roles</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Who can do what. Click a role to see and edit the permissions it grants.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton path="/roles/" params={{ search: debouncedSearch || undefined }} filename="roles.csv" />
          {canCreate && (
            <Button onClick={() => navigate("/roles/new")}>
              <Plus className="size-4" aria-hidden="true" />
              New role
            </Button>
          )}
        </div>
      </div>

      <div className="w-full max-w-xs">
        <Input icon={Search} placeholder="Search roles" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No roles found" description="Try adjusting your search." />
      ) : data ? (
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Type</TableHeaderCell>
                <TableHeaderCell>Permissions</TableHeaderCell>
                <TableHeaderCell>People</TableHeaderCell>
                {(canDelete || canUpdate) && <TableHeaderCell className="text-right">Actions</TableHeaderCell>}
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((role) => (
                <TableRowLink key={role.id} onClick={() => navigate(`/roles/${role.id}`)}>
                  <TableCell className="font-medium">
                    {role.name}
                    {!role.is_active && <span className="ml-2 inline-flex"><Badge tone="warning">Inactive</Badge></span>}
                  </TableCell>
                  <TableCell>
                    {role.is_system ? (
                      <Badge tone="neutral">
                        <Lock className="mr-1 inline size-3" aria-hidden="true" />
                        System
                      </Badge>
                    ) : (
                      <Badge tone="success">Custom</Badge>
                    )}
                  </TableCell>
                  <TableCell>{role.permission_codes.length}</TableCell>
                  <TableCell>{role.user_count}</TableCell>
                  {(canDelete || canUpdate) && (
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {canUpdate && (
                          <button
                            type="button"
                            onClick={() => setEditing(role)}
                            aria-label={`Edit ${role.name}`}
                            title="Edit name, description or status"
                            className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-primary)]"
                          >
                            <Pencil className="size-4" aria-hidden="true" />
                          </button>
                        )}
                        {canUpdate && (
                          <button
                            type="button"
                            onClick={() => setEditing(role)}
                            aria-label={`${role.is_active ? "Deactivate" : "Activate"} ${role.name}`}
                            title={role.is_active ? "Deactivate" : "Activate"}
                            className="rounded p-1.5 text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-warning)]"
                          >
                            <Power className="size-4" aria-hidden="true" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDelete(role)}
                            aria-label={`Delete ${role.name}`}
                            title="Delete"
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
        </TableContainer>
      ) : null}

      {editing && <RoleEditModal key={editing.id} role={editing} onClose={() => setEditing(null)} />}

      {isFetching && !isLoading && (
        <div className="flex justify-center">
          <Spinner />
        </div>
      )}
    </div>
  );
}
