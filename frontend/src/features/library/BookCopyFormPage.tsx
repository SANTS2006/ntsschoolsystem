import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";

import { useBook, useBookCopy, useCreateBookCopy, useUpdateBookCopy } from "./useLibraryCrud";

const schema = z.object({ copy_number: z.string().min(1, "Copy number is required") });
type FormValues = z.infer<typeof schema>;
const EMPTY_VALUES: FormValues = { copy_number: "" };
const FIELD_KEYS = new Set(["copy_number"]);

export function BookCopyFormPage() {
  const { bookId, id } = useParams<{ bookId: string; id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: book } = useBook(bookId);
  const { data: copy, isLoading: isLoadingCopy } = useBookCopy(id);
  const createCopy = useCreateBookCopy();
  const updateCopy = useUpdateBookCopy(id ?? "");
  const mutation = isEditMode ? updateCopy : createCopy;
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  useEffect(() => {
    if (copy) {
      reset({ copy_number: copy.copy_number });
    }
  }, [copy, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    mutation.mutate(
      { book: bookId as string, copy_number: values.copy_number },
      {
        onSuccess: () => {
          showToast({ title: isEditMode ? "Copy updated" : "Copy added" });
          navigate(`/library/books/${bookId}/copies`);
        },
        onError: (err: ApiError) => {
          if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
            const message = generalErrorMessage(err);
            setGeneralError(message);
            showToast({ title: "Could not save copy", description: message, tone: "danger" });
          }
        },
      },
    );
  };

  if (isEditMode && isLoadingCopy) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">{isEditMode ? "Edit copy" : "New copy"}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{book ? `For ${book.title}` : "Copy details"}</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input
              label="Copy number"
              placeholder="C-001"
              error={errors.copy_number?.message}
              {...register("copy_number")}
            />

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate(`/library/books/${bookId}/copies`)}>
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
