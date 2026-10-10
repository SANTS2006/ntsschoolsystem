import { apiClient } from "@/lib/api-client";

export interface Maintenance {
  enabled: boolean;
  message: string;
  /** Show the message on every page (true), or only on `pages` (false). */
  all_pages: boolean;
  /** Path prefixes inside the app, e.g. "/finance" or "/login". */
  pages: string[];
  enabled_at: string | null;
}

export interface MaintenanceUpdate {
  enabled: boolean;
  message: string;
  all_pages: boolean;
  pages: string[];
  /** Email every user when switching it on. */
  notify: boolean;
}

export async function fetchMaintenance(): Promise<Maintenance> {
  const { data } = await apiClient.get<{ maintenance: Maintenance }>("/platform/maintenance/");
  return data.maintenance;
}

export async function saveMaintenance(values: MaintenanceUpdate): Promise<{ maintenance: Maintenance; emailing: boolean }> {
  const { data } = await apiClient.put<{ maintenance: Maintenance; emailing: boolean }>("/platform/maintenance/", values);
  return data;
}
