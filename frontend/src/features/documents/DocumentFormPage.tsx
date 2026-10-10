import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { FileUp, Paperclip, Save, X } from "lucide-react";
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
import { useStaffLookup } from "@/features/staff/useStaffLookups";
import { listStudents } from "@/features/students/api";
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";

import { ownerTypeLabel } from "./statusTone";
import type { OwnerType } from "./types";
import { useCategoryList, useCreateDocument, useDocument, useUpdateDocument } from "./useDocumentsCrud";

const OWNER_TYPES: OwnerType[] = ["school", "student", "staff"];

const schema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string(),
  category: z.string(),
  owner_type: z.enum(["school", "student", "staff"]),
  student: z.string(),
  staff: z.string(),
  is_confidential: z.boolean(),
  expiry_date: z.string(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = {
  title: "",
  description: "",
  category: "",
  owner_type: "school",
  student: "",
  staff: "",
  is_confidential: false,
  expiry_date: "",
};
const FIELD_KEYS = new Set([
  "title",
  "description",
  "category",
  "owner_type",
  "student",
  "staff",
  "file",
  "is_confidential",
  "expiry_date",
]);

export function DocumentFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: doc, isLoading: isLoadingDocument } = useDocument(id);
  const { data: categories } = useCategoryList({ page_size: 100 });
  const { data: students } = useQuery({
    queryKey: ["students", "lookup", "active"],
    queryFn: () => listStudents({ status: "active", page_size: 100, ordering: "last_name" }),
  });
  const { data: staff } = useStaffLookup();
  const [progress, setProgress] = useState<number | null>(null);
  const createDocument = useCreateDocument(setProgress);
  const updateDocument = useUpdateDocument(id ?? "", setProgress);
  const mutation = isEditMode ? updateDocument : createDocument;
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  useEffect(() => {
    // Also re-fires once `categories`/`students`/`staff` finish loading (not just when `doc`
    // does): a native <select> silently ignores a value assigned before its matching <option>
    // exists in the DOM, and nothing re-applies it later on its own — so if `doc` resolves
    // before these lookups do, `category`/`student`/`staff` would be silently dropped on the
    // first `reset()` and never actually selected, even though `doc` itself has the right value.
    if (doc) {
      reset({
        title: doc.title,
        description: doc.description,
        category: doc.category ?? "",
        owner_type: doc.owner_type,
        student: doc.student ?? "",
        staff: doc.staff ?? "",
        is_confidential: doc.is_confidential,
        expiry_date: doc.expiry_date ?? "",
      });
    }
  }, [doc, categories, students, staff, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    setFileError(null);
    if (!isEditMode && !file) {
      setFileError("Choose a file to upload.");
      return;
    }
    setProgress(file ? 0 : null);
    mutation.mutate(
      {
        title: values.title,
        description: values.description || undefined,
        category: values.category || undefined,
        owner_type: values.owner_type,
        student: values.owner_type === "student" ? values.student || undefined : undefined,
        staff: values.owner_type === "staff" ? values.staff || undefined : undefined,
        file: file ?? undefined,
        is_confidential: values.is_confidential,
        expiry_date: values.expiry_date || undefined,
      },
      {
        onSuccess: () => {
          showToast({ title: isEditMode ? "Document updated" : "Document uploaded" });
          navigate("/documents/files");
        },
        onError: (err: ApiError) => {
          setProgress(null);
          // The file isn't a registered input, so its error is shown by the picker itself.
          const fileProblem = err.errors.find((e) => e.field === "file");
          if (fileProblem) setFileError(fileProblem.message);
          const attachedToFields = applyFieldErrors(err, setError, FIELD_KEYS);
          if (!attachedToFields && !fileProblem) {
            const message = generalErrorMessage(err);
            setGeneralError(message);
            showToast({ title: "Could not save document", description: message, tone: "danger" });
          }
        },
      },
    );
  };

  if (isEditMode && isLoadingDocument) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">
        {isEditMode ? "Edit document" : "New document"}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>
            Document details
            {doc?.uploaded_by_name && (
              <span className="ml-2 text-sm font-normal text-[var(--color-text-muted)]">
                Uploaded by {doc.uploaded_by_name}
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
            <Select label="Category" error={errors.category?.message} {...register("category")}>
              <option value="">Not set</option>
              {categories?.results.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
            <Select
              label="Owner"
              hint="School-wide documents must leave Student/Staff unset below."
              error={errors.owner_type?.message}
              {...register("owner_type")}
            >
              {OWNER_TYPES.map((option) => (
                <option key={option} value={option}>
                  {ownerTypeLabel(option)}
                </option>
              ))}
            </Select>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select label="Student" error={errors.student?.message} {...register("student")}>
                <option value="">Not set</option>
                {students?.results.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.full_name} ({student.admission_number})
                  </option>
                ))}
              </Select>
              <Select label="Staff" error={errors.staff?.message} {...register("staff")}>
                <option value="">Not set</option>
                {staff?.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.full_name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-[var(--color-text)]">
                File{!isEditMode && <span className="text-[var(--color-danger)]"> *</span>}
              </span>
              {doc?.file && !file && (
                <OpenFileButton url={doc.file} title={doc.title || "Current file"} className="flex w-fit items-center gap-1.5 text-sm text-[var(--color-primary)]">
                  <Paperclip className="size-3.5" aria-hidden="true" />
                  Current file — click to view
                </OpenFileButton>
              )}
              <label
                className={`flex cursor-pointer flex-col items-center gap-2 rounded-[var(--radius-lg)] border-2 border-dashed px-4 py-6 text-center transition-colors hover:border-[var(--color-primary)] hover:bg-[var(--color-bg-subtle)] ${
                  fileError ? "border-[var(--color-danger)]" : "border-[var(--color-border)]"
                }`}
              >
                <FileUp className="size-7 text-[var(--color-primary)]" aria-hidden="true" />
                <span className="text-sm font-medium text-[var(--color-text)]">
                  {file ? "Choose a different file" : isEditMode ? "Replace the file (optional)" : "Choose a file to upload"}
                </span>
                <span className="text-xs text-[var(--color-text-muted)]">PDF, Word, Excel, images and more</span>
                <input
                  type="file"
                  className="sr-only"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setFileError(null);
                  }}
                />
              </label>
              {file && (
                <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] px-3 py-2 text-sm">
                  <Paperclip className="size-4 shrink-0 text-[var(--color-primary)]" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-[var(--color-text)]">{file.name}</span>
                  <span className="shrink-0 text-xs text-[var(--color-text-muted)]">
                    {file.size >= 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    aria-label="Remove the chosen file"
                    className="shrink-0 rounded-full p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-danger)]"
                  >
                    <X className="size-4" aria-hidden="true" />
                  </button>
                </div>
              )}
              {fileError && <p className="text-sm text-[var(--color-danger)]">{fileError}</p>}
              {progress !== null && mutation.isPending && (
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-[var(--color-bg-subtle)]"
                  role="progressbar"
                  aria-label="Upload progress"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div className="h-full rounded-full bg-[image:var(--gradient-primary)] transition-all" style={{ width: `${progress}%` }} />
                </div>
              )}
            </div>

            <Input
              type="date"
              label="Expiry date"
              error={errors.expiry_date?.message}
              {...register("expiry_date")}
            />
            <Checkbox
              label="Confidential"
              hint="Only relevant for School-wide documents; hidden from self-service views when checked."
              {...register("is_confidential")}
            />

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/documents/files")}>
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
