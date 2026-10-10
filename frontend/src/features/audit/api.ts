import { apiClient } from "@/lib/api-client";
import type { PaginatedResponse } from "@/types/pagination";

import type { AuditLog, AuditLogListParams } from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

export async function fetchAuditLogs(params: PageParams & AuditLogListParams): Promise<PaginatedResponse<AuditLog>> {
  const { data } = await apiClient.get<PaginatedResponse<AuditLog>>("/audit/", { params });
  return data;
}

export async function getAuditLog(id: string): Promise<AuditLog> {
  const { data } = await apiClient.get<AuditLog>(`/audit/${id}/`);
  return data;
}
