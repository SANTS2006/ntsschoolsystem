import { Lock, Save } from "lucide-react";
import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import type { ApiError } from "@/lib/api-client";
import { useStateFromSource } from "@/hooks/useStateFromSource";

import { useRole, useRolePermissions, useSetRolePermissions } from "./useRolesCrud";

/** A role's own page: what it is, and every permission in the catalog with a checkbox for
 * whether this role grants it — "add multiple selects where all or some permissions can be
 * selected and added to or removed from a role", per the spec this was built from. */
export function RoleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const canUpdate = useHasPermission("roles.update");

  const { data: role, isLoading: isLoadingRole } = useRole(id);
  const { data: permissions, isLoading: isLoadingPermissions } = useRolePermissions(id);
  const setPermissions = useSetRolePermissions(id ?? "");

  const [selected, setSelected] = useStateFromSource(
    permissions,
    (loaded) => new Set<string>((loaded ?? []).filter((p) => p.granted).map((p) => p.id)),
  );

  const grouped = useMemo(() => {
    const byModule = new Map<string, typeof permissions>();
    for (const permission of permissions ?? []) {
      const list = byModule.get(permission.module) ?? [];
      list.push(permission);
      byModule.set(permission.module, list);
    }
    return [...byModule.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [permissions]);

  const toggle = (permissionId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(permissionId)) next.delete(permissionId);
      else next.add(permissionId);
      return next;
    });
  };

  const toggleModule = (modulePermissions: { id: string }[], allSelected: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      for (const p of modulePermissions) {
        if (allSelected) next.delete(p.id);
        else next.add(p.id);
      }
      return next;
    });
  };

  const handleSave = () => {
    setPermissions.mutate([...selected], {
      onSuccess: () => showToast({ title: "Permissions updated" }),
      onError: (err: ApiError) => showToast({ title: "Could not update permissions", description: err.message, tone: "danger" }),
    });
  };

  if (isLoadingRole) {
    return <FullPageSpinner />;
  }

  if (!role) {
    return <Alert tone="danger">Role not found.</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={() => navigate("/roles")}
        className="back-button"
      >
        <BackArrowIcon className="size-4" />
        Back to roles
      </button>

      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text)]">{role.name}</h1>
          {role.description && <p className="mt-1 text-sm text-[var(--color-text-muted)]">{role.description}</p>}
        </div>
        {role.is_system && (
          <Badge tone="neutral">
            <Lock className="mr-1 inline size-3" aria-hidden="true" />
            System role
          </Badge>
        )}
      </div>

      {role.is_system && canUpdate && (
        <Alert tone="warning">
          This is one of the school's standard roles. Editing its permissions below is fine — it just stops this role
          from being automatically kept in sync with the app's own defaults for that role going forward.
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Permissions</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoadingPermissions ? (
            <div className="flex justify-center py-8">
              <FullPageSpinner />
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {grouped.map(([module, modulePermissions]) => {
                const list = modulePermissions ?? [];
                const allSelected = list.length > 0 && list.every((p) => selected.has(p.id));
                return (
                  <div key={module} className="flex flex-col gap-2">
                    <label className="flex items-center gap-2 text-sm font-semibold capitalize text-[var(--color-text)]">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        disabled={!canUpdate}
                        onChange={() => toggleModule(list, allSelected)}
                        className="size-4 rounded border-[var(--color-border)] accent-[var(--color-primary)]"
                      />
                      {module.replace(/_/g, " ")}
                    </label>
                    <div className="grid grid-cols-1 gap-x-4 gap-y-1.5 pl-6 sm:grid-cols-2 lg:grid-cols-3">
                      {list.map((permission) => (
                        <Checkbox
                          key={permission.id}
                          label={permission.name}
                          hint={permission.code}
                          checked={selected.has(permission.id)}
                          disabled={!canUpdate}
                          onChange={() => toggle(permission.id)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {canUpdate && (
        <div className="flex justify-end">
          <Button onClick={handleSave} isLoading={setPermissions.isPending}>
            {!setPermissions.isPending && <Save className="size-4" aria-hidden="true" />}
            Save permissions
          </Button>
        </div>
      )}
    </div>
  );
}
