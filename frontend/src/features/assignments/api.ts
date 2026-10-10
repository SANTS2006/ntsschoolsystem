import { apiClient } from "@/lib/api-client";
import type { PaginatedResponse } from "@/types/pagination";

import type {
  Assignment,
  AssignmentListParams,
  AssignmentPayload,
  AssignmentSubmission,
  AssignmentSubmissionListParams,
  GradeSubmissionPayload,
} from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

/** A plain JSON body can't carry a File — switch to multipart/form-data only when a new
 * attachment was actually picked, so the common case (no attachment change) stays a cheap JSON
 * request, same pattern as Student.photo. */
function toRequestBody(values: AssignmentPayload): AssignmentPayload | FormData {
  if (!values.attachment) {
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

export async function fetchAssignments(
  params: PageParams & AssignmentListParams,
): Promise<PaginatedResponse<Assignment>> {
  const { data } = await apiClient.get<PaginatedResponse<Assignment>>("/assignments/", { params });
  return data;
}

export async function getAssignment(id: string): Promise<Assignment> {
  const { data } = await apiClient.get<Assignment>(`/assignments/${id}/`);
  return data;
}

export async function createAssignment(values: AssignmentPayload): Promise<Assignment> {
  const { data } = await apiClient.post<Assignment>("/assignments/", toRequestBody(values));
  return data;
}

export async function updateAssignment(id: string, values: AssignmentPayload): Promise<Assignment> {
  const { data } = await apiClient.patch<Assignment>(`/assignments/${id}/`, toRequestBody(values));
  return data;
}

export async function deleteAssignment(id: string): Promise<void> {
  await apiClient.delete(`/assignments/${id}/`);
}

export async function fetchSubmissions(
  params: PageParams & AssignmentSubmissionListParams,
): Promise<PaginatedResponse<AssignmentSubmission>> {
  const { data } = await apiClient.get<PaginatedResponse<AssignmentSubmission>>("/assignment-submissions/", {
    params,
  });
  return data;
}

export async function getSubmission(id: string): Promise<AssignmentSubmission> {
  const { data } = await apiClient.get<AssignmentSubmission>(`/assignment-submissions/${id}/`);
  return data;
}

export async function deleteSubmission(id: string): Promise<void> {
  await apiClient.delete(`/assignment-submissions/${id}/`);
}

/** `grade` is a custom action (calls `services.grade_submission()`), not a plain
 * `ModelViewSet.update()` — the response is enveloped as `{submission: {...}}`, verified against
 * `apps/assignments/views.py` directly (same shape as Library's loan actions). */
export async function gradeSubmission(
  id: string,
  values: GradeSubmissionPayload,
): Promise<AssignmentSubmission> {
  const { data } = await apiClient.post<{ submission: AssignmentSubmission }>(
    `/assignment-submissions/${id}/grade/`,
    values,
  );
  return data.submission;
}
