import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { apiClient } from "./api-client";

function networkError(config: InternalAxiosRequestConfig) {
  return new AxiosError("Network Error", "ERR_NETWORK", config);
}

function httpError(config: InternalAxiosRequestConfig, status: number, data: unknown = {}) {
  return new AxiosError("fail", "ERR_BAD_RESPONSE", config, null, { status, data, statusText: "", headers: {}, config });
}

function ok(config: InternalAxiosRequestConfig, data: unknown = { success: true }) {
  return Promise.resolve({ status: 200, data, statusText: "OK", headers: {}, config });
}

const original = apiClient.defaults.adapter;

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  apiClient.defaults.adapter = original;
});

async function settle<T>(promise: Promise<T>): Promise<T> {
  // Let every backoff timer run.
  const guarded = promise.then(
    (value) => ({ value }),
    (error) => ({ error }),
  );
  await vi.advanceTimersByTimeAsync(60_000);
  const result = await guarded;
  if ("error" in result) throw result.error;
  return result.value as T;
}

describe("API client resilience", () => {
  it("gives every write an idempotency key and keeps the same key when it retries", async () => {
    const keys: (string | undefined)[] = [];
    let calls = 0;
    apiClient.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
      keys.push(String(config.headers.get("Idempotency-Key")));
      calls += 1;
      if (calls < 3) throw networkError(config); // two dropped connections, then it gets through
      return ok(config);
    }) as AxiosAdapter;

    const response = await settle(apiClient.post("/things/", { name: "x" }));
    expect(response.status).toBe(200);
    expect(calls).toBe(3);
    expect(keys[0]).toMatch(/\S{8,}/);
    expect(new Set(keys).size).toBe(1); // one logical request: one key, so the server can do it once
  });

  it("different writes get different keys", async () => {
    const keys: string[] = [];
    apiClient.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
      keys.push(String(config.headers.get("Idempotency-Key")));
      return ok(config);
    }) as AxiosAdapter;
    await apiClient.post("/things/", {});
    await apiClient.post("/things/", {});
    expect(new Set(keys).size).toBe(2);
  });

  it("retries a read after a gateway/starting-up error", async () => {
    let calls = 0;
    apiClient.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
      calls += 1;
      if (calls === 1) throw httpError(config, 503);
      return ok(config);
    }) as AxiosAdapter;
    await settle(apiClient.get("/things/"));
    expect(calls).toBe(2);
  });

  it("waits and asks again when the server says the same request is still being processed", async () => {
    let calls = 0;
    apiClient.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
      calls += 1;
      if (calls === 1) throw httpError(config, 409, { success: false, code: "REQUEST_IN_PROGRESS", message: "busy", errors: [] });
      return ok(config, { success: true, replay: true });
    }) as AxiosAdapter;
    const response = await settle(apiClient.post("/things/", {}));
    expect(response.data).toEqual({ success: true, replay: true });
    expect(calls).toBe(2);
  });

  it("never retries a mistake: validation and permission errors come straight back", async () => {
    let calls = 0;
    apiClient.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
      calls += 1;
      throw httpError(config, 400, { success: false, code: "VALIDATION_ERROR", message: "Bad", errors: [] });
    }) as AxiosAdapter;
    await expect(settle(apiClient.post("/things/", {}))).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    expect(calls).toBe(1);
  });

  it("gives up after a few tries with a clear message instead of hanging", async () => {
    let calls = 0;
    apiClient.defaults.adapter = (async (config: InternalAxiosRequestConfig) => {
      calls += 1;
      throw networkError(config);
    }) as AxiosAdapter;
    await expect(settle(apiClient.get("/things/"))).rejects.toMatchObject({ code: "NETWORK_ERROR" });
    expect(calls).toBe(5); // the first try plus four retries
  });
});
