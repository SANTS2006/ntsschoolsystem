import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import {
  bulkAcceptApplications,
  bulkRejectApplications,
  bulkShortlistApplications,
  deleteApplication,
  fetchApplications,
  fetchFormConfig,
  fetchPublicApplicationOptions,
  getApplication,
  inviteApplicationsToInterview,
  saveFormConfig,
  submitPublicApplication,
} from "./api";
import type {
  Application,
  ApplicationListParams,
  BulkAcceptResult,
  FormConfig,
  FormConfigPayload,
  FormConfigResponse,
  InviteInterviewPayload,
  PublicApplicationOptions,
  PublicApplicationPayload,
} from "./types";

const APPLICATIONS_KEY = ["admissions", "applications"] as const;
// useSummaryStats builds its own query key as [resource, "summary", params] — "admissions/applications"
// is a single string there, not the two-element APPLICATIONS_KEY array above, so invalidating
// APPLICATIONS_KEY alone leaves the stats row stale after a mutation; both keys need invalidating.
const SUMMARY_KEY = ["admissions/applications"] as const;

function invalidateApplications(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: APPLICATIONS_KEY });
  queryClient.invalidateQueries({ queryKey: SUMMARY_KEY });
}

export function useApplicationList(params: ApplicationListParams) {
  return useQuery({
    queryKey: [...APPLICATIONS_KEY, "list", params],
    queryFn: () => fetchApplications(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useApplication(id: string | undefined) {
  return useQuery<Application, ApiError>({
    queryKey: [...APPLICATIONS_KEY, "detail", id],
    queryFn: () => getApplication(id as string),
    enabled: !!id,
  });
}

export function useDeleteApplication() {
  const queryClient = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: deleteApplication,
    onSuccess: () => invalidateApplications(queryClient),
  });
}

export function useBulkShortlistApplications() {
  const queryClient = useQueryClient();
  return useMutation<{ updated: number }, ApiError, string[]>({
    mutationFn: bulkShortlistApplications,
    onSuccess: () => invalidateApplications(queryClient),
  });
}

export function useInviteApplicationsToInterview() {
  const queryClient = useQueryClient();
  return useMutation<{ updated: number }, ApiError, InviteInterviewPayload>({
    mutationFn: inviteApplicationsToInterview,
    onSuccess: () => invalidateApplications(queryClient),
  });
}

export function useBulkAcceptApplications() {
  const queryClient = useQueryClient();
  return useMutation<BulkAcceptResult, ApiError, { applicationIds: string[]; numbers: Record<string, string> }>({
    mutationFn: ({ applicationIds, numbers }) => bulkAcceptApplications(applicationIds, numbers),
    onSuccess: () => invalidateApplications(queryClient),
  });
}

export function useBulkRejectApplications() {
  const queryClient = useQueryClient();
  return useMutation<{ updated: number }, ApiError, { applicationIds: string[]; reason?: string }>({
    mutationFn: ({ applicationIds, reason }) => bulkRejectApplications(applicationIds, reason),
    onSuccess: () => invalidateApplications(queryClient),
  });
}

export function usePublicApplicationOptions(schoolSlug: string | undefined) {
  return useQuery<PublicApplicationOptions, ApiError>({
    queryKey: ["admissions", "public-options", schoolSlug],
    queryFn: () => fetchPublicApplicationOptions(schoolSlug as string),
    enabled: !!schoolSlug,
  });
}

export function useSubmitPublicApplication() {
  return useMutation<
    { application_id: string },
    ApiError,
    { schoolSlug: string; values: PublicApplicationPayload; onProgress?: (percent: number) => void }
  >({
    mutationFn: ({ schoolSlug, values, onProgress }) => submitPublicApplication(schoolSlug, values, onProgress),
  });
}

export function useFormConfig() {
  return useQuery<FormConfigResponse, ApiError>({ queryKey: ["admissions", "form-config"], queryFn: fetchFormConfig });
}

export function useSaveFormConfig() {
  const queryClient = useQueryClient();
  return useMutation<FormConfig, ApiError, { kind: "student" | "staff"; payload: FormConfigPayload }>({
    mutationFn: ({ kind, payload }) => saveFormConfig(kind, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admissions", "form-config"] });
      queryClient.invalidateQueries({ queryKey: ["admissions", "public-options"] });
    },
  });
}
