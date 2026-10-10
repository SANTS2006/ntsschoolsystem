import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import {
  createLesson,
  createLessonEnrollment,
  createMaterial,
  deleteLesson,
  deleteLessonEnrollment,
  deleteMaterial,
  fetchLessonEnrollments,
  fetchLessons,
  fetchMaterials,
  fetchMyLessons,
  getLesson,
  updateLesson,
} from "./api";
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

const LESSONS_KEY = ["education", "lessons"] as const;
const MATERIALS_KEY = ["education", "materials"] as const;
const MY_LESSONS_KEY = ["education", "my-lessons"] as const;
const ENROLLMENTS_KEY = ["education", "enrollments"] as const;

export function useLessonList(params: PageParams & LessonListParams) {
  return useQuery({
    queryKey: [...LESSONS_KEY, "list", params],
    queryFn: () => fetchLessons(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useLesson(id: string | undefined) {
  return useQuery<Lesson, ApiError>({
    queryKey: [...LESSONS_KEY, "detail", id],
    queryFn: () => getLesson(id as string),
    enabled: !!id,
  });
}

export function useCreateLesson() {
  const queryClient = useQueryClient();
  return useMutation<Lesson, ApiError, LessonPayload>({
    mutationFn: createLesson,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LESSONS_KEY }),
  });
}

export function useUpdateLesson(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Lesson, ApiError, LessonPayload>({
    mutationFn: (values) => updateLesson(id, values),
    onSuccess: (lesson) => {
      queryClient.invalidateQueries({ queryKey: LESSONS_KEY });
      queryClient.setQueryData([...LESSONS_KEY, "detail", id], lesson);
    },
  });
}

export function useDeleteLesson() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteLesson,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: LESSONS_KEY }),
  });
}

export function useMaterialList(lesson: string | undefined) {
  return useQuery<LessonMaterial[], ApiError>({
    queryKey: [...MATERIALS_KEY, lesson],
    queryFn: async () => (await fetchMaterials(lesson as string)).results,
    enabled: !!lesson,
  });
}

interface CreateMaterialVars {
  values: LessonMaterialPayload;
  onProgress?: (percent: number) => void;
}

export function useCreateMaterial() {
  const queryClient = useQueryClient();
  return useMutation<LessonMaterial, ApiError, CreateMaterialVars>({
    mutationFn: ({ values, onProgress }) => createMaterial(values, onProgress),
    onSuccess: (material) => {
      queryClient.invalidateQueries({ queryKey: [...MATERIALS_KEY, material.lesson] });
      queryClient.invalidateQueries({ queryKey: LESSONS_KEY });
    },
  });
}

export function useDeleteMaterial() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { id: string; lesson: string }>({
    mutationFn: ({ id }) => deleteMaterial(id),
    onSuccess: (_data, { lesson }) => {
      queryClient.invalidateQueries({ queryKey: [...MATERIALS_KEY, lesson] });
      queryClient.invalidateQueries({ queryKey: LESSONS_KEY });
    },
  });
}

export function useMyLessons() {
  return useQuery<MyLesson[], ApiError>({
    queryKey: MY_LESSONS_KEY,
    queryFn: fetchMyLessons,
  });
}

export function useLessonEnrollmentList(lesson: string | undefined) {
  return useQuery<LessonEnrollment[], ApiError>({
    queryKey: [...ENROLLMENTS_KEY, lesson],
    queryFn: async () => (await fetchLessonEnrollments(lesson as string)).results,
    enabled: !!lesson,
  });
}

export function useCreateLessonEnrollment() {
  const queryClient = useQueryClient();
  return useMutation<LessonEnrollment, ApiError, LessonEnrollmentPayload>({
    mutationFn: createLessonEnrollment,
    onSuccess: (enrollment) => queryClient.invalidateQueries({ queryKey: [...ENROLLMENTS_KEY, enrollment.lesson] }),
  });
}

export function useDeleteLessonEnrollment() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, { id: string; lesson: string }>({
    mutationFn: ({ id }) => deleteLessonEnrollment(id),
    onSuccess: (_data, { lesson }) => queryClient.invalidateQueries({ queryKey: [...ENROLLMENTS_KEY, lesson] }),
  });
}
