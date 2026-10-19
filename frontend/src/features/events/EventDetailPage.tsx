import { Calendar, CheckCircle2, Images, Lock, Pencil, Send, Trash2, Unlock, Upload, XCircle } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { Alert } from "@/components/ui/Alert";
import { OpenFileButton } from "@/components/ui/FileViewer";
import { BackArrowIcon } from "@/components/ui/BackArrowIcon";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useConfirm } from "@/components/ui/confirmContext";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FullPageSpinner, Spinner } from "@/components/ui/Spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeaderCell,
} from "@/components/ui/Table";
import { useToast } from "@/components/ui/toastContext";
import { useCurrentUser, useHasPermission } from "@/features/auth/useAuth";
import type { ApiError } from "@/lib/api-client";
import { generalErrorMessage } from "@/lib/formErrors";

import { eventStatusLabel, eventStatusTone, targetTypeLabel } from "./statusTone";
import type { EventMediaType } from "./types";
import {
  useAttendees,
  useCancelEvent,
  useCancelEventRegistration,
  useCloseEventRegistration,
  useCreateEventMedia,
  useDeleteEvent,
  useDeleteEventMedia,
  useEvent,
  useEventMedia,
  usePublishEvent,
  useRegisterForEvent,
  useReopenEventRegistration,
} from "./useEventsCrud";

const REGISTRATION_CLOSED_TEXT = {
  open: "Open",
  not_published: "Not open yet",
  ended: "Closed — the event has ended",
  closed: "Closed by the organiser",
  deadline: "Closed — the registration deadline has passed",
} as const;

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-0.5 text-sm text-[var(--color-text)]">
        {value || <span className="text-[var(--color-text-muted)]">—</span>}
      </p>
    </div>
  );
}

export function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const confirm = useConfirm();
  const { data: currentUser } = useCurrentUser();
  const canUpdate = useHasPermission("events.update");
  const canDelete = useHasPermission("events.delete");
  const canRegister = useHasPermission("events.register");

  const { data: event, isLoading, isError, error } = useEvent(id);
  const { data: attendees, isLoading: isLoadingAttendees } = useAttendees(id, { enabled: canUpdate });
  const { data: media, isLoading: isLoadingMedia } = useEventMedia(id);
  const publishEvent = usePublishEvent();
  const cancelEvent = useCancelEvent();
  const deleteEvent = useDeleteEvent();
  const registerForEvent = useRegisterForEvent();
  const closeRegistration = useCloseEventRegistration();
  const reopenRegistration = useReopenEventRegistration();
  const cancelRegistration = useCancelEventRegistration();
  const createMedia = useCreateEventMedia();
  const deleteMedia = useDeleteEventMedia();

  const [mediaType, setMediaType] = useState<EventMediaType>("photo");
  const [caption, setCaption] = useState("");
  const [mediaFile, setMediaFile] = useState<File | null>(null);

  const myRegistration = attendees?.find((row) => row.user === currentUser?.id);

  const handlePublish = () => {
    if (!event) return;
    publishEvent.mutate(event.id, {
      onSuccess: (result) => showToast({ title: result.message }),
      onError: (err: ApiError) =>
        showToast({ title: "Could not publish", description: generalErrorMessage(err), tone: "danger" }),
    });
  };

  const handleCancel = async () => {
    if (!event) return;
    const ok = await confirm({
      title: `Cancel "${event.title}"?`,
      description: "Registered attendees will see it as cancelled.",
      tone: "danger",
    });
    if (!ok) return;
    cancelEvent.mutate(event.id, {
      onSuccess: () => showToast({ title: "Event cancelled" }),
      onError: (err: ApiError) =>
        showToast({ title: "Could not cancel", description: generalErrorMessage(err), tone: "danger" }),
    });
  };

  const handleDelete = async () => {
    if (!event) return;
    const ok = await confirm({
      title: `Delete "${event.title}"?`,
      description: "This cannot be undone.",
      tone: "danger",
    });
    if (!ok) return;
    deleteEvent.mutate(event.id, {
      onSuccess: () => {
        showToast({ title: "Event deleted" });
        navigate("/events");
      },
      onError: (err: ApiError) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
    });
  };

  const handleRegister = () => {
    if (!event) return;
    registerForEvent.mutate(event.id, {
      onSuccess: () => showToast({ title: "You're registered" }),
      onError: (err: ApiError) =>
        showToast({ title: "Could not register", description: generalErrorMessage(err), tone: "danger" }),
    });
  };

  const handleToggleRegistration = (close: boolean) => {
    if (!event) return;
    (close ? closeRegistration : reopenRegistration).mutate(event.id, {
      onSuccess: () => showToast({ title: close ? "Registration closed" : "Registration reopened" }),
      onError: (err: ApiError) =>
        showToast({ title: "Could not update registration", description: generalErrorMessage(err), tone: "danger" }),
    });
  };

  const handleCancelMyRegistration = () => {
    if (!event) return;
    cancelRegistration.mutate(event.id, {
      onSuccess: () => showToast({ title: "Registration cancelled" }),
      onError: (err: ApiError) =>
        showToast({ title: "Could not cancel registration", description: generalErrorMessage(err), tone: "danger" }),
    });
  };

  const handleUploadMedia = () => {
    if (!id || !mediaFile) return;
    createMedia.mutate(
      { event: id, media_type: mediaType, caption: caption.trim() || undefined, file: mediaFile },
      {
        onSuccess: () => {
          showToast({ title: "Media uploaded" });
          setCaption("");
          setMediaFile(null);
        },
        onError: (err: ApiError) => showToast({ title: "Upload failed", description: err.message, tone: "danger" }),
      },
    );
  };

  const handleDeleteMedia = async (mediaId: string) => {
    if (!id) return;
    const ok = await confirm({ title: "Delete this item?", description: "This cannot be undone.", tone: "danger" });
    if (!ok) return;
    deleteMedia.mutate(
      { id: mediaId, event: id },
      {
        onSuccess: () => showToast({ title: "Media deleted" }),
        onError: (err: ApiError) => showToast({ title: "Failed to delete", description: err.message, tone: "danger" }),
      },
    );
  };

  if (isLoading) {
    return <FullPageSpinner />;
  }

  if (isError || !event) {
    return <Alert tone="danger">{(error as ApiError)?.message ?? "Event not found."}</Alert>;
  }

  const isFull = event.capacity !== null && event.registered_count >= event.capacity;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => navigate("/events")}
          className="back-button"
        >
          <BackArrowIcon className="size-4" />
          Back to events
        </button>
        <div className="flex flex-wrap justify-end gap-2">
          {canUpdate && event.is_mine && (
            <Button variant="secondary" size="sm" onClick={() => navigate(`/events/${event.id}/edit`)}>
              <Pencil className="size-4" aria-hidden="true" />
              Edit
            </Button>
          )}
          {canUpdate && event.is_mine && event.status === "draft" && (
            <Button size="sm" onClick={handlePublish} isLoading={publishEvent.isPending}>
              <Send className="size-4" aria-hidden="true" />
              Publish
            </Button>
          )}
          {canUpdate && event.is_mine && event.status === "published" && event.registration_state !== "ended" && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleToggleRegistration(event.registration_state === "open")}
              isLoading={closeRegistration.isPending || reopenRegistration.isPending}
            >
              {event.registration_state === "open" ? (
                <Lock className="size-4" aria-hidden="true" />
              ) : (
                <Unlock className="size-4" aria-hidden="true" />
              )}
              {event.registration_state === "open" ? "Close registration" : "Reopen registration"}
            </Button>
          )}
          {canUpdate && event.is_mine && event.status === "published" && (
            <Button variant="danger" size="sm" onClick={handleCancel} isLoading={cancelEvent.isPending}>
              <XCircle className="size-4" aria-hidden="true" />
              Cancel event
            </Button>
          )}
          {canDelete && event.is_mine && (
            <Button variant="danger" size="sm" onClick={handleDelete} isLoading={deleteEvent.isPending}>
              <Trash2 className="size-4" aria-hidden="true" />
              Delete
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-semibold text-[var(--color-text)]">{event.title}</CardTitle>
            <p className="text-sm text-[var(--color-text-muted)]">{event.category_label}</p>
          </div>
          <Badge tone={eventStatusTone(event.status)}>{eventStatusLabel(event.status)}</Badge>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {event.image && (
            <OpenFileButton url={event.image} title={event.title} className="block w-full cursor-zoom-in sm:col-span-2">
              <img
                src={event.image}
                alt={event.title}
                className="max-h-72 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] object-cover"
              />
            </OpenFileButton>
          )}
          <Field label="Starts" value={new Date(event.start_datetime).toLocaleString()} />
          <Field label="Ends" value={new Date(event.end_datetime).toLocaleString()} />
          <Field label="Location" value={event.location} />
          <Field
            label="Attendance"
            value={`${event.registered_count}${event.capacity !== null ? ` / ${event.capacity}` : ""}`}
          />
          <Field
            label="Audience"
            value={[
              targetTypeLabel(event.target_type),
              event.target_class_name,
              event.target_section_name,
              event.target_department_name,
            ]
              .filter(Boolean)
              .join(" — ")}
          />
          <Field
            label="Registration"
            value={
              event.registration_state === "open"
                ? event.registration_closes_at
                  ? `Open until ${new Date(event.registration_closes_at).toLocaleString()}`
                  : "Open until the event ends"
                : REGISTRATION_CLOSED_TEXT[event.registration_state]
            }
          />
          <Field label="Created by" value={event.created_by_name} />
          {event.description && (
            <div className="sm:col-span-2">
              <Field label="Description" value={event.description} />
            </div>
          )}
        </CardContent>
      </Card>

      {canRegister && event.status === "published" && (
        <Card>
          <CardContent className="flex items-center justify-between gap-3">
            {myRegistration && myRegistration.status === "registered" ? (
              <>
                <p className="text-sm text-[var(--color-text)]">You're registered for this event.</p>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCancelMyRegistration}
                  isLoading={cancelRegistration.isPending}
                >
                  Cancel my registration
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-[var(--color-text)]">
                  {!event.registration_open
                    ? REGISTRATION_CLOSED_TEXT[event.registration_state]
                    : isFull
                      ? "This event is full."
                      : "Save your spot for this event."}
                </p>
                <Button
                  size="sm"
                  onClick={handleRegister}
                  isLoading={registerForEvent.isPending}
                  disabled={isFull || !event.registration_open}
                >
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                  Register
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {canUpdate && (
        <Card>
          <CardHeader>
            <CardTitle>Attendees</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoadingAttendees ? (
              <div className="flex justify-center py-6">
                <Spinner />
              </div>
            ) : attendees && attendees.length === 0 ? (
              <EmptyState icon={Calendar} title="No registrations yet" />
            ) : (
              <TableContainer className="border-0">
                <Table>
                  <TableHead>
                    <tr>
                      <TableHeaderCell>Name</TableHeaderCell>
                      <TableHeaderCell>Status</TableHeaderCell>
                      <TableHeaderCell>Registered</TableHeaderCell>
                    </tr>
                  </TableHead>
                  <TableBody>
                    {attendees?.map((row) => (
                      <tr key={row.id} className="border-b border-[var(--color-border)] last:border-0">
                        <TableCell className="font-medium">{row.user_name}</TableCell>
                        <TableCell className="capitalize">{row.status}</TableCell>
                        <TableCell>{new Date(row.registered_at).toLocaleString()}</TableCell>
                      </tr>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Photos &amp; videos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {canUpdate && (
            <div className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-subtle)] p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Select label="Type" value={mediaType} onChange={(e) => setMediaType(e.target.value as EventMediaType)}>
                  <option value="photo">Photo</option>
                  <option value="video">Video</option>
                </Select>
                <Input
                  label="Caption (optional)"
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                />
              </div>
              <input
                type="file"
                onChange={(e) => setMediaFile(e.target.files?.[0] ?? null)}
                className="text-sm text-[var(--color-text-muted)] file:mr-3 file:rounded-[var(--radius-md)] file:border-0 file:bg-[var(--color-surface)] file:px-3 file:py-1.5 file:text-sm file:text-[var(--color-text)]"
              />
              <div className="flex justify-end">
                <Button size="sm" onClick={handleUploadMedia} isLoading={createMedia.isPending} disabled={!mediaFile}>
                  <Upload className="size-4" aria-hidden="true" />
                  Upload
                </Button>
              </div>
            </div>
          )}

          {isLoadingMedia ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : media && media.length === 0 ? (
            <EmptyState icon={Images} title="No photos or videos yet" />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {media?.map((item) => (
                <div key={item.id} className="group relative overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)]">
                  {item.media_type === "video" ? (
                    // eslint-disable-next-line jsx-a11y/media-has-caption
                    <video src={item.file} controls className="aspect-square w-full object-cover" />
                  ) : (
                    <OpenFileButton url={item.file} title={item.caption || "Event photo"} className="block w-full cursor-zoom-in">
                      <img src={item.file} alt={item.caption || "Event photo"} className="aspect-square w-full object-cover" />
                    </OpenFileButton>
                  )}
                  {item.caption && (
                    <p className="truncate bg-black/50 p-1.5 text-xs text-white">{item.caption}</p>
                  )}
                  {canUpdate && (
                    <button
                      type="button"
                      onClick={() => handleDeleteMedia(item.id)}
                      aria-label="Delete"
                      className="absolute right-1.5 top-1.5 rounded-full bg-black/50 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[var(--color-danger)]"
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
