import { zodResolver } from "@hookform/resolvers/zod";
import { Paperclip, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { OpenFileButton } from "@/components/ui/FileViewer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import { useAllSections, useSchoolClasses, useSubjects } from "@/features/academics/useAcademicsLookups";
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";

import { useAssignment, useCreateAssignment, useUpdateAssignment } from "./useAssignmentsCrud";

const schema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string(),
  school_class: z.string().min(1, "Class is required"),
  section: z.string(),
  subject: z.string().min(1, "Subject is required"),
  due_date: z.string().min(1, "Due date is required"),
  max_score: z.string().min(1, "Max score is required"),
  is_active: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

function toDatetimeLocal(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const FIELD_KEYS = new Set([
  "title",
  "description",
  "school_class",
  "section",
  "subject",
  "due_date",
  "max_score",
  "is_active",
  "attachment",
]);

export function HomeworkAssignmentFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: assignment, isLoading: isLoadingAssignment } = useAssignment(id);
  const { data: classes } = useSchoolClasses();
  const { data: sections } = useAllSections();
  const { data: subjects } = useSubjects();
  const createAssignment = useCreateAssignment();
  const updateAssignment = useUpdateAssignment(id ?? "");
  const mutation = isEditMode ? updateAssignment : createAssignment;
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      description: "",
      school_class: "",
      section: "",
      subject: "",
      due_date: "",
      max_score: "100",
      is_active: true,
    },
  });

  useEffect(() => {
    // Also re-fires once `classes`/`sections`/`subjects` finish loading (not just when
    // `assignment` does): a native <select> silently ignores a value assigned before its
    // matching <option> exists in the DOM, and nothing re-applies it later on its own — so if
    // `assignment` resolves before these lookups do, `school_class`/`section`/`subject` would be
    // silently dropped on the first `reset()` and never actually selected.
    if (assignment) {
      reset({
        title: assignment.title,
        description: assignment.description,
        school_class: assignment.school_class,
        section: assignment.section ?? "",
        subject: assignment.subject,
        due_date: toDatetimeLocal(assignment.due_date),
        max_score: assignment.max_score,
        is_active: assignment.is_active,
      });
    }
  }, [assignment, classes, sections, subjects, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    mutation.mutate(
      {
        title: values.title,
        description: values.description || undefined,
        school_class: values.school_class,
        section: values.section || undefined,
        subject: values.subject,
        due_date: values.due_date,
        max_score: values.max_score,
        is_active: values.is_active,
        attachment: attachmentFile ?? undefined,
      },
      {
        onSuccess: () => {
          showToast({ title: isEditMode ? "Assignment updated" : "Assignment created" });
          navigate("/assignments");
        },
        onError: (err: ApiError) => {
          if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
            const message = generalErrorMessage(err);
            setGeneralError(message);
            showToast({ title: "Could not save assignment", description: message, tone: "danger" });
          }
        },
      },
    );
  };

  if (isEditMode && isLoadingAssignment) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">
        {isEditMode ? "Edit assignment" : "New assignment"}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>
            Assignment details
            {assignment?.teacher_name && (
              <span className="ml-2 text-sm font-normal text-[var(--color-text-muted)]">
                By {assignment.teacher_name}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input label="Title" error={errors.title?.message} {...register("title")} />
            <Input label="Description" error={errors.description?.message} {...register("description")} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select label="Class" error={errors.school_class?.message} {...register("school_class")}>
                <option value="">Select a class</option>
                {classes?.map((schoolClass) => (
                  <option key={schoolClass.id} value={schoolClass.id}>
                    {schoolClass.name}
                  </option>
                ))}
              </Select>
              <Select label="Section" error={errors.section?.message} {...register("section")}>
                <option value="">Not set (whole class)</option>
                {sections?.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.school_class_name} — {section.name}
                  </option>
                ))}
              </Select>
            </div>
            <Select label="Subject" error={errors.subject?.message} {...register("subject")}>
              <option value="">Select a subject</option>
              {subjects?.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </Select>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                type="datetime-local"
                label="Due date"
                error={errors.due_date?.message}
                {...register("due_date")}
              />
              <Input
                type="number"
                step="0.01"
                label="Max score"
                error={errors.max_score?.message}
                {...register("max_score")}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-[var(--color-text)]">Attachment</span>
              {assignment?.attachment && !attachmentFile && (
                <OpenFileButton url={assignment.attachment} title={assignment.title || "Current attachment"} className="flex items-center gap-1.5 text-sm text-[var(--color-primary)]">
                  <Paperclip className="size-3.5" aria-hidden="true" />
                  Current attachment
                </OpenFileButton>
              )}
              <input
                type="file"
                onChange={(e) => setAttachmentFile(e.target.files?.[0] ?? null)}
                className="text-sm text-[var(--color-text-muted)] file:mr-3 file:rounded-[var(--radius-md)] file:border-0 file:bg-[var(--color-bg-subtle)] file:px-3 file:py-1.5 file:text-sm file:text-[var(--color-text)]"
              />
            </div>

            <Checkbox label="Active" {...register("is_active")} />

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/assignments")}>
                Cancel
              </Button>
              <Button type="submit" isLoading={mutation.isPending}>
                {!mutation.isPending && <Save className="size-4" aria-hidden="true" />}
                Save
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
