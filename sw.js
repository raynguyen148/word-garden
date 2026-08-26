// Word Garden Service Worker — cache-first, offline-only strategy.
// Bump CACHE_VERSION to invalidate the old cache after changing app files.
const CACHE_VERSION = "wg-v28";

const APP_FILES = [
  "./",
  "./index.html",
  "./styles.css?v=28",
  "./logic.js",
  "./storage.js",
  "./view.js",
  "./backup.js",
  "./review.js?v=24",
  "./app.js?v=25",
  "./favicon.svg",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
];

// Install: precache every app file.
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(APP_FILES);
    })
  );
  self.skipWaiting();
});

// Activate: delete old caches so updated files take effect.
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys
          .filter(function (key) { return key !== CACHE_VERSION; })
          .map(function (key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

// Fetch: serve from cache first, fall back to network.
self.addEventListener("fetch", function (event) {
  // Only handle same-origin GET requests (skip POST, external, etc.).
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      return cached || fetch(event.request);
    })
  );
});
