import { apiClient } from "@/lib/api-client";
import type { PaginatedResponse } from "@/types/pagination";

import type {
  School,
  SchoolBranding,
  SchoolCreatePayload,
  SchoolListParams,
  SchoolSelfUpdatePayload,
  SchoolUpdatePayload,
} from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

export async function fetchSchools(params: PageParams & SchoolListParams): Promise<PaginatedResponse<School>> {
  const { data } = await apiClient.get<PaginatedResponse<School>>("/schools/", { params });
  return data;
}

export async function getSchool(id: string): Promise<School> {
  const { data } = await apiClient.get<School>(`/schools/${id}/`);
  return data;
}

/** A plain JSON body can't carry a File — switch to multipart/form-data only when a new
 * logo was actually picked, so the common case (no logo change) stays a cheap JSON request. */
function toRequestBody<T extends { logo?: File }>(values: T): T | FormData {
  if (!values.logo) {
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

export async function createSchool(values: SchoolCreatePayload): Promise<School> {
  const { data } = await apiClient.post<{ school: School }>("/schools/", toRequestBody(values));
  return data.school;
}

export async function updateSchool(id: string, values: SchoolUpdatePayload): Promise<School> {
  const { data } = await apiClient.patch<School>(`/schools/${id}/`, toRequestBody(values));
  return data;
}

export async function activateSchool(id: string): Promise<School> {
  const { data } = await apiClient.post<{ school: School }>(`/schools/${id}/activate/`);
  return data.school;
}

export async function suspendSchool(id: string, reason: string): Promise<School> {
  const { data } = await apiClient.post<{ school: School }>(`/schools/${id}/suspend/`, { reason });
  return data.school;
}

export async function fetchMySchool(): Promise<School> {
  const { data } = await apiClient.get<{ school: School }>("/schools/me/");
  return data.school;
}

export async function updateMySchool(values: SchoolSelfUpdatePayload): Promise<School> {
  const { data } = await apiClient.patch<{ school: School }>("/schools/me/", toRequestBody(values));
  return data.school;
}

/** Public, unauthenticated — used by the per-school branded login page. */
export async function fetchSchoolBranding(slug: string): Promise<SchoolBranding> {
  const { data } = await apiClient.get<{ school: SchoolBranding }>(`/schools/branding/${slug}/`);
  return data.school;
}

/** Public, unauthenticated — used by the generic login page's "find your school" search. */
export async function searchSchools(query: string): Promise<SchoolBranding[]> {
  const { data } = await apiClient.get<{ schools: SchoolBranding[] }>("/schools/search/", { params: { q: query } });
  return data.schools;
}

export async function deleteSchool(id: string, confirm: string): Promise<void> {
  await apiClient.delete(`/schools/${id}/`, { data: { confirm } });
}
