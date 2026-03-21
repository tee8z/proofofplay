// Service Worker — caches static assets for offline practice mode.
// Network-first for HTML pages, cache-first for static assets.
// HTMX fragment requests are never intercepted.

const CACHE_NAME = "pop-v2";

const STATIC_ASSETS = [
  "/static/styles.min.css",
  "/static/app.min.js",
  "/static/loader.js",
];

// Pages to cache for offline access (cached on first visit, not pre-cached)
const CACHEABLE_PAGES = ["/", "/play", "/leaderboard"];

// Install: pre-cache static assets only (not HTML pages)
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn("SW: failed to pre-cache some assets:", err);
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch strategy
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never intercept HTMX requests — they expect fragments, not full pages
  if (event.request.headers.get("HX-Request")) {
    return;
  }

  // API calls: network only, never cache
  if (url.pathname.startsWith("/api/")) {
    return;
  }

  // WASM + static assets: cache-first, fall back to network
  if (
    url.pathname.startsWith("/static/") ||
    url.pathname.startsWith("/ui/pkg/")
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        });
      })
    );
    return;
  }

  // HTML pages: network-first, cache for offline fallback
  if (event.request.mode === "navigate" && CACHEABLE_PAGES.includes(url.pathname)) {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(() => {
        // Offline: serve cached page, or fall back to /play for practice mode
        return caches.match(event.request).then((cached) => {
          return cached || caches.match("/play");
        });
      })
    );
    return;
  }
});
