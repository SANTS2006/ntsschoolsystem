import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import {
  activateYear,
  executeRollover,
  fetchRolloverRuns,
  fetchYearContext,
  previewRollover,
  type Decisions,
  type RolloverOptions,
  type RolloverPreview,
  type RolloverSummary,
  type YearContext,
} from "./yearApi";
import type { AcademicYear } from "./types";

export const YEAR_CONTEXT_KEY = ["academic-year-context"] as const;

/** The active academic year, from the server. Everything that says "this year" reads it from here, never from a constant. */
export function useYearContext() {
  return useQuery<YearContext, ApiError>({ queryKey: YEAR_CONTEXT_KEY, queryFn: fetchYearContext, staleTime: 60_000, retry: false });
}

/** After the active year changes, everything tied to a year is stale. Refresh all of it, but not who is signed in. */
export function refreshAfterYearChange(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ predicate: (query) => query.queryKey[0] !== "auth" });
}

export function useActivateYear() {
  const queryClient = useQueryClient();
  return useMutation<AcademicYear, ApiError, string>({
    mutationFn: activateYear,
    onSuccess: () => refreshAfterYearChange(queryClient),
  });
}

export function usePreviewRollover() {
  return useMutation<RolloverPreview, ApiError, { source: string; target: string }>({ mutationFn: ({ source, target }) => previewRollover(source, target) });
}

export function useExecuteRollover() {
  const queryClient = useQueryClient();
  return useMutation<{ id: string; status: string; summary: RolloverSummary }, ApiError, { source: string; target: string; decisions: Decisions; options: RolloverOptions }>({
    mutationFn: (body) => executeRollover(body),
    onSuccess: () => refreshAfterYearChange(queryClient),
  });
}

export function useRolloverRuns(enabled = true) {
  return useQuery({ queryKey: ["academics", "rollover-runs"], queryFn: fetchRolloverRuns, enabled });
}
