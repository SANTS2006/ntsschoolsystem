import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, Save, User as UserIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import { useDepartmentList } from "@/features/academics/useAcademicsCrud";
import type { ApiError } from "@/lib/api-client";
import { useStateFromSource } from "@/hooks/useStateFromSource";

import { useStaffMember, useUpdateStaff } from "./useStaffCrud";

const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024; // matches the backend's validate_image_file cap
const ACCEPTED_PHOTO_TYPES = "image/jpeg,image/png,image/gif,image/webp";

const schema = z.object({
  staff_id: z.string(),
  department: z.string(),
  job_title: z.string(),
  qualification: z.string(),
  hire_date: z.string(),
  emergency_contact_name: z.string(),
  emergency_contact_phone: z.string(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = {
  staff_id: "",
  department: "",
  job_title: "",
  qualification: "",
  hire_date: "",
  emergency_contact_name: "",
  emergency_contact_phone: "",
};

/** Editing never touches the linked User account — the `user` FK is immutable from this
 * form once a Staff profile exists (see `StaffFormPage` for why creating one is a
 * separate, two-call flow). Only the staff-specific fields below are writable here. */
export function StaffEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: staff, isLoading: isLoadingStaff } = useStaffMember(id);
  const { data: departments } = useDepartmentList({ page_size: 100 });
  const updateStaff = useUpdateStaff(id ?? "");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useStateFromSource(staff, (loaded) => loaded?.photo ?? null);
  const [photoError, setPhotoError] = useState<string | undefined>();

  useEffect(() => {
    return () => {
      if (photoPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(photoPreview);
      }
    };
  }, [photoPreview]);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.size > MAX_PHOTO_SIZE_BYTES) {
      setPhotoError(`Image exceeds the maximum allowed size of ${MAX_PHOTO_SIZE_BYTES / (1024 * 1024)}MB.`);
      return;
    }
    setPhotoError(undefined);
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
  };

  useEffect(() => {
    if (staff) {
      reset({
        staff_id: staff.staff_id,
        department: staff.department ?? "",
        job_title: staff.job_title,
        qualification: staff.qualification,
        hire_date: staff.hire_date ?? "",
        emergency_contact_name: staff.emergency_contact_name,
        emergency_contact_phone: staff.emergency_contact_phone,
      });
    }
  }, [staff, reset]);

  const onSubmit = (values: FormValues) => {
    updateStaff.mutate(
      {
        staff_id: values.staff_id || undefined,
        department: values.department || undefined,
        job_title: values.job_title || undefined,
        qualification: values.qualification || undefined,
        hire_date: values.hire_date || undefined,
        emergency_contact_name: values.emergency_contact_name || undefined,
        emergency_contact_phone: values.emergency_contact_phone || undefined,
        photo: photoFile ?? undefined,
      },
      {
        onSuccess: (updated) => {
          showToast({ title: "Staff profile updated" });
          navigate(`/staff/${updated.id}`);
        },
        onError: (err: ApiError) => {
          showToast({ title: "Could not save staff profile", description: err.message, tone: "danger" });
        },
      },
    );
  };

  if (isLoadingStaff) {
    return <FullPageSpinner />;
  }

  if (!staff) {
    return <Alert tone="danger">Staff member not found.</Alert>;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">Edit staff profile</h1>

      <Card>
        <CardHeader>
          <CardTitle>{staff.full_name}</CardTitle>
          <p className="text-sm text-[var(--color-text-muted)]">{staff.email}</p>
        </CardHeader>
        <CardContent>
          {updateStaff.isError && (
            <Alert tone="danger" className="mb-4">
              {(updateStaff.error as ApiError).message}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-start">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="group relative size-24 shrink-0 overflow-hidden rounded-full border-2 border-[var(--color-border)] bg-[var(--color-bg-subtle)] transition-all duration-200 hover:border-[var(--color-primary)] hover:shadow-[0_8px_24px_-8px_color-mix(in_srgb,var(--color-primary)_60%,transparent)]"
                aria-label="Change staff photo"
              >
                {photoPreview ? (
                  <img src={photoPreview} alt="" className="size-full object-cover" />
                ) : (
                  <UserIcon className="mx-auto size-10 translate-y-4 text-[var(--color-text-muted)]" aria-hidden="true" />
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-transparent transition-all duration-200 group-hover:bg-black/40 group-hover:text-white">
                  <Camera className="size-6" aria-hidden="true" />
                </span>
              </button>
              <div className="flex flex-col gap-1 text-center sm:text-left">
                <p className="text-sm font-medium text-[var(--color-text)]">Photo</p>
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
              <Input label="Staff ID" error={errors.staff_id?.message} {...register("staff_id")} />
              <Select label="Department" error={errors.department?.message} {...register("department")}>
                <option value="">Not set</option>
                {departments?.results.map((dept) => (
                  <option key={dept.id} value={dept.id}>
                    {dept.name}
                  </option>
                ))}
              </Select>
              <Input label="Job title" error={errors.job_title?.message} {...register("job_title")} />
              <Input type="date" label="Hire date" error={errors.hire_date?.message} {...register("hire_date")} />
            </div>
            <Input label="Qualification" error={errors.qualification?.message} {...register("qualification")} />
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

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate(-1)}>
                Cancel
              </Button>
              <Button type="submit" isLoading={updateStaff.isPending}>
                {!updateStaff.isPending && <Save className="size-4" aria-hidden="true" />}
                Save
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
