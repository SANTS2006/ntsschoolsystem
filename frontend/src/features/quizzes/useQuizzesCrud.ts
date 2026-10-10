import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import {
  cancelQuiz,
  createQuiz,
  deleteQuiz,
  fetchMyQuizzes,
  fetchMyResult,
  fetchQuizResults,
  fetchQuizzes,
  getQuiz,
} from "./api";
import type { AttemptResult, Quiz, QuizCreatePayload, QuizResults, StudentQuiz } from "./types";

const KEY = ["quizzes"] as const;

export function useQuizList(subjectOffering: string | undefined) {
  return useQuery({
    queryKey: [...KEY, "list", subjectOffering],
    queryFn: () => fetchQuizzes(subjectOffering as string),
    enabled: !!subjectOffering,
  });
}

export function useQuiz(id: string | undefined) {
  return useQuery<Quiz, ApiError>({
    queryKey: [...KEY, "detail", id],
    queryFn: () => getQuiz(id as string),
    enabled: !!id,
  });
}

export function useCreateQuiz() {
  const queryClient = useQueryClient();
  return useMutation<Quiz, ApiError, QuizCreatePayload>({
    mutationFn: createQuiz,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteQuiz() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteQuiz,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useCancelQuiz() {
  const queryClient = useQueryClient();
  return useMutation<Quiz, ApiError, string>({
    mutationFn: cancelQuiz,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
}

export function useQuizResults(id: string | undefined) {
  return useQuery<QuizResults, ApiError>({
    queryKey: [...KEY, "results", id],
    queryFn: () => fetchQuizResults(id as string),
    enabled: !!id,
  });
}

export function useMyQuizzes() {
  return useQuery<StudentQuiz[], ApiError>({
    queryKey: [...KEY, "mine"],
    queryFn: fetchMyQuizzes,
  });
}

export function useMyQuizResult(quizId: string | undefined, enabled: boolean) {
  return useQuery<AttemptResult, ApiError>({
    queryKey: [...KEY, "my-result", quizId],
    queryFn: () => fetchMyResult(quizId as string),
    enabled: !!quizId && enabled,
  });
}
