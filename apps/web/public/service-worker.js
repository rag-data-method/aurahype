// Service worker mínimo: transforma o site em PWA instalável, com cache do shell
// para carregar rápido e funcionar em conexão fraca. A geração real do site sempre
// vai à API — só o "casco" (HTML, CSS, JS, ícones) é cacheado.
const VERSION = "site-forge-v1";
const CORE_ASSETS = ["/", "/index.html", "/manifest.webmanifest", "/icon.svg", "/icon-maskable.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const looksLikeApi = /\/(jobs|sites)(\/|$)/.test(url.pathname) || url.hostname.includes("execute-api");

  // Chamadas de API vão sempre pela rede, sem cache (dados sempre frescos).
  if (looksLikeApi) return;

  if (sameOrigin && request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("/index.html").then((cached) => cached ?? Response.error()))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok && sameOrigin) {
          const copy = response.clone();
          caches.open(VERSION).then((cache) => cache.put(request, copy));
        }
        return response;
      }).catch(() => cached ?? Response.error());
    })
  );
});
