import { zodResolver } from "@hookform/resolvers/zod";
import { Camera, Save, School as SchoolIcon } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
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
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";
import { useStateFromSource } from "@/hooks/useStateFromSource";

import { BrandColorFields } from "./BrandColorFields";
import { useCreateSchool, useSchool, useUpdateSchool } from "./useSchoolsCrud";

const MAX_LOGO_SIZE_BYTES = 5 * 1024 * 1024; // matches the backend's validate_image_file cap
const ACCEPTED_LOGO_TYPES = "image/jpeg,image/png,image/gif,image/webp";

const SCHOOL_TYPES = ["primary", "secondary", "combined", "tertiary", "other"] as const;
const OWNERSHIP_TYPES = ["public", "private", "religious", "ngo", "other"] as const;

function buildSchema(isEditMode: boolean) {
  const requiredAdminField = (label: string) =>
    isEditMode ? z.string() : z.string().min(1, `Administrator ${label} is required`);

  return z.object({
    name: z.string().min(1, "Name is required"),
    slug: z.string().min(1, "Slug is required"),
    motto: z.string(),
    logo_url: z.string(),
    primary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Enter a colour like #1565c0"),
    secondary_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Enter a colour like #22d3ee"),
    email: z.string().email("Enter a valid email address").or(z.literal("")),
    phone_number: z.string(),
    website: z.string(),
    country: z.string(),
    region: z.string(),
    city: z.string(),
    address: z.string(),
    school_type: z.enum(SCHOOL_TYPES),
    ownership_type: z.enum(OWNERSHIP_TYPES),
    currency: z.string(),
    timezone: z.string(),
    admin_email: isEditMode
      ? z.string()
      : z.string().min(1, "Administrator email is required").email("Enter a valid email address"),
    admin_first_name: requiredAdminField("first name"),
    admin_last_name: requiredAdminField("last name"),
  });
}

type FormValues = z.infer<ReturnType<typeof buildSchema>>;

const EMPTY_VALUES: FormValues = {
  name: "",
  slug: "",
  motto: "",
  logo_url: "",
  primary_color: "#1565c0",
  secondary_color: "#22d3ee",
  email: "",
  phone_number: "",
  website: "",
  country: "",
  region: "",
  city: "",
  address: "",
  school_type: "other",
  ownership_type: "other",
  currency: "USD",
  timezone: "UTC",
  admin_email: "",
  admin_first_name: "",
  admin_last_name: "",
};

const FIELD_KEYS = new Set([
  "name", "slug", "motto", "logo_url", "primary_color", "secondary_color", "email", "phone_number", "website", "country", "region",
  "city", "address", "school_type", "ownership_type", "currency", "timezone",
  "admin_email", "admin_first_name", "admin_last_name",
]);

export function SchoolFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: school, isLoading: isLoadingSchool } = useSchool(id);
  const createSchool = useCreateSchool();
  const updateSchool = useUpdateSchool(id ?? "");
  const mutation = isEditMode ? updateSchool : createSchool;
  const [generalError, setGeneralError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    control,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(buildSchema(isEditMode)), defaultValues: EMPTY_VALUES });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useStateFromSource(school, (loaded) => loaded?.logo ?? null);
  const [logoError, setLogoError] = useState<string | undefined>();

  useEffect(() => {
    return () => {
      if (logoPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(logoPreview);
      }
    };
  }, [logoPreview]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.size > MAX_LOGO_SIZE_BYTES) {
      setLogoError(`Image exceeds the maximum allowed size of ${MAX_LOGO_SIZE_BYTES / (1024 * 1024)}MB.`);
      return;
    }
    setLogoError(undefined);
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const [primaryColor, secondaryColor, schoolNameValue] = useWatch({ control, name: ["primary_color", "secondary_color", "name"] });

  useEffect(() => {
    if (school) {
      reset({
        name: school.name,
        slug: school.slug,
        motto: school.motto,
        logo_url: school.logo_url,
        primary_color: school.primary_color,
        secondary_color: school.secondary_color,
        email: school.email,
        phone_number: school.phone_number,
        website: school.website,
        country: school.country,
        region: school.region,
        city: school.city,
        address: school.address,
        school_type: school.school_type,
        ownership_type: school.ownership_type,
        currency: school.currency,
        timezone: school.timezone,
        admin_email: "",
        admin_first_name: "",
        admin_last_name: "",
      });
    }
  }, [school, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);

    const shared = {
      name: values.name,
      slug: values.slug,
      motto: values.motto || undefined,
      primary_color: values.primary_color,
      secondary_color: values.secondary_color,
      email: values.email || undefined,
      phone_number: values.phone_number || undefined,
      website: values.website || undefined,
      country: values.country || undefined,
      region: values.region || undefined,
      city: values.city || undefined,
      address: values.address || undefined,
      school_type: values.school_type,
      ownership_type: values.ownership_type,
      currency: values.currency || undefined,
      timezone: values.timezone || undefined,
    };

    const payload = isEditMode ? {
      ...shared,
      logo_url: values.logo_url || undefined,
      logo: logoFile ?? undefined,
    } : {
      ...shared,
      logo: logoFile ?? undefined,
      admin_email: values.admin_email,
      admin_first_name: values.admin_first_name,
      admin_last_name: values.admin_last_name,
    };

    mutation.mutate(payload as never, {
      onSuccess: (saved) => {
        showToast({ title: isEditMode ? "School updated" : "School created and its administrator invited" });
        navigate(`/platform/schools/${saved.id}`);
      },
      onError: (err: ApiError) => {
        if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
          const message = generalErrorMessage(err);
          setGeneralError(message);
          showToast({ title: "Could not save school", description: message, tone: "danger" });
        }
      },
    });
  };

  if (isEditMode && isLoadingSchool) {
    return <FullPageSpinner />;
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--color-text)]">{isEditMode ? "Edit school" : "Add a school"}</h1>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          {isEditMode
            ? "Update the school's details, colours and address."
            : "Set up the school, choose the colours its whole system will use, and invite its first administrator."}
        </p>
      </div>

      {generalError && <Alert tone="danger">{generalError}</Alert>}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-6">
        <FormSection title="Identity" description="How the school is named and where its pages live.">
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="group relative size-24 shrink-0 overflow-hidden rounded-full border-2 border-[var(--color-border)] bg-[var(--color-bg-subtle)] transition-all duration-200 hover:border-[var(--color-primary)] hover:shadow-[0_8px_24px_-8px_color-mix(in_srgb,var(--color-primary)_60%,transparent)]"
              aria-label="Change school logo"
            >
              {logoPreview ? (
                <img src={logoPreview} alt="" className="size-full object-cover" />
              ) : (
                <SchoolIcon className="mx-auto size-10 translate-y-4 text-[var(--color-text-muted)]" aria-hidden="true" />
              )}
              <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-transparent transition-all duration-200 group-hover:bg-black/40 group-hover:text-white">
                <Camera className="size-6" aria-hidden="true" />
              </span>
            </button>
            <div className="flex min-w-0 flex-col gap-1 text-center sm:text-left">
              <p className="text-sm font-semibold text-[var(--color-text)]">School logo</p>
              <p className="text-xs text-[var(--color-text-muted)]">
                JPG, PNG, GIF or WEBP, up to 5MB. Shown on the school's login page, menus and loading screens.
              </p>
              {logoError && <p className="text-xs text-[var(--color-danger)]">{logoError}</p>}
            </div>
            <input ref={fileInputRef} type="file" accept={ACCEPTED_LOGO_TYPES} onChange={handleLogoChange} className="hidden" />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="School name" error={errors.name?.message} {...register("name")} />
            <Input
              label="Slug"
              hint="The school's address: this site's URL followed by /slug. Lowercase, hyphenated."
              error={errors.slug?.message}
              {...register("slug")}
            />
          </div>
          <Input label="Motto" error={errors.motto?.message} {...register("motto")} />
          {isEditMode && <Input label="Logo URL" error={errors.logo_url?.message} {...register("logo_url")} />}
        </FormSection>

        <FormSection
          title="Colours"
          description="The school's two colours. They style its login page and every screen its people use, and the emails it sends."
        >
          <BrandColorFields
            primary={primaryColor}
            secondary={secondaryColor}
            onPrimaryChange={(value) => setValue("primary_color", value, { shouldDirty: true, shouldValidate: true })}
            onSecondaryChange={(value) => setValue("secondary_color", value, { shouldDirty: true, shouldValidate: true })}
            primaryError={errors.primary_color?.message}
            secondaryError={errors.secondary_color?.message}
            logo={logoPreview}
            schoolName={schoolNameValue}
          />
        </FormSection>

        <FormSection title="Contact" description="Shown in the footer of the emails the school sends.">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input type="email" label="Email" error={errors.email?.message} {...register("email")} />
            <Input label="Phone number" error={errors.phone_number?.message} {...register("phone_number")} />
          </div>
          <Input label="Website" error={errors.website?.message} {...register("website")} />
        </FormSection>

        <FormSection title="Location">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Country" error={errors.country?.message} {...register("country")} />
            <Input label="Region" error={errors.region?.message} {...register("region")} />
            <Input label="City" error={errors.city?.message} {...register("city")} />
            <Input label="Address" error={errors.address?.message} {...register("address")} />
          </div>
        </FormSection>

        <FormSection title="Classification & money">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select label="School type" error={errors.school_type?.message} {...register("school_type")}>
              {SCHOOL_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type[0].toUpperCase() + type.slice(1)}
                </option>
              ))}
            </Select>
            <Select label="Ownership type" error={errors.ownership_type?.message} {...register("ownership_type")}>
              {OWNERSHIP_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type[0].toUpperCase() + type.slice(1)}
                </option>
              ))}
            </Select>
            <Input label="Currency" hint="3-letter code, e.g. USD." error={errors.currency?.message} {...register("currency")} />
            <Input label="Timezone" error={errors.timezone?.message} {...register("timezone")} />
          </div>
        </FormSection>

        {!isEditMode && (
          <FormSection
            title="First administrator"
            description={`This person becomes the school's first administrator, active immediately with a default password — the school's initials plus the current year (e.g. "DA@2026"). Their email arrives with a link to this school's own sign-in page.`}
          >
            <Input type="email" label="Administrator email" error={errors.admin_email?.message} {...register("admin_email")} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label="First name" error={errors.admin_first_name?.message} {...register("admin_first_name")} />
              <Input label="Last name" error={errors.admin_last_name?.message} {...register("admin_last_name")} />
            </div>
          </FormSection>
        )}

        <div className="sticky bottom-0 -mx-1 flex flex-col-reverse gap-3 border-t border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-bg-subtle)_92%,transparent)] px-1 py-4 backdrop-blur sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate(isEditMode ? `/platform/schools/${id}` : "/platform/schools")}
          >
            Cancel
          </Button>
          <Button type="submit" isLoading={mutation.isPending}>
            {!mutation.isPending && <Save className="size-4" aria-hidden="true" />}
            {isEditMode ? "Save changes" : "Create school"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader className="gap-1 pb-1">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <p className="text-sm font-normal text-[var(--color-text-muted)]">{description}</p>}
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-4">{children}</CardContent>
    </Card>
  );
}
