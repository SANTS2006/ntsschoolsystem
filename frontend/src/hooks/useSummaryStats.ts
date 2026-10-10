import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api-client";

/** Each entry is either a plain count, or (for a `{"groupby": ...}` spec on the backend) a map
 * of value -> count. */
export type SummaryStats = Record<string, number | Record<string, number>>;

/** Fetches `GET /{resource}/summary/` — the generic `SummaryStatsMixin` endpoint every
 * `TenantScopedModelViewSet` exposes. Keyed with the same filter params as the paired list
 * query, so the two stay in sync and the stat row reflects whatever filter is currently applied
 * (the backend's `filter_queryset(get_queryset())` does the same filtering for both). Pass the
 * exact same `params` object the list hook receives. */
export function useSummaryStats(resource: string, params: Record<string, unknown> = {}) {
  return useQuery<SummaryStats>({
    queryKey: [resource, "summary", params],
    queryFn: async () => {
      const { data } = await apiClient.get<{ summary: SummaryStats }>(`/${resource}/summary/`, { params });
      return data.summary;
    },
    // Keep showing the previous numbers while a filter change refetches, instead of the whole
    // stat row disappearing and reappearing on every keystroke/filter change.
    placeholderData: (previousData) => previousData,
  });
}
