import { zodResolver } from "@hookform/resolvers/zod";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useNavigate, useParams } from "react-router-dom";
import { z } from "zod";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { CategorySelect } from "@/components/ui/CategorySelect";
import { ImageField } from "@/components/ui/ImageField";
import { Input } from "@/components/ui/Input";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/toastContext";
import { useStateFromSource } from "@/hooks/useStateFromSource";
import { AudienceSection } from "@/features/audience/AudienceSection";
import { audienceFromApi, audienceToPayload, EMPTY_AUDIENCE } from "@/features/audience/audience";
import { useResolveCategory } from "@/features/formoptions/useResolveCategory";
import type { ApiError } from "@/lib/api-client";
import { applyFieldErrors, generalErrorMessage } from "@/lib/formErrors";

import { categoryLabel } from "./statusTone";
import type { BuiltinEventCategory } from "./types";
import { useCreateEvent, useEvent, useUpdateEvent } from "./useEventsCrud";

const CATEGORIES: BuiltinEventCategory[] = ["academic", "sports", "cultural", "meeting", "holiday", "other"];

const schema = z
  .object({
    title: z.string().min(1, "Title is required"),
    description: z.string(),
    category: z.string().min(1, "Choose a category"),
    start_datetime: z.string().min(1, "Start date/time is required"),
    end_datetime: z.string().min(1, "End date/time is required"),
    location: z.string(),
    capacity: z.string(),
  })
  .refine((values) => values.end_datetime >= values.start_datetime, {
    message: "Must be on or after the start date/time.",
    path: ["end_datetime"],
  });

type FormValues = z.infer<typeof schema>;

const EMPTY_VALUES: FormValues = {
  title: "",
  description: "",
  category: "other",
  start_datetime: "",
  end_datetime: "",
  location: "",
  capacity: "",
};
const FIELD_KEYS = new Set([
  "title", "description", "image", "category", "start_datetime", "end_datetime", "location", "capacity",
]);

/** The backend stores UTC ISO datetimes; a `datetime-local` input works in naive local time with
 * no timezone/seconds ("YYYY-MM-DDTHH:mm") — converting each direction here keeps the picker
 * showing the same wall-clock time the event was actually created with. */
function toLocalInputValue(isoString: string): string {
  const date = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function EventFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = !!id;
  const navigate = useNavigate();
  const { showToast } = useToast();

  const { data: event, isLoading: isLoadingEvent } = useEvent(id);
  const createEvent = useCreateEvent();
  const updateEvent = useUpdateEvent(id ?? "");
  const mutation = isEditMode ? updateEvent : createEvent;
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [otherText, setOtherText] = useState("");
  const [audience, setAudience] = useStateFromSource(event, (loaded) => (loaded ? audienceFromApi(loaded) : EMPTY_AUDIENCE));
  const resolveCategory = useResolveCategory("events.category");
  const [imageError, setImageError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY_VALUES });

  useEffect(() => {
    // Also re-fires once `classes`/`sections`/`departments` finish loading — see
    // AnnouncementFormPage for why: a native <select> silently drops a value assigned before its
    // matching <option> exists in the DOM.
    if (event) {
      reset({
        title: event.title,
        description: event.description,
        category: event.category,
        start_datetime: toLocalInputValue(event.start_datetime),
        end_datetime: toLocalInputValue(event.end_datetime),
        location: event.location,
        capacity: event.capacity === null ? "" : String(event.capacity),
      });
    }
  }, [event, reset]);

  const onSubmit = async (values: FormValues) => {
    setGeneralError(null);
    // An event needs a picture: required when creating, optional on edit (keeps the current one).
    if (!isEditMode && !image) {
      setImageError("An image is required.");
      return;
    }
    setImageError(null);
    let category: string;
    try {
      // "Other" + a typed name becomes a real option on the school's list first.
      category = await resolveCategory(values.category, otherText);
    } catch (err) {
      setGeneralError(generalErrorMessage(err as ApiError));
      return;
    }
    mutation.mutate(
      {
        title: values.title,
        image: image ?? undefined,
        description: values.description || undefined,
        category,
        start_datetime: values.start_datetime,
        end_datetime: values.end_datetime,
        location: values.location || undefined,
        capacity: values.capacity ? Number(values.capacity) : undefined,
        ...audienceToPayload(audience),
      },
      {
        onSuccess: (saved) => {
          showToast({ title: isEditMode ? "Event updated" : "Event created" });
          navigate(`/events/${saved.id}`);
        },
        onError: (err: ApiError) => {
          if (!applyFieldErrors(err, setError, FIELD_KEYS)) {
            const message = generalErrorMessage(err);
            setGeneralError(message);
            showToast({ title: "Could not save event", description: message, tone: "danger" });
          }
        },
      },
    );
  };

  if (isEditMode && isLoadingEvent) {
    return <FullPageSpinner />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-[var(--color-text)]">{isEditMode ? "Edit event" : "New event"}</h1>

      <Card>
        <CardHeader>
          <CardTitle>Event details</CardTitle>
        </CardHeader>
        <CardContent>
          {generalError && (
            <Alert tone="danger" className="mb-4">
              {generalError}
            </Alert>
          )}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
            <Input label="Title" error={errors.title?.message} {...register("title")} />
            <Input label="Description" error={errors.description?.message} {...register("description")} />
            <ImageField
              label="Event image"
              required
              value={image}
              onChange={(file) => {
                setImage(file);
                setImageError(null);
              }}
              existingUrl={event?.image}
              error={imageError ?? undefined}
              hint="The event's cover picture. JPG, PNG, WEBP or GIF, up to 5MB."
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Controller
                name="category"
                control={control}
                render={({ field }) => (
                  <CategorySelect
                    field="events.category"
                    label="Category"
                    builtin={CATEGORIES.map((value) => ({ value, label: categoryLabel(value) }))}
                    value={field.value}
                    onChange={field.onChange}
                    otherText={otherText}
                    onOtherTextChange={setOtherText}
                    error={errors.category?.message}
                  />
                )}
              />
              <Input label="Location" error={errors.location?.message} {...register("location")} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                type="datetime-local"
                label="Starts"
                error={errors.start_datetime?.message}
                {...register("start_datetime")}
              />
              <Input
                type="datetime-local"
                label="Ends"
                error={errors.end_datetime?.message}
                {...register("end_datetime")}
              />
            </div>
            <Input
              type="number"
              label="Capacity"
              hint="Leave blank for unlimited attendance."
              error={errors.capacity?.message}
              {...register("capacity")}
            />

            <AudienceSection value={audience} onChange={setAudience} />

            <div className="mt-2 flex justify-end gap-3">
              <Button type="button" variant="secondary" onClick={() => navigate("/events")}>
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
