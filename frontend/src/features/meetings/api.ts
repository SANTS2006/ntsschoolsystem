import { apiClient } from "@/lib/api-client";
import type { PaginatedResponse } from "@/types/pagination";

import type {
  AudiencePreview,
  Meeting,
  MeetingAudience,
  MeetingCreatePayload,
  MeetingDetail,
  MeetingJoin,
  MeetingListParams,
} from "./types";

export async function fetchMeetings(params: MeetingListParams): Promise<PaginatedResponse<Meeting>> {
  const { data } = await apiClient.get<PaginatedResponse<Meeting>>("/meetings/", { params });
  return data;
}

export async function getMeeting(id: string): Promise<MeetingDetail> {
  const { data } = await apiClient.get<MeetingDetail>(`/meetings/${id}/`);
  return data;
}

export async function createMeeting(payload: MeetingCreatePayload): Promise<MeetingDetail> {
  const { data } = await apiClient.post<{ meeting: MeetingDetail }>("/meetings/", payload);
  return data.meeting;
}

export async function previewAudience(audience: MeetingAudience): Promise<AudiencePreview> {
  const { data } = await apiClient.post<AudiencePreview>("/meetings/preview/", audience);
  return data;
}

export async function meetingAction(id: string, action: "start" | "end" | "cancel" | "resend"): Promise<void> {
  await apiClient.post(`/meetings/${id}/${action}/`);
}

export async function fetchMyMeetings(): Promise<Meeting[]> {
  const { data } = await apiClient.get<{ meetings: Meeting[] }>("/meetings/my/");
  return data.meetings;
}

export async function fetchMeetingJoin(id: string): Promise<MeetingJoin> {
  const { data } = await apiClient.get<MeetingJoin>(`/meetings/${id}/join/`);
  return data;
}
