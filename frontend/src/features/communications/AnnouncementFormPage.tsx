import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Checkbox } from "@/components/ui/Checkbox";
import { ImageField } from "@/components/ui/ImageField";
import { Input } from "@/components/ui/Input";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import { useStateFromSource } from "@/hooks/useStateFromSource";
import { AudienceSection } from "@/features/audience/AudienceSection";
import { audienceFromApi, audienceToPayload, EMPTY_AUDIENCE } from "@/features/audience/audience";
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";

import { useAnnouncement, useCreateAnnouncement, useUpdateAnnouncement } from "./useCommunicationsCrud";


const schema = z.object({
  title: z.string().min(1, "Title is required"),
  body: z.string().min(1, "Body is required"),
  send_email: z.boolean(),
  is_active: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = {
  title: "",
  body: "",
  send_email: false,
  is_active: true,
};
const FIELD_KEYS = new Set([
  "title",
  "body",
  "image",
  "target_type",
  "target_class",
  "target_section",
  "target_department",
  "send_email",
  "is_active",
]);

export function AnnouncementFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: announcement, isLoading: isLoadingAnnouncement } = useAnnouncement(id);
  const createAnnouncement = useCreateAnnouncement();
  const updateAnnouncement = useUpdateAnnouncement(id ?? "");
  const mutation = isEditMode ? updateAnnouncement : createAnnouncement;
  const [generalError, setGeneralError] = useState<string | null>(null);
  // Someone else's announcement: viewable, never editable (the server enforces this too).
  const readOnly = isEditMode && !!announcement && !announcement.is_mine;
  const [image, setImage] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [audience, setAudience] = useStateFromSource(announcement, (loaded) => (loaded ? audienceFromApi(loaded) : EMPTY_AUDIENCE));

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  useEffect(() => {
    // Also re-fires once `classes`/`sections`/`departments` finish loading (not just when
    // `announcement` does): a native <select> silently ignores a value assigned before its
    // matching <option> exists in the DOM, and nothing re-applies it later on its own — so if
    // `announcement` resolves before these lookups do, `target_class`/`target_section`/
    // `target_department` would be silently dropped on the first `reset()` and never actually
    // selected.
    if (announcement) {
      reset({
        title: announcement.title,
        body: announcement.body,
        send_email: announcement.send_email,
        is_active: announcement.is_active,
      });
    }
  }, [announcement, reset]);

  const onSubmit = (values: FormValues) => {
    setGeneralError(null);
    // An announcement needs a picture: required when creating, optional on edit (keeps the current one).
    if (!isEditMode && !image) {
      setImageError("An image is required.");
      return;
    }
    setImageError(null);
    mutation.mutate(
      {
        title: values.title,
        image: image ?? undefined,
        body: values.body,
        ...audienceToPayload(audience),
        // An announcement to a chosen audience always goes out by e-mail as well as in the app.
        send_email: true,
        is_active: values.is_active,
      },
      {
        onSuccess: () => {
          showToast({ title: isEditMode ? "Announcement updated" : "Announcement created" });
          navigate("/communications");
        },
        onError: (err: ApiError) => {
          if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
            const message = generalErrorMessage(err);
            setGeneralError(message);
            showToast({ title: "Could not save announcement", description: message, tone: "danger" });
          }
        },
      },
    );
  };

  if (isEditMode && isLoadingAnnouncement) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">
        {isEditMode ? "Edit announcement" : "New announcement"}
      </h1>

      <Card>
        <CardHeader>
          <CardTitle>
            Announcement details
            {announcement?.published_by_name && (
              <span className="ml-2 text-sm font-normal text-[var(--color-text-muted)]">
                Published by {announcement.published_by_name}
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
          {readOnly && (
            <Alert tone="warning" className="mb-4">
              This announcement was created by {announcement?.created_by_name ?? "someone else"}, so only they can
              edit, publish or delete it. You can read it here.
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
          <fieldset disabled={readOnly} className="flex flex-col gap-4 border-0 p-0">
            <Input label="Title" error={errors.title?.message} {...register("title")} />
            <Input label="Body" error={errors.body?.message} {...register("body")} />
            <ImageField
              label="Image"
              required
              value={image}
              onChange={(file) => {
                setImage(file);
                setImageError(null);
              }}
              existingUrl={announcement?.image}
              error={imageError ?? undefined}
              hint="Shown with the announcement. JPG, PNG, WEBP or GIF, up to 5MB."
            />
            <AudienceSection value={audience} onChange={setAudience} />
            <Checkbox label="Active" {...register("is_active")} />

          </fieldset>

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/communications")}>
                {readOnly ? "Back" : "Cancel"}
              </Button>
              {!readOnly && (
                <Button type="submit" isLoading={mutation.isPending}>
                  {!mutation.isPending && <Save className="size-4" aria-hidden="true" />}
                  Save
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
