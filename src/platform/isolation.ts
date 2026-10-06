// Cross-origin isolation for the multi-core water (PLAN §20 D397; src/core/sim/parallel.ts needs
// SharedArrayBuffer, which a browser gives only a cross-origin isolated page). GitHub Pages can't send the
// headers, so the site's one service worker (public/sw.js) adds them. On a first visit this registers it and,
// once it controls the page, reloads once, before anything else has run (platform/index.ts imports this first
// and waits for it); a hard reload, which skips the worker, reloads once too. A page already isolated (the
// worker's own reload, or a server sending the headers, as `npm run dev` and the tests' preview do) goes straight
// on, as does every browser where it can't help: WebKit (whose water stays on one thread), no service workers
// (a private window), or the worker failing. Never two reloads within a few seconds, whatever happens.

const KEY = "dgm.isolation-reload";
const FAILED = "dgm.isolation-failed";

async function isolate(): Promise<void> {
  if (typeof window === "undefined" || window.crossOriginIsolated || !window.isSecureContext) return;
  if (!("serviceWorker" in navigator)) return;
  const ua = navigator.userAgent;
  if (/AppleWebKit/.test(ua) && !/Chrome\/|Chromium\//.test(ua)) return;
  try {
    if (localStorage.getItem(FAILED)) return;
    if (Date.now() - Number(sessionStorage.getItem(KEY) ?? 0) < 10_000) {
      // just reloaded through the worker and still not isolated: this browser won't be, so stop trying
      if (navigator.serviceWorker.controller) localStorage.setItem(FAILED, "1");
      return;
    }
  } catch {
    return; // no storage: no guard against reloading again, so no reload at all
  }
  try {
    const base = import.meta.env.BASE_URL;
    const reg = await navigator.serviceWorker.register(`${base}sw.js`, { scope: base, updateViaCache: "none" });
    // a first visit: the new worker claims the page as it activates (a moment); a hard reload: it is already
    // active and only a plain reload goes through it
    if (!navigator.serviceWorker.controller && (reg.installing || reg.waiting || !reg.active)) {
      await Promise.race([
        new Promise((done) => navigator.serviceWorker.addEventListener("controllerchange", done, { once: true })),
        new Promise((done) => setTimeout(done, 4000)),
      ]);
    }
    if (!navigator.serviceWorker.controller && !reg.active) return;
    sessionStorage.setItem(KEY, String(Date.now()));
    location.reload();
    await new Promise(() => {}); // nothing else runs in the page being replaced
  } catch {
    // the page works as it is, its water on one thread
  }
}

await isolate();
