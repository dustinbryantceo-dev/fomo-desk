// sw.js - app shell for the home-screen app. Network first (a new deploy shows at once), cache as fallback.
// Never caches the encrypted desk data (raw.githubusercontent.com): stale numbers must look stale.
const CACHE = "desk-shell-v15-window";
const SHELL = ["./", "index.html", "app.css", "app.js", "chart.js", "desk-crypto.js", "manifest.json", "icons/apple-touch-icon.png", "icons/icon-192.png", "rocket-logo.png", "rocket-real.png", "rocket-green.png", "rocket-red.png", "rocket-blue.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== "GET") return;
  e.respondWith(fetch(e.request).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request)));
});
// ---------- web push (the desk's outbox) ----------
// Payload {title, body, event, tag, url "./?tab=..."}; no secrets, no desk data beyond the line itself.
self.addEventListener("push", (e) => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "Pump Pilot", {
    body: d.body || "", icon: "icons/icon-192.png", badge: "icons/icon-192.png", tag: d.tag || "pp", renotify: true,
    timestamp: d.ts ? d.ts * 1000 : Date.now(), data: { url: d.url || "./" } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope);
  const tab = url.searchParams.get("tab");
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((cs) => {
    const c = cs.find((x) => x.url.startsWith(self.registration.scope));
    if (c) { c.postMessage({ type: "pp-open", tab }); return c.focus(); }
    return self.clients.openWindow(url.href);
  }));
});
