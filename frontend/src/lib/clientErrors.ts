/** Reports problems that happen in people's browsers — a page that crashed, a script that failed to load, a promise
 * nobody caught — to the server log (and the console), so they can be found and fixed instead of staying a blank
 * screen on someone's phone. Never sends anything sensitive: just what failed, where, and the browser. */

interface Report {
  kind: "render" | "chunk" | "unhandled-rejection" | "window-error" | "api";
  message: string;
  stack?: string;
  componentStack?: string;
}

const seen = new Map<string, number>();
const WINDOW_MS = 10_000;
const MAX_PER_MINUTE = 6;
let sentThisMinute = 0;
let minuteStartedAt = Date.now();

function throttled(key: string): boolean {
  const now = Date.now();
  if (now - minuteStartedAt > 60_000) {
    minuteStartedAt = now;
    sentThisMinute = 0;
  }
  const last = seen.get(key);
  if (last !== undefined && now - last < WINDOW_MS) return true;
  seen.set(key, now);
  sentThisMinute += 1;
  return sentThisMinute > MAX_PER_MINUTE;
}

export function reportClientError(report: Report): void {
  // Always visible in the browser console for whoever is debugging.
  console.error(`[${report.kind}] ${report.message}`, report.stack ?? "");
  if (throttled(`${report.kind}:${report.message}`)) return;

  const body = JSON.stringify({
    kind: report.kind,
    message: report.message.slice(0, 500),
    stack: report.stack?.slice(0, 2000),
    component_stack: report.componentStack?.slice(0, 2000),
    url: `${window.location.pathname}`.slice(0, 300),
    user_agent: navigator.userAgent.slice(0, 300),
  });
  try {
    // Fire and forget — reporting a failure must never cause another one.
    void fetch("/api/v1/client-errors/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // ignore
  }
}

/** Installs the last-resort handlers: uncaught errors and promise rejections, and Vite's "a lazy chunk failed to
 * preload" event (normally a stale page after a new deploy). */
export function installGlobalErrorHandlers(): void {
  window.addEventListener("error", (event) => {
    // Resource load errors (an <img> 404) bubble differently and aren't script crashes.
    if (!event.error && !event.message) return;
    reportClientError({
      kind: "window-error",
      message: event.message || String(event.error),
      stack: (event.error as Error | undefined)?.stack,
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason as { message?: string; stack?: string } | string | undefined;
    // API errors are handled where they happen (toasts, error states); only report genuine surprises.
    if (reason && typeof reason === "object" && "code" in reason) return;
    reportClientError({
      kind: "unhandled-rejection",
      message: typeof reason === "string" ? reason : (reason?.message ?? "Unhandled promise rejection"),
      stack: typeof reason === "object" ? reason?.stack : undefined,
    });
  });
  window.addEventListener("vite:preloadError", (event) => {
    // The lazy-route wrapper (lib/lazyRetry.ts) decides how to recover; this just keeps Vite from throwing again.
    event.preventDefault();
    reportClientError({ kind: "chunk", message: "A page script failed to preload (likely a new version was deployed)." });
  });
}
