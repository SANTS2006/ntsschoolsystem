import { apiClient } from "@/lib/api-client";
import type { PaginatedResponse } from "@/types/pagination";

import type { InvitePlatformAdminPayload, PlatformAdmin, PlatformAdminListParams, PlatformStats } from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

export async function fetchPlatformAdmins(
  params: PageParams & PlatformAdminListParams,
): Promise<PaginatedResponse<PlatformAdmin>> {
  const { data } = await apiClient.get<PaginatedResponse<PlatformAdmin>>("/platform/admins/", { params });
  return data;
}

export async function invitePlatformAdmin(values: InvitePlatformAdminPayload): Promise<PlatformAdmin> {
  const { data } = await apiClient.post<{ admin: PlatformAdmin }>("/platform/admins/invite/", values);
  return data.admin;
}

export async function disablePlatformAdmin(id: string): Promise<PlatformAdmin> {
  const { data } = await apiClient.post<{ admin: PlatformAdmin }>(`/platform/admins/${id}/disable/`);
  return data.admin;
}

export async function deletePlatformAdmin(id: string): Promise<void> {
  await apiClient.delete(`/platform/admins/${id}/`);
}

export async function enablePlatformAdmin(id: string): Promise<PlatformAdmin> {
  const { data } = await apiClient.post<{ admin: PlatformAdmin }>(`/platform/admins/${id}/enable/`);
  return data.admin;
}

export async function fetchPlatformStats(): Promise<PlatformStats> {
  const { data } = await apiClient.get<{ stats: PlatformStats }>("/platform/stats/");
  return data.stats;
}
