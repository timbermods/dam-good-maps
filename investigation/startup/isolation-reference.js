// Adoption candidate: ONE fetch listener shared with any future offline cache.
// Bump this version when changing policy. Do not skipWaiting during an active edit.
const POLICY_VERSION = 'parallel-water-v1';
self.addEventListener('install', () => {});
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_WHEN_SAFE') self.skipWaiting();
  if (event.data?.type === 'VERSION') event.source?.postMessage({version:POLICY_VERSION});
});
function isolate(response) {
  // An opaque response is unreadable. Never invent CORP permission on somebody else's resource.
  if (response.type === 'opaque' || response.status === 0) return response;
  const headers = new Headers(response.headers);
  headers.set('Cross-Origin-Opener-Policy','same-origin');
  headers.set('Cross-Origin-Embedder-Policy','require-corp');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
self.addEventListener('fetch', event => {
  const request=event.request;
  if (request.cache==='only-if-cached' && request.mode!=='same-origin') return;
  const url=new URL(request.url);
  if (url.origin!==self.location.origin) return;
  // Put the startup investigation's network/cache selection HERE; policy must run
  // after BOTH network and cache hits, including cached navigation and worker scripts.
  event.respondWith(fetch(request).then(isolate));
});
