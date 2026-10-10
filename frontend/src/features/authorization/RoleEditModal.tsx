import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/toastContext";
import type { ApiError } from "@/lib/api-client";

import type { Role } from "./types";
import { useUpdateRole } from "./useRolesCrud";

/** Rename a role, change its description, or switch it on/off. Works for every role, including the standard (system)
 * ones; a role that is switched off stops granting its permissions to the people who hold it. */
export function RoleEditModal({ role, onClose }: { role: Role; onClose: () => void }) {
  const { showToast } = useToast();
  const update = useUpdateRole(role.id);
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description);
  const [active, setActive] = useState(role.is_active);
  const [error, setError] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    update.mutate(
      { name: name.trim(), description: description.trim(), is_active: active },
      {
        onSuccess: () => {
          showToast({ title: "Role updated" });
          onClose();
        },
        onError: (err: ApiError) => setError(err.message),
      },
    );
  };

  return (
    <Modal open onClose={onClose} title={`Edit ${role.name}`}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <Input label="Name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        <Input label="Description" value={description} maxLength={255} onChange={(e) => setDescription(e.target.value)} />
        <Checkbox
          label="Active"
          hint={`Switch off to stop this role granting anything to its ${role.user_count} ${role.user_count === 1 ? "person" : "people"}, without deleting it.`}
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
        {role.is_system && (
          <p className="text-xs text-[var(--color-text-muted)]">
            This is one of the standard roles. Once you change it here, the app no longer resets its name or switches it back on
            when it updates; newly introduced permissions are still offered to it.
          </p>
        )}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!name.trim()} isLoading={update.isPending}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  );
}
