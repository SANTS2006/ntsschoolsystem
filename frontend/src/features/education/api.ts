import { apiClient } from "@/lib/api-client";
import type { PaginatedResponse } from "@/types/pagination";

import type {
  Lesson,
  LessonEnrollment,
  LessonEnrollmentPayload,
  LessonListParams,
  LessonMaterial,
  LessonMaterialPayload,
  LessonPayload,
  MyLesson,
} from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

export async function fetchLessons(params: PageParams & LessonListParams): Promise<PaginatedResponse<Lesson>> {
  const { data } = await apiClient.get<PaginatedResponse<Lesson>>("/education/lessons/", { params });
  return data;
}

export async function getLesson(id: string): Promise<Lesson> {
  const { data } = await apiClient.get<Lesson>(`/education/lessons/${id}/`);
  return data;
}

export async function createLesson(values: LessonPayload): Promise<Lesson> {
  const { data } = await apiClient.post<Lesson>("/education/lessons/", values);
  return data;
}

export async function updateLesson(id: string, values: LessonPayload): Promise<Lesson> {
  const { data } = await apiClient.patch<Lesson>(`/education/lessons/${id}/`, values);
  return data;
}

export async function deleteLesson(id: string): Promise<void> {
  await apiClient.delete(`/education/lessons/${id}/`);
}

export async function fetchMaterials(lesson: string): Promise<PaginatedResponse<LessonMaterial>> {
  const { data } = await apiClient.get<PaginatedResponse<LessonMaterial>>("/education/materials/", {
    params: { lesson, page_size: 100 },
  });
  return data;
}

/** Always multipart — a lesson material is never created without a file. `onProgress` reports
 * upload percentage (0-100), useful given video uploads can be up to ~200MB. */
export async function createMaterial(
  values: LessonMaterialPayload,
  onProgress?: (percent: number) => void,
): Promise<LessonMaterial> {
  const formData = new FormData();
  formData.append("lesson", values.lesson);
  formData.append("material_type", values.material_type);
  formData.append("title", values.title);
  formData.append("file", values.file);
  const { data } = await apiClient.post<LessonMaterial>("/education/materials/", formData, {
    onUploadProgress: (event) => {
      if (onProgress && event.total) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    },
  });
  return data;
}

export async function deleteMaterial(id: string): Promise<void> {
  await apiClient.delete(`/education/materials/${id}/`);
}

export async function fetchMyLessons(): Promise<MyLesson[]> {
  const { data } = await apiClient.get<{ lessons: MyLesson[] }>("/education/my-lessons/");
  return data.lessons;
}

export async function fetchLessonEnrollments(lesson: string): Promise<PaginatedResponse<LessonEnrollment>> {
  const { data } = await apiClient.get<PaginatedResponse<LessonEnrollment>>("/education/enrollments/", {
    params: { lesson, page_size: 200 },
  });
  return data;
}

export async function createLessonEnrollment(values: LessonEnrollmentPayload): Promise<LessonEnrollment> {
  const { data } = await apiClient.post<LessonEnrollment>("/education/enrollments/", values);
  return data;
}

export async function deleteLessonEnrollment(id: string): Promise<void> {
  await apiClient.delete(`/education/enrollments/${id}/`);
}
