import { useSyncExternalStore } from "react";

/** What the sign-out overlay is showing: nothing, "signing you out…", or the brief "signed out" confirmation. */
export type SignOutState = { phase: "idle" } | { phase: "working"; message: string } | { phase: "done" };

let state: SignOutState = { phase: "idle" };
const listeners = new Set<() => void>();

export function setSignOutState(next: SignOutState): void {
  state = next;
  listeners.forEach((listener) => listener());
}

export function useSignOutState(): SignOutState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => state,
  );
}
