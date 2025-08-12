/* Simple offline + notification helper */
const CACHE = "trakstar-v2";
const ASSETS = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "bank.js",
  "manifest.json",
  "icon.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", e => {
  const req = e.request;
  e.respondWith(
    caches.match(req).then(res => res || fetch(req).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
      return r;
    }).catch(()=>caches.match("./")))
  );
});

// Notification shim: allow main page to call showNotification via SW
self.addEventListener("message", evt => {
  if (evt.data && evt.data.type === "showNotification") {
    const { title, body, tag } = evt.data;
    self.registration.showNotification(title, { body, tag, icon: "icon.png", badge: "icon.png" });
  }
});
