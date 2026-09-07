// Word Garden Service Worker — cache-first, offline-only strategy.
// Bump CACHE_VERSION to invalidate the old cache after changing app files.
const CACHE_VERSION = "wg-v57";

const APP_FILES = [
  "./",
  "./index.html",
  "./css/styles.css?v=53",
  "./css/theme-light.css?v=51",
  "./css/theme-dark.css?v=51",
  "./css/tokens.css?v=52",
  "./css/refinement.css?v=63",
  "./js/logic.js",
  "./js/storage.js",
  "./js/view.js?v=4",
  "./js/backup.js",
  "./js/review.js?v=39",
  "./js/app.js?v=32",
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
      return cache.addAll(APP_FILES.map(function (url) { return new Request(url, { cache: "reload" }); }));
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
          .filter(function (key) { return key.startsWith("wg-v") && key !== CACHE_VERSION; })
          .map(function (key) { return caches.delete(key); })
      );
    })
  );
  self.clients.claim();
});

// Fetch: serve from cache first, fall back to network.
self.addEventListener("fetch", function (event) {
  // Only handle same-origin GET requests (skip POST, external, etc.).
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      return cached || fetch(event.request);
    })
  );
});
