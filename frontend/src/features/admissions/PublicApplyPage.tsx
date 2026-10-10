import { Briefcase, CheckCircle2, GraduationCap, Paperclip, School as SchoolIcon, Upload } from "lucide-react";
import { useState } from "react";
import { Navigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { useSchoolBranding } from "@/features/schools/useSchoolsCrud";
import type { ApiError } from "@/lib/api-client";
import { useSchoolSlug } from "@/lib/schoolSlug";

import { CHOICE_TYPES, type ApplicationKind, type CustomFieldConfig, type FormFieldConfig, type PublicApplicationOptions } from "./types";
import { usePublicApplicationOptions, useSubmitPublicApplication } from "./useAdmissionsCrud";

/** Wide controls take a whole row; the rest sit two to a row. */
const FULL_WIDTH_TYPES = new Set(["textarea", "files"]);

type Errors = Record<string, string>;

export function PublicApplyPage() {
  const params = useParams<{ schoolSlug: string; kind: string }>();
  // Inside a school's own address the slug comes from the URL prefix; the old /apply/<slug>/<kind> links carry it.
  const addressSlug = useSchoolSlug();
  const schoolSlug = addressSlug ?? params.schoolSlug;
  const kindParam = params.kind;
  // Each kind of applicant has its own link (/apply/<school>/student or /staff), so there's nothing to switch.
  const kind: ApplicationKind = kindParam === "staff" ? "staff" : "student";
  const { data: school, isLoading: isLoadingSchool, isError: schoolNotFound } = useSchoolBranding(schoolSlug);
  const { data: options } = usePublicApplicationOptions(schoolSlug);
  const submitApplication = useSubmitPublicApplication();

  // One bag of answers keyed by field key — standard questions and the school's own extra ones alike.
  const [values, setValues] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<File[]>([]);
  // Answers that aren't a single string: ticked choices, and uploads for the school's own file questions.
  const [multi, setMulti] = useState<Record<string, string[]>>({});
  const [customFiles, setCustomFiles] = useState<Record<string, File[]>>({});
  const [progress, setProgress] = useState<number | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);

  const form = options?.form[kind];
  const set = (key: string, value: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: "" } : prev));
  };

  if (kindParam !== "student" && kindParam !== "staff") {
    return <Navigate to={addressSlug ? "/apply/student" : `/apply/${schoolSlug}/student`} replace />;
  }

  if (isLoadingSchool) {
    return <FullPageSpinner />;
  }

  if (schoolNotFound || !school || !schoolSlug) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <SchoolIcon className="size-8 text-[var(--color-text-muted)]" aria-hidden="true" />
          <p className="text-sm text-[var(--color-text)]">We couldn't find that school.</p>
        </CardContent>
      </Card>
    );
  }

  if (submitted) {
    return (
      <Card className="w-full max-w-lg">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <CheckCircle2 className="size-10 text-[var(--color-success)]" aria-hidden="true" />
          <h1 className="text-lg font-semibold text-[var(--color-text)]">Application submitted</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Thank you for applying to {school.name}. We'll be in touch by email with next steps.
          </p>
        </CardContent>
      </Card>
    );
  }

  const validate = (): Errors => {
    const found: Errors = {};
    for (const field of form?.fields ?? []) {
      if (!field.enabled || !field.required) continue;
      const missing = field.type === "files" ? files.length === 0 : !(values[field.key] ?? "").trim();
      if (missing) found[field.key] = "This field is required.";
    }
    for (const question of form?.custom_fields ?? []) {
      const key = question.key as string;
      if (!question.required) continue;
      if (question.type === "file") {
        if ((customFiles[key] ?? []).length === 0) found[key] = "Please upload a file.";
      } else if (question.type === "multiselect") {
        if ((multi[key] ?? []).length === 0) found[key] = "Choose at least one.";
      } else if (question.type === "checkbox") {
        if (values[key] !== "true") found[key] = "This box must be ticked.";
      } else if (!(values[key] ?? "").trim()) {
        found[key] = "This question is required.";
      }
    }
    return found;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setGeneralError(null);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setGeneralError("Please complete the highlighted questions.");
      return;
    }
    setProgress(0);

    const customAnswers: Record<string, string | string[]> = {};
    const uploads: Record<string, File[]> = {};
    for (const question of form?.custom_fields ?? []) {
      const key = question.key as string;
      if (question.type === "file") {
        if ((customFiles[key] ?? []).length > 0) uploads[key] = customFiles[key];
      } else if (question.type === "multiselect") {
        if ((multi[key] ?? []).length > 0) customAnswers[key] = multi[key];
      } else {
        const answer = (values[key] ?? "").trim();
        if (answer) customAnswers[key] = answer;
      }
    }
    const standard: Record<string, string | number | undefined> = {};
    for (const field of form?.fields ?? []) {
      if (!field.enabled || field.type === "files") continue;
      const raw = (values[field.key] ?? "").trim();
      standard[field.key] = field.type === "number" ? (raw ? Number(raw) : undefined) : raw || undefined;
    }

    submitApplication.mutate(
      {
        schoolSlug,
        values: {
          kind,
          first_name: standard.first_name as string,
          last_name: standard.last_name as string,
          email: standard.email as string,
          ...standard,
          custom_answers: Object.keys(customAnswers).length > 0 ? customAnswers : undefined,
          custom_files: Object.keys(uploads).length > 0 ? uploads : undefined,
          documents: form?.fields.some((f) => f.key === "documents" && f.enabled) ? files : [],
        },
        onProgress: setProgress,
      },
      {
        onSuccess: () => setSubmitted(true),
        onError: (err: ApiError) => {
          const fieldErrors: Errors = {};
          for (const item of err.errors ?? []) {
            if (item.field) fieldErrors[item.field] = item.message;
          }
          setErrors(fieldErrors);
          setGeneralError(
            Object.keys(fieldErrors).length > 0 ? "Please fix the highlighted questions." : (err.errors[0]?.message ?? err.message),
          );
          setProgress(null);
        },
      },
    );
  };

  const renderStandard = (field: FormFieldConfig, opts: PublicApplicationOptions | undefined) => {
    const common = { label: field.label, required: field.required, error: errors[field.key] || undefined };
    const value = values[field.key] ?? "";
    switch (field.type) {
      case "textarea":
        return <Textarea {...common} rows={2} value={value} onChange={(e) => set(field.key, e.target.value)} />;
      case "gender":
        return (
          <Select {...common} value={value} onChange={(e) => set(field.key, e.target.value)}>
            <option value="">Prefer not to say</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </Select>
        );
      case "class":
        return (
          <Select {...common} value={value} onChange={(e) => set(field.key, e.target.value)}>
            <option value="">Select a class</option>
            {opts?.classes.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </Select>
        );
      case "role":
        return (
          <Select {...common} value={value} onChange={(e) => set(field.key, e.target.value)}>
            <option value="">Select a role</option>
            {opts?.roles.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </Select>
        );
      case "files":
        return (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-[var(--color-text)]">
              {field.label}
              {field.required && <span className="text-[var(--color-danger)]"> *</span>}
            </span>
            <input
              type="file"
              multiple
              onChange={(e) => {
                setFiles(e.target.files ? Array.from(e.target.files) : []);
                setErrors((prev) => (prev[field.key] ? { ...prev, [field.key]: "" } : prev));
              }}
              className="text-sm text-[var(--color-text-muted)] file:mr-3 file:rounded-[var(--radius-md)] file:border-0 file:bg-[var(--color-bg-subtle)] file:px-3 file:py-1.5 file:text-sm file:text-[var(--color-text)]"
            />
            {files.length > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                <Paperclip className="size-3.5" aria-hidden="true" />
                {files.length} file(s) selected
              </p>
            )}
            {errors[field.key] && <p className="text-xs text-[var(--color-danger)]">{errors[field.key]}</p>}
          </div>
        );
      default:
        return (
          <Input
            {...common}
            type={field.type === "number" ? "number" : field.type}
            min={field.type === "number" ? 0 : undefined}
            value={value}
            onChange={(e) => set(field.key, e.target.value)}
          />
        );
    }
  };

  const clearError = (key: string) => setErrors((prev) => (prev[key] ? { ...prev, [key]: "" } : prev));

  const renderCustom = (question: CustomFieldConfig) => {
    const key = question.key as string;
    const common = { label: question.label, required: question.required, error: errors[key] || undefined };
    const value = values[key] ?? "";
    const heading = (
      <span className="text-sm font-medium text-[var(--color-text)]">
        {question.label}
        {question.required && <span className="text-[var(--color-danger)]"> *</span>}
      </span>
    );
    const errorLine = errors[key] ? <p className="text-xs text-[var(--color-danger)]">{errors[key]}</p> : null;

    switch (question.type) {
      case "textarea":
        return <Textarea {...common} rows={3} value={value} onChange={(e) => set(key, e.target.value)} />;
      case "select":
        return (
          <Select {...common} value={value} onChange={(e) => set(key, e.target.value)}>
            <option value="">Select…</option>
            {question.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        );
      case "radio":
        return (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1">{heading}</legend>
            {question.options.map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm text-[var(--color-text)]">
                <input type="radio" name={key} checked={value === option} onChange={() => set(key, option)} />
                <span className="min-w-0 break-words">{option}</span>
              </label>
            ))}
            {errorLine}
          </fieldset>
        );
      case "multiselect":
        return (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1">{heading}</legend>
            {question.options.map((option) => (
              <label key={option} className="flex items-center gap-2 text-sm text-[var(--color-text)]">
                <input
                  type="checkbox"
                  checked={(multi[key] ?? []).includes(option)}
                  onChange={(e) => {
                    setMulti((prev) => {
                      const current = prev[key] ?? [];
                      return { ...prev, [key]: e.target.checked ? [...current, option] : current.filter((o) => o !== option) };
                    });
                    clearError(key);
                  }}
                />
                <span className="min-w-0 break-words">{option}</span>
              </label>
            ))}
            {errorLine}
          </fieldset>
        );
      case "checkbox":
        return (
          <div className="flex flex-col gap-1">
            <label className="flex items-start gap-2 text-sm text-[var(--color-text)]">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={value === "true"}
                onChange={(e) => set(key, e.target.checked ? "true" : "")}
              />
              <span className="min-w-0 break-words">
                {question.label}
                {question.required && <span className="text-[var(--color-danger)]"> *</span>}
              </span>
            </label>
            {errorLine}
          </div>
        );
      case "file":
        return (
          <div className="flex flex-col gap-1.5">
            {heading}
            <input
              type="file"
              multiple
              onChange={(e) => {
                setCustomFiles((prev) => ({ ...prev, [key]: e.target.files ? Array.from(e.target.files) : [] }));
                clearError(key);
              }}
              className="w-full min-w-0 text-sm text-[var(--color-text-muted)] file:mr-3 file:rounded-[var(--radius-md)] file:border-0 file:bg-[var(--color-bg-subtle)] file:px-3 file:py-1.5 file:text-sm file:text-[var(--color-text)]"
            />
            {(customFiles[key] ?? []).length > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                <Paperclip className="size-3.5 shrink-0" aria-hidden="true" />
                {customFiles[key].length} file(s) selected
              </p>
            )}
            {errorLine}
          </div>
        );
      default:
        return (
          <Input
            {...common}
            type={question.type === "number" || question.type === "date" || question.type === "email" ? question.type : question.type === "phone" ? "tel" : "text"}
            inputMode={question.type === "phone" ? "tel" : undefined}
            value={value}
            onChange={(e) => set(key, e.target.value)}
          />
        );
    }
  };

  const enabledFields = form?.fields.filter((field) => field.enabled) ?? [];

  return (
    <Card className="w-full max-w-2xl overflow-hidden">
      <div className="flex items-center gap-3 border-b border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-primary)_8%,transparent)] px-4 py-5 sm:gap-4 sm:px-6">
        {school.logo ? (
          <img src={school.logo} alt="" className="size-12 shrink-0 rounded-[var(--radius-md)] object-cover sm:size-14" />
        ) : (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-primary)] text-white sm:size-14">
            <SchoolIcon className="size-6" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[var(--color-text-muted)]">{school.name}</p>
          <h1 className="flex items-center gap-2 text-lg font-semibold text-[var(--color-text)] sm:text-xl">
            {kind === "student" ? (
              <GraduationCap className="size-5 shrink-0 text-[var(--color-primary)]" aria-hidden="true" />
            ) : (
              <Briefcase className="size-5 shrink-0 text-[var(--color-primary)]" aria-hidden="true" />
            )}
            {kind === "student" ? "Student application" : "Staff application"}
          </h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            {kind === "student" ? "Tell us about the applicant and their guardian." : "Tell us about yourself and the role you want."}
            {" "}Fields marked <span className="text-[var(--color-danger)]">*</span> are required.
          </p>
        </div>
      </div>
      <CardContent className="px-4 py-5 sm:px-6">
        {generalError && (
          <Alert tone="danger" className="mb-4">
            {generalError}
          </Alert>
        )}
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {!form ? (
            <FullPageSpinner />
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {enabledFields.map((field) => (
                  <div key={field.key} className={FULL_WIDTH_TYPES.has(field.type) ? "sm:col-span-2" : undefined}>
                    {renderStandard(field, options)}
                  </div>
                ))}
                {form.custom_fields.map((question) => (
                  <div
                    key={question.key}
                    className={question.type === "textarea" || CHOICE_TYPES.includes(question.type) || question.type === "checkbox" ? "sm:col-span-2" : undefined}
                  >
                    {renderCustom(question)}
                  </div>
                ))}
              </div>

              {progress !== null && (
                <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-bg-subtle)]">
                  <div
                    className="h-full rounded-full bg-[image:var(--gradient-primary)] transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}

              <div className="mt-2 flex justify-end">
                <Button type="submit" isLoading={submitApplication.isPending}>
                  {!submitApplication.isPending && <Upload className="size-4" aria-hidden="true" />}
                  Submit application
                </Button>
              </div>
            </>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
