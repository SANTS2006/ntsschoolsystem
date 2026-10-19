import { QueryClient } from "@tanstack/react-query";

import type { ApiError } from "./api-client";

/** Retry what might work a second time — a dropped connection, a timeout, a 5xx — but never what can't: a 401, 403,
 * 404 or validation error will fail identically again, so retrying only slows the error screen down. */
function shouldRetry(failureCount: number, error: unknown): boolean {
  const status = (error as ApiError | undefined)?.status;
  if (status !== undefined && status >= 400 && status < 500) return false;
  // The API client has already retried network failures (with backoff and waiting for the connection to return), so one
  // more try here is enough; a server error gets two.
  return failureCount < (status === undefined ? 1 : 2);
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: shouldRetry,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
      // Whatever is on screen refreshes itself every 20 seconds (only while the tab is visible), when the person returns
      // to the tab, and when the connection comes back — nobody has to reload to see what others changed.
      refetchInterval: 20_000,
      refetchIntervalInBackground: false,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 0,
    },
  },
});
