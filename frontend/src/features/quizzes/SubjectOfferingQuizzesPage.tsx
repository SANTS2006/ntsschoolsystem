import { zodResolver } from "@hookform/resolvers/zod";
import { BarChart3, FileQuestion, Plus, Trash2, XCircle } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

import { useSubjectOffering } from "@/features/academics/useAcademicsCrud";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/confirmContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/toastContext";
import type { ApiError } from "@/lib/api-client";
import { generalErrorMessage } from "@/lib/formErrors";

import { quizStatusTone } from "./statusTone";
import { useCancelQuiz, useCreateQuiz, useDeleteQuiz, useQuizList } from "./useQuizzesCrud";

const schema = z
  .object({
    title: z.string().min(1, "Title is required"),
    instructions: z.string().optional(),
    start_time: z.string().min(1, "Start time is required"),
    end_time: z.string().min(1, "End time is required"),
    duration_minutes: z.coerce.number().int().min(1, "Must be at least 1 minute"),
  })
  .refine((v) => !v.start_time || !v.end_time || new Date(v.end_time) > new Date(v.start_time), {
    path: ["end_time"],
    message: "End time must be after the start time",
  });

type FormInput = z.input<typeof schema>;
type FormOutput = z.output<typeof schema>;

const FORMAT_EXAMPLE = `1. What is 2 + 2?
A) 3
B) 4*
C) 5

2. Capital of France?
A) London
B) Paris*
C) Madrid`;

export function SubjectOfferingQuizzesPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();

  const { data: offering } = useSubjectOffering(id);
  const { data: quizzes, isLoading, isError, error } = useQuizList(id);
  const createQuiz = useCreateQuiz();
  const cancelQuiz = useCancelQuiz();
  const deleteQuiz = useDeleteQuiz();

  const [showForm, setShowForm] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormInput, unknown, FormOutput>({
    resolver: zodResolver(schema),
    defaultValues: { title: "", instructions: "", start_time: "", end_time: "", duration_minutes: 20 },
  });

  const onSubmit = (values: FormOutput) => {
    if (!file) {
      setFileError("Choose the file that contains your questions.");
      return;
    }
    setFileError(null);
    setFormError(null);
    createQuiz.mutate(
      {
        subject_offering: id as string,
        title: values.title,
        instructions: values.instructions ?? "",
        start_time: new Date(values.start_time).toISOString(),
        end_time: new Date(values.end_time).toISOString(),
        duration_minutes: values.duration_minutes,
        file,
      },
      {
        onSuccess: (quiz) => {
          showToast({ title: "Quiz scheduled", description: `${quiz.question_count} question(s) read from your file.` });
          reset();
          setFile(null);
          setShowForm(false);
        },
        onError: (err: ApiError) => setFormError(generalErrorMessage(err)),
      },
    );
  };

  const handleCancel = async (quizId: string, title: string) => {
    const ok = await confirm({
      title: `Cancel "${title}"?`,
      description: "Students currently taking it are submitted immediately with the answers they have so far.",
      confirmLabel: "Cancel quiz",
      tone: "danger",
    });
    if (!ok) return;
    cancelQuiz.mutate(quizId, {
      onSuccess: () => showToast({ title: "Quiz cancelled" }),
      onError: (err: ApiError) => showToast({ title: "Could not cancel", description: err.message, tone: "danger" }),
    });
  };

  const handleDelete = async (quizId: string, title: string) => {
    const ok = await confirm({ title: `Delete "${title}"?`, confirmLabel: "Delete", tone: "danger" });
    if (!ok) return;
    deleteQuiz.mutate(quizId, {
      onSuccess: () => showToast({ title: "Quiz deleted" }),
      onError: (err: ApiError) => showToast({ title: "Could not delete", description: err.message, tone: "danger" }),
    });
  };

  if (isLoading) return <FullPageSpinner />;
  if (isError) return <Alert tone="danger">{(error as ApiError).message}</Alert>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate(-1)} className="back-button">
            <BackArrowIcon className="size-4" />
            Back
          </button>
          <div>
            <h1 className="text-xl font-semibold text-[var(--color-text)]">Quizzes</h1>
            {offering && (
              <p className="text-sm text-[var(--color-text-muted)]">
                {offering.subject_name} · {offering.school_class_name}
              </p>
            )}
          </div>
        </div>
        {!showForm && (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Schedule a quiz
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Schedule a quiz</CardTitle>
          </CardHeader>
          <CardContent>
            {formError && (
              <Alert tone="danger" className="mb-4">
                {formError}
              </Alert>
            )}
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
              <Input label="Title" error={errors.title?.message} {...register("title")} />
              <Textarea label="Instructions (optional)" rows={2} {...register("instructions")} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Input
                  type="datetime-local"
                  label="Opens"
                  error={errors.start_time?.message}
                  {...register("start_time")}
                />
                <Input
                  type="datetime-local"
                  label="Closes"
                  error={errors.end_time?.message}
                  {...register("end_time")}
                />
                <Input
                  type="number"
                  min={1}
                  label="Minutes per student"
                  hint="How long each student gets once they start."
                  error={errors.duration_minutes?.message}
                  {...register("duration_minutes")}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="quiz-file" className="text-sm font-medium text-[var(--color-text)]">
                  Questions file (.txt or .docx)
                </label>
                <input
                  id="quiz-file"
                  type="file"
                  accept=".txt,.docx"
                  onChange={(e) => {
                    setFile(e.target.files?.[0] ?? null);
                    setFileError(null);
                  }}
                  className="text-sm text-[var(--color-text)]"
                />
                {fileError && <p className="text-sm text-[var(--color-danger)]">{fileError}</p>}
                <details className="text-xs text-[var(--color-text-muted)]">
                  <summary className="cursor-pointer">File format</summary>
                  <p className="mt-1">
                    Number each question and letter each option. Show the one correct answer any of these ways:
                  </p>
                  <ul className="ml-4 mt-1 list-disc">
                    <li>
                      a <strong>*</strong> after it (<code>B) 4*</code>)
                    </li>
                    <li>
                      a tick icon (✓ ✔ ✅) or a <code>(correct)</code> tag next to it
                    </li>
                    <li>
                      make <strong>just that option bold</strong> (in Word, or <code>**bold**</code> in a text file)
                    </li>
                    <li>
                      or a separate line under the question: <code>Answer: B</code>
                    </li>
                  </ul>
                  <p className="mt-1">
                    Anything before question 1 (a title, instructions) is ignored. Questions and options are
                    shuffled per student automatically.
                  </p>
                  <pre className="mt-1 rounded bg-[var(--color-bg-subtle)] p-2">{FORMAT_EXAMPLE}</pre>
                </details>
              </div>

              <div className="flex justify-end gap-3">
                <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" isLoading={createQuiz.isPending}>
                  Schedule quiz
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {!quizzes || quizzes.results.length === 0 ? (
        <EmptyState
          icon={FileQuestion}
          title="No quizzes yet"
          description="Schedule one by uploading a file of questions."
        />
      ) : (
        <div className="flex flex-col gap-3">
          {quizzes.results.map((quiz) => (
            <Card key={quiz.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--color-text)]">{quiz.title}</p>
                  <p className="text-sm text-[var(--color-text-muted)]">
                    {new Date(quiz.start_time).toLocaleString()} – {new Date(quiz.end_time).toLocaleString()} ·{" "}
                    {quiz.duration_minutes} min · {quiz.question_count} questions · {quiz.attempted_count} started
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={quizStatusTone(quiz.status)}>{quiz.status}</Badge>
                  <Button size="sm" variant="secondary" onClick={() => navigate(`/quizzes/${quiz.id}/results`)}>
                    <BarChart3 className="size-4" aria-hidden="true" />
                    Results
                  </Button>
                  {(quiz.status === "scheduled" || quiz.status === "active") && (
                    <Button size="sm" variant="secondary" onClick={() => handleCancel(quiz.id, quiz.title)}>
                      <XCircle className="size-4" aria-hidden="true" />
                      Cancel
                    </Button>
                  )}
                  {quiz.attempted_count === 0 && (
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-label={`Delete ${quiz.title}`}
                      onClick={() => handleDelete(quiz.id, quiz.title)}
                    >
                      <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
