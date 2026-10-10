import { Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/toastContext";
import { useHasPermission } from "@/features/auth/useAuth";
import type { ApiError } from "@/lib/api-client";
import { generalErrorMessage } from "@/lib/formErrors";

import { ApplicationLinks } from "./ApplicationLinks";
import { CHOICE_TYPES, type ApplicationKind, type CustomFieldConfig, type CustomFieldType, type FormConfig } from "./types";
import { useFormConfig, useSaveFormConfig } from "./useAdmissionsCrud";

const CUSTOM_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: "Short answer",
  textarea: "Long answer (paragraph)",
  number: "Number",
  date: "Date",
  email: "Email address",
  phone: "Phone number",
  select: "Dropdown (pick one)",
  radio: "Choose one (all choices shown)",
  multiselect: "Choose several (tick boxes)",
  checkbox: "Single tick box (e.g. “I agree”)",
  file: "File upload",
};

type FieldChoices = Record<string, { enabled: boolean; required: boolean }>;

interface Draft {
  fields: FieldChoices;
  custom: CustomFieldConfig[];
  /** Multiple-choice options as the admin types them, one per line. */
  optionText: Record<number, string>;
}

function toDraft(config: FormConfig): Draft {
  const fields: FieldChoices = {};
  for (const field of config.fields) {
    if (!field.locked) fields[field.key] = { enabled: field.enabled, required: field.required };
  }
  return {
    fields,
    custom: config.custom_fields.map((q) => ({ ...q })),
    optionText: Object.fromEntries(config.custom_fields.map((q, i) => [i, q.options.join("\n")])),
  };
}

function KindEditor({ kind, config }: { kind: ApplicationKind; config: FormConfig }) {
  const { showToast } = useToast();
  const canUpdate = useHasPermission("admissions.update");
  const save = useSaveFormConfig();
  const [draft, setDraft] = useState<Draft>(() => toDraft(config));
  const [error, setError] = useState<string | null>(null);

  const setField = (key: string, change: Partial<{ enabled: boolean; required: boolean }>) =>
    setDraft((d) => {
      const next = { ...d.fields[key], ...change };
      if (!next.enabled) next.required = false; // a hidden question can't be mandatory
      return { ...d, fields: { ...d.fields, [key]: next } };
    });

  const setCustom = (index: number, change: Partial<CustomFieldConfig>) =>
    setDraft((d) => ({ ...d, custom: d.custom.map((q, i) => (i === index ? { ...q, ...change } : q)) }));

  const addQuestion = () =>
    setDraft((d) => ({
      ...d,
      custom: [...d.custom, { label: "", type: "text", required: false, options: [] }],
      optionText: { ...d.optionText, [d.custom.length]: "" },
    }));

  const removeQuestion = (index: number) =>
    setDraft((d) => {
      const custom = d.custom.filter((_, i) => i !== index);
      return { ...d, custom, optionText: Object.fromEntries(custom.map((_, i) => [i, d.optionText[i < index ? i : i + 1] ?? ""])) };
    });

  const handleSave = () => {
    setError(null);
    const custom = draft.custom.map((q, i) => ({
      ...q,
      label: q.label.trim(),
      options:
        CHOICE_TYPES.includes(q.type)
          ? (draft.optionText[i] ?? "")
              .split("\n")
              .map((o) => o.trim())
              .filter(Boolean)
          : [],
    }));
    save.mutate(
      { kind, payload: { fields: draft.fields, custom_fields: custom } },
      {
        onSuccess: () => showToast({ title: "Application form saved" }),
        onError: (err: ApiError) => {
          const message = generalErrorMessage(err);
          setError(message);
          showToast({ title: "Could not save the form", description: message, tone: "danger" });
        },
      },
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {error && <Alert tone="danger">{error}</Alert>}

      <Card>
        <CardHeader>
          <CardTitle>Standard questions</CardTitle>
          <p className="text-sm text-[var(--color-text-muted)]">
            Choose which questions {kind} applicants see and which they must answer. Names, email and the
            {kind === "student" ? " class" : " role"} being applied for are always asked.
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase text-[var(--color-text-muted)]">
                  <th className="py-2 pr-3 font-medium">Question</th>
                  <th className="px-3 py-2 text-center font-medium">Show</th>
                  <th className="px-3 py-2 text-center font-medium">Required</th>
                </tr>
              </thead>
              <tbody>
                {config.fields.map((field) => {
                  const choice = draft.fields[field.key];
                  return (
                    <tr key={field.key} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="py-2.5 pr-3 text-[var(--color-text)]">
                        {field.label}
                        {field.locked && <span className="ml-2 text-xs text-[var(--color-text-muted)]">always asked</span>}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          aria-label={`Show ${field.label}`}
                          checked={field.locked ? true : choice.enabled}
                          disabled={field.locked || !canUpdate}
                          onChange={(e) => setField(field.key, { enabled: e.target.checked })}
                          className="size-4"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <input
                          type="checkbox"
                          aria-label={`${field.label} is required`}
                          checked={field.locked ? true : choice.required}
                          disabled={field.locked || !choice.enabled || !canUpdate}
                          onChange={(e) => setField(field.key, { required: e.target.checked })}
                          className="size-4"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>Your own questions</CardTitle>
            <p className="text-sm text-[var(--color-text-muted)]">
              Add anything else you need to know. Answers appear on each application.
            </p>
          </div>
          {canUpdate && (
            <Button size="sm" variant="secondary" onClick={addQuestion} disabled={draft.custom.length >= 20}>
              <Plus className="size-4" aria-hidden="true" /> Add a question
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {draft.custom.length === 0 && (
            <p className="text-sm text-[var(--color-text-muted)]">No extra questions yet.</p>
          )}
          {draft.custom.map((question, index) => (
            <div key={question.key ?? `new-${index}`} className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_180px_auto]">
                <Input
                  label="Question"
                  value={question.label}
                  maxLength={150}
                  disabled={!canUpdate}
                  onChange={(e) => setCustom(index, { label: e.target.value })}
                  placeholder="e.g. Religion"
                />
                <Select
                  label="Answer type"
                  value={question.type}
                  disabled={!canUpdate}
                  onChange={(e) => setCustom(index, { type: e.target.value as CustomFieldType })}
                >
                  {(Object.keys(CUSTOM_TYPE_LABELS) as CustomFieldType[]).map((type) => (
                    <option key={type} value={type}>
                      {CUSTOM_TYPE_LABELS[type]}
                    </option>
                  ))}
                </Select>
                <div className="flex items-end gap-3 pb-1">
                  <label className="flex items-center gap-2 text-sm text-[var(--color-text)]">
                    <input
                      type="checkbox"
                      checked={question.required}
                      disabled={!canUpdate}
                      onChange={(e) => setCustom(index, { required: e.target.checked })}
                      className="size-4"
                    />
                    Required
                  </label>
                  {canUpdate && (
                    <button
                      type="button"
                      onClick={() => removeQuestion(index)}
                      aria-label={`Remove question ${question.label || index + 1}`}
                      className="rounded p-1.5 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-danger)]"
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>
              {question.type === "file" && (
                <p className="text-xs text-[var(--color-text-muted)]">
                  Applicants upload one or more files (documents, images, PDF; up to 10 MB each).
                </p>
              )}
              {CHOICE_TYPES.includes(question.type) && (
                <Textarea
                  label="Choices (one per line)"
                  rows={3}
                  value={draft.optionText[index] ?? ""}
                  disabled={!canUpdate}
                  onChange={(e) => setDraft((d) => ({ ...d, optionText: { ...d.optionText, [index]: e.target.value } }))}
                  placeholder={"Christian\nMuslim\nOther"}
                />
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {canUpdate && (
        <div className="flex justify-end">
          <Button onClick={handleSave} isLoading={save.isPending}>
            {!save.isPending && <Save className="size-4" aria-hidden="true" />}
            Save {kind} form
          </Button>
        </div>
      )}
    </div>
  );
}

export function ApplicationFormBuilderPage() {
  const { data, isLoading, isError, error } = useFormConfig();
  const [kind, setKind] = useState<ApplicationKind>("student");

  if (isLoading) return <FullPageSpinner />;
  if (isError || !data) return <Alert tone="danger">{(error as ApiError)?.message ?? "Could not load the form."}</Alert>;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Application form</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          Share each form's link or QR code, and build the questions applicants answer.
        </p>
      </div>

      <ApplicationLinks baseUrl={data.apply_url} />

      <div className="flex gap-2">
        {(["student", "staff"] as ApplicationKind[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setKind(option)}
            className={`flex-1 rounded-[var(--radius-md)] border px-4 py-2 text-sm font-medium capitalize transition-colors sm:flex-none ${
              kind === option
                ? "border-[var(--color-primary)] bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)] text-[var(--color-primary)]"
                : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            }`}
          >
            {option} applicants
          </button>
        ))}
      </div>

      {/* Remounts on switching kind or after a save, so the editor re-reads the saved config. */}
      <KindEditor key={`${kind}-${JSON.stringify(data[kind])}`} kind={kind} config={data[kind]} />
    </div>
  );
}
