import { apiClient } from "@/lib/api-client";
import type { PaginatedResponse } from "@/types/pagination";

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

export async function fetchLiveSessions(
  params: PageParams & LiveSessionListParams,
): Promise<PaginatedResponse<LiveSession>> {
  const { data } = await apiClient.get<PaginatedResponse<LiveSession>>("/live-sessions/", { params });
  return data;
}

export async function getLiveSession(id: string): Promise<LiveSession> {
  const { data } = await apiClient.get<LiveSession>(`/live-sessions/${id}/`);
  return data;
}

export async function createLiveSession(values: LiveSessionPayload): Promise<LiveSession> {
  const { data } = await apiClient.post<LiveSession>("/live-sessions/", values);
  return data;
}

export async function deleteLiveSession(id: string): Promise<void> {
  await apiClient.delete(`/live-sessions/${id}/`);
}

/** `start`/`end` are custom actions, enveloped as `{session: {...}}` — same shape as every
 * other transition action in this codebase (Results' submit/review/approve/publish, Events'
 * publish/cancel). */
export async function startLiveSession(id: string): Promise<LiveSession> {
  const { data } = await apiClient.post<{ session: LiveSession }>(`/live-sessions/${id}/start/`);
  return data.session;
}

export async function endLiveSession(id: string): Promise<LiveSession> {
  const { data } = await apiClient.post<{ session: LiveSession }>(`/live-sessions/${id}/end/`);
  return data.session;
}

export async function fetchMyLiveSessions(): Promise<LiveSession[]> {
  const { data } = await apiClient.get<{ sessions: LiveSession[] }>("/my-live-sessions/");
  return data.sessions;
}

export async function remindLiveSession(id: string): Promise<void> {
  await apiClient.post(`/live-sessions/${id}/remind/`);
}

export async function fetchLiveSessionRecipients(session: string): Promise<PaginatedResponse<LiveSessionRecipient>> {
  const { data } = await apiClient.get<PaginatedResponse<LiveSessionRecipient>>("/live-session-recipients/", {
    params: { session, page_size: 200 },
  });
  return data;
}

export async function createLiveSessionRecipient(values: LiveSessionRecipientPayload): Promise<LiveSessionRecipient> {
  const { data } = await apiClient.post<LiveSessionRecipient>("/live-session-recipients/", values);
  return data;
}

export async function deleteLiveSessionRecipient(id: string): Promise<void> {
  await apiClient.delete(`/live-session-recipients/${id}/`);
}

/** What the schedule form may offer. For a teacher: only the (subject, class) combinations they are assigned to. */
export interface LiveSessionOptions {
  restricted: boolean;
  pairs: { subject: string; school_class: string }[];
}

export async function fetchLiveSessionOptions(): Promise<LiveSessionOptions> {
  const { data } = await apiClient.get<LiveSessionOptions>("/live-sessions/options/");
  return data;
}

