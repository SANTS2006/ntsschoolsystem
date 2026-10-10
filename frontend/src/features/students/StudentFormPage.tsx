import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, Save, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import { useAcademicYears, useSchoolClasses, useSections } from "@/features/academics/useAcademicsLookups";
import type { ApiError } from "@/lib/api-client";
import { useStateFromSource } from "@/hooks/useStateFromSource";

import type { StudentPayload } from "./types";
import { useCreateStudent, useStudent, useUpdateStudent } from "./useStudents";

const studentSchema = z.object({
  admission_number: z.string().min(1, "Admission number is required"),
  first_name: z.string().min(1, "First name is required"),
  middle_name: z.string(),
  last_name: z.string().min(1, "Last name is required"),
  date_of_birth: z.string(),
  gender: z.enum(["male", "female", "other", ""]),
  address: z.string(),
  previous_school: z.string(),
  admission_date: z.string(),
  status: z.enum(["applicant", "admitted", "active", "transferred", "graduated", "withdrawn", "archived"]),
  current_academic_year: z.string(),
  current_class: z.string(),
  current_section: z.string(),
});

type StudentFormValues = z.infer<typeof studentSchema>;

const EMPTY_VALUES: StudentFormValues = {
  admission_number: "",
  first_name: "",
  middle_name: "",
  last_name: "",
  date_of_birth: "",
  gender: "",
  address: "",
  previous_school: "",
  admission_date: "",
  status: "admitted",
  current_academic_year: "",
  current_class: "",
  current_section: "",
};

const OPTIONAL_KEYS = [
  "middle_name",
  "date_of_birth",
  "gender",
  "address",
  "previous_school",
  "admission_date",
  "current_academic_year",
  "current_class",
  "current_section",
] as const satisfies ReadonlyArray<keyof StudentFormValues>;

const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024; // matches the backend's validate_image_file cap
const ACCEPTED_PHOTO_TYPES = "image/jpeg,image/png,image/gif,image/webp";

/** Optional fields go to the API as omitted (undefined), never "" — DRF's DateField/UUID
 * relation fields reject an empty string as "wrong format," they don't treat it as null.
 * `photo` is handled separately (local component state, not a react-hook-form field) since
 * a <input type="file"> can't be a controlled value the normal way — only included here when
 * the user actually picked a new one. */
function toPayload(values: StudentFormValues, photo: File | null): StudentPayload {
  // TS can't correlate `key`/`value` through a union-keyed loop even though this is safe by
  // construction (both come from the same field of the same object each iteration) — one
  // assertion at the boundary rather than fighting the type system inside the loop.
  const payload: Record<string, string | File> = {
    admission_number: values.admission_number,
    first_name: values.first_name,
    last_name: values.last_name,
    status: values.status,
  };
  for (const key of OPTIONAL_KEYS) {
    const value = values[key];
    if (value) {
      payload[key] = value;
    }
  }
  if (photo) {
    payload.photo = photo;
  }
  return payload as unknown as StudentPayload;
}

export function StudentFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: student, isLoading: isLoadingStudent } = useStudent(id);
  const { data: academicYears } = useAcademicYears();
  const { data: schoolClasses } = useSchoolClasses();

  const createStudent = useCreateStudent();
  const updateStudent = useUpdateStudent(id ?? "");
  const mutation = isEditMode ? updateStudent : createStudent;

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<StudentFormValues>({ resolver: zodResolver(studentSchema), defaultValues: EMPTY_VALUES });

  const selectedClass = useWatch({ control, name: "current_class" });
  const { data: sections } = useSections(selectedClass ? { school_class: selectedClass } : undefined);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useStateFromSource(student, (loaded) => loaded?.photo ?? null);
  const [photoError, setPhotoError] = useState<string | undefined>();

  useEffect(() => {
    if (student) {
      reset({
        admission_number: student.admission_number,
        first_name: student.first_name,
        middle_name: student.middle_name ?? "",
        last_name: student.last_name,
        date_of_birth: student.date_of_birth ?? "",
        gender: student.gender,
        address: student.address,
        previous_school: student.previous_school,
        admission_date: student.admission_date ?? "",
        status: student.status,
        current_academic_year: student.current_academic_year ?? "",
        current_class: student.current_class ?? "",
        current_section: student.current_section ?? "",
      });
    }
  }, [student, reset]);

  // Revoke the object URL created for a locally-picked file when it's replaced or the
  // component unmounts — otherwise each new preview leaks the previous blob URL.
  useEffect(() => {
    return () => {
      if (photoPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(photoPreview);
      }
    };
  }, [photoPreview]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file later
    if (!file) return;

    if (file.size > MAX_PHOTO_SIZE_BYTES) {
      setPhotoError(`Image exceeds the maximum allowed size of ${MAX_PHOTO_SIZE_BYTES / (1024 * 1024)}MB.`);
      return;
    }
    setPhotoError(undefined);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  const onSubmit = (values: StudentFormValues) => {
    mutation.mutate(toPayload(values, photoFile), {
      onSuccess: (savedStudent) => {
        showToast({ title: isEditMode ? "Student updated" : "Student created" });
        navigate(`/students/${savedStudent.id}`);
      },
      onError: (err: ApiError) => {
        showToast({ title: "Could not save student", description: err.message, tone: "danger" });
      },
    });
  };

  if (isEditMode && isLoadingStudent) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">
          {isEditMode ? "Edit student" : "New student"}
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Student details</CardTitle>
        </CardHeader>
        <CardContent>
          {mutation.isError && (
            <Alert tone="danger" className="mb-4">
              {(mutation.error as ApiError).message}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-start">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="group relative size-24 shrink-0 overflow-hidden rounded-full border-2 border-[var(--color-border)] bg-[var(--color-bg-subtle)] transition-all duration-200 hover:border-[var(--color-primary)] hover:shadow-[0_8px_24px_-8px_color-mix(in_srgb,var(--color-primary)_60%,transparent)]"
                aria-label="Change student photo"
              >
                {photoPreview ? (
                  <img src={photoPreview} alt="" className="size-full object-cover" />
                ) : (
                  <User className="mx-auto size-10 translate-y-4 text-[var(--color-text-muted)]" aria-hidden="true" />
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-transparent transition-all duration-200 group-hover:bg-black/40 group-hover:text-white">
                  <Camera className="size-6" aria-hidden="true" />
                </span>
              </button>
              <div className="flex flex-col gap-1 text-center sm:text-left">
                <p className="text-sm font-medium text-[var(--color-text)]">Student photo</p>
                <p className="text-xs text-[var(--color-text-muted)]">JPG, PNG, GIF or WEBP, up to 5MB.</p>
                {photoError && <p className="text-xs text-[var(--color-danger)]">{photoError}</p>}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_PHOTO_TYPES}
                onChange={handlePhotoChange}
                className="hidden"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="Admission number" error={errors.admission_number?.message} {...register("admission_number")} />
              <Select label="Status" error={errors.status?.message} {...register("status")}>
                <option value="applicant">Applicant</option>
                <option value="admitted">Admitted</option>
                <option value="active">Active</option>
                <option value="transferred">Transferred</option>
                <option value="graduated">Graduated</option>
                <option value="withdrawn">Withdrawn</option>
                <option value="archived">Archived</option>
              </Select>
              <Input label="First name" error={errors.first_name?.message} {...register("first_name")} />
              <Input label="Middle name" error={errors.middle_name?.message} {...register("middle_name")} />
              <Input label="Last name" error={errors.last_name?.message} {...register("last_name")} />
              <Input type="date" label="Date of birth" error={errors.date_of_birth?.message} {...register("date_of_birth")} />
              <Select label="Gender" error={errors.gender?.message} {...register("gender")}>
                <option value="">Not specified</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </Select>
              <Input type="date" label="Admission date" error={errors.admission_date?.message} {...register("admission_date")} />
              <Input label="Previous school" error={errors.previous_school?.message} {...register("previous_school")} />
            </div>

            <Input label="Address" error={errors.address?.message} {...register("address")} />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Select label="Academic year" error={errors.current_academic_year?.message} {...register("current_academic_year")}>
                <option value="">Not set</option>
                {academicYears?.map((year) => (
                  <option key={year.id} value={year.id}>
                    {year.name}
                  </option>
                ))}
              </Select>
              <Select label="Class" error={errors.current_class?.message} {...register("current_class")}>
                <option value="">Not set</option>
                {schoolClasses?.map((schoolClass) => (
                  <option key={schoolClass.id} value={schoolClass.id}>
                    {schoolClass.name}
                  </option>
                ))}
              </Select>
              <Select
                label="Section"
                error={errors.current_section?.message}
                disabled={!selectedClass}
                {...register("current_section")}
              >
                <option value="">Not set</option>
                {sections?.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
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
