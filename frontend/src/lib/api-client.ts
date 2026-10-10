import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

import { getActingSchool } from "./actingSchool";
import { getActiveRoleSlug } from "./activeRole";

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  _retriedAfterRefresh?: boolean;
}

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

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiErrorBody>) => {
    const config = error.config as RetriableRequestConfig | undefined;

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
