/*
 * Service worker: keeps the app usable offline without ever showing you a stale
 * build. Weather API calls are never cached, so conditions are always live.
 *
 * build.ps1 bumps CACHE_VERSION automatically. Keep this file ASCII-only.
 */
const CACHE_VERSION = "weather-v3";

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

  /*
   * Network-first for the app shell, falling back to cache when offline.
   *
   * Cache-first would be marginally faster to open, but it serves the previous
   * build on the first launch after an update -- so a change looks like it
   * didn't deploy until you close and reopen the app. Correctness wins here;
   * the shell is a few KB and the cache still covers offline use.
   */
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req))
  );
});
