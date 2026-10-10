import { apiClient } from "@/lib/api-client";
import type { PaginatedResponse } from "@/types/pagination";

import type {
  BulkIssuePayload,
  BulkIssueResult,
  CardVerification,
  IdCard,
  IdCardListParams,
  IssueCardPayload,
} from "./types";

export async function fetchIdCards(params: IdCardListParams): Promise<PaginatedResponse<IdCard>> {
  const { data } = await apiClient.get<PaginatedResponse<IdCard>>("/idcards/", { params });
  return data;
}

export async function issueIdCard(payload: IssueCardPayload): Promise<IdCard> {
  const { data } = await apiClient.post<{ card: IdCard }>("/idcards/issue/", payload);
  return data.card;
}

export async function bulkIssueIdCards(payload: BulkIssuePayload): Promise<BulkIssueResult> {
  const { data } = await apiClient.post<BulkIssueResult>("/idcards/bulk-issue/", payload);
  return data;
}

export async function revokeIdCard(id: string): Promise<IdCard> {
  const { data } = await apiClient.post<{ card: IdCard }>(`/idcards/${id}/revoke/`);
  return data.card;
}

export async function fetchMyIdCard(): Promise<IdCard | null> {
  const { data } = await apiClient.get<{ card: IdCard | null }>("/idcards/mine/");
  return data.card;
}

export async function verifyIdCard(token: string): Promise<CardVerification> {
  const { data } = await apiClient.get<{ card: CardVerification }>(`/idcards/verify/${token}/`);
  return data.card;
}
