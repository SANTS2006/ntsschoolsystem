import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { z } from "zod";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import { useSubjectList } from "@/features/academics/useAcademicsCrud";
import { useAllSections } from "@/features/academics/useAcademicsLookups";
import { useStaffLookup } from "@/features/staff/useStaffLookups";
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";

import type { DayOfWeek } from "./types";
import { useCreateEntry, useEntry, usePeriodList, useRoomList, useUpdateEntry } from "./useTimetableCrud";

const DAY_OPTIONS: { value: DayOfWeek; label: string }[] = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
  { value: "saturday", label: "Saturday" },
  { value: "sunday", label: "Sunday" },
];

const schema = z.object({
  section: z.string().min(1, "Section is required"),
  day_of_week: z.enum(["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]),
  period: z.string().min(1, "Period is required"),
  subject: z.string(),
  teacher: z.string(),
  room: z.string(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = {
  section: "",
  day_of_week: "monday",
  period: "",
  subject: "",
  teacher: "",
  room: "",
};

// The server tags a double-booking conflict to whichever field caused it — surface that
// message right under the offending field instead of a generic "Validation failed." banner.
const FIELD_KEYS = new Set(["section", "day_of_week", "period", "subject", "teacher", "room"]);

export function TimetableEntryFormPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: entry, isLoading: isLoadingEntry } = useEntry(id);
  const { data: sections } = useAllSections();
  const { data: periods } = usePeriodList({ page_size: 100, ordering: "order" });
  const { data: subjects } = useSubjectList({ page_size: 100 });
  const { data: staff } = useStaffLookup("teacher");
  const { data: rooms } = useRoomList({ page_size: 100 });
  const createEntry = useCreateEntry();
  const updateEntry = useUpdateEntry(id ?? "");
  const mutation = isEditMode ? updateEntry : createEntry;
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      ...EMPTY_VALUES,
      section: searchParams.get("section") ?? "",
      day_of_week: (searchParams.get("day") as DayOfWeek) ?? "monday",
      period: searchParams.get("period") ?? "",
    },
  });

  useEffect(() => {
    if (entry) {
      reset({
        section: entry.section,
        day_of_week: entry.day_of_week,
        period: entry.period,
        subject: entry.subject ?? "",
        teacher: entry.teacher ?? "",
        room: entry.room ?? "",
      });
    }
  }, [entry, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    const payload = {
      section: values.section,
      day_of_week: values.day_of_week,
      period: values.period,
      subject: values.subject || undefined,
      teacher: values.teacher || undefined,
      room: values.room || undefined,
    };
    mutation.mutate(payload, {
      onSuccess: () => {
        showToast({ title: isEditMode ? "Lesson updated" : "Lesson scheduled" });
        navigate("/timetable/schedule");
      },
      onError: (err: ApiError) => {
        if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
          const message = generalErrorMessage(err);
          setGeneralError(message);
          showToast({ title: "Could not save this lesson", description: message, tone: "danger" });
        }
      },
    });
  };

  if (isEditMode && isLoadingEntry) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">
        {isEditMode ? "Edit lesson" : "Schedule a lesson"}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Lesson details</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Select label="Section" error={errors.section?.message} {...register("section")}>
              <option value="">Select a section</option>
              {sections?.map((section) => (
                <option key={section.id} value={section.id}>
                  {section.school_class_name} - {section.name} ({section.academic_year_name})
                </option>
              ))}
            </Select>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Select label="Day" error={errors.day_of_week?.message} {...register("day_of_week")}>
                {DAY_OPTIONS.map((day) => (
                  <option key={day.value} value={day.value}>
                    {day.label}
                  </option>
                ))}
              </Select>
              <Select label="Period" error={errors.period?.message} {...register("period")}>
                <option value="">Select a period</option>
                {periods?.results.map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.name} ({period.start_time.slice(0, 5)}–{period.end_time.slice(0, 5)})
                  </option>
                ))}
              </Select>
            </div>
            <Select label="Subject" error={errors.subject?.message} {...register("subject")}>
              <option value="">Not set</option>
              {subjects?.results.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.name}
                </option>
              ))}
            </Select>
            <Select label="Teacher" error={errors.teacher?.message} {...register("teacher")}>
              <option value="">Not set</option>
              {staff?.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.full_name}
                </option>
              ))}
            </Select>
            <Select label="Room" error={errors.room?.message} {...register("room")}>
              <option value="">Not set</option>
              {rooms?.results.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </Select>

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/timetable/schedule")}>
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
