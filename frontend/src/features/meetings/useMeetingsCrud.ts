import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import {
  createMeeting,
  fetchMeetingJoin,
  fetchMeetings,
  fetchMyMeetings,
  getMeeting,
  meetingAction,
  previewAudience,
} from "./api";
import type {
  AudiencePreview,
  Meeting,
  MeetingAudience,
  MeetingCreatePayload,
  MeetingDetail,
  MeetingJoin,
  MeetingListParams,
} from "./types";

// Also prefix-matches useSummaryStats's [resource, "summary", params] key for "meetings".
const MEETINGS_KEY = ["meetings"] as const;

export function useMeetingList(params: MeetingListParams) {
  return useQuery({
    queryKey: [...MEETINGS_KEY, "list", params],
    queryFn: () => fetchMeetings(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useMeeting(id: string | undefined) {
  return useQuery<MeetingDetail, ApiError>({
    queryKey: [...MEETINGS_KEY, "detail", id],
    queryFn: () => getMeeting(id as string),
    enabled: !!id,
    // Invitation emails go out in the background — keep the delivery column fresh while any are pending.
    refetchInterval: (query) => (query.state.data?.invitee_counts.pending ? 4000 : false),
  });
}

export function useMyMeetings() {
  return useQuery<Meeting[], ApiError>({ queryKey: [...MEETINGS_KEY, "mine"], queryFn: fetchMyMeetings });
}

export function useMeetingJoin(id: string | undefined) {
  return useQuery<MeetingJoin, ApiError>({
    queryKey: [...MEETINGS_KEY, "join", id],
    queryFn: () => fetchMeetingJoin(id as string),
    enabled: !!id,
  });
}

export function useAudiencePreview(audience: MeetingAudience, enabled: boolean) {
  return useQuery<AudiencePreview, ApiError>({
    queryKey: [...MEETINGS_KEY, "preview", audience],
    queryFn: () => previewAudience(audience),
    enabled,
    placeholderData: (previousData) => previousData,
  });
}

export function useCreateMeeting() {
  const queryClient = useQueryClient();
  return useMutation<MeetingDetail, ApiError, MeetingCreatePayload>({
    mutationFn: createMeeting,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MEETINGS_KEY }),
  });
}

export function useMeetingAction() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { id: string; action: "start" | "end" | "cancel" | "resend" }>({
    mutationFn: ({ id, action }) => meetingAction(id, action),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MEETINGS_KEY }),
  });
}
