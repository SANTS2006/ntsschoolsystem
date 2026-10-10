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
import { useSubjectList } from "@/features/academics/useAcademicsCrud";
import { useSchoolClasses } from "@/features/academics/useAcademicsLookups";
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";

import { useCreateExamSchedule, useExam, useExamSchedule, useUpdateExamSchedule } from "./useExaminationsCrud";

const schema = z.object({
  school_class: z.string().min(1, "Class is required"),
  subject: z.string().min(1, "Subject is required"),
  max_score: z.coerce.number().min(1, "Max score must be at least 1"),
  date: z.string(),
  start_time: z.string(),
  end_time: z.string(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = { school_class: "", subject: "", max_score: 100, date: "", start_time: "", end_time: "" };
const FIELD_KEYS = new Set(["school_class", "subject", "max_score", "date", "start_time", "end_time"]);

export function ExamScheduleFormPage() {
  const { examId, id } = useParams<{ examId: string; id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: exam } = useExam(examId);
  const { data: schedule, isLoading: isLoadingSchedule } = useExamSchedule(id);
  const { data: schoolClasses } = useSchoolClasses();
  const { data: subjects } = useSubjectList({ page_size: 100 });
  const createSchedule = useCreateExamSchedule();
  const updateSchedule = useUpdateExamSchedule(id ?? "");
  const mutation = isEditMode ? updateSchedule : createSchedule;
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<z.input<typeof schema>, unknown, FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  useEffect(() => {
    if (schedule) {
      reset({
        school_class: schedule.school_class,
        subject: schedule.subject,
        max_score: Number(schedule.max_score),
        date: schedule.date ?? "",
        start_time: schedule.start_time?.slice(0, 5) ?? "",
        end_time: schedule.end_time?.slice(0, 5) ?? "",
      });
    }
  }, [schedule, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    mutation.mutate(
      {
        exam: examId as string,
        school_class: values.school_class,
        subject: values.subject,
        max_score: String(values.max_score),
        date: values.date || undefined,
        start_time: values.start_time || null,
        end_time: values.end_time || null,
      },
      {
        onSuccess: () => {
          showToast({ title: isEditMode ? "Schedule updated" : "Schedule created" });
          navigate(`/examinations/exams/${examId}/schedules`);
        },
        onError: (err: ApiError) => {
          if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
            const message = generalErrorMessage(err);
            setGeneralError(message);
            showToast({ title: "Could not save schedule", description: message, tone: "danger" });
          }
        },
      },
    );
  };

  if (isEditMode && isLoadingSchedule) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">
        {isEditMode ? "Edit schedule" : "New schedule"}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>{exam ? `For ${exam.name}` : "Schedule details"}</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Select label="Class" error={errors.school_class?.message} {...register("school_class")}>
              <option value="">Select a class</option>
              {schoolClasses?.map((schoolClass) => (
                <option key={schoolClass.id} value={schoolClass.id}>
                  {schoolClass.name}
                </option>
              ))}
            </Select>
            <Select label="Subject" error={errors.subject?.message} {...register("subject")}>
              <option value="">Select a subject</option>
              {subjects?.results.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </Select>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input type="number" label="Max score" error={errors.max_score?.message} {...register("max_score")} />
              <Input type="date" label="Date" error={errors.date?.message} {...register("date")} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input type="time" label="Start time" error={errors.start_time?.message} {...register("start_time")} />
              <Input type="time" label="End time" error={errors.end_time?.message} {...register("end_time")} />
            </div>

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate(`/examinations/exams/${examId}/schedules`)}>
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
