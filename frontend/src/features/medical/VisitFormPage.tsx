import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
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
import { Select } from "@/components/ui/Select";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import { useStaffLookup } from "@/features/staff/useStaffLookups";
import { listStudents } from "@/features/students/api";
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";

import { useCreateVisit, useUpdateVisit, useVisit } from "./useMedicalCrud";

const schema = z.object({
  student: z.string().min(1, "Student is required"),
  attended_by: z.string(),
  visit_type: z.enum(["routine", "incident", "emergency"]),
  visited_at: z.string().min(1, "Visited at is required"),
  symptoms: z.string(),
  treatment: z.string(),
  notes: z.string(),
  parent_notified: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

function toDatetimeLocal(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function nowAsDatetimeLocal(): string {
  return toDatetimeLocal(new Date().toISOString());
}

const EMPTY_VALUES: FormValues = {
  student: "",
  attended_by: "",
  visit_type: "routine",
  visited_at: "",
  symptoms: "",
  treatment: "",
  notes: "",
  parent_notified: false,
};
const FIELD_KEYS = new Set([
  "student",
  "attended_by",
  "visit_type",
  "visited_at",
  "symptoms",
  "treatment",
  "notes",
  "parent_notified",
]);

export function VisitFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: visit, isLoading: isLoadingVisit } = useVisit(id);
  const { data: students } = useQuery({
    queryKey: ["students", "lookup", "active"],
    queryFn: () => listStudents({ status: "active", page_size: 100, ordering: "last_name" }),
  });
  const { data: staff } = useStaffLookup("medical");
  const createVisit = useCreateVisit();
  const updateVisit = useUpdateVisit(id ?? "");
  const mutation = isEditMode ? updateVisit : createVisit;
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { ...EMPTY_VALUES, visited_at: nowAsDatetimeLocal() },
  });

  useEffect(() => {
    if (visit) {
      reset({
        student: visit.student,
        attended_by: visit.attended_by ?? "",
        visit_type: visit.visit_type,
        visited_at: toDatetimeLocal(visit.visited_at),
        symptoms: visit.symptoms,
        treatment: visit.treatment,
        notes: visit.notes,
        parent_notified: visit.parent_notified,
      });
    }
  }, [visit, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    mutation.mutate(
      {
        student: values.student,
        attended_by: values.attended_by || undefined,
        visit_type: values.visit_type,
        visited_at: values.visited_at,
        symptoms: values.symptoms || undefined,
        treatment: values.treatment || undefined,
        notes: values.notes || undefined,
        parent_notified: values.parent_notified,
      },
      {
        onSuccess: () => {
          showToast({ title: isEditMode ? "Visit updated" : "Visit recorded" });
          navigate("/medical/visits");
        },
        onError: (err: ApiError) => {
          if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
            const message = generalErrorMessage(err);
            setGeneralError(message);
            showToast({ title: "Could not save visit", description: message, tone: "danger" });
          }
        },
      },
    );
  };

  if (isEditMode && isLoadingVisit) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">{isEditMode ? "Edit visit" : "New visit"}</h1>

      <Card>
        <CardHeader>
          <CardTitle>Visit details</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Select label="Student" error={errors.student?.message} {...register("student")}>
              <option value="">Select a student</option>
              {students?.results.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.full_name} ({student.admission_number})
                </option>
              ))}
            </Select>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select label="Visit type" error={errors.visit_type?.message} {...register("visit_type")}>
                <option value="routine">Routine</option>
                <option value="incident">Incident</option>
                <option value="emergency">Emergency</option>
              </Select>
              <Input
                type="datetime-local"
                label="Visited at"
                error={errors.visited_at?.message}
                {...register("visited_at")}
              />
            </div>
            <Select label="Attended by" error={errors.attended_by?.message} {...register("attended_by")}>
              <option value="">Not set</option>
              {staff?.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.full_name}
                </option>
              ))}
            </Select>
            <Input label="Symptoms" error={errors.symptoms?.message} {...register("symptoms")} />
            <Input label="Treatment" error={errors.treatment?.message} {...register("treatment")} />
            <Input label="Notes" error={errors.notes?.message} {...register("notes")} />
            <Checkbox label="Parent notified" {...register("parent_notified")} />

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/medical/visits")}>
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
