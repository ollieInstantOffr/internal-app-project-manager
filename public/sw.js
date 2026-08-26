/**
 * Deliberately close to nothing.
 *
 * A service worker is what makes Chrome offer to install the app, and it needs
 * a fetch handler to count. It would be easy to add caching here and much worse
 * for it: Arc is cookie-authenticated, holds a live SSE stream open, and shows
 * data that is wrong the moment it is stale. Serving a cached board, or a page
 * belonging to whoever was signed in last, would be a real bug in exchange for
 * an offline mode nobody asked for.
 *
 * So: navigations fall back to an offline page only when the network actually
 * fails, and everything else passes straight through.
 */
const OFFLINE_URL = "/offline";
const CACHE = "arc-offline-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(OFFLINE_URL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only ever intervene in a page load, and only when the network is gone.
  if (request.mode !== "navigate") return;

  event.respondWith(
    fetch(request).catch(async () => {
      const cached = await caches.match(OFFLINE_URL);
      return cached ?? new Response("Offline", { status: 503 });
    }),
  );
});
