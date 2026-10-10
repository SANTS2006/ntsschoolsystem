import { apiClient } from "@/lib/api-client";
import { toFormData } from "@/lib/formData";
import type { PaginatedResponse } from "@/types/pagination";

import type {
  Announcement,
  AnnouncementListParams,
  AnnouncementPayload,
  AnnouncementRecipient,
  AnnouncementRecipientListParams,
  AnnouncementRecipientPayload,
} from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

export async function fetchAnnouncements(
  params: PageParams & AnnouncementListParams,
): Promise<PaginatedResponse<Announcement>> {
  const { data } = await apiClient.get<PaginatedResponse<Announcement>>("/communications/announcements/", {
    params,
  });
  return data;
}

export async function getAnnouncement(id: string): Promise<Announcement> {
  const { data } = await apiClient.get<Announcement>(`/communications/announcements/${id}/`);
  return data;
}

export async function createAnnouncement(values: AnnouncementPayload): Promise<Announcement> {
  const { data } = await apiClient.post<Announcement>("/communications/announcements/", toFormData(values));
  return data;
}

export async function updateAnnouncement(id: string, values: AnnouncementPayload): Promise<Announcement> {
  const { data } = await apiClient.patch<Announcement>(`/communications/announcements/${id}/`, toFormData(values));
  return data;
}

export async function deleteAnnouncement(id: string): Promise<void> {
  await apiClient.delete(`/communications/announcements/${id}/`);
}

/** `publish` is a custom action, not a plain `ModelViewSet.create()`-style endpoint — the
 * response is enveloped as `{announcement: {...}}` (singular, verified against
 * `apps/communications/views.py` directly), and `message` carries the recipient count
 * ("Published to N recipient(s)."). */
export async function publishAnnouncement(id: string): Promise<{ announcement: Announcement; message: string }> {
  const { data } = await apiClient.post<{ announcement: Announcement; message: string }>(
    `/communications/announcements/${id}/publish/`,
  );
  return data;
}

export async function fetchRecipients(
  params: PageParams & AnnouncementRecipientListParams,
): Promise<PaginatedResponse<AnnouncementRecipient>> {
  const { data } = await apiClient.get<PaginatedResponse<AnnouncementRecipient>>(
    "/communications/announcement-recipients/",
    { params },
  );
  return data;
}

export async function createRecipient(values: AnnouncementRecipientPayload): Promise<AnnouncementRecipient> {
  const { data } = await apiClient.post<AnnouncementRecipient>("/communications/announcement-recipients/", values);
  return data;
}

export async function deleteRecipient(id: string): Promise<void> {
  await apiClient.delete(`/communications/announcement-recipients/${id}/`);
}
