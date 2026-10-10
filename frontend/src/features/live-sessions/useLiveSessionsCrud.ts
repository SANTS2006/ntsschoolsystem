import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import {
  createLiveSession,
  createLiveSessionRecipient,
  deleteLiveSession,
  deleteLiveSessionRecipient,
  endLiveSession,
  fetchLiveSessionOptions,
  fetchLiveSessionRecipients,
  fetchLiveSessions,
  fetchMyLiveSessions,
  getLiveSession,
  remindLiveSession,
  startLiveSession,
} from "./api";
import type {
  LiveSession,
  LiveSessionListParams,
  LiveSessionPayload,
  LiveSessionRecipient,
  LiveSessionRecipientPayload,
} from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

const SESSIONS_KEY = ["live-sessions", "sessions"] as const;
const MY_SESSIONS_KEY = ["live-sessions", "my-sessions"] as const;
const RECIPIENTS_KEY = ["live-sessions", "recipients"] as const;

export function useLiveSessionList(params: PageParams & LiveSessionListParams) {
  return useQuery({
    queryKey: [...SESSIONS_KEY, "list", params],
    queryFn: () => fetchLiveSessions(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useLiveSession(id: string | undefined) {
  return useQuery<LiveSession, ApiError>({
    queryKey: [...SESSIONS_KEY, "detail", id],
    queryFn: () => getLiveSession(id as string),
    enabled: !!id,
    // A live session's room URL only appears after `start` — keep polling while it might still
    // be starting, so the room page doesn't need a manual refresh.
    refetchInterval: (query) => (query.state.data?.status === "scheduled" ? 3000 : false),
  });
}

export function useCreateLiveSession() {
  const queryClient = useQueryClient();
  return useMutation<LiveSession, ApiError, LiveSessionPayload>({
    mutationFn: createLiveSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });
}

export function useDeleteLiveSession() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteLiveSession,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: SESSIONS_KEY }),
  });
}

function useTransition(mutationFn: (id: string) => Promise<LiveSession>) {
  const queryClient = useQueryClient();
  return useMutation<LiveSession, ApiError, string>({
    mutationFn,
    onSuccess: (session) => {
      queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
      queryClient.setQueryData([...SESSIONS_KEY, "detail", session.id], session);
    },
  });
}

export const useStartLiveSession = () => useTransition(startLiveSession);
export const useEndLiveSession = () => useTransition(endLiveSession);

export function useMyLiveSessions() {
  return useQuery<LiveSession[], ApiError>({
    queryKey: MY_SESSIONS_KEY,
    queryFn: fetchMyLiveSessions,
    refetchInterval: 15000,
  });
}

export function useRemindLiveSession() {
  return useMutation<void, ApiError, string>({
    mutationFn: remindLiveSession,
  });
}

export function useLiveSessionRecipientList(session: string | undefined) {
  return useQuery<LiveSessionRecipient[], ApiError>({
    queryKey: [...RECIPIENTS_KEY, session],
    queryFn: async () => (await fetchLiveSessionRecipients(session as string)).results,
    enabled: !!session,
  });
}

export function useCreateLiveSessionRecipient() {
  const queryClient = useQueryClient();
  return useMutation<LiveSessionRecipient, ApiError, LiveSessionRecipientPayload>({
    mutationFn: createLiveSessionRecipient,
    onSuccess: (recipient) => queryClient.invalidateQueries({ queryKey: [...RECIPIENTS_KEY, recipient.session] }),
  });
}

export function useDeleteLiveSessionRecipient() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { id: string; session: string }>({
    mutationFn: ({ id }) => deleteLiveSessionRecipient(id),
    onSuccess: (_data, { session }) => queryClient.invalidateQueries({ queryKey: [...RECIPIENTS_KEY, session] }),
  });
}

export function useLiveSessionOptions() {
  return useQuery({ queryKey: ["live-sessions", "options"], queryFn: fetchLiveSessionOptions, staleTime: 60_000 });
}
