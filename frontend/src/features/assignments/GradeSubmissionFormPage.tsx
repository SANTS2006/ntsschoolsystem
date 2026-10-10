import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useState } from "react";
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

import { useAssignment, useGradeSubmission, useSubmission } from "./useAssignmentsCrud";

const schema = z.object({
  score: z.string().min(1, "Score is required"),
  feedback: z.string(),
});

type FormValues = z.infer<typeof schema>;
const FIELD_KEYS = new Set(["score", "feedback"]);

export function GradeSubmissionFormPage() {
  const { assignmentId, id } = useParams<{ assignmentId: string; id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: assignment } = useAssignment(assignmentId);
  const { data: submission, isLoading: isLoadingSubmission } = useSubmission(id);
  const gradeSubmission = useGradeSubmission(id ?? "");
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    values: submission
      ? { score: submission.score ?? "", feedback: submission.feedback }
      : { score: "", feedback: "" },
  });

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    gradeSubmission.mutate(
      { score: values.score, feedback: values.feedback || undefined },
      {
        onSuccess: () => {
          showToast({ title: "Submission graded" });
          navigate(`/assignments/${assignmentId}/submissions`);
        },
        onError: (err: ApiError) => {
          if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
            const message = generalErrorMessage(err);
            setGeneralError(message);
            showToast({ title: "Could not save grade", description: message, tone: "danger" });
          }
        },
      },
    );
  };

  if (isLoadingSubmission) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">Grade submission</h1>

      <Card>
        <CardHeader>
          <CardTitle>{submission ? `${submission.student_name} — ${submission.assignment_title}` : "Grade"}</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input
              type="number"
              step="0.01"
              label={`Score${assignment ? ` (out of ${assignment.max_score})` : ""}`}
              error={errors.score?.message}
              {...register("score")}
            />
            <Input label="Feedback" error={errors.feedback?.message} {...register("feedback")} />

            <div className="mt-2 flex justify-end gap-3">
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate(`/assignments/${assignmentId}/submissions`)}
              >
                Cancel
              </Button>
              <Button type="submit" isLoading={gradeSubmission.isPending}>
                {!gradeSubmission.isPending && <Save className="size-4" aria-hidden="true" />}
                Save grade
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
