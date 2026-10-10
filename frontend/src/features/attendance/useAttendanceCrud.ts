import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import {
  bulkMarkAttendance,
  createStaffAttendance,
  createStudentAttendance,
  deleteStaffAttendance,
  deleteStudentAttendance,
  fetchAttendanceStats,
  fetchMyAttendance,
  fetchMyStaffAttendance,
  fetchStaffAttendance,
  fetchStudentAttendance,
  getStaffAttendance,
  getStudentAttendance,
  updateStaffAttendance,
  updateStudentAttendance,
} from "./api";
import type {
  AttendanceStats,
  AttendanceStatsParams,
  BulkMarkPayload,
  StaffAttendance,
  StaffAttendanceListParams,
  StaffAttendancePayload,
  StudentAttendance,
  StudentAttendanceListParams,
  StudentAttendancePayload,
} from "./types";

const STUDENT_ATTENDANCE_KEY = ["attendance", "students"] as const;
const STAFF_ATTENDANCE_KEY = ["attendance", "staff"] as const;

export function useStudentAttendanceList(params: StudentAttendanceListParams) {
  return useQuery({
    queryKey: [...STUDENT_ATTENDANCE_KEY, "list", params],
    queryFn: () => fetchStudentAttendance(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useStudentAttendanceRecord(id: string | undefined) {
  return useQuery<StudentAttendance, ApiError>({
    queryKey: [...STUDENT_ATTENDANCE_KEY, "detail", id],
    queryFn: () => getStudentAttendance(id as string),
    enabled: !!id,
  });
}

export function useCreateStudentAttendance() {
  const queryClient = useQueryClient();
  return useMutation<StudentAttendance, ApiError, StudentAttendancePayload>({
    mutationFn: createStudentAttendance,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: STUDENT_ATTENDANCE_KEY }),
  });
}

export function useUpdateStudentAttendance(id: string) {
  const queryClient = useQueryClient();
  return useMutation<StudentAttendance, ApiError, StudentAttendancePayload>({
    mutationFn: (values) => updateStudentAttendance(id, values),
    onSuccess: (record) => {
      queryClient.invalidateQueries({ queryKey: STUDENT_ATTENDANCE_KEY });
      queryClient.setQueryData([...STUDENT_ATTENDANCE_KEY, "detail", id], record);
    },
  });
}

export function useDeleteStudentAttendance() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteStudentAttendance,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: STUDENT_ATTENDANCE_KEY }),
  });
}

export function useBulkMarkAttendance() {
  const queryClient = useQueryClient();
  return useMutation<StudentAttendance[], ApiError, BulkMarkPayload>({
    mutationFn: bulkMarkAttendance,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: STUDENT_ATTENDANCE_KEY }),
  });
}

export function useAttendanceStats(params: AttendanceStatsParams) {
  return useQuery<AttendanceStats, ApiError>({
    queryKey: [...STUDENT_ATTENDANCE_KEY, "stats", params],
    queryFn: () => fetchAttendanceStats(params),
  });
}

export function useStaffAttendanceList(params: StaffAttendanceListParams) {
  return useQuery({
    queryKey: [...STAFF_ATTENDANCE_KEY, "list", params],
    queryFn: () => fetchStaffAttendance(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useStaffAttendanceRecord(id: string | undefined) {
  return useQuery<StaffAttendance, ApiError>({
    queryKey: [...STAFF_ATTENDANCE_KEY, "detail", id],
    queryFn: () => getStaffAttendance(id as string),
    enabled: !!id,
  });
}

export function useCreateStaffAttendance() {
  const queryClient = useQueryClient();
  return useMutation<StaffAttendance, ApiError, StaffAttendancePayload>({
    mutationFn: createStaffAttendance,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: STAFF_ATTENDANCE_KEY }),
  });
}

export function useUpdateStaffAttendance(id: string) {
  const queryClient = useQueryClient();
  return useMutation<StaffAttendance, ApiError, StaffAttendancePayload>({
    mutationFn: (values) => updateStaffAttendance(id, values),
    onSuccess: (record) => {
      queryClient.invalidateQueries({ queryKey: STAFF_ATTENDANCE_KEY });
      queryClient.setQueryData([...STAFF_ATTENDANCE_KEY, "detail", id], record);
    },
  });
}

export function useDeleteStaffAttendance() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteStaffAttendance,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: STAFF_ATTENDANCE_KEY }),
  });
}

export function useMyAttendance() {
  return useQuery({ queryKey: ["attendance", "my-attendance"], queryFn: fetchMyAttendance });
}

export function useMyStaffAttendance() {
  return useQuery({ queryKey: ["attendance", "my-staff-attendance"], queryFn: fetchMyStaffAttendance });
}
