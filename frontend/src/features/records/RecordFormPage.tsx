import { zodResolver } from "@hookform/resolvers/zod";
import { Paperclip, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

import { Alert } from "@/components/ui/Alert";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Button } from "@/components/ui/Button";
import { OpenFileButton } from "@/components/ui/FileViewer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/toastContext";
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";

import { useCreateRecord, useRecord, useUpdateRecord } from "./useRecordsCrud";

const schema = z.object({
  title: z.string().min(1, "Title is required"),
  category: z.string(),
  body: z.string(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = { title: "", category: "", body: "" };
const FIELD_KEYS = new Set(["title", "category", "body", "file"]);

export function RecordFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: record, isLoading: isLoadingRecord } = useRecord(id);
  const createRecord = useCreateRecord();
  const updateRecord = useUpdateRecord(id ?? "");
  const mutation = isEditMode ? updateRecord : createRecord;
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  useEffect(() => {
    if (record) {
      reset({ title: record.title, category: record.category, body: record.body });
    }
  }, [record, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    if (!values.body.trim() && !file && !record?.file) {
      setError("body", { message: "Enter some text, attach a file, or both." });
      return;
    }
    mutation.mutate(
      {
        title: values.title,
        category: values.category || undefined,
        body: values.body || undefined,
        file: file ?? undefined,
      },
      {
        onSuccess: (saved) => {
          showToast({ title: isEditMode ? "Record updated" : "Record added" });
          navigate(`/records/${saved.id}`);
        },
        onError: (err: ApiError) => {
          if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
            const message = generalErrorMessage(err);
            setGeneralError(message);
            showToast({ title: "Could not save record", description: message, tone: "danger" });
          }
        },
      },
    );
  };

  if (isEditMode && isLoadingRecord) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <button
        type="button"
        onClick={() => navigate(isEditMode && record ? `/records/${record.id}` : "/records")}
        className="back-button"
      >
        <BackArrowIcon className="size-4" />
        Back to records
      </button>

      <h1 className="text-xl font-semibold text-[var(--color-text)]">
        {isEditMode ? "Edit record" : "Add record"}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Record details</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input label="Title" error={errors.title?.message} {...register("title")} />
            <Input
              label="Category"
              placeholder="e.g. Policy, Certificate, Notice"
              hint="Optional — helps others find related records."
              error={errors.category?.message}
              {...register("category")}
            />
            <Textarea
              label="Details"
              placeholder="Write the record's content here, if any."
              rows={6}
              error={errors.body?.message}
              {...register("body")}
            />

            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-[var(--color-text)]">Attachment</span>
              {record?.file && !file && (
                <OpenFileButton url={record.file} title={record.title || "Current file"} className="flex items-center gap-1.5 text-sm text-[var(--color-primary)]">
                  <Paperclip className="size-3.5" aria-hidden="true" />
                  Current file
                </OpenFileButton>
              )}
              <input
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="text-sm text-[var(--color-text-muted)] file:mr-3 file:rounded-[var(--radius-md)] file:border-0 file:bg-[var(--color-bg-subtle)] file:px-3 file:py-1.5 file:text-sm file:text-[var(--color-text)]"
              />
              <p className="text-xs text-[var(--color-text-muted)]">
                Documents, images, spreadsheets and similar files up to 10MB. Optional if you've written details
                above.
              </p>
            </div>

            <div className="mt-2 flex justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate(isEditMode && record ? `/records/${record.id}` : "/records")}
              >
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
