import { apiClient } from "@/lib/api-client";
import { toFormData } from "@/lib/formData";
import type { PaginatedResponse } from "@/types/pagination";

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

export async function fetchEvents(params: PageParams & EventListParams): Promise<PaginatedResponse<Event>> {
  const { data } = await apiClient.get<PaginatedResponse<Event>>("/events/", { params });
  return data;
}

export async function getEvent(id: string): Promise<Event> {
  const { data } = await apiClient.get<Event>(`/events/${id}/`);
  return data;
}

export async function createEvent(values: EventPayload): Promise<Event> {
  const { data } = await apiClient.post<Event>("/events/", toFormData(values));
  return data;
}

export async function updateEvent(id: string, values: EventPayload): Promise<Event> {
  const { data } = await apiClient.patch<Event>(`/events/${id}/`, toFormData(values));
  return data;
}

export async function deleteEvent(id: string): Promise<void> {
  await apiClient.delete(`/events/${id}/`);
}

export async function publishEvent(id: string): Promise<{ event: Event; message: string }> {
  const { data } = await apiClient.post<{ event: Event; message: string }>(`/events/${id}/publish/`);
  return data;
}

export async function cancelEvent(id: string): Promise<Event> {
  const { data } = await apiClient.post<{ event: Event }>(`/events/${id}/cancel/`);
  return data.event;
}

export async function fetchAttendees(id: string): Promise<EventRegistrationStatus[]> {
  const { data } = await apiClient.get<{ attendees: EventRegistrationStatus[] }>(`/events/${id}/attendees/`);
  return data.attendees;
}

export async function registerForEvent(id: string): Promise<EventRegistrationStatus> {
  const { data } = await apiClient.post<{ registration: EventRegistrationStatus }>(`/events/${id}/register/`);
  return data.registration;
}

export async function cancelEventRegistration(id: string): Promise<EventRegistrationStatus> {
  const { data } = await apiClient.post<{ registration: EventRegistrationStatus }>(
    `/events/${id}/cancel-registration/`,
  );
  return data.registration;
}

export async function fetchEventRecipients(
  params: PageParams & EventRecipientListParams,
): Promise<PaginatedResponse<EventRecipient>> {
  const { data } = await apiClient.get<PaginatedResponse<EventRecipient>>("/event-recipients/", { params });
  return data;
}

export async function createEventRecipient(values: EventRecipientPayload): Promise<EventRecipient> {
  const { data } = await apiClient.post<EventRecipient>("/event-recipients/", values);
  return data;
}

export async function deleteEventRecipient(id: string): Promise<void> {
  await apiClient.delete(`/event-recipients/${id}/`);
}

export async function fetchEventMedia(event: string): Promise<EventMedia[]> {
  const { data } = await apiClient.get<PaginatedResponse<EventMedia>>("/event-media/", {
    params: { event, page_size: 100 },
  });
  return data.results;
}

/** Always multipart — event media is never created without a file. */
export async function createEventMedia(values: EventMediaPayload): Promise<EventMedia> {
  const formData = new FormData();
  formData.append("event", values.event);
  formData.append("media_type", values.media_type);
  if (values.caption) formData.append("caption", values.caption);
  formData.append("file", values.file);
  const { data } = await apiClient.post<EventMedia>("/event-media/", formData);
  return data;
}

export async function deleteEventMedia(id: string): Promise<void> {
  await apiClient.delete(`/event-media/${id}/`);
}
