// The site's one service worker (PLAN §20 D397). GitHub Pages can't send headers, so this adds the two that make
// a page cross-origin isolated, which the multi-core water needs (src/core/sim/parallel.ts):
// Cross-Origin-Opener-Policy: same-origin and Cross-Origin-Embedder-Policy: require-corp, on every same-origin
// response of its scope (the site, or /preview/ for a preview build's own copy), pages and worker scripts alike.
// It also keeps the build's content-hashed scripts, styles and Wasm (its assets/ folder), so a return visit opens
// without downloading them again (D367, D397). Nothing else is kept: pages, projects, maps, sounds, requests with
// a query or a range, and partial answers always go to the network. Requests to other origins, the roadmap canvas
// (/roadmap/, which reads other sites live) and anything but GET go straight to the network untouched.
// src/platform/isolation.ts registers it and reloads a first visit once; on a host that sends the headers itself,
// the page registers it once the map is editable (cacheAfterEditable). A new version never takes over an open
// page: it waits until every tab using the old one has closed, so a map being edited is never reloaded.

const BASE = new URL("./", self.location.href).pathname;
// one cache per scope, so the site and a preview never evict each other's files
const CACHE = `dgm-assets-v1:${BASE}`;
const CACHE_LIMIT = 64;

// (no skipWaiting: the first install activates at once anyway, and an update waits for the old tabs to close)
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
  event.respondWith(answer(event, url).then(isolated));
});

/** A build file whose name carries its content's hash: the same name always holds the same bytes. */
function immutable(request, url) {
  return (
    url.pathname.startsWith(`${BASE}assets/`) &&
    /-[A-Za-z0-9_-]{8,}\.(js|css|wasm)$/.test(url.pathname) &&
    !url.search &&
    !request.headers.has("range")
  );
}

async function answer(event, url) {
  const request = event.request;
  if (!immutable(request, url)) return fetch(request);
  let cache;
  try {
    cache = await caches.open(CACHE);
    const hit = await cache.match(request);
    if (hit) return hit;
  } catch {
    return fetch(request); // storage is optional: the network still answers
  }
  const response = await fetch(request);
  if (response.status === 200 && !response.headers.has("content-range") && !response.redirected && response.type !== "opaque") {
    // kept once the page has its answer, never holding it up
    event.waitUntil(keep(cache, request, response.clone()));
  }
  return response;
}

async function keep(cache, request, response) {
  try {
    await cache.put(request, response);
    const keys = await cache.keys();
    for (const key of keys.slice(0, Math.max(0, keys.length - CACHE_LIMIT))) await cache.delete(key);
  } catch {
    // a full or unavailable cache only means the network answers next time
  }
}
