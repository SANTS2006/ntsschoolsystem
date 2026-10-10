import { apiClient } from "@/lib/api-client";
import type { PaginatedResponse } from "@/types/pagination";

import type { RecordListParams, RecordPayload, SchoolRecord } from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

/** A plain JSON body can't carry a File — switch to multipart/form-data only when a new file
 * was actually picked, same pattern as Document.file and Student.photo. */
function toRequestBody(values: RecordPayload): RecordPayload | FormData {
  if (!values.file) {
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

export async function fetchRecords(
  params: PageParams & RecordListParams,
): Promise<PaginatedResponse<SchoolRecord>> {
  const { data } = await apiClient.get<PaginatedResponse<SchoolRecord>>("/records/", { params });
  return data;
}

export async function getRecord(id: string): Promise<SchoolRecord> {
  const { data } = await apiClient.get<SchoolRecord>(`/records/${id}/`);
  return data;
}

export async function createRecord(values: RecordPayload): Promise<SchoolRecord> {
  const { data } = await apiClient.post<SchoolRecord>("/records/", toRequestBody(values));
  return data;
}

export async function updateRecord(id: string, values: RecordPayload): Promise<SchoolRecord> {
  const { data } = await apiClient.patch<SchoolRecord>(`/records/${id}/`, toRequestBody(values));
  return data;
}

export async function deleteRecord(id: string): Promise<void> {
  await apiClient.delete(`/records/${id}/`);
}
