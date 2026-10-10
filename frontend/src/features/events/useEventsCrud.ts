import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import {
  cancelEvent,
  cancelEventRegistration,
  createEvent,
  createEventMedia,
  createEventRecipient,
  deleteEvent,
  deleteEventMedia,
  deleteEventRecipient,
  fetchAttendees,
  fetchEventMedia,
  fetchEventRecipients,
  fetchEvents,
  getEvent,
  publishEvent,
  registerForEvent,
  updateEvent,
} from "./api";
import type {
  Event,
  EventListParams,
  EventMedia,
  EventMediaPayload,
  EventPayload,
  EventRecipient,
  EventRecipientListParams,
  EventRecipientPayload,
  EventRegistrationStatus,
} from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

const EVENTS_KEY = ["events", "records"] as const;
const RECIPIENTS_KEY = ["events", "recipients"] as const;
const MEDIA_KEY = ["events", "media"] as const;

export function useEventList(params: PageParams & EventListParams) {
  return useQuery({
    queryKey: [...EVENTS_KEY, "list", params],
    queryFn: () => fetchEvents(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useEvent(id: string | undefined) {
  return useQuery<Event, ApiError>({
    queryKey: [...EVENTS_KEY, "detail", id],
    queryFn: () => getEvent(id as string),
    enabled: !!id,
  });
}

export function useCreateEvent() {
  const queryClient = useQueryClient();
  return useMutation<Event, ApiError, EventPayload>({
    mutationFn: createEvent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: EVENTS_KEY }),
  });
}

export function useUpdateEvent(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Event, ApiError, EventPayload>({
    mutationFn: (values) => updateEvent(id, values),
    onSuccess: (event) => {
      queryClient.invalidateQueries({ queryKey: EVENTS_KEY });
      queryClient.setQueryData([...EVENTS_KEY, "detail", id], event);
    },
  });
}

export function useDeleteEvent() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteEvent,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: EVENTS_KEY }),
  });
}

function invalidateEvent(queryClient: ReturnType<typeof useQueryClient>, id: string) {
  queryClient.invalidateQueries({ queryKey: EVENTS_KEY });
  queryClient.invalidateQueries({ queryKey: [...EVENTS_KEY, "detail", id] });
}

export function usePublishEvent() {
  const queryClient = useQueryClient();
  return useMutation<{ event: Event; message: string }, ApiError, string>({
    mutationFn: publishEvent,
    onSuccess: (_data, id) => invalidateEvent(queryClient, id),
  });
}

export function useCancelEvent() {
  const queryClient = useQueryClient();
  return useMutation<Event, ApiError, string>({
    mutationFn: cancelEvent,
    onSuccess: (_data, id) => invalidateEvent(queryClient, id),
  });
}

export function useAttendees(id: string | undefined, options?: { enabled?: boolean }) {
  return useQuery<EventRegistrationStatus[], ApiError>({
    queryKey: [...EVENTS_KEY, "attendees", id],
    queryFn: () => fetchAttendees(id as string),
    enabled: !!id && (options?.enabled ?? true),
  });
}

export function useRegisterForEvent() {
  const queryClient = useQueryClient();
  return useMutation<EventRegistrationStatus, ApiError, string>({
    mutationFn: registerForEvent,
    onSuccess: (_data, id) => invalidateEvent(queryClient, id),
  });
}

export function useCancelEventRegistration() {
  const queryClient = useQueryClient();
  return useMutation<EventRegistrationStatus, ApiError, string>({
    mutationFn: cancelEventRegistration,
    onSuccess: (_data, id) => invalidateEvent(queryClient, id),
  });
}

export function useEventRecipientList(params: PageParams & EventRecipientListParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...RECIPIENTS_KEY, "list", params],
    queryFn: () => fetchEventRecipients(params),
    enabled: options?.enabled,
    placeholderData: (previousData) => previousData,
  });
}

export function useCreateEventRecipient() {
  const queryClient = useQueryClient();
  return useMutation<EventRecipient, ApiError, EventRecipientPayload>({
    mutationFn: createEventRecipient,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RECIPIENTS_KEY }),
  });
}

export function useDeleteEventRecipient() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteEventRecipient,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RECIPIENTS_KEY }),
  });
}

export function useEventMedia(event: string | undefined) {
  return useQuery<EventMedia[], ApiError>({
    queryKey: [...MEDIA_KEY, event],
    queryFn: () => fetchEventMedia(event as string),
    enabled: !!event,
  });
}

export function useCreateEventMedia() {
  const queryClient = useQueryClient();
  return useMutation<EventMedia, ApiError, EventMediaPayload>({
    mutationFn: createEventMedia,
    onSuccess: (media) => queryClient.invalidateQueries({ queryKey: [...MEDIA_KEY, media.event] }),
  });
}

export function useDeleteEventMedia() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { id: string; event: string }>({
    mutationFn: ({ id }) => deleteEventMedia(id),
    onSuccess: (_data, { event }) => queryClient.invalidateQueries({ queryKey: [...MEDIA_KEY, event] }),
  });
}
