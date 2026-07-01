// FieldTrack KSA — Service Worker
// Strategy:
//   - App shell (HTML/JS/CSS): cache-first so the app loads offline
//   - API calls (/api/v1/*): network-only (data must be fresh; offline
//     lead submission is handled by IndexedDB in upload-queue.ts)
//   - Static assets (images, fonts): stale-while-revalidate

const CACHE_NAME = "fieldtrack-shell-v1";

// Core app shell files that must load for the driver app to start
const SHELL_URLS = [
  "/",
  "/driver",
  "/driver/home",
  "/driver/check-in",
  "/driver/navigation",
  "/driver/lead-form",
  "/driver/sync",
];

// ── Install: pre-cache the app shell ────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting()),
  );
});

// ── Activate: remove stale caches from previous versions ────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// ── Fetch: route-based strategy ──────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Non-GET requests (POST/PUT/PATCH/DELETE) always go to the network.
  // Offline lead uploads are queued in IndexedDB by upload-queue.ts.
  if (request.method !== "GET") return;

  // API calls — network only; never serve stale data
  if (url.pathname.startsWith("/api/")) return;

  // Navigation requests (driver opens app while offline) — serve shell from cache
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match("/").then((cached) => cached ?? Response.error()),
      ),
    );
    return;
  }

  // Static assets (JS chunks, CSS, images) — stale-while-revalidate
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(request);
      const networkFetch = fetch(request).then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      });
      return cached ?? networkFetch;
    }),
  );
});
