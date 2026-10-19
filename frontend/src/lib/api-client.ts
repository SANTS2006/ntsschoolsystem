import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

import { getActingSchool } from "./actingSchool";
import { getActiveRoleSlug } from "./activeRole";
import { markFailed, markOk, markRetrying, waitForOnline } from "./connection";

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  _retriedAfterRefresh?: boolean;
  _networkRetries?: number;
}

/** How long to wait before each retry of a request that failed because of the network (not because of a mistake). Jittered
 * so that many tabs recovering at once do not all knock at the same instant. */
const RETRY_DELAYS_MS = [900, 2200, 5000, 9000];

function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export interface ApiErrorBody {
  success: false;
  message: string;
  code: string;
  errors: Array<{ field: string | null; message: string }>;
}

export class ApiError extends Error {
  code: string;
  errors: ApiErrorBody["errors"];
  status?: number;

  constructor(body: ApiErrorBody, status?: number) {
    super(body.message);
    this.name = "ApiError";
    this.code = body.code;
    this.errors = body.errors ?? [];
    this.status = status;
  }
}

function readCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

const UNSAFE_METHODS = new Set(["post", "put", "patch", "delete"]);

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "/api/v1",
  withCredentials: true, // send httpOnly access/refresh cookies
  // Never wait forever on a stalled connection: a request that hasn't answered in a minute fails with a clear
  // "timed out" error the page can show, instead of leaving a spinner (or a half-rendered page) hanging.
  // Uploads and exports that legitimately take longer set their own `timeout`.
  timeout: 60_000,
  // Deliberately no default Content-Type header: axios's own transformRequest already
  // infers "application/json" for a plain object body. Presetting "application/json" here
  // would make axios JSON.stringify a FormData body too (it checks the *existing*
  // Content-Type before deciding, not the data type) — silently breaking every multipart
  // file upload (Student.photo and any future one) rather than sending the file.
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const method = (config.method ?? "get").toLowerCase();
  if (UNSAFE_METHODS.has(method)) {
    const csrfToken = readCookie("csrftoken");
    if (csrfToken) {
      config.headers.set("X-CSRFToken", csrfToken);
    }
    // One key per logical write, kept across retries: if a slow connection makes the same write arrive twice (a retry, a
    // double click), the server recognises it and does it once.
    if (!config.headers.has("Idempotency-Key")) config.headers.set("Idempotency-Key", newIdempotencyKey());
  }
  // Only ever honored server-side for an actual platform admin (see
  // apps.tenants.mixins.ACTING_SCHOOL_HEADER) — harmless to attach for anyone else.
  const actingSchool = getActingSchool();
  if (actingSchool) {
    config.headers.set("X-Acting-School", actingSchool.id);
  }
  // Which of their roles a multi-role person is working as; the server applies only that role's permissions.
  const activeRole = getActiveRoleSlug();
  if (activeRole) {
    config.headers.set("X-Active-Role", activeRole);
  }
  return config;
});

// Endpoints that must never trigger (or be retried by) the refresh flow below —
// a 401 from login is "wrong password," not "session expired," and refresh
// retrying itself would recurse forever.
const AUTH_ENDPOINTS_EXCLUDED_FROM_REFRESH = ["/auth/login/", "/auth/refresh/", "/auth/logout/"];

// Multiple requests can 401 at once (e.g. several queries firing on page load
// with the same expired access token) — share one in-flight refresh instead of
// firing the refresh endpoint once per request.
let refreshPromise: Promise<void> | null = null;

function isExcludedFromRefresh(url?: string): boolean {
  return !!url && AUTH_ENDPOINTS_EXCLUDED_FROM_REFRESH.some((path) => url.includes(path));
}

/** Whether a failed request is worth sending again by itself: the network dropped, the server timed out or was starting
 * up, or is busy — never a validation or permission problem. Writes are only retried because they carry an idempotency key. */
function shouldRetryOnNetwork(error: AxiosError<ApiErrorBody>, config: RetriableRequestConfig): boolean {
  if (error.code === "ERR_CANCELED" || config.signal?.aborted) return false;
  if ((config._networkRetries ?? 0) >= RETRY_DELAYS_MS.length) return false;
  const method = (config.method ?? "get").toLowerCase();
  const safe = method === "get" || method === "head" || config.headers?.has?.("Idempotency-Key");
  if (!safe || isExcludedFromRefresh(config.url)) return false;
  const status = error.response?.status;
  if (!error.response) return true; // network error or timeout
  if (status === 502 || status === 503 || status === 504 || status === 429) return true;
  return status === 409 && error.response.data?.code === "REQUEST_IN_PROGRESS";
}

apiClient.interceptors.response.use(
  (response) => {
    markOk();
    return response;
  },
  async (error: AxiosError<ApiErrorBody>) => {
    const config = error.config as RetriableRequestConfig | undefined;

    if (config && shouldRetryOnNetwork(error, config)) {
      const attempt = config._networkRetries ?? 0;
      config._networkRetries = attempt + 1;
      markRetrying();
      const retryAfter = Number(error.response?.headers?.["retry-after"]);
      const base = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 10) * 1000 : RETRY_DELAYS_MS[attempt];
      await sleep(base * (0.75 + Math.random() * 0.5));
      await waitForOnline(20_000);
      return apiClient(config);
    }
    if (config && !error.response) markFailed();

    if (
      error.response?.status === 401 &&
      config &&
      !config._retriedAfterRefresh &&
      !isExcludedFromRefresh(config.url)
    ) {
      config._retriedAfterRefresh = true;
      try {
        refreshPromise ??= apiClient.post("/auth/refresh/").then(() => undefined).finally(() => {
          refreshPromise = null;
        });
        await refreshPromise;
        return apiClient(config);
      } catch {
        // Refresh itself failed (refresh token also expired/invalid) — fall through
        // to the normal error path below; ProtectedRoute reacts to the resulting
        // 401 on the `me` query by redirecting to /login.
      }
    }

    if (error.response?.data && typeof error.response.data === "object" && "success" in error.response.data) {
      return Promise.reject(new ApiError(error.response.data, error.response.status));
    }
    const timedOut = error.code === "ECONNABORTED" || error.code === "ETIMEDOUT";
    return Promise.reject(
      new ApiError(
        {
          success: false,
          message: timedOut
            ? "The server took too long to respond. Please try again."
            : error.response
              ? "The server had a problem. Please try again in a moment."
              : "Can't reach the server. Please check your connection.",
          code: timedOut ? "TIMEOUT" : error.response ? "SERVER_ERROR" : "NETWORK_ERROR",
          errors: [],
        },
        error.response?.status,
      ),
    );
  },
);
