// Frame statistics of one run's timed part: pure functions, tested in tests/unit/smooth.test.ts.
// (Adapted from investigation/performance/metrics.mjs: same percentile rule, same 50 ms hitch.)

export const HITCH_MS = 50;

export function median(a: readonly number[]): number | null {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : null;
}

/** The nearest-rank percentile (p in 0..1). */
export function percentile(a: readonly number[], p: number): number | null {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.min(s.length - 1, Math.ceil(s.length * p) - 1)] : null;
}

export interface FrameStats {
  frames: number;
  medianMs: number | null;
  p99Ms: number | null;
  worstMs: number | null;
  /** Frames longer than 50 ms. */
  hitches: number;
  /** Long tasks (count and total ms), null where the browser has no longtask observer (never 0). */
  longTasks: number | null;
  longTaskMs: number | null;
  /** The timed part's wall time. */
  durationMs: number | null;
}

/** The gaps between consecutive animation-frame timestamps (ms). */
export function deltas(stamps: readonly number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < stamps.length; i++) out.push(stamps[i] - stamps[i - 1]);
  return out;
}

export function frameStats(stamps: readonly number[], tasks: readonly (readonly [number, number])[] | null, durationMs: number | null = null): FrameStats {
  const d = deltas(stamps);
  return {
    frames: d.length,
    medianMs: median(d),
    p99Ms: percentile(d, 0.99),
    worstMs: d.length ? Math.max(...d) : null,
    hitches: d.filter((x) => x > HITCH_MS).length,
    longTasks: tasks ? tasks.length : null,
    longTaskMs: tasks ? tasks.reduce((s, t) => s + t[1], 0) : null,
    durationMs,
  };
}

export interface Spread {
  median: number;
  min: number;
  max: number;
}

/** Median, min and max of a metric over runs (null when any run lacks it). */
export function spread(values: readonly (number | null)[]): Spread | null {
  const v = values.filter((x): x is number => x !== null && Number.isFinite(x));
  if (!v.length || v.length !== values.length) return null;
  return { median: median(v)!, min: Math.min(...v), max: Math.max(...v) };
}
