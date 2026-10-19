import { AlertTriangle, RefreshCw, RotateCcw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode, Suspense, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";

import { Button } from "@/components/ui/Button";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { reportClientError } from "@/lib/clientErrors";
import { isChunkError, reloadForNewVersion } from "@/lib/lazyRetry";

interface Props {
  children: ReactNode;
  /** When this changes (the user navigated), a previous crash is forgotten and the new page gets a clean try. */
  resetKey?: string;
  /** Fill the whole screen (the outermost boundary) instead of just the page area. */
  fullScreen?: boolean;
}

interface State {
  error: Error | null;
  /** The `resetKey` this state was last reconciled with. */
  seenKey?: string;
}

/** The two ways out of the recovery screen. Each shows an activity indicator the moment it is pressed, and both are locked
 * while one is working, so a second tap on a slow phone cannot start a second reload. */
function RecoveryButtons({ stale, onRetry }: { stale: boolean; onRetry: () => void }) {
  const [busy, setBusy] = useState<"retry" | "reload" | null>(null);
  const retry = () => {
    setBusy("retry");
    window.setTimeout(() => {
      onRetry();
      setBusy(null);
    }, 700);
  };
  const reload = () => {
    setBusy("reload");
    window.setTimeout(() => {
      if (!reloadForNewVersion()) window.location.reload();
    }, 300);
  };
  return (
    <div className="flex w-full max-w-sm flex-col justify-center gap-2 sm:w-auto sm:max-w-none sm:flex-row">
      {!stale && (
        <Button onClick={retry} isLoading={busy === "retry"} disabled={busy !== null}>
          <RotateCcw className="size-4" aria-hidden="true" />
          Try again
        </Button>
      )}
      <Button variant={stale ? "primary" : "secondary"} onClick={reload} isLoading={busy === "reload"} disabled={busy !== null}>
        <RefreshCw className="size-4" aria-hidden="true" />
        Reload the app
      </Button>
    </div>
  );
}

/** Catches a crash while rendering (or loading) part of the app and shows a friendly recovery screen, so one broken
 * page never turns the entire app into a blank white screen. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, seenKey: this.props.resetKey };

  /** A page that crashes gets one silent fresh try before the recovery screen appears: many crashes are a one-off
   * (a half-loaded response, a browser extension or translator touching the page) and succeed on a clean render.
   * Reset whenever the route changes. */
  private autoRetried = false;
  private lastKey = this.props.resetKey;

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  // Navigating to another page forgets a previous crash, so one bad page doesn't poison the rest of the app.
  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (props.resetKey !== state.seenKey) return { error: null, seenKey: props.resetKey };
    return null;
  }

  componentDidUpdate() {
    if (this.props.resetKey !== this.lastKey) {
      this.lastKey = this.props.resetKey;
      this.autoRetried = false;
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (!this.autoRetried && !isChunkError(error)) {
      this.autoRetried = true;
      window.setTimeout(() => this.setState({ error: null }), 0);
    }
    reportClientError({
      kind: isChunkError(error) ? "chunk" : "render",
      message: error.message || String(error),
      stack: error.stack,
      componentStack: info.componentStack ?? undefined,
    });
  }

  private retry = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const stale = isChunkError(error);
    return (
      <div
        role="alert"
        className={`flex w-full flex-col items-center justify-center gap-4 px-4 py-16 text-center ${this.props.fullScreen ? "min-h-full bg-[var(--color-bg-subtle)]" : "min-h-[50vh]"}`}
      >
        <span className="flex size-14 items-center justify-center rounded-2xl bg-[color-mix(in_srgb,var(--color-warning)_15%,transparent)] text-[var(--color-warning)]">
          <AlertTriangle className="size-7" aria-hidden="true" />
        </span>
        <div className="max-w-md">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">
            {stale ? "This page couldn't be loaded" : "Something went wrong while loading this page"}
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {stale
              ? "The app may have been updated while this tab was open, or your connection dropped. Reload to get the latest version."
              : "The page hit an unexpected problem. You can try again, or carry on from another page."}
          </p>
        </div>
        <RecoveryButtons stale={stale} onRetry={this.retry} />
      </div>
    );
  }
}

/** The area where a page renders inside a layout: its own boundary (the sidebar and header stay usable when a page
 * crashes) and its own loading fallback. Resets whenever the route changes. */
export function PageOutlet() {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary resetKey={pathname}>
      <Suspense fallback={<FullPageSpinner />}>
        <Outlet />
      </Suspense>
    </ErrorBoundary>
  );
}
