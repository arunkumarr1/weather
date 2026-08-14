/*
 * Service worker: caches the app shell so the app opens instantly and still
 * loads when offline. Weather API calls are never cached â€” they always go to
 * the network, so you never see stale conditions.
 *
 * Bump CACHE_VERSION whenever the shell files change, otherwise phones will
 * keep serving the old cached copies.
 */
const CACHE_VERSION = "weather-v2";

const SHELL = [
  "./",
  "index.html",
  "styles.css",
  "app.js",
  "manifest.json",
  "vendor/react.production.min.js",
  "vendor/react-dom.production.min.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      // Add individually so one missing file can't fail the whole install.
      Promise.all(
        SHELL.map((url) =>
          cache.add(url).catch(() => {
            /* skip files that aren't there */
          })
        )
      )
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Live data (weather, geocoding) must never come from cache.
  if (url.origin !== self.location.origin) return;

  // App shell: serve from cache first, refresh the copy in the background.
  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
