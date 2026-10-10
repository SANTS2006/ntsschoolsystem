import { apiClient } from "@/lib/api-client";
import type { PaginatedResponse } from "@/types/pagination";

import type {
  Document,
  DocumentCategory,
  DocumentCategoryListParams,
  DocumentCategoryPayload,
  DocumentListParams,
  DocumentPayload,
} from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

export async function fetchCategories(
  params: PageParams & DocumentCategoryListParams,
): Promise<PaginatedResponse<DocumentCategory>> {
  const { data } = await apiClient.get<PaginatedResponse<DocumentCategory>>("/document-categories/", { params });
  return data;
}

export async function getCategory(id: string): Promise<DocumentCategory> {
  const { data } = await apiClient.get<DocumentCategory>(`/document-categories/${id}/`);
  return data;
}

export async function createCategory(values: DocumentCategoryPayload): Promise<DocumentCategory> {
  const { data } = await apiClient.post<DocumentCategory>("/document-categories/", values);
  return data;
}

export async function updateCategory(id: string, values: DocumentCategoryPayload): Promise<DocumentCategory> {
  const { data } = await apiClient.patch<DocumentCategory>(`/document-categories/${id}/`, values);
  return data;
}

export async function deleteCategory(id: string): Promise<void> {
  await apiClient.delete(`/document-categories/${id}/`);
}

/** A plain JSON body can't carry a File — switch to multipart/form-data only when a new file
 * was actually picked, same pattern as Student.photo and Assignment.attachment. */
function toRequestBody(values: DocumentPayload): DocumentPayload | FormData {
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

export async function fetchDocuments(
  params: PageParams & DocumentListParams,
): Promise<PaginatedResponse<Document>> {
  const { data } = await apiClient.get<PaginatedResponse<Document>>("/documents/", { params });
  return data;
}

export async function getDocument(id: string): Promise<Document> {
  const { data } = await apiClient.get<Document>(`/documents/${id}/`);
  return data;
}

/** Reports 0–100 while a file is on its way up, so a slow upload shows progress instead of a dead spinner. */
function progressReporter(onProgress?: (percent: number) => void) {
  return {
    onUploadProgress: (event: { loaded: number; total?: number }) => {
      if (onProgress && event.total) onProgress(Math.round((event.loaded / event.total) * 100));
    },
    // A large file on a slow connection can take well over the default; give it room.
    timeout: 5 * 60 * 1000,
  };
}

export async function createDocument(values: DocumentPayload, onProgress?: (percent: number) => void): Promise<Document> {
  const { data } = await apiClient.post<Document>("/documents/", toRequestBody(values), progressReporter(onProgress));
  return data;
}

export async function updateDocument(
  id: string,
  values: DocumentPayload,
  onProgress?: (percent: number) => void,
): Promise<Document> {
  const { data } = await apiClient.patch<Document>(`/documents/${id}/`, toRequestBody(values), progressReporter(onProgress));
  return data;
}

export async function deleteDocument(id: string): Promise<void> {
  await apiClient.delete(`/documents/${id}/`);
}

export async function fetchMyDocuments(): Promise<Document[]> {
  const { data } = await apiClient.get<{ documents: Document[] }>("/documents/me/");
  return data.documents;
}
