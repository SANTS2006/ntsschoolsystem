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
import { useStaffLookup } from "@/features/staff/useStaffLookups";
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";

import { attendanceStatusLabel } from "./statusTone";
import { useCreateStaffAttendance, useStaffAttendanceRecord, useUpdateStaffAttendance } from "./useAttendanceCrud";

const STATUS_OPTIONS = ["present", "absent", "late", "excused", "early_departure"] as const;

const schema = z.object({
  staff: z.string().min(1, "Staff member is required"),
  date: z.string().min(1, "Date is required"),
  status: z.enum(STATUS_OPTIONS),
  check_in_time: z.string(),
  check_out_time: z.string(),
  notes: z.string(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = {
  staff: "",
  date: new Date().toISOString().slice(0, 10),
  status: "present",
  check_in_time: "",
  check_out_time: "",
  notes: "",
};

const FIELD_KEYS = new Set(["staff", "date", "status", "check_in_time", "check_out_time", "notes"]);

export function StaffAttendanceFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: record, isLoading: isLoadingRecord } = useStaffAttendanceRecord(id);
  const { data: staff } = useStaffLookup();
  const createRecord = useCreateStaffAttendance();
  const updateRecord = useUpdateStaffAttendance(id ?? "");
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
        staff: record.staff,
        date: record.date,
        status: record.status,
        check_in_time: record.check_in_time?.slice(0, 5) ?? "",
        check_out_time: record.check_out_time?.slice(0, 5) ?? "",
        notes: record.notes,
      });
    }
  }, [record, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    mutation.mutate(
      {
        staff: values.staff,
        date: values.date,
        status: values.status,
        check_in_time: values.check_in_time || undefined,
        check_out_time: values.check_out_time || undefined,
        notes: values.notes || undefined,
      },
      {
        onSuccess: () => {
          showToast({ title: isEditMode ? "Record updated" : "Record created" });
          navigate("/attendance/staff");
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
        {isEditMode ? "Edit staff attendance" : "New staff attendance record"}
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
            <Select label="Staff member" error={errors.staff?.message} {...register("staff")}>
              <option value="">Select a staff member</option>
              {staff?.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.full_name}
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input type="time" label="Check-in time" error={errors.check_in_time?.message} {...register("check_in_time")} />
              <Input type="time" label="Check-out time" error={errors.check_out_time?.message} {...register("check_out_time")} />
            </div>
            <Input label="Notes" error={errors.notes?.message} {...register("notes")} />

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/attendance/staff")}>
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
