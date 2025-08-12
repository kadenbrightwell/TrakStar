/* Simple offline + notification helper — FIXED to not cache API calls */
const CACHE = "trakstar-v4"; // bump to flush old cached API responses
const ASSETS = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "bank.js",
  "manifest.json",
  "icon.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

/**
 * Caching strategy:
 * - Network only for cross-origin requests and any /plaid/* or /bank/* API (fresh data).
 * - Network-first for navigations (HTML) with offline fallback.
 * - Stale-while-revalidate for same-origin static assets (CSS/JS/img).
 */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isHTML = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");
  const isAPI =
    (sameOrigin && (url.pathname.startsWith("/plaid/") || url.pathname.startsWith("/bank/"))) ||
    !sameOrigin; // any cross-origin request is treated as API/network data

  // Always go to network for API/cross-origin & do NOT cache
  if (isAPI) {
    event.respondWith(
      fetch(req, { cache: "no-store" }).catch(() => caches.match("./"))
    );
    return;
  }

  // Navigations: network-first with offline fallback
  if (isHTML) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("./"))
    );
    return;
  }

  // Same-origin static assets: stale-while-revalidate
  if (req.method === "GET") {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req)
          .then((res) => {
            if (res && res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone())).catch(() => {});
            return res;
          })
          .catch(() => cached || caches.match("./"));
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Default pass-through
  event.respondWith(fetch(req));
});

// Notification shim (unchanged)
self.addEventListener("message", (evt) => {
  if (evt.data && evt.data.type === "showNotification") {
    const { title, body, tag } = evt.data;
    self.registration.showNotification(title, { body, tag, icon: "icon.png", badge: "icon.png" });
  }
});
