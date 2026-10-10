import { useQuery } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import { type DashboardParams, fetchRoleDashboard } from "./api";
import type { RoleDashboard } from "./types";

export function useRoleDashboard(params: DashboardParams = {}) {
  return useQuery<RoleDashboard, ApiError>({
    queryKey: ["reports", "dashboard", "me", params],
    queryFn: () => fetchRoleDashboard(params),
    placeholderData: (previous) => previous,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}
