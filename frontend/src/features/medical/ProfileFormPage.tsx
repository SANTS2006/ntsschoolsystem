import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import { fetchStudentGuardians, listStudents } from "@/features/students/api";
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";

import { useCreateProfile, useProfile, useUpdateProfile } from "./useMedicalCrud";

const schema = z.object({
  student: z.string().min(1, "Student is required"),
  blood_group: z.enum(["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "unknown"]),
  allergies: z.string(),
  chronic_conditions: z.string(),
  emergency_contact_name: z.string(),
  emergency_contact_phone: z.string(),
  notes: z.string(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = {
  student: "",
  blood_group: "unknown",
  allergies: "",
  chronic_conditions: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
  notes: "",
};
const FIELD_KEYS = new Set([
  "student",
  "blood_group",
  "allergies",
  "chronic_conditions",
  "emergency_contact_name",
  "emergency_contact_phone",
  "notes",
]);

export function ProfileFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: profile, isLoading: isLoadingProfile } = useProfile(id);
  const { data: students } = useQuery({
    queryKey: ["students", "lookup", "active"],
    queryFn: () => listStudents({ status: "active", page_size: 100, ordering: "last_name" }),
  });
  const createProfile = useCreateProfile();
  const updateProfile = useUpdateProfile(id ?? "");
  const mutation = isEditMode ? updateProfile : createProfile;
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    getValues,
    control,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  // When a student is picked, fill the emergency contact from the parent / guardian they are linked to (their emergency
  // contact if one is marked, else the primary guardian, else the first). Only fills fields that are still empty, so
  // anything already typed is never overwritten.
  const selectedStudent = useWatch({ control, name: "student" });
  useEffect(() => {
    if (isEditMode || !selectedStudent) return;
    let cancelled = false;
    fetchStudentGuardians(selectedStudent)
      .then((links) => {
        if (cancelled || links.length === 0) return;
        const link = links.find((l) => l.is_emergency_contact) ?? links.find((l) => l.is_primary) ?? links[0];
        if (!getValues("emergency_contact_name")) setValue("emergency_contact_name", link.guardian.full_name);
        if (!getValues("emergency_contact_phone")) setValue("emergency_contact_phone", link.guardian.phone_number);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [selectedStudent, isEditMode, getValues, setValue]);

  useEffect(() => {
    if (profile) {
      reset({
        student: profile.student,
        blood_group: profile.blood_group,
        allergies: profile.allergies,
        chronic_conditions: profile.chronic_conditions,
        emergency_contact_name: profile.emergency_contact_name,
        emergency_contact_phone: profile.emergency_contact_phone,
        notes: profile.notes,
      });
    }
  }, [profile, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    mutation.mutate(values, {
      onSuccess: () => {
        showToast({ title: isEditMode ? "Medical profile updated" : "Medical profile created" });
        navigate("/medical/profiles");
      },
      onError: (err: ApiError) => {
        if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
          const message = generalErrorMessage(err);
          setGeneralError(message);
          showToast({ title: "Could not save profile", description: message, tone: "danger" });
        }
      },
    });
  };

  if (isEditMode && isLoadingProfile) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">
        {isEditMode ? "Edit medical profile" : "New medical profile"}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Profile details</CardTitle>
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
            <Select label="Blood group" error={errors.blood_group?.message} {...register("blood_group")}>
              <option value="unknown">Unknown</option>
              <option value="A+">A+</option>
              <option value="A-">A-</option>
              <option value="B+">B+</option>
              <option value="B-">B-</option>
              <option value="AB+">AB+</option>
              <option value="AB-">AB-</option>
              <option value="O+">O+</option>
              <option value="O-">O-</option>
            </Select>
            <Input label="Allergies" error={errors.allergies?.message} {...register("allergies")} />
            <Input
              label="Chronic conditions"
              error={errors.chronic_conditions?.message}
              {...register("chronic_conditions")}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Emergency contact name"
                error={errors.emergency_contact_name?.message}
                {...register("emergency_contact_name")}
              />
              <Input
                label="Emergency contact phone"
                error={errors.emergency_contact_phone?.message}
                {...register("emergency_contact_phone")}
              />
            </div>
            <Input label="Notes" error={errors.notes?.message} {...register("notes")} />

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/medical/profiles")}>
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
