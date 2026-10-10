import { apiClient } from "@/lib/api-client";
import type { PaginatedResponse } from "@/types/pagination";

import type {
  MedicalProfile,
  MedicalProfileListParams,
  MedicalProfilePayload,
  MedicalVisit,
  MedicalVisitListParams,
  MedicalVisitPayload,
  MyMedical,
} from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

export async function fetchProfiles(
  params: PageParams & MedicalProfileListParams,
): Promise<PaginatedResponse<MedicalProfile>> {
  const { data } = await apiClient.get<PaginatedResponse<MedicalProfile>>("/medical/profiles/", { params });
  return data;
}

export async function getProfile(id: string): Promise<MedicalProfile> {
  const { data } = await apiClient.get<MedicalProfile>(`/medical/profiles/${id}/`);
  return data;
}

export async function createProfile(values: MedicalProfilePayload): Promise<MedicalProfile> {
  const { data } = await apiClient.post<MedicalProfile>("/medical/profiles/", values);
  return data;
}

export async function updateProfile(id: string, values: MedicalProfilePayload): Promise<MedicalProfile> {
  const { data } = await apiClient.patch<MedicalProfile>(`/medical/profiles/${id}/`, values);
  return data;
}

export async function deleteProfile(id: string): Promise<void> {
  await apiClient.delete(`/medical/profiles/${id}/`);
}

export async function fetchVisits(
  params: PageParams & MedicalVisitListParams,
): Promise<PaginatedResponse<MedicalVisit>> {
  const { data } = await apiClient.get<PaginatedResponse<MedicalVisit>>("/medical/visits/", { params });
  return data;
}

export async function getVisit(id: string): Promise<MedicalVisit> {
  const { data } = await apiClient.get<MedicalVisit>(`/medical/visits/${id}/`);
  return data;
}

export async function createVisit(values: MedicalVisitPayload): Promise<MedicalVisit> {
  const { data } = await apiClient.post<MedicalVisit>("/medical/visits/", values);
  return data;
}

export async function updateVisit(id: string, values: MedicalVisitPayload): Promise<MedicalVisit> {
  const { data } = await apiClient.patch<MedicalVisit>(`/medical/visits/${id}/`, values);
  return data;
}

export async function deleteVisit(id: string): Promise<void> {
  await apiClient.delete(`/medical/visits/${id}/`);
}

export async function fetchMyMedical(): Promise<MyMedical> {
  const { data } = await apiClient.get<{ profile: MedicalProfile | null; visits: MedicalVisit[] }>(
    "/medical/my-medical/",
  );
  return { profile: data.profile, visits: data.visits };
}
