import { apiClient } from "@/lib/api-client";
import type { PaginatedResponse } from "@/types/pagination";

import type {
  Exam,
  ExamListParams,
  ExamPayload,
  ExamSchedule,
  ExamScheduleListParams,
  ExamSchedulePayload,
  GradeBoundary,
  GradeBoundaryPayload,
  GradingScale,
  AssignRoomPayload,
  ExamTimetable,
  GradingScalePayload,
  MyExamTimetable,
  TimetableOptions,
  TimetablePaper,
  Transcript,
} from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
  search?: string;
  ordering?: string;
}

export async function fetchGradingScales(params: PageParams): Promise<PaginatedResponse<GradingScale>> {
  const { data } = await apiClient.get<PaginatedResponse<GradingScale>>("/examinations/grading-scales/", { params });
  return data;
}

export async function getGradingScale(id: string): Promise<GradingScale> {
  const { data } = await apiClient.get<GradingScale>(`/examinations/grading-scales/${id}/`);
  return data;
}

export async function createGradingScale(values: GradingScalePayload): Promise<GradingScale> {
  const { data } = await apiClient.post<GradingScale>("/examinations/grading-scales/", values);
  return data;
}

export async function updateGradingScale(id: string, values: GradingScalePayload): Promise<GradingScale> {
  const { data } = await apiClient.patch<GradingScale>(`/examinations/grading-scales/${id}/`, values);
  return data;
}

export async function deleteGradingScale(id: string): Promise<void> {
  await apiClient.delete(`/examinations/grading-scales/${id}/`);
}

export async function fetchGradeBoundaries(
  params: PageParams & { grading_scale: string },
): Promise<PaginatedResponse<GradeBoundary>> {
  const { data } = await apiClient.get<PaginatedResponse<GradeBoundary>>("/examinations/grade-boundaries/", {
    params,
  });
  return data;
}

export async function getGradeBoundary(id: string): Promise<GradeBoundary> {
  const { data } = await apiClient.get<GradeBoundary>(`/examinations/grade-boundaries/${id}/`);
  return data;
}

export async function createGradeBoundary(values: GradeBoundaryPayload): Promise<GradeBoundary> {
  const { data } = await apiClient.post<GradeBoundary>("/examinations/grade-boundaries/", values);
  return data;
}

export async function updateGradeBoundary(id: string, values: GradeBoundaryPayload): Promise<GradeBoundary> {
  const { data } = await apiClient.patch<GradeBoundary>(`/examinations/grade-boundaries/${id}/`, values);
  return data;
}

export async function deleteGradeBoundary(id: string): Promise<void> {
  await apiClient.delete(`/examinations/grade-boundaries/${id}/`);
}

export async function fetchExams(params: PageParams & ExamListParams): Promise<PaginatedResponse<Exam>> {
  const { data } = await apiClient.get<PaginatedResponse<Exam>>("/examinations/exams/", { params });
  return data;
}

export async function getExam(id: string): Promise<Exam> {
  const { data } = await apiClient.get<Exam>(`/examinations/exams/${id}/`);
  return data;
}

export async function createExam(values: ExamPayload): Promise<Exam> {
  const { data } = await apiClient.post<Exam>("/examinations/exams/", values);
  return data;
}

export async function updateExam(id: string, values: ExamPayload): Promise<Exam> {
  const { data } = await apiClient.patch<Exam>(`/examinations/exams/${id}/`, values);
  return data;
}

export async function deleteExam(id: string): Promise<void> {
  await apiClient.delete(`/examinations/exams/${id}/`);
}

export async function fetchExamSchedules(
  params: PageParams & ExamScheduleListParams,
): Promise<PaginatedResponse<ExamSchedule>> {
  const { data } = await apiClient.get<PaginatedResponse<ExamSchedule>>("/examinations/schedules/", { params });
  return data;
}

export async function getExamSchedule(id: string): Promise<ExamSchedule> {
  const { data } = await apiClient.get<ExamSchedule>(`/examinations/schedules/${id}/`);
  return data;
}

export async function createExamSchedule(values: ExamSchedulePayload): Promise<ExamSchedule> {
  const { data } = await apiClient.post<ExamSchedule>("/examinations/schedules/", values);
  return data;
}

export async function updateExamSchedule(id: string, values: ExamSchedulePayload): Promise<ExamSchedule> {
  const { data } = await apiClient.patch<ExamSchedule>(`/examinations/schedules/${id}/`, values);
  return data;
}

export async function deleteExamSchedule(id: string): Promise<void> {
  await apiClient.delete(`/examinations/schedules/${id}/`);
}

export async function fetchMyTranscript(): Promise<Transcript> {
  const { data } = await apiClient.get<Transcript>("/results/transcript/me/");
  return data;
}

export async function fetchExamTimetable(examId: string): Promise<ExamTimetable> {
  const { data } = await apiClient.get<{ timetable: ExamTimetable }>(`/examinations/exams/${examId}/timetable/`);
  return data.timetable;
}

export async function setExamTimetablePublished(examId: string, publish: boolean): Promise<ExamTimetable> {
  const { data } = await apiClient.post<{ timetable: ExamTimetable }>(
    `/examinations/exams/${examId}/timetable/${publish ? "publish" : "unpublish"}/`,
  );
  return data.timetable;
}

export async function fetchTimetableOptions(): Promise<TimetableOptions> {
  const { data } = await apiClient.get<TimetableOptions>("/examinations/timetable-options/");
  return data;
}

export async function assignExamRoom(scheduleId: string, payload: AssignRoomPayload): Promise<TimetablePaper> {
  const { data } = await apiClient.post<{ schedule: TimetablePaper }>(`/examinations/schedules/${scheduleId}/rooms/`, payload);
  return data.schedule;
}

export async function removeExamRoom(scheduleId: string, assignmentId: string): Promise<void> {
  await apiClient.delete(`/examinations/schedules/${scheduleId}/rooms/${assignmentId}/`);
}

export async function fetchMyExamTimetable(): Promise<MyExamTimetable> {
  const { data } = await apiClient.get<MyExamTimetable>("/examinations/my-timetable/");
  return data;
}
