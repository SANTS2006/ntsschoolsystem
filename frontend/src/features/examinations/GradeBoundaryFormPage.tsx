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
import { useCurrentUser } from "@/features/auth/useAuth";
import { useToast } from "@/components/ui/toastContext";
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";

import { useCreateGradeBoundary, useGradeBoundary, useGradingScale, useUpdateGradeBoundary } from "./useExaminationsCrud";

const schema = z.object({
  grade: z.string().min(1, "Grade is required").max(5, "Grade must be 5 characters or fewer"),
  min_score: z.coerce.number().min(0, "Min score must be zero or greater"),
  max_score: z.coerce.number().min(0, "Max score must be zero or greater"),
  gpa_value: z.string(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = { grade: "", min_score: 0, max_score: 0, gpa_value: "" };
const FIELD_KEYS = new Set(["grade", "min_score", "max_score", "gpa_value"]);

export function GradeBoundaryFormPage() {
  const { scaleId, id } = useParams<{ scaleId: string; id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { data: user } = useCurrentUser();

  const { data: scale } = useGradingScale(scaleId);
  const { data: boundary, isLoading: isLoadingBoundary } = useGradeBoundary(id);
  const createBoundary = useCreateGradeBoundary();
  const updateBoundary = useUpdateGradeBoundary(id ?? "");
  const mutation = isEditMode ? updateBoundary : createBoundary;
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<z.input<typeof schema>, unknown, FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  useEffect(() => {
    if (boundary) {
      reset({
        grade: boundary.grade,
        min_score: Number(boundary.min_score),
        max_score: Number(boundary.max_score),
        gpa_value: boundary.gpa_value ?? "",
      });
    }
  }, [boundary, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    mutation.mutate(
      {
        grading_scale: scaleId as string,
        grade: values.grade,
        min_score: String(values.min_score),
        max_score: String(values.max_score),
        gpa_value: values.gpa_value || undefined,
      },
      {
        onSuccess: () => {
          showToast({ title: isEditMode ? "Grade boundary updated" : "Grade boundary created" });
          navigate(`/examinations/scales/${scaleId}/boundaries`);
        },
        onError: (err: ApiError) => {
          if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
            const message = generalErrorMessage(err);
            setGeneralError(message);
            showToast({ title: "Could not save grade boundary", description: message, tone: "danger" });
          }
        },
      },
    );
  };

  if (isEditMode && isLoadingBoundary) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">
        {isEditMode ? "Edit grade boundary" : "New grade boundary"}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>{scale ? `For ${scale.name}` : "Grade boundary details"}</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input label="Grade" placeholder="A" error={errors.grade?.message} {...register("grade")} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input type="number" label="Min score" error={errors.min_score?.message} {...register("min_score")} />
              <Input type="number" label="Max score" error={errors.max_score?.message} {...register("max_score")} />
            </div>
            <Input
              type="number"
              step="0.01"
              min={0}
              max={Number(user?.school?.grade_point_scale ?? 5)}
              label="Grade points"
              hint={
                user?.school?.school_type === "tertiary"
                  ? `The points this letter is worth, up to your top of ${user.school.grade_point_scale}. Used to work out each student's GPA.`
                  : "Optional — only needed for schools that report grade points."
              }
              error={errors.gpa_value?.message}
              {...register("gpa_value")}
            />

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate(`/examinations/scales/${scaleId}/boundaries`)}>
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
