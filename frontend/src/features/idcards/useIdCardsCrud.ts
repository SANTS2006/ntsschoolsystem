import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import { bulkIssueIdCards, fetchIdCards, fetchMyIdCard, issueIdCard, revokeIdCard, verifyIdCard } from "./api";
import type {
  BulkIssuePayload,
  BulkIssueResult,
  CardVerification,
  IdCard,
  IdCardListParams,
  IssueCardPayload,
} from "./types";

// Also prefix-matches useSummaryStats's [resource, "summary", params] key, so one invalidation
// refreshes both the list and the stat row.
const IDCARDS_KEY = ["idcards"] as const;

function invalidateIdCards(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: IDCARDS_KEY });
}

export function useIdCardList(params: IdCardListParams) {
  return useQuery({
    queryKey: [...IDCARDS_KEY, "list", params],
    queryFn: () => fetchIdCards(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useMyIdCard() {
  return useQuery<IdCard | null, ApiError>({
    queryKey: [...IDCARDS_KEY, "mine"],
    queryFn: fetchMyIdCard,
  });
}

export function useVerifyIdCard(token: string | undefined) {
  return useQuery<CardVerification, ApiError>({
    queryKey: [...IDCARDS_KEY, "verify", token],
    queryFn: () => verifyIdCard(token as string),
    enabled: !!token,
    retry: false,
  });
}

export function useIssueIdCard() {
  const queryClient = useQueryClient();
  return useMutation<IdCard, ApiError, IssueCardPayload>({
    mutationFn: issueIdCard,
    onSuccess: () => invalidateIdCards(queryClient),
  });
}

export function useBulkIssueIdCards() {
  const queryClient = useQueryClient();
  return useMutation<BulkIssueResult, ApiError, BulkIssuePayload>({
    mutationFn: bulkIssueIdCards,
    onSuccess: () => invalidateIdCards(queryClient),
  });
}

export function useRevokeIdCard() {
  const queryClient = useQueryClient();
  return useMutation<IdCard, ApiError, string>({
    mutationFn: revokeIdCard,
    onSuccess: () => invalidateIdCards(queryClient),
  });
}
