import { AlertTriangle, ClipboardCopy, RefreshCw, RotateCcw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode, Suspense } from "react";
import { Outlet, useLocation } from "react-router-dom";

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
    this.lastDetails = [`${error.name}: ${error.message}`, error.stack ?? "", info.componentStack ?? "", `at ${window.location.pathname}`]
      .filter(Boolean)
      .join("\n");
    reportClientError({
      kind: isChunkError(error) ? "chunk" : "render",
      message: error.message || String(error),
      stack: error.stack,
      componentStack: info.componentStack ?? undefined,
    });
  }

  private lastDetails = "";

  private retry = () => this.setState({ error: null });

  /** The technical details are never shown on screen; the person can copy them to send to support. */
  private copyDetails = () => {
    void navigator.clipboard?.writeText(this.lastDetails).catch(() => undefined);
  };

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
        <div className="flex flex-wrap justify-center gap-2">
          {!stale && (
            <button
              type="button"
              onClick={this.retry}
              className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] bg-[image:var(--gradient-primary)] px-4 text-sm font-semibold text-white"
            >
              <RotateCcw className="size-4" aria-hidden="true" />
              Try again
            </button>
          )}
          {!stale && (
            <button
              type="button"
              onClick={this.copyDetails}
              className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 text-sm font-semibold text-[var(--color-text)]"
            >
              <ClipboardCopy className="size-4" aria-hidden="true" />
              Copy error details
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              if (!reloadForNewVersion()) window.location.reload();
            }}
            className={`inline-flex h-10 items-center gap-2 rounded-[var(--radius-md)] px-4 text-sm font-semibold ${stale ? "bg-[image:var(--gradient-primary)] text-white" : "border border-[var(--color-border)] text-[var(--color-text)]"}`}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Reload the app
          </button>
        </div>
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
