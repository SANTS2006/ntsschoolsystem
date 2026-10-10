import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import {
  createAssignment,
  deleteAssignment,
  deleteSubmission,
  fetchAssignments,
  fetchSubmissions,
  getAssignment,
  getSubmission,
  gradeSubmission,
  updateAssignment,
} from "./api";
import type {
  Assignment,
  AssignmentListParams,
  AssignmentPayload,
  AssignmentSubmission,
  AssignmentSubmissionListParams,
  GradeSubmissionPayload,
} from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

const ASSIGNMENTS_KEY = ["assignments", "assignments"] as const;
const SUBMISSIONS_KEY = ["assignments", "submissions"] as const;

export function useAssignmentList(params: PageParams & AssignmentListParams) {
  return useQuery({
    queryKey: [...ASSIGNMENTS_KEY, "list", params],
    queryFn: () => fetchAssignments(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useAssignment(id: string | undefined) {
  return useQuery<Assignment, ApiError>({
    queryKey: [...ASSIGNMENTS_KEY, "detail", id],
    queryFn: () => getAssignment(id as string),
    enabled: !!id,
  });
}

export function useCreateAssignment() {
  const queryClient = useQueryClient();
  return useMutation<Assignment, ApiError, AssignmentPayload>({
    mutationFn: createAssignment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ASSIGNMENTS_KEY }),
  });
}

export function useUpdateAssignment(id: string) {
  const queryClient = useQueryClient();
  return useMutation<Assignment, ApiError, AssignmentPayload>({
    mutationFn: (values) => updateAssignment(id, values),
    onSuccess: (assignment) => {
      queryClient.invalidateQueries({ queryKey: ASSIGNMENTS_KEY });
      queryClient.setQueryData([...ASSIGNMENTS_KEY, "detail", id], assignment);
    },
  });
}

export function useDeleteAssignment() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteAssignment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ASSIGNMENTS_KEY }),
  });
}

export function useSubmissionList(params: PageParams & AssignmentSubmissionListParams, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...SUBMISSIONS_KEY, "list", params],
    queryFn: () => fetchSubmissions(params),
    enabled: options?.enabled,
    placeholderData: (previousData) => previousData,
  });
}

export function useSubmission(id: string | undefined) {
  return useQuery<AssignmentSubmission, ApiError>({
    queryKey: [...SUBMISSIONS_KEY, "detail", id],
    queryFn: () => getSubmission(id as string),
    enabled: !!id,
  });
}

export function useDeleteSubmission() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteSubmission,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: SUBMISSIONS_KEY });
      queryClient.invalidateQueries({ queryKey: ASSIGNMENTS_KEY });
    },
  });
}

export function useGradeSubmission(id: string) {
  const queryClient = useQueryClient();
  return useMutation<AssignmentSubmission, ApiError, GradeSubmissionPayload>({
    mutationFn: (values) => gradeSubmission(id, values),
    onSuccess: (submission) => {
      queryClient.invalidateQueries({ queryKey: SUBMISSIONS_KEY });
      queryClient.setQueryData([...SUBMISSIONS_KEY, "detail", id], submission);
    },
  });
}
