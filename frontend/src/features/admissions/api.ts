import { apiClient } from "@/lib/api-client";
import type { PaginatedResponse } from "@/types/pagination";

import type {
  Application,
  FormConfig,
  FormConfigPayload,
  FormConfigResponse,
  ApplicationListParams,
  BulkAcceptResult,
  InviteInterviewPayload,
  PublicApplicationOptions,
  PublicApplicationPayload,
} from "./types";

export async function fetchApplications(params: ApplicationListParams): Promise<PaginatedResponse<Application>> {
  const { data } = await apiClient.get<PaginatedResponse<Application>>("/admissions/applications/", { params });
  return data;
}

export async function getApplication(id: string): Promise<Application> {
  const { data } = await apiClient.get<Application>(`/admissions/applications/${id}/`);
  return data;
}

export async function deleteApplication(id: string): Promise<void> {
  await apiClient.delete(`/admissions/applications/${id}/`);
}

export async function bulkShortlistApplications(applicationIds: string[]): Promise<{ updated: number }> {
  const { data } = await apiClient.post<{ updated: number }>("/admissions/applications/bulk-shortlist/", {
    application_ids: applicationIds,
  });
  return data;
}

export async function inviteApplicationsToInterview(
  payload: InviteInterviewPayload,
): Promise<{ updated: number }> {
  const { data } = await apiClient.post<{ updated: number }>(
    "/admissions/applications/invite-interview/",
    payload,
  );
  return data;
}

/** `numbers` maps application id -> the admission number (student) or staff number (staff) entered. */
export async function bulkAcceptApplications(
  applicationIds: string[],
  numbers: Record<string, string>,
): Promise<BulkAcceptResult> {
  const { data } = await apiClient.post<BulkAcceptResult>("/admissions/applications/bulk-accept/", {
    application_ids: applicationIds,
    numbers,
  });
  return data;
}

export async function bulkRejectApplications(
  applicationIds: string[],
  reason?: string,
): Promise<{ updated: number }> {
  const { data } = await apiClient.post<{ updated: number }>("/admissions/applications/bulk-reject/", {
    application_ids: applicationIds,
    reason,
  });
  return data;
}

export async function fetchPublicApplicationOptions(schoolSlug: string): Promise<PublicApplicationOptions> {
  const { data } = await apiClient.get<PublicApplicationOptions>(`/admissions/apply/${schoolSlug}/options/`);
  return data;
}

export async function submitPublicApplication(
  schoolSlug: string,
  values: PublicApplicationPayload,
  onProgress?: (percent: number) => void,
): Promise<{ application_id: string }> {
  const formData = new FormData();
  const { documents, custom_files: customFiles, ...fields } = values;
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === "") continue;
    // The school's extra-question answers are an object — sent as a JSON string the server parses.
    formData.append(key, key === "custom_answers" ? JSON.stringify(value) : String(value));
  }
  for (const file of documents ?? []) {
    formData.append("documents", file);
  }
  for (const [key, files] of Object.entries(customFiles ?? {})) {
    for (const file of files) formData.append(`file_${key}`, file);
  }
  const { data } = await apiClient.post<{ application_id: string }>(
    `/admissions/apply/${schoolSlug}/`,
    formData,
    {
      onUploadProgress: (event) => {
        if (onProgress && event.total) {
          onProgress(Math.round((event.loaded / event.total) * 100));
        }
      },
    },
  );
  return data;
}

export async function fetchFormConfig(): Promise<FormConfigResponse> {
  const { data } = await apiClient.get<FormConfigResponse>("/admissions/form-config/");
  return data;
}

export async function saveFormConfig(kind: "student" | "staff", payload: FormConfigPayload): Promise<FormConfig> {
  const { data } = await apiClient.put<{ config: FormConfig }>(`/admissions/form-config/${kind}/`, payload);
  return data.config;
}
