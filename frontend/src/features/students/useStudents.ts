import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";
import type { LinkGuardianPayload, StudentGuardian } from "@/features/parents/types";

import {
  archiveStudent,
  bulkUpdateStudentStatus,
  createStudent,
  fetchStudentGuardians,
  getStudent,
  linkGuardianToStudent,
  listStudents,
  unlinkGuardianFromStudent,
  updateStudent,
} from "./api";
import type { Student, StudentPayload, StudentListParams } from "./types";

const STUDENTS_KEY = ["students"] as const;
const STUDENT_GUARDIANS_KEY = ["students", "guardians"] as const;

export function useStudents(params: StudentListParams, options?: { enabled?: boolean }) {
  return useQuery({
    enabled: options?.enabled,
    queryKey: [...STUDENTS_KEY, "list", params],
    queryFn: () => listStudents(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useStudent(id: string | undefined) {
  return useQuery<Student, ApiError>({
    queryKey: [...STUDENTS_KEY, "detail", id],
    queryFn: () => getStudent(id as string),
    enabled: !!id,
  });
}

export function useCreateStudent() {
  const queryClient = useQueryClient();
  return useMutation<Student, ApiError, StudentPayload>({
    mutationFn: createStudent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STUDENTS_KEY });
    },
  });
}

export function useUpdateStudent(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Student, ApiError, StudentPayload>({
    mutationFn: (values) => updateStudent(id, values),
    onSuccess: (student) => {
      queryClient.invalidateQueries({ queryKey: STUDENTS_KEY });
      queryClient.setQueryData([...STUDENTS_KEY, "detail", id], student);
    },
  });
}

export function useArchiveStudent() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: archiveStudent,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STUDENTS_KEY });
    },
  });
}

export function useBulkUpdateStudentStatus() {
  const queryClient = useQueryClient();
  return useMutation<{ updated: number }, ApiError, { studentIds: string[]; status: Student["status"] }>({
    mutationFn: ({ studentIds, status }) => bulkUpdateStudentStatus(studentIds, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: STUDENTS_KEY });
    },
  });
}

export function useStudentGuardians(studentId: string | undefined) {
  return useQuery<StudentGuardian[], ApiError>({
    queryKey: [...STUDENT_GUARDIANS_KEY, studentId],
    queryFn: () => fetchStudentGuardians(studentId as string),
    enabled: !!studentId,
  });
}

export function useLinkGuardian(studentId: string) {
  const queryClient = useQueryClient();
  return useMutation<StudentGuardian, ApiError, LinkGuardianPayload>({
    mutationFn: (values) => linkGuardianToStudent(studentId, values),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...STUDENT_GUARDIANS_KEY, studentId] }),
  });
}

export function useUnlinkGuardian(studentId: string) {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (guardianId) => unlinkGuardianFromStudent(studentId, guardianId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...STUDENT_GUARDIANS_KEY, studentId] }),
  });
}
