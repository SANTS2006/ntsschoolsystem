import { useSyncExternalStore } from "react";

/** The app's picture of the network: online or offline, and whether requests are currently being retried because the
 * connection is slow or unstable. The banner and the retry screens read this; the API client updates it. */
export interface ConnectionState {
  offline: boolean;
  /** Requests are failing and being retried right now. */
  retrying: boolean;
}

let state: ConnectionState = { offline: typeof navigator !== "undefined" && navigator.onLine === false, retrying: false };
const listeners = new Set<() => void>();
let okTimer: number | undefined;

function set(next: Partial<ConnectionState>) {
  const merged = { ...state, ...next };
  if (merged.offline === state.offline && merged.retrying === state.retrying) return;
  state = merged;
  listeners.forEach((listener) => listener());
}

if (typeof window !== "undefined") {
  window.addEventListener("offline", () => set({ offline: true }));
  window.addEventListener("online", () => set({ offline: false }));
}

/** A request failed in a way that is being retried. */
export function markRetrying() {
  window.clearTimeout(okTimer);
  set({ retrying: true });
}

/** A request got an answer: the connection works. (Debounced so the banner does not flicker between two retries.) */
export function markOk() {
  if (!state.retrying) return;
  window.clearTimeout(okTimer);
  okTimer = window.setTimeout(() => set({ retrying: false }), 1500);
}

/** A request gave up for good. */
export function markFailed() {
  window.clearTimeout(okTimer);
  set({ retrying: false });
}

export function getConnection(): ConnectionState {
  return state;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useConnection(): ConnectionState {
  return useSyncExternalStore(subscribe, getConnection, getConnection);
}

/** Resolves when the browser reports it is online again, or after `maxMs`, whichever comes first. */
export function waitForOnline(maxMs: number): Promise<void> {
  if (typeof navigator === "undefined" || navigator.onLine !== false) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      window.removeEventListener("online", done);
      window.clearTimeout(timer);
      resolve();
    };
    const timer = window.setTimeout(done, maxMs);
    window.addEventListener("online", done, { once: true });
  });
}
