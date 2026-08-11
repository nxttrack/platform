const CACHE = "nxttrack-static-v1";
const STATIC = ["/lovable/nxttrack-logo.svg"];
const PORTAL_MODE_CACHE = "nxttrack-portal-mode-v1";
const PORTAL_MODE_KEY = "/__nxttrack_portal_mode__";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(STATIC)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => ![CACHE, PORTAL_MODE_CACHE].includes(key)).map((key) => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "PORTAL_MODE" || !["parent", "child", "locked"].includes(event.data.mode)) return;
  event.waitUntil(caches.open(PORTAL_MODE_CACHE).then((cache) => cache.put(
    PORTAL_MODE_KEY,
    new Response(JSON.stringify({ mode: event.data.mode }), { headers: { "Content-Type": "application/json" } })
  )));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Private pages and API responses are deliberately never cached.
  if (request.mode === "navigate" || url.pathname.startsWith("/api/") || request.headers.has("authorization")) return;
  if (!url.pathname.startsWith("/_next/static/") && !STATIC.includes(url.pathname)) return;

  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok) caches.open(CACHE).then((cache) => cache.put(request, response.clone()));
    return response;
  })));
});

self.addEventListener("push", (event) => {
  let payload = { title: "NXTTRACK", body: "Er staat een nieuwe update voor je klaar.", url: "/" };
  try {
    const candidate = event.data ? event.data.json() : null;
    if (candidate && typeof candidate === "object") {
      payload = {
        title: typeof candidate.title === "string" ? candidate.title.slice(0, 80) : payload.title,
        body: typeof candidate.body === "string" ? candidate.body.slice(0, 180) : payload.body,
        url: typeof candidate.url === "string" && candidate.url.startsWith("/") && !candidate.url.startsWith("//") ? candidate.url : "/"
      };
    }
  } catch {}
  event.waitUntil(readPortalMode().then((mode) => {
    if (mode !== "parent") return;
    return self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/lovable/nxttrack-logo.svg",
      badge: "/lovable/nxttrack-logo.svg",
      data: { url: payload.url },
      tag: "nxttrack-service-update"
    });
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data && typeof event.notification.data.url === "string" ? event.notification.data.url : "/";
  event.waitUntil(Promise.all([readPortalMode(), self.clients.matchAll({ type: "window", includeUncontrolled: true })]).then(([mode, clients]) => {
    if (mode !== "parent") return self.clients.openWindow("/kind");
    const existing = clients.find((client) => new URL(client.url).pathname === path);
    if (existing) return existing.focus();
    return self.clients.openWindow(path);
  }));
});

async function readPortalMode() {
  const cache = await caches.open(PORTAL_MODE_CACHE);
  const response = await cache.match(PORTAL_MODE_KEY);
  if (!response) return "locked";
  try {
    const value = await response.json();
    return value && ["parent", "child", "locked"].includes(value.mode) ? value.mode : "locked";
  } catch {
    return "locked";
  }
}
