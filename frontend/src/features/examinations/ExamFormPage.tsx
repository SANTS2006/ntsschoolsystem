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
import { Select } from "@/components/ui/Select";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import { useTermList } from "@/features/academics/useAcademicsCrud";
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";

import type { ExamType } from "./types";
import { useCreateExam, useExam, useGradingScaleList, useUpdateExam } from "./useExaminationsCrud";

const EXAM_TYPE_OPTIONS: ExamType[] = ["exam", "test", "quiz", "continuous_assessment", "practical"];

function examTypeLabel(type: ExamType): string {
  return type
    .split("_")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

const schema = z.object({
  name: z.string().min(1, "Name is required"),
  exam_type: z.enum(["exam", "test", "quiz", "continuous_assessment", "practical"]),
  term: z.string().min(1, "Term is required"),
  grading_scale: z.string(),
  start_date: z.string().min(1, "Start date is required"),
  end_date: z.string().min(1, "End date is required"),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = {
  name: "",
  exam_type: "exam",
  term: "",
  grading_scale: "",
  start_date: "",
  end_date: "",
};

const FIELD_KEYS = new Set(["name", "exam_type", "term", "grading_scale", "start_date", "end_date"]);

export function ExamFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: exam, isLoading: isLoadingExam } = useExam(id);
  const { data: terms } = useTermList({ page_size: 100 });
  const { data: scales } = useGradingScaleList({ page_size: 100 });
  const createExam = useCreateExam();
  const updateExam = useUpdateExam(id ?? "");
  const mutation = isEditMode ? updateExam : createExam;
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  useEffect(() => {
    if (exam) {
      reset({
        name: exam.name,
        exam_type: exam.exam_type,
        term: exam.term,
        grading_scale: exam.grading_scale ?? "",
        start_date: exam.start_date,
        end_date: exam.end_date,
      });
    }
  }, [exam, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    mutation.mutate(
      {
        name: values.name,
        exam_type: values.exam_type,
        term: values.term,
        grading_scale: values.grading_scale || undefined,
        start_date: values.start_date,
        end_date: values.end_date,
      },
      {
        onSuccess: () => {
          showToast({ title: isEditMode ? "Exam updated" : "Exam created" });
          navigate("/examinations/exams");
        },
        onError: (err: ApiError) => {
          if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
            const message = generalErrorMessage(err);
            setGeneralError(message);
            showToast({ title: "Could not save exam", description: message, tone: "danger" });
          }
        },
      },
    );
  };

  if (isEditMode && isLoadingExam) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">{isEditMode ? "Edit exam" : "New exam"}</h1>

      <Card>
        <CardHeader>
          <CardTitle>Exam details</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input label="Name" placeholder="Mid-Term Exam" error={errors.name?.message} {...register("name")} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select label="Type" error={errors.exam_type?.message} {...register("exam_type")}>
                {EXAM_TYPE_OPTIONS.map((type) => (
                  <option key={type} value={type}>
                    {examTypeLabel(type)}
                  </option>
                ))}
              </Select>
              <Select label="Term" error={errors.term?.message} {...register("term")}>
                <option value="">Select a term</option>
                {terms?.results.map((term) => (
                  <option key={term.id} value={term.id}>
                    {term.name} ({term.academic_year_name})
                  </option>
                ))}
              </Select>
            </div>
            <Select
              label="Grading scale"
              hint="Determines the letter grade computed for each result."
              error={errors.grading_scale?.message}
              {...register("grading_scale")}
            >
              <option value="">Not set</option>
              {scales?.results.map((scale) => (
                <option key={scale.id} value={scale.id}>
                  {scale.name}
                </option>
              ))}
            </Select>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input type="date" label="Start date" error={errors.start_date?.message} {...register("start_date")} />
              <Input type="date" label="End date" error={errors.end_date?.message} {...register("end_date")} />
            </div>

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/examinations/exams")}>
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
