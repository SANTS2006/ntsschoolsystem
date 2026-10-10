import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, Save, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";
import { useStateFromSource } from "@/hooks/useStateFromSource";

import { useCreateGuardian, useGuardian, useUpdateGuardian } from "./useParentsCrud";

const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024; // matches the backend's validate_image_file cap
const ACCEPTED_PHOTO_TYPES = "image/jpeg,image/png,image/gif,image/webp";

const schema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  email: z.string().email("Enter a valid email address").or(z.literal("")),
  phone_number: z.string(),
  address: z.string(),
  occupation: z.string(),
});
type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = {
  first_name: "",
  last_name: "",
  email: "",
  phone_number: "",
  address: "",
  occupation: "",
};
const FIELD_KEYS = new Set(["first_name", "last_name", "email", "phone_number", "address", "occupation"]);

export function GuardianFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: guardian, isLoading: isLoadingGuardian } = useGuardian(id);
  const createGuardian = useCreateGuardian();
  const updateGuardian = useUpdateGuardian(id ?? "");
  const mutation = isEditMode ? updateGuardian : createGuardian;
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useStateFromSource(guardian, (loaded) => loaded?.photo ?? null);
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
    if (guardian) {
      reset({
        first_name: guardian.first_name,
        last_name: guardian.last_name,
        email: guardian.email,
        phone_number: guardian.phone_number,
        address: guardian.address,
        occupation: guardian.occupation,
      });
    }
  }, [guardian, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    mutation.mutate(
      {
        first_name: values.first_name,
        last_name: values.last_name,
        email: values.email || undefined,
        phone_number: values.phone_number || undefined,
        address: values.address || undefined,
        occupation: values.occupation || undefined,
        photo: photoFile ?? undefined,
      },
      {
        onSuccess: () => {
          showToast({ title: isEditMode ? "Guardian updated" : "Guardian created" });
          navigate("/parents");
        },
        onError: (err: ApiError) => {
          if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
            const message = generalErrorMessage(err);
            setGeneralError(message);
            showToast({ title: "Could not save guardian", description: message, tone: "danger" });
          }
        },
      },
    );
  };

  if (isEditMode && isLoadingGuardian) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">
        {isEditMode ? "Edit guardian" : "New guardian"}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>Guardian details</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <div className="flex flex-col items-center gap-2 sm:flex-row sm:items-start">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="group relative size-24 shrink-0 overflow-hidden rounded-full border-2 border-[var(--color-border)] bg-[var(--color-bg-subtle)] transition-all duration-200 hover:border-[var(--color-primary)] hover:shadow-[0_8px_24px_-8px_color-mix(in_srgb,var(--color-primary)_60%,transparent)]"
                aria-label="Change guardian photo"
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
                <p className="text-sm font-medium text-[var(--color-text)]">Guardian photo</p>
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
              <Input label="First name" error={errors.first_name?.message} {...register("first_name")} />
              <Input label="Last name" error={errors.last_name?.message} {...register("last_name")} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input type="email" label="Email" error={errors.email?.message} {...register("email")} />
              <Input label="Phone number" error={errors.phone_number?.message} {...register("phone_number")} />
            </div>
            <Input label="Address" error={errors.address?.message} {...register("address")} />
            <Input label="Occupation" error={errors.occupation?.message} {...register("occupation")} />

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/parents")}>
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
