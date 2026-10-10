import { apiClient } from "@/lib/api-client";
import type { LinkGuardianPayload, StudentGuardian } from "@/features/parents/types";
import type { PaginatedResponse } from "@/types/pagination";

import type { Student, StudentListParams, StudentPayload } from "./types";

export async function listStudents(params: StudentListParams): Promise<PaginatedResponse<Student>> {
  const { data } = await apiClient.get<PaginatedResponse<Student>>("/students/", { params });
  return data;
}

export async function getStudent(id: string): Promise<Student> {
  const { data } = await apiClient.get<Student>(`/students/${id}/`);
  return data;
}

/** A plain JSON body can't carry a File — switch to multipart/form-data only when a new
 * photo was actually picked, so the common case (no photo change) stays a cheap JSON request. */
function toRequestBody(values: StudentPayload): StudentPayload | FormData {
  if (!values.photo) {
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

export async function createStudent(values: StudentPayload): Promise<Student> {
  const { data } = await apiClient.post<Student>("/students/", toRequestBody(values));
  return data;
}

export async function updateStudent(id: string, values: StudentPayload): Promise<Student> {
  const { data } = await apiClient.patch<Student>(`/students/${id}/`, toRequestBody(values));
  return data;
}

export async function archiveStudent(id: string): Promise<void> {
  await apiClient.delete(`/students/${id}/`);
}

export async function bulkUpdateStudentStatus(
  studentIds: string[],
  status: Student["status"],
): Promise<{ updated: number }> {
  const { data } = await apiClient.post<{ updated: number }>("/students/bulk-status/", {
    student_ids: studentIds,
    status,
  });
  return data;
}

/** Linking/unlinking a guardian happens entirely through this student-side action — there is no
 * flat `StudentGuardian` list endpoint and no reverse "this guardian's students" endpoint, so a
 * student's guardians can only ever be read/changed via its own id. */
export async function fetchStudentGuardians(studentId: string): Promise<StudentGuardian[]> {
  const { data } = await apiClient.get<{ guardians: StudentGuardian[] }>(`/students/${studentId}/guardians/`);
  return data.guardians;
}

export async function linkGuardianToStudent(
  studentId: string,
  values: LinkGuardianPayload,
): Promise<StudentGuardian> {
  const { data } = await apiClient.post<{ guardian: StudentGuardian }>(`/students/${studentId}/guardians/`, values);
  return data.guardian;
}

export async function unlinkGuardianFromStudent(studentId: string, guardianId: string): Promise<void> {
  await apiClient.delete(`/students/${studentId}/guardians/`, { params: { guardian_id: guardianId } });
}
