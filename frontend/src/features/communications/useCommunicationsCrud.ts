import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import {
  createAnnouncement,
  createRecipient,
  deleteAnnouncement,
  deleteRecipient,
  fetchAnnouncements,
  fetchRecipients,
  getAnnouncement,
  publishAnnouncement,
  updateAnnouncement,
} from "./api";
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

const ANNOUNCEMENTS_KEY = ["communications", "announcements"] as const;
const RECIPIENTS_KEY = ["communications", "recipients"] as const;

export function useAnnouncementList(params: PageParams & AnnouncementListParams) {
  return useQuery({
    queryKey: [...ANNOUNCEMENTS_KEY, "list", params],
    queryFn: () => fetchAnnouncements(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useAnnouncement(id: string | undefined) {
  return useQuery<Announcement, ApiError>({
    queryKey: [...ANNOUNCEMENTS_KEY, "detail", id],
    queryFn: () => getAnnouncement(id as string),
    enabled: !!id,
  });
}

export function useCreateAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation<Announcement, ApiError, AnnouncementPayload>({
    mutationFn: createAnnouncement,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ANNOUNCEMENTS_KEY }),
  });
}

export function useUpdateAnnouncement(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Announcement, ApiError, AnnouncementPayload>({
    mutationFn: (values) => updateAnnouncement(id, values),
    onSuccess: (announcement) => {
      queryClient.invalidateQueries({ queryKey: ANNOUNCEMENTS_KEY });
      queryClient.setQueryData([...ANNOUNCEMENTS_KEY, "detail", id], announcement);
    },
  });
}

export function useDeleteAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteAnnouncement,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ANNOUNCEMENTS_KEY }),
  });
}

export function usePublishAnnouncement() {
  const queryClient = useQueryClient();
  return useMutation<{ announcement: Announcement; message: string }, ApiError, string>({
    mutationFn: publishAnnouncement,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ANNOUNCEMENTS_KEY }),
  });
}

export function useRecipientList(params: PageParams & AnnouncementRecipientListParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...RECIPIENTS_KEY, "list", params],
    queryFn: () => fetchRecipients(params),
    enabled: options?.enabled,
    placeholderData: (previousData) => previousData,
  });
}

export function useCreateRecipient() {
  const queryClient = useQueryClient();
  return useMutation<AnnouncementRecipient, ApiError, AnnouncementRecipientPayload>({
    mutationFn: createRecipient,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RECIPIENTS_KEY }),
  });
}

export function useDeleteRecipient() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteRecipient,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: RECIPIENTS_KEY }),
  });
}
