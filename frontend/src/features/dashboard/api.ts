import { apiClient } from "@/lib/api-client";

import type { RoleDashboard } from "./types";

/** The signed-in person's own dashboard. The server decides which one (from the role they are working as) and
 * which sections they may see; nothing here chooses a role. */
export interface DashboardParams {
  term?: string;
  school_class?: string;
}

export async function fetchRoleDashboard(params: DashboardParams = {}): Promise<RoleDashboard> {
  const { data } = await apiClient.get<{ dashboard: RoleDashboard }>("/reports/dashboard/me/", { params });
  return data.dashboard;
}
