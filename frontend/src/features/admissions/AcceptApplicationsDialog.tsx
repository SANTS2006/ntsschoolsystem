import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/toastContext";
import type { ApiError } from "@/lib/api-client";
import { generalErrorMessage } from "@/lib/formErrors";

import type { ApplicationKind } from "./types";
import { useBulkAcceptApplications } from "./useAdmissionsCrud";

export interface Applicant {
  id: string;
  name: string;
  kind: ApplicationKind;
}

const COPY: Record<ApplicationKind, { heading: string; label: string; placeholder: string }> = {
  student: { heading: "Students", label: "Admission number", placeholder: "e.g. 2026/0042" },
  staff: { heading: "Staff", label: "Staff number", placeholder: "e.g. T-0017" },
};

/** Asks for the number each accepted person will be known by before they're moved into the school's
 * records: an admission number for each student and a staff number for each staff member, entered
 * separately so the two can't be mixed up. The numbers are saved on the new student/staff record, and a
 * student's sign-in email is built from theirs, the same way as every other student's. */
export function AcceptApplicationsDialog({
  open,
  onClose,
  applicants,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  applicants: Applicant[];
  onDone: () => void;
}) {
  const { showToast } = useToast();
  const accept = useBulkAcceptApplications();
  const [numbers, setNumbers] = useState<Record<string, string>>({});
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  // People still waiting to be accepted — an accepted one drops off so only the problems remain.
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [formError, setFormError] = useState<string | null>(null);

  const remaining = applicants.filter((a) => !accepted.has(a.id));
  const groups = (["student", "staff"] as ApplicationKind[])
    .map((kind) => ({ kind, people: remaining.filter((a) => a.kind === kind) }))
    .filter((group) => group.people.length > 0);

  const setNumber = (id: string, value: string) => {
    setNumbers((prev) => ({ ...prev, [id]: value }));
    setRowErrors((prev) => (prev[id] ? { ...prev, [id]: "" } : prev));
  };

  const validate = (): Record<string, string> => {
    const found: Record<string, string> = {};
    for (const group of groups) {
      const seen = new Map<string, string>();
      for (const person of group.people) {
        const value = (numbers[person.id] ?? "").trim();
        if (!value) {
          found[person.id] = `Enter the ${COPY[group.kind].label.toLowerCase()}.`;
          continue;
        }
        const clash = seen.get(value.toLowerCase());
        if (clash) found[person.id] = `Same as ${clash} — each number must be different.`;
        else seen.set(value.toLowerCase(), person.name);
      }
    }
    return found;
  };

  const handleClose = () => {
    setNumbers({});
    setRowErrors({});
    setAccepted(new Set());
    setFormError(null);
    onClose();
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const found = validate();
    setRowErrors(found);
    if (Object.keys(found).length > 0) return;

    accept.mutate(
      {
        applicationIds: remaining.map((a) => a.id),
        numbers: Object.fromEntries(remaining.map((a) => [a.id, (numbers[a.id] ?? "").trim()])),
      },
      {
        onSuccess: ({ accepted: count, skipped }) => {
          const failed = new Map(skipped.map((s) => [s.id, s.reason]));
          const done = new Set([...accepted, ...remaining.filter((a) => !failed.has(a.id)).map((a) => a.id)]);
          if (count > 0) showToast({ title: `Accepted ${count} applicant(s)` });
          if (failed.size === 0) {
            handleClose();
            onDone();
            return;
          }
          setAccepted(done);
          setRowErrors(Object.fromEntries([...failed].map(([id, reason]) => [id, reason])));
          setFormError("Some applicants could not be accepted — fix the highlighted numbers and try again.");
        },
        onError: (err: ApiError) => setFormError(generalErrorMessage(err)),
      },
    );
  };

  return (
    <Modal open={open} onClose={handleClose} title={`Accept ${remaining.length || applicants.length} applicant(s)`} maxWidthClassName="max-w-xl">
      <form onSubmit={submit} className="flex flex-col gap-5">
        <p className="text-sm text-[var(--color-text-muted)]">
          Enter the number each person will be known by. Accepted applicants get a record in the school's students or
          staff list, with this number saved on it, and are emailed their sign-in details.
        </p>
        {formError && <Alert tone="danger">{formError}</Alert>}

        {groups.map((group) => (
          <fieldset key={group.kind} className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] p-3">
            <legend className="px-1 text-sm font-semibold text-[var(--color-text)]">
              {COPY[group.kind].heading} — {COPY[group.kind].label.toLowerCase()}
            </legend>
            {group.people.map((person) => (
              <Input
                key={person.id}
                label={person.name}
                placeholder={COPY[group.kind].placeholder}
                value={numbers[person.id] ?? ""}
                maxLength={50}
                onChange={(e) => setNumber(person.id, e.target.value)}
                error={rowErrors[person.id] || undefined}
              />
            ))}
          </fieldset>
        ))}

        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button type="submit" isLoading={accept.isPending} disabled={remaining.length === 0}>
            Accept
          </Button>
        </div>
      </form>
    </Modal>
  );
}
