// sw.js - app shell for the home-screen app. Network first (a new deploy shows at once), cache as fallback.
// Never caches the encrypted desk data (raw.githubusercontent.com): stale numbers must look stale.
const CACHE = "desk-shell-v10-polish";
const SHELL = ["./", "index.html", "app.css", "app.js", "chart.js", "desk-crypto.js", "manifest.json", "icons/apple-touch-icon.png", "icons/icon-192.png", "rocket-logo.png", "rocket-real.png", "rocket-green.png", "rocket-red.png", "rocket-blue.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
