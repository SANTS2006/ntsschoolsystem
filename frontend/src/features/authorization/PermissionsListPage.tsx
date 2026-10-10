import { Key, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { useConfirm } from "@/components/ui/confirmContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExportCsvButton } from "@/components/ui/ExportCsvButton";
import { Input } from "@/components/ui/Input";
import { FullPageSpinner, Spinner } from "@/components/ui/Spinner";
import { Table, TableBody, TableCell, TableContainer, TableHead, TableHeaderCell, TableRow } from "@/components/ui/Table";
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import { useDebounce } from "@/hooks/useDebounce";
import type { ApiError } from "@/lib/api-client";

import { useDeletePermission, usePermissionList } from "./useRolesCrud";

const PAGE_SIZE = 50;

/** The permission catalog — mostly seeded from code (apps.authorization.catalog) and recreated
 * on every deploy, so editing or deleting one of those has no lasting effect; this page is really
 * for a school's own custom permission codes (which only do something once a workflow is built
 * to check them). */
export function PermissionsListPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const canCreate = useHasPermission("permissions.create");
  const canDelete = useHasPermission("permissions.delete");

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search);
  const { data, isLoading, isError, error, isFetching } = usePermissionList({
    page_size: PAGE_SIZE,
    search: debouncedSearch || undefined,
  });
  const deletePermission = useDeletePermission();

  const handleDelete = async (id: string, code: string) => {
    const ok = await confirm({ title: `Delete "${code}"?`, description: "This cannot be undone.", tone: "danger" });
    if (!ok) return;
    deletePermission.mutate(id, {
      onSuccess: () => showToast({ title: `${code} deleted` }),
      onError: (err: ApiError) => showToast({ title: "Could not delete", description: err.message, tone: "danger" }),
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">Permissions</h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            Every permission code roles can be granted. Assign these to a role from its own page.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ExportCsvButton
            path="/roles/permissions/"
            params={{ search: debouncedSearch || undefined }}
            filename="permissions.csv"
          />
          {canCreate && (
            <Button onClick={() => navigate("/permissions/new")}>
              <Plus className="size-4" aria-hidden="true" />
              New permission
            </Button>
          )}
        </div>
      </div>

      <div className="w-full max-w-xs">
        <Input icon={Search} placeholder="Search permissions" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isError && <Alert tone="danger">{(error as ApiError).message}</Alert>}

      {isLoading ? (
        <FullPageSpinner />
      ) : data && data.results.length === 0 ? (
        <EmptyState icon={Key} title="No permissions found" description="Try adjusting your search." />
      ) : data ? (
        <TableContainer>
          <Table>
            <TableHead>
              <tr>
                <TableHeaderCell>Code</TableHeaderCell>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Module</TableHeaderCell>
                {canDelete && <TableHeaderCell className="text-right">Actions</TableHeaderCell>}
              </tr>
            </TableHead>
            <TableBody>
              {data.results.map((permission) => (
                <TableRow key={permission.id}>
                  <TableCell className="font-mono text-xs">{permission.code}</TableCell>
                  <TableCell className="font-medium">{permission.name}</TableCell>
                  <TableCell className="capitalize">{permission.module.replace(/_/g, " ")}</TableCell>
                  {canDelete && (
                    <TableCell className="text-right">
                      <button
                        type="button"
                        onClick={() => handleDelete(permission.id, permission.code)}
                        aria-label={`Delete ${permission.code}`}
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
