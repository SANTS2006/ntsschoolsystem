import { CloudOff, Loader2 } from "lucide-react";

import { useConnection } from "@/lib/connection";

/** A calm, non-blocking notice while the connection is offline or requests are being retried. Nothing is lost: the app keeps
 * the page as it is and tries again by itself. */
export function ConnectionBanner() {
  const { offline, retrying } = useConnection();
  if (!offline && !retrying) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-3 z-[80] flex justify-center px-3"
    >
      <div className="pointer-events-auto flex max-w-md items-center gap-2.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs font-medium text-[var(--color-text)] shadow-[var(--shadow-md)]">
        {offline ? (
          <CloudOff className="size-4 shrink-0 text-[var(--color-warning)]" aria-hidden="true" />
        ) : (
          <Loader2 className="size-4 shrink-0 animate-spin text-[var(--color-primary)]" aria-hidden="true" />
        )}
        <span>
          {offline
            ? "You're offline. Your page is safe, and the app will carry on when you're back online."
            : "Slow or unstable connection — still trying. Please don't press the button again."}
        </span>
      </div>
    </div>
  );
}
