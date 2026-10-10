import { type ComponentType, lazy } from "react";

import { reportClientError } from "./clientErrors";

/** A page script that could not be loaded even after retrying. The error boundary shows a recovery screen for it. */
export class ChunkLoadError extends Error {
  constructor(message = "A part of the app could not be loaded.") {
    super(message);
    this.name = "ChunkLoadError";
  }
}

const CHUNK_PATTERN =
  /dynamically imported module|Failed to fetch dynamically|Importing a module script failed|error loading dynamically|ChunkLoadError|Unable to preload|Loading chunk|is not a valid JavaScript MIME type/i;

export function isChunkError(error: unknown): boolean {
  if (error instanceof ChunkLoadError) return true;
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return CHUNK_PATTERN.test(message);
}

const RELOAD_KEY = "nts:chunk-reload-at";
const RELOAD_COOLDOWN_MS = 2 * 60 * 1000;

/** After a new deploy, a tab that was open before it still points at script files that no longer exist. Reloading
 * fetches the new page, which is the real fix — but never more than once every couple of minutes, so a genuinely
 * broken deploy can't trap anyone in a reload loop. Returns whether it reloaded. */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

/** `React.lazy` for a page: a flaky connection gets one quick retry, and a script that is really gone (a stale
 * page after a deploy) triggers a single guarded reload — otherwise it surfaces as a ChunkLoadError for the page's
 * error boundary instead of crashing the whole app into a blank screen. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyRetry<T extends ComponentType<any>>(factory: () => Promise<{ default: T }>) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (first) {
      if (!isChunkError(first)) throw first;
      await sleep(400);
      try {
        return await factory();
      } catch (second) {
        reportClientError({
          kind: "chunk",
          message: second instanceof Error ? second.message : "Page script failed to load",
        });
        if (reloadForNewVersion()) {
          // The reload is under way; keep the loading screen up instead of flashing an error.
          return new Promise<{ default: T }>(() => undefined);
        }
        throw new ChunkLoadError();
      }
    }
  });
}
