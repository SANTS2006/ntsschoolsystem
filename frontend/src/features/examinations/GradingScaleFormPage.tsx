import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";

import { useCreateGradingScale, useGradingScale, useUpdateGradingScale } from "./useExaminationsCrud";

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  is_default: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = { name: "", is_default: false };
const FIELD_KEYS = new Set(["name", "is_default"]);

export function GradingScaleFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: scale, isLoading: isLoadingScale } = useGradingScale(id);
  const createScale = useCreateGradingScale();
  const updateScale = useUpdateGradingScale(id ?? "");
  const mutation = isEditMode ? updateScale : createScale;
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  useEffect(() => {
    if (scale) {
      reset({ name: scale.name, is_default: scale.is_default });
    }
  }, [scale, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    mutation.mutate(values, {
      onSuccess: () => {
        showToast({ title: isEditMode ? "Grading scale updated" : "Grading scale created" });
        navigate("/examinations/scales");
      },
      onError: (err: ApiError) => {
        if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
          const message = generalErrorMessage(err);
          setGeneralError(message);
          showToast({ title: "Could not save grading scale", description: message, tone: "danger" });
        }
      },
    });
  };

  if (isEditMode && isLoadingScale) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">
        {isEditMode ? "Edit grading scale" : "New grading scale"}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Grading scale details</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input label="Name" placeholder="Standard A-F" error={errors.name?.message} {...register("name")} />
            <Checkbox
              label="Default grading scale"
              hint="Used as the suggested scale when creating a new exam."
              {...register("is_default")}
            />

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/examinations/scales")}>
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
