// Insert into parallel-water's isolation-sw.js, retaining its sole fetch listener.
// Cache only content-hashed Vite assets. First-map filenames currently are NOT hashes.
const STARTUP_CACHE = 'dgm-startup-immutable-v1';
const STARTUP_CACHE_LIMIT = 64;
async function startupResponse(request) {
  const url = new URL(request.url);
  const scope = new URL(self.registration.scope);
  const immutable = request.method === 'GET' && url.origin === scope.origin &&
    url.pathname.startsWith(scope.pathname + 'assets/') &&
    /-[A-Za-z0-9_-]{8,}\.(js|css|wasm)$/.test(url.pathname) && !url.search;
  if (!immutable) return fetch(request);
  let cache;
  try { cache = await caches.open(STARTUP_CACHE); const hit = await cache.match(request); if (hit) return hit; }
  catch { return fetch(request); }
  const response = await fetch(request);
  if (response.ok && !response.redirected && response.type !== 'opaque') {
    try {
      await cache.put(request, response.clone());
      const keys = await cache.keys();
      for (const key of keys.slice(0, Math.max(0, keys.length - STARTUP_CACHE_LIMIT))) await cache.delete(key);
    } catch { /* Storage is optional; the network response is still valid. */ }
  }
  return response;
}
