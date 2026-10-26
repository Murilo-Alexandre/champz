/* Champz service worker — mínimo e seguro.
 * Cacheia apenas o shell estático (ícones, CSS/JS versionados de /_next/static).
 * NUNCA cacheia /api, autenticação, fotos privadas (URLs assinadas) ou páginas com dados do usuário. */
const CACHE = "champz-static-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const isStatic = url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
  if (!isStatic) return; // rede direta para todo o resto
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    }),
  );
});
