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

import { useCreatePurchaseRequest, usePurchaseRequest, useUpdatePurchaseRequest } from "./useProcurementCrud";

const schema = z.object({ title: z.string().min(1, "Title is required"), notes: z.string() });
type FormValues = z.infer<typeof schema>;
const EMPTY_VALUES: FormValues = { title: "", notes: "" };
const FIELD_KEYS = new Set(["title", "notes"]);

export function PurchaseRequestFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: request, isLoading: isLoadingRequest } = usePurchaseRequest(id);
  const createRequest = useCreatePurchaseRequest();
  const updateRequest = useUpdatePurchaseRequest(id ?? "");
  const mutation = isEditMode ? updateRequest : createRequest;
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  useEffect(() => {
    if (request) {
      reset({ title: request.title, notes: request.notes });
    }
  }, [request, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    mutation.mutate(
      { title: values.title, notes: values.notes || undefined },
      {
        onSuccess: (saved) => {
          showToast({ title: isEditMode ? "Request updated" : "Request created" });
          navigate(`/procurement/requests/${saved.id}`);
        },
        onError: (err: ApiError) => {
          if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
            const message = generalErrorMessage(err);
            setGeneralError(message);
            showToast({ title: "Could not save request", description: message, tone: "danger" });
          }
        },
      },
    );
  };

  if (isEditMode && isLoadingRequest) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">
        {isEditMode ? "Edit purchase request" : "New purchase request"}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Request details</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input label="Title" error={errors.title?.message} {...register("title")} />
            <Input label="Notes" error={errors.notes?.message} {...register("notes")} />

            <div className="mt-2 flex justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate(isEditMode ? `/procurement/requests/${id}` : "/procurement/requests")}
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
