import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { ApiError } from "@/lib/api-client";

import { fetchMaintenance, saveMaintenance, type Maintenance, type MaintenanceUpdate } from "./api";

export const MAINTENANCE_KEY = ["platform", "maintenance"] as const;

/** Public: is the system under maintenance? Re-checked every minute so a banner appears (and goes away)
 * without anyone reloading. A failed check just means no banner. */
export function useMaintenance() {
  return useQuery<Maintenance, ApiError>({
    queryKey: MAINTENANCE_KEY,
    queryFn: fetchMaintenance,
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false,
  });
}

export function useSaveMaintenance() {
  const queryClient = useQueryClient();
  return useMutation<{ maintenance: Maintenance; emailing: boolean }, ApiError, MaintenanceUpdate>({
    mutationFn: saveMaintenance,
    onSuccess: ({ maintenance }) => queryClient.setQueryData(MAINTENANCE_KEY, maintenance),
  });
}
