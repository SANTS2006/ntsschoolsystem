import { render, screen } from "@testing-library/react";
import { Suspense } from "react";
import { describe, expect, it, vi } from "vitest";

import { ErrorBoundary } from "@/components/ErrorBoundary";

import { ChunkLoadError, isChunkError, lazyRetry } from "./lazyRetry";

const chunkFailure = () => new TypeError("Failed to fetch dynamically imported module: /assets/Page-abc123.js");

describe("isChunkError", () => {
  it("recognises the ways browsers report a missing script", () => {
    expect(isChunkError(chunkFailure())).toBe(true);
    expect(isChunkError(new Error("error loading dynamically imported module"))).toBe(true);
    expect(isChunkError(new Error("Importing a module script failed."))).toBe(true);
    expect(isChunkError(new ChunkLoadError())).toBe(true);
    expect(isChunkError(new Error("Cannot read properties of undefined"))).toBe(false);
  });
});

describe("lazyRetry", () => {
  it("loads the page normally", async () => {
    const Page = lazyRetry(() => Promise.resolve({ default: () => <p>students page</p> }));
    render(
      <Suspense fallback={<p>loading</p>}>
        <Page />
      </Suspense>,
    );
    expect(await screen.findByText("students page")).toBeInTheDocument();
  });

  it("retries once after a hiccup", async () => {
    const factory = vi
      .fn<() => Promise<{ default: () => React.JSX.Element }>>()
      .mockRejectedValueOnce(chunkFailure())
      .mockResolvedValueOnce({ default: () => <p>recovered</p> });
    const Page = lazyRetry(factory);
    render(
      <Suspense fallback={<p>loading</p>}>
        <Page />
      </Suspense>,
    );
    expect(await screen.findByText("recovered")).toBeInTheDocument();
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("a truly missing script reloads the app once, then shows the recovery screen — never a reload loop", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload, pathname: "/students" });
    const Page = lazyRetry(() => Promise.reject(chunkFailure()));

    // first failure: the guarded reload happens (and the loading screen stays up)
    const first = render(
      <Suspense fallback={<p>loading</p>}>
        <Page />
      </Suspense>,
    );
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    first.unmount();

    // a second failure inside the cooldown does NOT reload again: the boundary shows the recovery UI
    const Page2 = lazyRetry(() => Promise.reject(chunkFailure()));
    render(
      <ErrorBoundary>
        <Suspense fallback={<p>loading</p>}>
          <Page2 />
        </Suspense>
      </ErrorBoundary>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("couldn't be loaded");
    expect(reload).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("an ordinary error in the page's own module is not mistaken for a stale script", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const Page = lazyRetry(() => Promise.reject(new Error("syntax problem in the page")));
    render(
      <ErrorBoundary>
        <Suspense fallback={<p>loading</p>}>
          <Page />
        </Suspense>
      </ErrorBoundary>,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong while loading this page");
  });
});
