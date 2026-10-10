import { apiClient } from "@/lib/api-client";
import type { PaginatedResponse } from "@/types/pagination";

import type {
  AttemptResult,
  AttemptState,
  Quiz,
  QuizCreatePayload,
  QuizResults,
  StudentQuiz,
  ViolationKind,
} from "./types";

export async function fetchQuizzes(subjectOffering: string): Promise<PaginatedResponse<Quiz>> {
  const { data } = await apiClient.get<PaginatedResponse<Quiz>>("/quizzes/", {
    params: { subject_offering: subjectOffering, page_size: 100 },
  });
  return data;
}

export async function getQuiz(id: string): Promise<Quiz> {
  const { data } = await apiClient.get<Quiz>(`/quizzes/${id}/`);
  return data;
}

export async function createQuiz(payload: QuizCreatePayload): Promise<Quiz> {
  const form = new FormData();
  form.append("subject_offering", payload.subject_offering);
  form.append("title", payload.title);
  form.append("instructions", payload.instructions);
  form.append("start_time", payload.start_time);
  form.append("end_time", payload.end_time);
  form.append("duration_minutes", String(payload.duration_minutes));
  form.append("file", payload.file);
  const { data } = await apiClient.post<{ quiz: Quiz }>("/quizzes/", form);
  return data.quiz;
}

export async function deleteQuiz(id: string): Promise<void> {
  await apiClient.delete(`/quizzes/${id}/`);
}

export async function cancelQuiz(id: string): Promise<Quiz> {
  const { data } = await apiClient.post<{ quiz: Quiz }>(`/quizzes/${id}/cancel/`);
  return data.quiz;
}

export async function fetchQuizResults(id: string): Promise<QuizResults> {
  const { data } = await apiClient.get<{ results: QuizResults }>(`/quizzes/${id}/results/`);
  return data.results;
}

export async function fetchMyQuizzes(): Promise<StudentQuiz[]> {
  const { data } = await apiClient.get<{ results: StudentQuiz[] }>("/quizzes/my-quizzes/");
  return data.results;
}

export async function startAttempt(quizId: string): Promise<AttemptState> {
  const { data } = await apiClient.post<{ attempt: AttemptState }>(`/quizzes/my-quizzes/${quizId}/start/`);
  return data.attempt;
}

export async function markQuestionViewed(quizId: string, questionId: string): Promise<void> {
  await apiClient.post(`/quizzes/my-quizzes/${quizId}/view/`, { question_id: questionId });
}

export async function saveAnswer(quizId: string, questionId: string, optionId: string): Promise<void> {
  await apiClient.post(`/quizzes/my-quizzes/${quizId}/answer/`, { question_id: questionId, option_id: optionId });
}

export async function reportViolation(
  quizId: string,
  kind: ViolationKind,
): Promise<{ status: string; violation_count: number }> {
  const { data } = await apiClient.post<{ status: string; violation_count: number }>(
    `/quizzes/my-quizzes/${quizId}/violation/`,
    { kind },
  );
  return data;
}

export async function submitAttempt(quizId: string): Promise<AttemptResult> {
  const { data } = await apiClient.post<{ result: AttemptResult }>(`/quizzes/my-quizzes/${quizId}/submit/`);
  return data.result;
}

export async function fetchMyResult(quizId: string): Promise<AttemptResult> {
  const { data } = await apiClient.get<{ result: AttemptResult }>(`/quizzes/my-quizzes/${quizId}/result/`);
  return data.result;
}
