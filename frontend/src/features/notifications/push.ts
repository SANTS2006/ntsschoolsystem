import { apiClient } from "@/lib/api-client";

/** Web Push helpers. Push needs a service worker, the Push API and the Notification API; iPhones only offer it to an app
 * that was added to the home screen. Everything here degrades to "not supported" rather than throwing. */

export type PushState = "unsupported" | "blocked" | "off" | "on";

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.ready);
  } catch {
    return null;
  }
}

const WANTED_KEY = "nts-push-wanted";

/** Whether this person turned alerts on for this browser (kept so signing back in re-subscribes without asking again). */
export function pushWanted(): boolean {
  try {
    return localStorage.getItem(WANTED_KEY) === "1";
  } catch {
    return false;
  }
}

function setPushWanted(value: boolean) {
  try {
    if (value) localStorage.setItem(WANTED_KEY, "1");
    else localStorage.removeItem(WANTED_KEY);
  } catch {
    // Private mode: alerts still work for this session, they just will not be remembered.
  }
}

export async function fetchPushConfig(): Promise<{ enabled: boolean; public_key: string }> {
  const { data } = await apiClient.get<{ enabled: boolean; public_key: string }>("/notifications/push/key/");
  return data;
}

export async function currentPushState(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

/** Asks permission (must be called from a click), subscribes this browser and tells the server. */
export async function enablePush(): Promise<PushState> {
  if (!pushSupported()) return "unsupported";
  const config = await fetchPushConfig();
  if (!config.enabled) throw new Error("Alerts are not switched on for this system yet.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "blocked" : "off";
  const reg = await registration();
  if (!reg) throw new Error("The app is not ready for alerts yet. Reload the page and try again.");
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(config.public_key) }));
  const json = sub.toJSON();
  await apiClient.post("/notifications/push/subscription/", { endpoint: sub.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth });
  setPushWanted(true);
  return "on";
}

/** Stops alerts on this browser: tells the server and drops the browser's subscription. Safe to call when not subscribed.
 * `remember: false` is for signing out: the device stops being alerted for that person, but the choice is kept so the next
 * sign-in on this browser can switch alerts back on by itself. */
export async function disablePush({ remember = true }: { remember?: boolean } = {}): Promise<void> {
  if (remember) setPushWanted(false);
  if (!pushSupported()) return;
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  try {
    await apiClient.delete("/notifications/push/subscription/", { data: { endpoint: sub.endpoint } });
  } catch {
    // Offline or already signed out: the server forgets it the next time the push service reports the device gone.
  }
  await sub.unsubscribe();
}
