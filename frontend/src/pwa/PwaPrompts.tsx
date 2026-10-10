import { Download, RefreshCw, WifiOff, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/Button";

import { applyUpdate, promptInstall, usePwaState } from "./pwaStore";

const DISMISSED_KEY = "nts-install-dismissed";

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

function rememberDismissed() {
  try {
    window.localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    // Storage blocked — the card just comes back next visit.
  }
}

/** The three app-level notices of an installable app: a slim bar while offline, a card when an update
 * is ready (never applied automatically, so it can't interrupt a form being filled in), and an
 * "Install" card the browser's install prompt makes possible. */
export function PwaPrompts() {
  const { updateReady, canInstall, online } = usePwaState();
  const [installHidden, setInstallHidden] = useState(wasDismissed);

  return (
    <>
      {!online && (
        <div
          role="status"
          className="fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 bg-[var(--color-warning)] px-4 py-1.5 text-center text-sm font-medium text-white"
        >
          <WifiOff className="size-4 shrink-0" aria-hidden="true" />
          You're offline — saved screens still open, but changes can't be sent until you're back online.
        </div>
      )}

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-3 p-4 sm:items-end">
        {updateReady && (
          <div
            role="status"
            className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-[var(--shadow-md)]"
          >
            <RefreshCw className="size-5 shrink-0 text-[var(--color-primary)]" aria-hidden="true" />
            <p className="flex-1 text-sm text-[var(--color-text)]">A new version is ready.</p>
            <Button size="sm" onClick={applyUpdate}>
              Reload
            </Button>
          </div>
        )}

        {canInstall && !installHidden && (
          <div
            role="dialog"
            aria-label="Install the app"
            className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-[var(--shadow-md)]"
          >
            <img src="/icons/icon-192.png" alt="" className="size-10 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[var(--color-text)]">Install NTS School</p>
              <p className="text-xs text-[var(--color-text-muted)]">Open it like an app, straight from your home screen.</p>
            </div>
            <Button size="sm" onClick={() => void promptInstall()}>
              <Download className="size-4" aria-hidden="true" /> Install
            </Button>
            <button
              type="button"
              aria-label="Not now"
              onClick={() => {
                rememberDismissed();
                setInstallHidden(true);
              }}
              className="shrink-0 rounded p-1 text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)]"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
