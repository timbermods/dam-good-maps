// The page-side recorder, injected into every run's page (nothing in the app is touched): every animation frame's
// timestamp while a scenario's timed part is active, and long tasks where the browser has them.

// (tsx's esbuild wraps named functions in a __name helper, which page.evaluate would carry into the page)
export const PROBE = `(() => {
  window.__name = window.__name || ((f) => f);
  const S = (window.__smooth = { on: false, frames: [], tasks: [], longTasks: null, t0: 0, hidden: 0, unfocused: 0, heap0: null });
  try {
    // (Firefox and WebKit only warn about an unsupported entry type; they do not throw)
    if (!(PerformanceObserver.supportedEntryTypes || []).includes("longtask")) throw new Error("no longtask");
    const o = new PerformanceObserver((l) => { if (S.on) for (const e of l.getEntries()) S.tasks.push([e.startTime, e.duration]); });
    o.observe({ type: "longtask", buffered: false });
    S.longTasks = true;
  } catch { S.longTasks = false; }
  const heap = () => (performance.memory ? performance.memory.usedJSHeapSize : null);
  const tick = (t) => {
    if (S.on) {
      S.frames.push(t);
      if (document.visibilityState !== "visible") S.hidden++;
      if (!document.hasFocus()) S.unfocused++;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  S.begin = () => { S.frames = []; S.tasks = []; S.hidden = 0; S.unfocused = 0; S.t0 = performance.now(); S.heap0 = heap(); S.on = true; };
  S.end = () => {
    S.on = false;
    return { frames: S.frames, tasks: S.tasks, longTasks: S.longTasks, t0: S.t0, t1: performance.now(), hidden: S.hidden, unfocused: S.unfocused, heap0: S.heap0, heap1: heap() };
  };
})();`;

export interface Env {
  browser: string;
  engine: string;
  /** The WebGL unmasked renderer string (Firefox and WebKit mask it). */
  webgl: string;
  refreshHz: number;
  dpr: number;
  look: string | null;
  /** Firefox only: the setup it ran with (see browsers.ts firefoxSetup). */
  firefox?: FirefoxEvidence;
}

export interface FirefoxEvidence {
  executable: string;
  omniJaSha256: string;
  runtimeJsSha256: string;
  /** The debugger no longer pins WebAssembly to the baseline tier: Runtime.js sets allowUnobservedWasm and allowUnobservedAsmJS. */
  runtimeUnpinned: boolean;
  prefs: Record<string, boolean>;
}
