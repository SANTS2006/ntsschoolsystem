import { AxiosError, type AxiosAdapter, type AxiosResponse, type InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ApiError, apiClient } from "./api-client";

const original = apiClient.defaults.adapter;
afterEach(() => {
  apiClient.defaults.adapter = original;
});

function reply(config: InternalAxiosRequestConfig, status: number, data: unknown): AxiosResponse {
  return { data, status, statusText: String(status), headers: {}, config };
}

function failWith(status: number, data: unknown): AxiosAdapter {
  return async (config) => {
    throw new AxiosError("failed", AxiosError.ERR_BAD_RESPONSE, config, null, reply(config, status, data));
  };
}

describe("API client failures never leave a page guessing", () => {
  it("has a request timeout (a stalled connection fails instead of hanging forever)", () => {
    expect(apiClient.defaults.timeout).toBeGreaterThan(0);
  });

  it("maps a timeout to a clear TIMEOUT error", async () => {
    apiClient.defaults.adapter = async (config) => {
      throw new AxiosError("timeout of 60000ms exceeded", AxiosError.ECONNABORTED, config);
    };
    const error = await apiClient.get("/students/").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("TIMEOUT");
    expect((error as ApiError).message).toMatch(/too long/i);
  });

  it("maps a dropped connection to NETWORK_ERROR", async () => {
    apiClient.defaults.adapter = async (config) => {
      throw new AxiosError("Network Error", AxiosError.ERR_NETWORK, config);
    };
    const error = (await apiClient.get("/students/").catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe("NETWORK_ERROR");
    expect(error.status).toBeUndefined();
  });

  it("maps an HTML/empty 5xx (a proxy error page) to SERVER_ERROR without leaking it", async () => {
    apiClient.defaults.adapter = failWith(502, "<html><body>Bad gateway: secret.internal.host</body></html>");
    const error = (await apiClient.get("/students/").catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe("SERVER_ERROR");
    expect(error.status).toBe(502);
    expect(error.message).not.toMatch(/secret\.internal|html/i);
  });

  it("passes the server's own error envelope straight through", async () => {
    apiClient.defaults.adapter = failWith(403, { success: false, message: "Nope", code: "PERMISSION_DENIED", errors: [] });
    const error = (await apiClient.get("/students/").catch((e: unknown) => e)) as ApiError;
    expect(error.code).toBe("PERMISSION_DENIED");
    expect(error.status).toBe(403);
  });
});

describe("token refresh", () => {
  let refreshCalls = 0;
  let fresh = false;

  beforeEach(() => {
    refreshCalls = 0;
    fresh = false;
    apiClient.defaults.adapter = async (config) => {
      if (config.url?.includes("/auth/refresh/")) {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 30));
        fresh = true;
        return reply(config, 200, { success: true });
      }
      if (!fresh) {
        throw new AxiosError("unauthorized", AxiosError.ERR_BAD_REQUEST, config, null, reply(config, 401, {
          success: false, message: "expired", code: "NOT_AUTHENTICATED", errors: [],
        }));
      }
      return reply(config, 200, { ok: config.url });
    };
  });

  it("several requests that expire together share ONE refresh, then all succeed", async () => {
    const results = await Promise.all(["/a/", "/b/", "/c/", "/d/", "/e/"].map((url) => apiClient.get(url)));
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(refreshCalls).toBe(1);
  });

  it("when the refresh itself fails, the request fails cleanly with 401 (no loop, no hang)", async () => {
    apiClient.defaults.adapter = async (config) => {
      throw new AxiosError("unauthorized", AxiosError.ERR_BAD_REQUEST, config, null, reply(config, 401, {
        success: false, message: "expired", code: "NOT_AUTHENTICATED", errors: [],
      }));
    };
    const error = (await apiClient.get("/students/").catch((e: unknown) => e)) as ApiError;
    expect(error.status).toBe(401);
  });
});
