import { apiClient } from "@/lib/api-client";
import type { PaginatedResponse } from "@/types/pagination";

import type { DisciplineIncident, DisciplineIncidentListParams, DisciplineIncidentPayload } from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

export async function fetchIncidents(
  params: PageParams & DisciplineIncidentListParams,
): Promise<PaginatedResponse<DisciplineIncident>> {
  const { data } = await apiClient.get<PaginatedResponse<DisciplineIncident>>("/discipline/incidents/", { params });
  return data;
}

export async function getIncident(id: string): Promise<DisciplineIncident> {
  const { data } = await apiClient.get<DisciplineIncident>(`/discipline/incidents/${id}/`);
  return data;
}

export async function createIncident(values: DisciplineIncidentPayload): Promise<DisciplineIncident> {
  const { data } = await apiClient.post<DisciplineIncident>("/discipline/incidents/", values);
  return data;
}

export async function updateIncident(id: string, values: DisciplineIncidentPayload): Promise<DisciplineIncident> {
  const { data } = await apiClient.patch<DisciplineIncident>(`/discipline/incidents/${id}/`, values);
  return data;
}

export async function deleteIncident(id: string): Promise<void> {
  await apiClient.delete(`/discipline/incidents/${id}/`);
}

export async function fetchMyDiscipline(): Promise<DisciplineIncident[]> {
  const { data } = await apiClient.get<{ incidents: DisciplineIncident[] }>("/discipline/my-discipline/");
  return data.incidents;
}
