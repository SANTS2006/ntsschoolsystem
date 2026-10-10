import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/toastContext";
import type { ApiError } from "@/lib/api-client";
import { generalErrorMessage } from "@/lib/formErrors";

import type { Assessment, AssessmentStatus } from "./types";
import { useCreateAssessment, useUpdateAssessment } from "./useAcademicsCrud";

interface FormState {
  name: string;
  weight: string;
  maxScore: string;
  discretionary: string;
  status: AssessmentStatus;
  allowUploads: boolean;
  deadline: string; // datetime-local value (the teacher's own clock), "" = no cut-off
  instructions: string;
}

/** ISO instant -> the value a datetime-local input wants, in the browser's time zone. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function initialState(assessment: Assessment | null): FormState {
  return assessment
    ? {
        name: assessment.name,
        weight: String(assessment.weight),
        maxScore: String(Number(assessment.max_score)),
        discretionary: assessment.discretionary_weight ? String(assessment.discretionary_weight) : "",
        status: assessment.status,
        allowUploads: assessment.allow_file_uploads,
        deadline: toLocalInput(assessment.upload_deadline),
        instructions: assessment.upload_instructions,
      }
    : { name: "", weight: "", maxScore: "100", discretionary: "", status: "active", allowUploads: false, deadline: "", instructions: "" };
}

/** Add a new assessment, or edit an existing one (name, weight, maximum score, marks held back for the
 * teacher's discretion, and active/inactive). Mount it with a `key` per assessment so each opens with
 * its own values. `availablePercent` is how much of the subject's CA weight is still unallocated. */
export function AssessmentFormModal({
  open,
  onClose,
  subjectOfferingId,
  assessment,
  availablePercent,
}: {
  open: boolean;
  onClose: () => void;
  subjectOfferingId: string;
  assessment: Assessment | null;
  availablePercent: number;
}) {
  const { showToast } = useToast();
  const isEdit = assessment !== null;
  const create = useCreateAssessment();
  const update = useUpdateAssessment(assessment?.id ?? "");
  const mutation = isEdit ? update : create;
  const [form, setForm] = useState<FormState>(() => initialState(assessment));
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }));

  // Editing an active assessment frees its own weight first, so it can be raised up to what's left + itself.
  const ceiling = availablePercent + (isEdit && assessment.status === "active" ? assessment.weight : 0);
  const weight = Number(form.weight);
  const canSave = form.name.trim() !== "" && weight > 0 && Number(form.maxScore) > 0;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    mutation.mutate(
      {
        subject_offering: subjectOfferingId,
        name: form.name.trim(),
        weight,
        max_score: form.maxScore,
        discretionary_weight: form.discretionary ? Number(form.discretionary) : 0,
        allow_file_uploads: form.allowUploads,
        upload_deadline: form.allowUploads && form.deadline ? new Date(form.deadline).toISOString() : null,
        upload_instructions: form.allowUploads ? form.instructions.trim() : "",
        ...(isEdit ? { status: form.status } : {}),
      },
      {
        onSuccess: () => {
          showToast({ title: isEdit ? "Assessment updated" : "Assessment added" });
          onClose();
        },
        onError: (err: ApiError) => setError(generalErrorMessage(err)),
      },
    );
  };

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Edit "${assessment.name}"` : "Add an assessment"}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {error && <Alert tone="danger">{error}</Alert>}
        <Input label="Name" placeholder="e.g. Assignment 1" value={form.name} maxLength={100} onChange={(e) => set("name", e.target.value)} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Weight %"
            type="number"
            min={1}
            max={Math.max(ceiling, 1)}
            value={form.weight}
            onChange={(e) => set("weight", e.target.value)}
            hint={`Share of the subject's CA. Up to ${ceiling}% is still available.`}
          />
          <Input
            label="Max score"
            type="number"
            min={1}
            value={form.maxScore}
            onChange={(e) => set("maxScore", e.target.value)}
            hint="The score that counts as full marks."
          />
        </div>
        <Input
          label="Reserved for discretion"
          type="number"
          min={0}
          max={form.weight ? weight : undefined}
          value={form.discretionary}
          onChange={(e) => set("discretionary", e.target.value)}
          hint="Part of the weight you award by hand, per student, instead of from the test score."
        />
        <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] p-3">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              role="switch"
              checked={form.allowUploads}
              onChange={(e) => set("allowUploads", e.target.checked)}
              className="mt-1 size-4 accent-[var(--color-primary)]"
            />
            <span>
              <span className="block text-sm font-medium text-[var(--color-text)]">Students upload files for this assessment</span>
              <span className="block text-xs text-[var(--color-text-muted)]">
                For assignments, lab reports and other work handed in as files. You open and mark each student&apos;s files.
              </span>
            </span>
          </label>
          {form.allowUploads && (
            <>
              <Input
                label="Upload deadline"
                type="datetime-local"
                value={form.deadline}
                onChange={(e) => set("deadline", e.target.value)}
                hint="After this date and time students can no longer upload, and are reminded as it approaches. Leave empty for no cut-off. Move it later at any time to reopen uploads."
              />
              <Input
                label="Instructions for students (optional)"
                placeholder="e.g. PDF or Word, one file per question"
                value={form.instructions}
                maxLength={500}
                onChange={(e) => set("instructions", e.target.value)}
              />
            </>
          )}
        </div>
        {isEdit && (
          <Select label="Status" value={form.status} onChange={(e) => set("status", e.target.value as AssessmentStatus)}>
            <option value="active">Active — counts towards CA</option>
            <option value="inactive">Inactive — left out of CA</option>
          </Select>
        )}
        {isEdit && (
          <p className="text-xs text-[var(--color-text-muted)]">
            Changing the weight, max score or reserved marks recalculates the scores already entered.
          </p>
        )}
        <div className="flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={!canSave} isLoading={mutation.isPending}>
            {isEdit ? "Save changes" : "Add assessment"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
