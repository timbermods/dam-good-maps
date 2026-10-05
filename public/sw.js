// The site's one service worker (PLAN §20 D397). GitHub Pages can't send headers, so this adds the two that make
// a page cross-origin isolated, which the multi-core water needs (src/core/sim/parallel.ts):
// Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp, on every same-origin
// response of its scope (the site, or /preview/ for a preview build's own copy), pages and worker scripts alike.
// It changes nothing else: requests to other origins, the roadmap canvas (/roadmap/, which reads other sites
// live) and anything but GET go straight to the network untouched, and nothing is cached. src/platform/
// isolation.ts registers it and reloads a first visit once. When startup's caching joins (D397), it goes in this
// worker's one fetch handler, and updates then wait for a safe moment instead of taking over at once.

const BASE = new URL("./", self.location.href).pathname;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

function isolated(response) {
  // an opaque or redirect response can't be read or changed
  if (response.type === "opaque" || response.type === "opaqueredirect" || response.status === 0) return response;
  const headers = new Headers(response.headers);
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  if (request.cache === "only-if-cached" && request.mode !== "same-origin") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  if (url.pathname.startsWith(`${BASE}roadmap/`) || url.pathname === `${BASE}roadmap`) return;
  event.respondWith(fetch(request).then(isolated));
});
