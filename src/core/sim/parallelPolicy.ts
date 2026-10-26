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

/** The most threads the canonical settle of a map with caves or overhangs uses (stackParallel.ts): from 128²
 *  on, since a stacked column costs more than a flat tile; √(n / 1024), about 4 at 128², 6 at 192², 8 at 256². */
export function stackThreadsFor(n: number): number {
  if (n < 128 * 128) return 1;
  let t = 4;
  while (t < MAX_THREADS && (t + 1) * (t + 1) * 1024 <= n) t++;
  return t;
}

/** The machine's threads (4 where the browser doesn't say). */
export function machineThreads(): number {
  const n = typeof navigator !== "undefined" ? navigator.hardwareConcurrency : 0;
  return n > 0 ? n : 4;
}

/** The renderer's water mesh workers on a machine of `cores` threads (render3d/waterMesher.ts): a few, never more
 *  than a quarter of them. */
export function meshWorkersFor(cores: number): number {
  return Math.max(1, Math.min(3, Math.floor(cores / 4)));
}

/** The most threads the water may use on a machine of `cores`, its coordinator's own included. A flood keeps the
 *  page's thread, the water mesh workers and the flow bake busy at the same time as the water's strips, so each
 *  keeps a core of its own: with all of them competing for the same cores, the page's thread lost 60 to 300 ms
 *  at a time with nothing of its own to run (#581's profile). Never below 1; the water's bytes are the same
 *  whatever the count (parallel.ts). */
export function waterThreadBudget(cores: number): number {
  return Math.max(1, Math.min(MAX_THREADS, cores - meshWorkersFor(cores) - 2));
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
