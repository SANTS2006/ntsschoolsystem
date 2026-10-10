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

import { useCategory, useCreateCategory, useUpdateCategory } from "./useDocumentsCrud";

const schema = z.object({ name: z.string().min(1, "Name is required"), description: z.string() });
type FormValues = z.infer<typeof schema>;
const EMPTY_VALUES: FormValues = { name: "", description: "" };
const FIELD_KEYS = new Set(["name", "description"]);

export function CategoryFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: category, isLoading: isLoadingCategory } = useCategory(id);
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory(id ?? "");
  const mutation = isEditMode ? updateCategory : createCategory;
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  useEffect(() => {
    if (category) {
      reset({ name: category.name, description: category.description });
    }
  }, [category, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    mutation.mutate(
      { name: values.name, description: values.description || undefined },
      {
        onSuccess: () => {
          showToast({ title: isEditMode ? "Category updated" : "Category created" });
          navigate("/documents/categories");
        },
        onError: (err: ApiError) => {
          if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
            const message = generalErrorMessage(err);
            setGeneralError(message);
            showToast({ title: "Could not save category", description: message, tone: "danger" });
          }
        },
      },
    );
  };

  if (isEditMode && isLoadingCategory) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">
        {isEditMode ? "Edit category" : "New category"}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Category details</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input label="Name" placeholder="Report Cards" error={errors.name?.message} {...register("name")} />
            <Input label="Description" error={errors.description?.message} {...register("description")} />

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/documents/categories")}>
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
