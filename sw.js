const CACHE = "fsrp-ops-v4.2.0";
const CORE = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/assets/brand/fsrp-logo.png",
  "/css/base.css",
  "/css/navigation.css",
  "/css/pages.css",
  "/css/cad.css",
  "/css/staff-ops.css",
  "/css/command-suite.css",
  "/css/community-suite.css",
  "/css/live-radio.css",
  "/js/config.js",
  "/js/store.js",
  "/js/router.js",
  "/js/app.js",
  "/js/cad.js",
  "/js/staff-ops.js",
  "/js/command-suite.js",
  "/js/community-suite.js",
  "/js/live-radio.js"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put("/index.html", copy)).catch(() => undefined);
          return response;
        })
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone())).catch(() => undefined);
      return response;
    }))
  );
});
