import { Save } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import { useRoles } from "@/features/authorization/useRoles";
import { useStateFromSource } from "@/hooks/useStateFromSource";

import type { Staff } from "./types";
import { useSetStaffRoles } from "./useStaffCrud";

export function ManageRolesModal({
  open,
  onClose,
  staff,
}: {
  open: boolean;
  onClose: () => void;
  staff: Staff | null;
}) {
  const { showToast } = useToast();
  const { data: roles, isLoading } = useRoles();
  const setStaffRoles = useSetStaffRoles();
  const [selectedIds, setSelectedIds] = useStateFromSource(staff, (loaded) => loaded?.roles.map((role) => role.id) ?? []);

  if (!staff) return null;

  const toggle = (id: string) => {
    setSelectedIds((current) => (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]));
  };

  const handleSave = () => {
    setStaffRoles.mutate(
      { id: staff.id, roleIds: selectedIds },
      {
        onSuccess: () => {
          showToast({ title: `Roles updated for ${staff.full_name}` });
          onClose();
        },
        onError: (err) => showToast({ title: "Could not update roles", description: err.message, tone: "danger" }),
      },
    );
  };

  return (
    <Modal open={open} onClose={onClose} title={`Manage roles — ${staff.full_name}`}>
      <div className="flex flex-col gap-4">
        <p className="text-sm text-[var(--color-text-muted)]">
          A staff member holding more than one role can switch which one drives their sidebar from their
          account menu — this doesn't change what they're allowed to do, only what's shown by default.
        </p>
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : (
          <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
            {roles?.map((role) => (
              <Checkbox
                key={role.id}
                label={role.name}
                checked={selectedIds.includes(role.id)}
                onChange={() => toggle(role.id)}
              />
            ))}
          </div>
        )}
        <div className="mt-1 flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} isLoading={setStaffRoles.isPending}>
            {!setStaffRoles.isPending && <Save className="size-4" aria-hidden="true" />}
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
