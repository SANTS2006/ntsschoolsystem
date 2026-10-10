import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, GraduationCap, KeyRound, Save, User as UserIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useToast } from "@/components/ui/toastContext";
import { TwoFactorCard } from "@/features/auth/TwoFactorCard";
import { useSignOut } from "@/features/auth/useSignOut";
import { useChangePassword, useCurrentUser, useHasPermission, useUpdateCurrentUser } from "@/features/auth/useAuth";
import { useMySchool, useUpdateMySchool } from "@/features/schools/useSchoolsCrud";
import { Select } from "@/components/ui/Select";
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";
import { useStateFromSource } from "@/hooks/useStateFromSource";

const MAX_PHOTO_SIZE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_PHOTO_TYPES = "image/jpeg,image/png,image/gif,image/webp";

const profileSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  email: z.string().min(1, "Email is required").email("Enter a valid email address"),
  phone_number: z.string(),
});
type ProfileFormValues = z.infer<typeof profileSchema>;
const PROFILE_FIELD_KEYS = new Set(["first_name", "last_name", "email", "phone_number", "photo"]);

const passwordSchema = z
  .object({
    current_password: z.string().min(1, "Current password is required"),
    new_password: z.string().min(10, "Must be at least 10 characters"),
    confirm_password: z.string().min(1, "Confirm your new password"),
  })
  .refine((values) => values.new_password === values.confirm_password, {
    message: "Passwords do not match",
    path: ["confirm_password"],
  });
type PasswordFormValues = z.infer<typeof passwordSchema>;
const PASSWORD_FIELD_KEYS = new Set(["current_password", "new_password"]);
const EMPTY_PASSWORD_VALUES: PasswordFormValues = { current_password: "", new_password: "", confirm_password: "" };

function ProfileCard() {
  const { data: user } = useCurrentUser();
  const { showToast } = useToast();
  const updateProfile = useUpdateCurrentUser();
  const [generalError, setGeneralError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useStateFromSource(user, (loaded) => loaded?.photo ?? null);
  const [photoError, setPhotoError] = useState<string | undefined>();

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { first_name: "", last_name: "", email: "", phone_number: "" },
  });

  useEffect(() => {
    if (user) {
      reset({
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
        phone_number: user.phone_number,
      });
    }
  }, [user, reset]);

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

  const onSubmit = (values: ProfileFormValues) => {
    setGeneralError(null);
    updateProfile.mutate(
      {
        first_name: values.first_name,
        last_name: values.last_name,
        email: values.email,
        phone_number: values.phone_number || undefined,
        photo: photoFile ?? undefined,
      },
      {
        onSuccess: () => {
          setPhotoFile(null);
          showToast({ title: "Profile updated" });
        },
        onError: (err: ApiError) => {
          if (!applyFieldErrors(err, setError, PROFILE_FIELD_KEYS)) {
            const message = generalErrorMessage(err);
            setGeneralError(message);
            showToast({ title: "Could not update profile", description: message, tone: "danger" });
          }
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Your name, contact details, and photo.</p>
      </CardHeader>
      <CardContent>
        {generalError && (
          <Alert tone="danger" className="mb-4">
            {generalError}
          </Alert>
        )}
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="group relative size-20 shrink-0 overflow-hidden rounded-full border-2 border-[var(--color-border)] bg-[var(--color-bg-subtle)] transition-all duration-200 hover:border-[var(--color-primary)] hover:shadow-[0_8px_24px_-8px_color-mix(in_srgb,var(--color-primary)_60%,transparent)]"
              aria-label="Change profile photo"
            >
              {photoPreview ? (
                <img src={photoPreview} alt="" className="size-full object-cover" />
              ) : (
                <UserIcon className="mx-auto size-8 translate-y-3 text-[var(--color-text-muted)]" aria-hidden="true" />
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-transparent transition-all duration-200 group-hover:bg-black/40 group-hover:text-white">
                <Camera className="size-5" aria-hidden="true" />
              </span>
            </button>
            <div className="flex flex-col gap-1 text-center sm:text-left">
              <p className="text-sm font-medium text-[var(--color-text)]">Profile photo</p>
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
          <Input
            type="email"
            label="Email"
            hint="Also your sign-in username — changing it takes effect immediately."
            error={errors.email?.message}
            {...register("email")}
          />
          <Input label="Phone number" error={errors.phone_number?.message} {...register("phone_number")} />

          <div className="mt-2 flex justify-end">
            <Button type="submit" isLoading={updateProfile.isPending}>
              {!updateProfile.isPending && <Save className="size-4" aria-hidden="true" />}
              Save changes
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function PasswordCard({ forced = false }: { forced?: boolean } = {}) {
  const { showToast } = useToast();
  const changePassword = useChangePassword();
  const signOut = useSignOut();
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<PasswordFormValues>({ resolver: zodResolver(passwordSchema), defaultValues: EMPTY_PASSWORD_VALUES });

  const onSubmit = (values: PasswordFormValues) => {
    setGeneralError(null);
    changePassword.mutate(
      { current_password: values.current_password, new_password: values.new_password },
      {
        onSuccess: () => {
          reset(EMPTY_PASSWORD_VALUES);
          showToast({ title: "Password changed", description: "Please sign in again with your new password." });
          // The backend blacklists every outstanding refresh token for this user on a
          // successful change — the current session is already invalid, so log out client-side
          // to match and send them back to /login rather than leaving a dead session in place.
          void signOut({ message: "Password changed — signing you out…" });
        },
        onError: (err: ApiError) => {
          if (!applyFieldErrors(err, setError, PASSWORD_FIELD_KEYS)) {
            const message = generalErrorMessage(err);
            setGeneralError(message);
            showToast({ title: "Could not change password", description: message, tone: "danger" });
          }
        },
      },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Password</CardTitle>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          {forced
            ? "Your account still uses a password someone else chose. Pick your own to continue."
            : "Changing your password signs you out of every other session."}
        </p>
      </CardHeader>
      <CardContent>
        {generalError && (
          <Alert tone="danger" className="mb-4">
            {generalError}
          </Alert>
        )}
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <PasswordInput
            label="Current password"
            error={errors.current_password?.message}
            {...register("current_password")}
          />
          <PasswordInput
            label="New password"
            hint="At least 10 characters — not entirely numeric, and not a commonly used password."
            error={errors.new_password?.message}
            {...register("new_password")}
          />
          <PasswordInput
            label="Confirm new password"
            error={errors.confirm_password?.message}
            {...register("confirm_password")}
          />

          <div className="mt-2 flex justify-end">
            <Button type="submit" isLoading={changePassword.isPending}>
              {!changePassword.isPending && <KeyRound className="size-4" aria-hidden="true" />}
              Change password
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

const academicSettingsSchema = z.object({
  promotion_threshold_percent: z.coerce.number().int().min(0).max(100),
  grade_point_scale: z.enum(["4.00", "5.00"]),
});
type AcademicSettingsFormValues = z.infer<typeof academicSettingsSchema>;

/** Only rendered for school users with `settings.update` — platform admins have no `school` at
 * all (`/schools/me/` 404s for them), and anyone without the permission can't PATCH it anyway. */
function AcademicSettingsCard() {
  const { showToast } = useToast();
  const { data: school, isLoading } = useMySchool();
  const updateSchool = useUpdateMySchool();
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<z.input<typeof academicSettingsSchema>, unknown, AcademicSettingsFormValues>({
    resolver: zodResolver(academicSettingsSchema),
    defaultValues: { promotion_threshold_percent: 50, grade_point_scale: "5.00" },
  });

  useEffect(() => {
    if (school) {
      reset({
        promotion_threshold_percent: school.promotion_threshold_percent,
        grade_point_scale: school.grade_point_scale === "4.00" ? "4.00" : "5.00",
      });
    }
  }, [school, reset]);

  const onSubmit = (values: AcademicSettingsFormValues) => {
    setGeneralError(null);
    updateSchool.mutate(values, {
      onSuccess: () => showToast({ title: "Academic settings updated" }),
      onError: (err: ApiError) => {
        const message = generalErrorMessage(err);
        setGeneralError(message);
        showToast({ title: "Could not update academic settings", description: message, tone: "danger" });
      },
    });
  };

  if (isLoading) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Academic settings</CardTitle>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          School-wide rules the promotion engine uses at the end of each academic year.
        </p>
      </CardHeader>
      <CardContent>
        {generalError && (
          <Alert tone="danger" className="mb-4">
            {generalError}
          </Alert>
        )}
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <Input
            type="number"
            min={0}
            max={100}
            label="Promotion threshold (%)"
            hint="A student's three-term overall percentage must meet or exceed this to be promoted to the next class."
            error={errors.promotion_threshold_percent?.message}
            {...register("promotion_threshold_percent")}
          />
          {school?.school_type === "tertiary" && (
            <Select
              label="Highest grade points"
              hint="The top of your grade-point scale — what the best letter grade is worth. Set each letter's points under Examinations > Grading scales; the GPA on final results is worked out from them."
              error={errors.grade_point_scale?.message}
              {...register("grade_point_scale")}
            >
              <option value="5.00">5.00</option>
              <option value="4.00">4.00</option>
            </Select>
          )}
          <div className="mt-2 flex justify-end">
            <Button type="submit" isLoading={updateSchool.isPending}>
              {!updateSchool.isPending && <GraduationCap className="size-4" aria-hidden="true" />}
              Save
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function AccountCard() {
  const { data: user } = useCurrentUser();
  if (!user) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">School</p>
          <p className="mt-0.5 text-sm text-[var(--color-text)]">
            {user.school?.name ?? <span className="text-[var(--color-text-muted)]">—</span>}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Role</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {user.roles.length > 0 ? (
              user.roles.map((role) => (
                <Badge key={role.id} tone="primary" className="normal-case">
                  {role.name}
                </Badge>
              ))
            ) : user.is_platform_admin ? (
              <Badge tone="primary" className="normal-case">
                Platform Administrator
              </Badge>
            ) : (
              <span className="text-sm text-[var(--color-text-muted)]">—</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function SettingsPage() {
  const { data: user } = useCurrentUser();
  const canUpdateSettings = useHasPermission("settings.update");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">Settings</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">Manage your profile, password, and account.</p>
      </div>

      <AccountCard />
      {!user?.is_platform_admin && canUpdateSettings && <AcademicSettingsCard />}
      <ProfileCard />
      <PasswordCard />
      <TwoFactorCard />
    </div>
  );
}
