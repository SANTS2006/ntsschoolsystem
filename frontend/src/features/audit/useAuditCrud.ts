import { useQuery } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import { fetchAuditLogs, getAuditLog } from "./api";
import type { AuditLog, AuditLogListParams } from "./types";

interface PageParams {
  page?: number;
  page_size?: number;
}

const AUDIT_LOGS_KEY = ["audit", "logs"] as const;

export function useAuditLogList(params: PageParams & AuditLogListParams) {
  return useQuery({
    queryKey: [...AUDIT_LOGS_KEY, "list", params],
    queryFn: () => fetchAuditLogs(params),
    placeholderData: (previousData) => previousData,
  });
}

export function useAuditLog(id: string | undefined) {
  return useQuery<AuditLog, ApiError>({
    queryKey: [...AUDIT_LOGS_KEY, "detail", id],
    queryFn: () => getAuditLog(id as string),
    enabled: !!id,
  });
}
