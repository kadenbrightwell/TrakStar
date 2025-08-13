/* Simple offline + notification helper */
const CACHE = "trakstar-v6"; // bump
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
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  const isGet = req.method === "GET";
  const isSameOrigin = url.origin === location.origin;

  // App shell
  if (isGet && isSameOrigin && (url.pathname === "/" || ASSETS.includes(url.pathname.slice(1)))) {
    event.respondWith(
      caches.match(req).then(cached => {
        const fetcher = fetch(req).then(r => {
          const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy));
          return r;
        }).catch(() => cached);
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
