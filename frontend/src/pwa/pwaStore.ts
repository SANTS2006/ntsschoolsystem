import { useSyncExternalStore } from "react";

/** The browser's install prompt event — not in TypeScript's DOM types. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface PwaState {
  /** A new version of the app has been downloaded and is waiting for the user to switch to it. */
  updateReady: boolean;
  /** The browser offered to install the app and the user hasn't yet. */
  canInstall: boolean;
  online: boolean;
}

let state: PwaState = { updateReady: false, canInstall: false, online: typeof navigator === "undefined" ? true : navigator.onLine };
const listeners = new Set<() => void>();
let waitingWorker: ServiceWorker | null = null;
let installEvent: BeforeInstallPromptEvent | null = null;
let reloadOnControllerChange = false;

function update(patch: Partial<PwaState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePwaState(): PwaState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}

/** Switches to the downloaded version: tells the waiting worker to take over, then reloads once it has. */
export function applyUpdate() {
  if (!waitingWorker) return;
  reloadOnControllerChange = true;
  waitingWorker.postMessage("SKIP_WAITING");
}

/** Shows the browser's install dialog. Resolves to whether the user accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!installEvent) return false;
  const event = installEvent;
  installEvent = null;
  update({ canInstall: false });
  await event.prompt();
  return (await event.userChoice).outcome === "accepted";
}

function trackWaitingWorker(worker: ServiceWorker | null | undefined) {
  if (worker && navigator.serviceWorker.controller) {
    waitingWorker = worker;
    update({ updateReady: true });
  }
}

/** Registers the service worker (production builds only — in development it would cache stale code)
 * and wires up the install / update / online state. Safe to call once at startup. */
export function initPwa() {
  window.addEventListener("online", () => update({ online: true }));
  window.addEventListener("offline", () => update({ online: false }));
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault(); // we show our own prompt, at a moment of our choosing
    installEvent = event as BeforeInstallPromptEvent;
    update({ canInstall: true });
  });
  window.addEventListener("appinstalled", () => {
    installEvent = null;
    update({ canInstall: false });
  });

  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloadOnControllerChange) window.location.reload();
  });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then((registration) => {
        trackWaitingWorker(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const installing = registration.installing;
          installing?.addEventListener("statechange", () => {
            if (installing.state === "installed") trackWaitingWorker(installing);
          });
        });
        // Long-lived installed apps rarely reload; check for a new version hourly.
        window.setInterval(() => void registration.update(), 60 * 60 * 1000);
      })
      .catch((error) => console.warn("Service worker registration failed", error));
  });
}
