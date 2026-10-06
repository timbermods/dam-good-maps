// Where the multi-core water runs (parallel.ts), apart from the water itself, so the page's own thread can ask
// (platform/index.ts starts the helpers) without loading the Rust module.

const MAX_THREADS = 16;

/** The most threads a map of `n` tiles uses: none below 256², about 8 at 256², up to 16 at 512² (#130). */
export function threadsFor(n: number): number {
  if (n < 256 * 256) return 1;
  // 8·√(n / 256²), in integers
  let t = 8;
  while (t < MAX_THREADS && (t + 1) * (t + 1) * 1024 <= n) t++;
  return t;
}

/** Whether this thread can run the water on several: a worker on a cross-origin isolated page in Chromium or
 *  Firefox (WebKit stays on one thread, #130). `page`: whether the page's own thread may start helpers for its
 *  worker (it can't wait for them itself). */
export function parallelWaterSupported(page = false): boolean {
  const g = globalThis as { crossOriginIsolated?: boolean; document?: unknown; navigator?: { userAgent?: string } };
  if (g.crossOriginIsolated !== true || typeof SharedArrayBuffer !== "function" || typeof Atomics?.wait !== "function") return false;
  if (!page && g.document !== undefined) return false; // the page's own thread may not wait
  const ua = g.navigator?.userAgent ?? "";
  return !(/AppleWebKit/.test(ua) && !/Chrome\/|Chromium\//.test(ua));
}
