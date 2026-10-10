/* NTS School System service worker.
 *
 * Goals: the app installs, opens instantly, and still opens (showing an offline notice) with no
 * connection. What it deliberately does NOT do: cache anything from /api/ or any other origin. Those
 * responses are private, per-user and change constantly, so they always go to the network — nothing
 * about a signed-in user is ever stored by the worker, and signing out leaves nothing behind.
 *
 *  - Navigations: network first, so a new deploy is picked up immediately; the HTML shell is kept as the
 *    offline fallback (it's the same for every user and contains no data).
 *  - /assets/* (content-hashed by Vite, immutable): cache first.
 *  - Icons, manifest, logo: stale-while-revalidate.
 *
 * Bump VERSION to drop every old cache on the next activation.
 */
const VERSION = "v3";
const SHELL_CACHE = `nts-shell-${VERSION}`;
const ASSET_CACHE = `nts-assets-${VERSION}`;
const STATIC_CACHE = `nts-static-${VERSION}`;
const KNOWN_CACHES = [SHELL_CACHE, ASSET_CACHE, STATIC_CACHE];

const STATIC_URLS = [
  "/manifest.webmanifest",
  "/nts-logo.webp",
  "/theme-init.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline — NTS School System</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#060b1f;color:#e6eefc;text-align:center;padding:24px}main{max-width:380px}h1{font-size:1.25rem}p{color:#93a8d6;line-height:1.5}button{margin-top:12px;padding:10px 20px;border:0;border-radius:8px;background:#1565c0;color:#fff;font-size:1rem}</style></head><body><main><h1>You're offline</h1><p>NTS School System needs a connection the first time it opens. Check your network and try again.</p><button onclick="location.reload()">Try again</button></main></body></html>`;

/** Hashed asset URLs the HTML shell references, so the app can open offline straight after install. */
async function shellAssetUrls(html) {
  const urls = new Set();
  for (const match of html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)) urls.add(match[1]);
  return [...urls];
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      // The app's own shell (the website owns "/", so ask for an app-only address).
      const response = await fetch("/find-school", { cache: "no-store" });
      if (response.ok) {
        const html = await response.clone().text();
        await shell.put("/", response);
        const assets = await caches.open(ASSET_CACHE);
        await Promise.allSettled(
          (await shellAssetUrls(html)).map(async (url) => {
            const asset = await fetch(url);
            if (asset.ok) await assets.put(url, asset);
          }),
        );
      }
      const statics = await caches.open(STATIC_CACHE);
      await Promise.allSettled(STATIC_URLS.map((url) => statics.add(url)));
      // No skipWaiting() here: an update waits until the user chooses "Reload" (see the message
      // handler), so a new version never swaps in underneath a half-filled form.
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith("nts-") && !KNOWN_CACHES.includes(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return hit || (await refresh) || Response.error();
}

async function navigation(request) {
  try {
    const response = await fetch(request);
    // Keep the newest shell for offline use (every route serves the same single-page shell).
    if (
      response.ok &&
      response.headers.get("content-type")?.includes("text/html") &&
      response.headers.get("x-nts-surface") !== "marketing" // a marketing page is not the app's offline shell
    ) {
      (await caches.open(SHELL_CACHE)).put("/", response.clone());
    }
    return response;
  } catch {
    const shell = await (await caches.open(SHELL_CACHE)).match("/");
    return (
      shell ||
      new Response(OFFLINE_HTML, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } })
    );
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Cloudinary, Daily.co, ... — never touched
  if (url.pathname.startsWith("/api/")) return; // private, per-user data — always the network

  if (request.mode === "navigate") {
    event.respondWith(navigation(request));
  } else if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
  } else if (STATIC_URLS.includes(url.pathname) || url.pathname.startsWith("/icons/")) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
  }
});
