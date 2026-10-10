import { apiClient } from "@/lib/api-client";
import type { PaginatedResponse } from "@/types/pagination";

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

export async function fetchMyAttendance(): Promise<StudentAttendance[]> {
  const { data } = await apiClient.get<{ records: StudentAttendance[] }>("/attendance/my-attendance/");
  return data.records;
}

export async function fetchMyStaffAttendance(): Promise<StaffAttendance[]> {
  const { data } = await apiClient.get<{ records: StaffAttendance[] }>("/attendance/my-staff-attendance/");
  return data.records;
}

export async function fetchStudentAttendance(
  params: StudentAttendanceListParams,
): Promise<PaginatedResponse<StudentAttendance>> {
  const { data } = await apiClient.get<PaginatedResponse<StudentAttendance>>("/attendance/students/", { params });
  return data;
}

export async function getStudentAttendance(id: string): Promise<StudentAttendance> {
  const { data } = await apiClient.get<StudentAttendance>(`/attendance/students/${id}/`);
  return data;
}

export async function createStudentAttendance(values: StudentAttendancePayload): Promise<StudentAttendance> {
  const { data } = await apiClient.post<StudentAttendance>("/attendance/students/", values);
  return data;
}

export async function updateStudentAttendance(
  id: string,
  values: StudentAttendancePayload,
): Promise<StudentAttendance> {
  const { data } = await apiClient.patch<StudentAttendance>(`/attendance/students/${id}/`, values);
  return data;
}

export async function deleteStudentAttendance(id: string): Promise<void> {
  await apiClient.delete(`/attendance/students/${id}/`);
}

export async function bulkMarkAttendance(payload: BulkMarkPayload): Promise<StudentAttendance[]> {
  const { data } = await apiClient.post<{ results: StudentAttendance[] }>(
    "/attendance/students/bulk-mark/",
    payload,
  );
  return data.results;
}

export async function fetchAttendanceStats(params: AttendanceStatsParams): Promise<AttendanceStats> {
  const { data } = await apiClient.get<{ stats: AttendanceStats }>("/attendance/students/stats/", { params });
  return data.stats;
}

export async function fetchStaffAttendance(
  params: StaffAttendanceListParams,
): Promise<PaginatedResponse<StaffAttendance>> {
  const { data } = await apiClient.get<PaginatedResponse<StaffAttendance>>("/attendance/staff/", { params });
  return data;
}

export async function getStaffAttendance(id: string): Promise<StaffAttendance> {
  const { data } = await apiClient.get<StaffAttendance>(`/attendance/staff/${id}/`);
  return data;
}

export async function createStaffAttendance(values: StaffAttendancePayload): Promise<StaffAttendance> {
  const { data } = await apiClient.post<StaffAttendance>("/attendance/staff/", values);
  return data;
}

export async function updateStaffAttendance(id: string, values: StaffAttendancePayload): Promise<StaffAttendance> {
  const { data } = await apiClient.patch<StaffAttendance>(`/attendance/staff/${id}/`, values);
  return data;
}

export async function deleteStaffAttendance(id: string): Promise<void> {
  await apiClient.delete(`/attendance/staff/${id}/`);
}
