/* Simple offline + notification helper — FIXED */
const CACHE = "trakstar-v5";
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
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

/**
 * Strategy:
 * - Network only for cross-origin + /plaid/* + /bank/* (fresh data).
 * - Network-first for navigations.
 * - Stale-while-revalidate for same-origin static assets.
 */
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const isHTML = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");
  const isAPI = !sameOrigin || url.pathname.startsWith("/plaid/") || url.pathname.startsWith("/bank/");

  if (isAPI) {
    event.respondWith(fetch(req, { cache: "no-store" }).catch(() => caches.match("./")));
    return;
  }
  if (isHTML) {
    event.respondWith(
      fetch(req).then((res) => {
        caches.open(CACHE).then((c) => c.put(req, res.clone())).catch(()=>{});
        return res;
      }).catch(() => caches.match("./"))
    );
    return;
  }
  if (req.method === "GET") {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetcher = fetch(req).then((res) => {
          if (res && res.ok) caches.open(CACHE).then((c) => c.put(req, res.clone())).catch(()=>{});
          return res;
        }).catch(() => cached || caches.match("./"));
        return cached || fetcher;
      })
    );
    return;
  }
  event.respondWith(fetch(req));
});

self.addEventListener("message", (evt) => {
  if (evt.data && evt.data.type === "showNotification") {
    const { title, body, tag } = evt.data;
    self.registration.showNotification(title, { body, tag, icon: "icon.png", badge: "icon.png" });
  }
});
