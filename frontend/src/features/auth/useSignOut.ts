import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

import { setSignOutState } from "./signOutStore";
import { useLogout } from "./useAuth";

/** The shortest the "signing you out" screen stays up, so it reads as a deliberate step rather than a flash. */
const MIN_WORKING_MS = 900;
const DONE_MS = 700;

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** Signs the person out behind a full-screen overlay (see SignOutOverlay): the brand loader and a message
 * while the session is ended, a short "signed out" confirmation, then the sign-in page. */
export function useSignOut() {
  const logout = useLogout();
  const navigate = useNavigate();

  return useCallback(
    async (options: { message?: string; reason?: "idle" } = {}) => {
      const started = Date.now();
      setSignOutState({ phase: "working", message: options.message ?? "Signing you out securely…" });
      try {
        await logout.mutateAsync();
      } catch {
        // The session is dropped on this device either way; the server-side cleanup failing mustn't trap anyone.
      }
      await wait(Math.max(0, MIN_WORKING_MS - (Date.now() - started)));
      setSignOutState({ phase: "done" });
      await wait(DONE_MS);
      navigate("/login", { replace: true, state: options.reason ? { reason: options.reason } : undefined });
      setSignOutState({ phase: "idle" });
    },
    [logout, navigate],
  );
}
