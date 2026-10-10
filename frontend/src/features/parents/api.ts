import { apiClient } from "@/lib/api-client";
import type { PaginatedResponse } from "@/types/pagination";

import type { Guardian, GuardianListParams, GuardianPayload } from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

export async function fetchGuardians(params: PageParams & GuardianListParams): Promise<PaginatedResponse<Guardian>> {
  const { data } = await apiClient.get<PaginatedResponse<Guardian>>("/parents/", { params });
  return data;
}

export async function getGuardian(id: string): Promise<Guardian> {
  const { data } = await apiClient.get<Guardian>(`/parents/${id}/`);
  return data;
}

/** A plain JSON body can't carry a File — switch to multipart/form-data only when a new
 * photo was actually picked, so the common case (no photo change) stays a cheap JSON request. */
function toRequestBody(values: GuardianPayload): GuardianPayload | FormData {
  if (!values.photo) {
    return values;
  }
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      formData.append(key, value);
    }
  }
  return formData;
}

export async function createGuardian(values: GuardianPayload): Promise<Guardian> {
  const { data } = await apiClient.post<Guardian>("/parents/", toRequestBody(values));
  return data;
}

export async function updateGuardian(id: string, values: GuardianPayload): Promise<Guardian> {
  const { data } = await apiClient.patch<Guardian>(`/parents/${id}/`, toRequestBody(values));
  return data;
}

export async function deleteGuardian(id: string): Promise<void> {
  await apiClient.delete(`/parents/${id}/`);
}

/** Resets the linked account's password back to the school's default (initials + creation
 * year) — 400s if this guardian has no login account at all, which most don't. */
export async function resetGuardianPassword(id: string): Promise<string> {
  const { data } = await apiClient.post<{ default_password: string }>(`/parents/${id}/reset-password/`);
  return data.default_password;
}
