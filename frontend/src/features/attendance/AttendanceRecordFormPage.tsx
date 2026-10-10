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
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import { useSubjectList } from "@/features/academics/useAcademicsCrud";
import { useAllSections } from "@/features/academics/useAcademicsLookups";
import { listStudents } from "@/features/students/api";
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";

import { attendanceStatusLabel } from "./statusTone";
import { useCreateStudentAttendance, useStudentAttendanceRecord, useUpdateStudentAttendance } from "./useAttendanceCrud";

const STATUS_OPTIONS = ["present", "absent", "late", "excused", "early_departure"] as const;

const schema = z.object({
  student: z.string().min(1, "Student is required"),
  date: z.string().min(1, "Date is required"),
  status: z.enum(STATUS_OPTIONS),
  section: z.string(),
  subject: z.string(),
  notes: z.string(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = {
  student: "",
  date: new Date().toISOString().slice(0, 10),
  status: "present",
  section: "",
  subject: "",
  notes: "",
};

const FIELD_KEYS = new Set(["student", "date", "status", "section", "subject", "notes"]);

/** A single-record correction, not the everyday flow — most attendance gets taken in bulk via
 * `TakeAttendancePage`. This exists for edge cases: one latecomer added after the fact, fixing a
 * mis-marked status, or a record with no matching bulk-marked section at all. */
export function AttendanceRecordFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: record, isLoading: isLoadingRecord } = useStudentAttendanceRecord(id);
  const { data: students } = useQuery({
    queryKey: ["students", "lookup", "active"],
    queryFn: () => listStudents({ status: "active", page_size: 100, ordering: "last_name" }),
  });
  const { data: sections } = useAllSections();
  const { data: subjects } = useSubjectList({ page_size: 100 });
  const createRecord = useCreateStudentAttendance();
  const updateRecord = useUpdateStudentAttendance(id ?? "");
  const mutation = isEditMode ? updateRecord : createRecord;
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  useEffect(() => {
    if (record) {
      reset({
        student: record.student,
        date: record.date,
        status: record.status,
        section: record.section ?? "",
        subject: record.subject ?? "",
        notes: record.notes,
      });
    }
  }, [record, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    mutation.mutate(
      {
        student: values.student,
        date: values.date,
        status: values.status,
        section: values.section || undefined,
        subject: values.subject || undefined,
        notes: values.notes || undefined,
      },
      {
        onSuccess: () => {
          showToast({ title: isEditMode ? "Record updated" : "Record created" });
          navigate("/attendance/records");
        },
        onError: (err: ApiError) => {
          if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
            const message = generalErrorMessage(err);
            setGeneralError(message);
            showToast({ title: "Could not save this record", description: message, tone: "danger" });
          }
        },
      },
    );
  };

  if (isEditMode && isLoadingRecord) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">
        {isEditMode ? "Edit attendance record" : "New attendance record"}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Record details</CardTitle>
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
              <Input type="date" label="Date" error={errors.date?.message} {...register("date")} />
              <Select label="Status" error={errors.status?.message} {...register("status")}>
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {attendanceStatusLabel(status)}
                  </option>
                ))}
              </Select>
            </div>
            <Select label="Section" error={errors.section?.message} {...register("section")}>
              <option value="">Not set</option>
              {sections?.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.school_class_name} - {section.name} ({section.academic_year_name})
                </option>
              ))}
            </Select>
            <Select label="Subject" error={errors.subject?.message} {...register("subject")}>
              <option value="">Not set</option>
              {subjects?.results.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </Select>
            <Input label="Notes" error={errors.notes?.message} {...register("notes")} />

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/attendance/records")}>
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
