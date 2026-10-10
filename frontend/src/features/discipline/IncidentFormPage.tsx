import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { CategorySelect } from "@/components/ui/CategorySelect";
import { Checkbox } from "@/components/ui/Checkbox";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import { useResolveCategory } from "@/features/formoptions/useResolveCategory";
import { listStudents } from "@/features/students/api";
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";

import { statusLabel } from "./statusTone";
import { useCreateIncident, useIncident, useUpdateIncident } from "./useDisciplineCrud";

const schema = z.object({
  student: z.string().min(1, "Student is required"),
  category: z.string().min(1, "Choose a category"),
  severity: z.enum(["minor", "moderate", "severe"]),
  incident_date: z.string().min(1, "Incident date is required"),
  description: z.string().min(1, "Description is required"),
  action_taken: z.enum(["none", "warning", "detention", "suspension", "expulsion"]),
  status: z.enum(["reported", "under_review", "resolved"]),
  parent_notified: z.boolean(),
  follow_up_notes: z.string(),
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

const CATEGORIES = ["bullying", "vandalism", "tardiness", "academic_dishonesty", "fighting", "other"] as const;
const SEVERITIES = ["minor", "moderate", "severe"] as const;
const ACTIONS_TAKEN = ["none", "warning", "detention", "suspension", "expulsion"] as const;
const STATUSES = ["reported", "under_review", "resolved"] as const;

const FIELD_KEYS = new Set([
  "student",
  "category",
  "severity",
  "incident_date",
  "description",
  "action_taken",
  "status",
  "parent_notified",
  "follow_up_notes",
]);

export function IncidentFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: incident, isLoading: isLoadingIncident } = useIncident(id);
  const { data: students } = useQuery({
    queryKey: ["students", "lookup", "active"],
    queryFn: () => listStudents({ status: "active", page_size: 100, ordering: "last_name" }),
  });
  const createIncident = useCreateIncident();
  const updateIncident = useUpdateIncident(id ?? "");
  const mutation = isEditMode ? updateIncident : createIncident;
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [otherText, setOtherText] = useState("");
  const resolveCategory = useResolveCategory("discipline.category");

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      student: "",
      category: "other",
      severity: "minor",
      incident_date: nowAsDatetimeLocal(),
      description: "",
      action_taken: "none",
      status: "reported",
      parent_notified: false,
      follow_up_notes: "",
    },
  });

  useEffect(() => {
    if (incident) {
      reset({
        student: incident.student,
        category: incident.category,
        severity: incident.severity,
        incident_date: toDatetimeLocal(incident.incident_date),
        description: incident.description,
        action_taken: incident.action_taken,
        status: incident.status,
        parent_notified: incident.parent_notified,
        follow_up_notes: incident.follow_up_notes,
      });
    }
  }, [incident, reset]);

  const onSubmit = async (values: FormValues) => {
    setGeneralError(null);
    let category: string;
    try {
      // "Other" + a typed name becomes a real option on the school's list first.
      category = await resolveCategory(values.category, otherText);
    } catch (err) {
      setGeneralError(generalErrorMessage(err as ApiError));
      return;
    }
    mutation.mutate(
      {
        student: values.student,
        category,
        severity: values.severity,
        incident_date: values.incident_date,
        description: values.description,
        action_taken: values.action_taken,
        status: values.status,
        parent_notified: values.parent_notified,
        follow_up_notes: values.follow_up_notes || undefined,
      },
      {
        onSuccess: () => {
          showToast({ title: isEditMode ? "Incident updated" : "Incident reported" });
          navigate("/discipline");
        },
        onError: (err: ApiError) => {
          if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
            const message = generalErrorMessage(err);
            setGeneralError(message);
            showToast({ title: "Could not save incident", description: message, tone: "danger" });
          }
        },
      },
    );
  };

  if (isEditMode && isLoadingIncident) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">
        {isEditMode ? "Edit discipline incident" : "Report an incident"}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>
            Incident details
            {incident?.reported_by_name && (
              <span className="ml-2 text-sm font-normal text-[var(--color-text-muted)]">
                Reported by {incident.reported_by_name}
              </span>
            )}
          </CardTitle>
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
              <Controller
                name="category"
                control={control}
                render={({ field }) => (
                  <CategorySelect
                    field="discipline.category"
                    label="Category"
                    builtin={CATEGORIES.map((value) => ({ value, label: statusLabel(value) }))}
                    value={field.value}
                    onChange={field.onChange}
                    otherText={otherText}
                    onOtherTextChange={setOtherText}
                    error={errors.category?.message}
                  />
                )}
              />
              <Select label="Severity" error={errors.severity?.message} {...register("severity")}>
                {SEVERITIES.map((option) => (
                  <option key={option} value={option}>
                    {statusLabel(option)}
                  </option>
                ))}
              </Select>
            </div>
            <Input
              type="datetime-local"
              label="Incident date"
              error={errors.incident_date?.message}
              {...register("incident_date")}
            />
            <Input label="Description" error={errors.description?.message} {...register("description")} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select label="Action taken" error={errors.action_taken?.message} {...register("action_taken")}>
                {ACTIONS_TAKEN.map((option) => (
                  <option key={option} value={option}>
                    {statusLabel(option)}
                  </option>
                ))}
              </Select>
              <Select label="Status" error={errors.status?.message} {...register("status")}>
                {STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {statusLabel(option)}
                  </option>
                ))}
              </Select>
            </div>
            <Input label="Follow-up notes" error={errors.follow_up_notes?.message} {...register("follow_up_notes")} />
            <Checkbox label="Parent notified" {...register("parent_notified")} />

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/discipline")}>
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
