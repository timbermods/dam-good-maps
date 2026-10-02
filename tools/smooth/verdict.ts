// The verdict (agreed with Kyler, PLAN §20 D380: nothing may get slower): per cell, "after" passes when its median p99,
// its median worst frame and its median hitch count are each no higher than the highest value among the "before" runs
// (that is, within before's own spread). Pure; tested in tests/unit/smooth.test.ts.

import { spread, type FrameStats, type Spread } from "./stats";

export interface RunRecord {
  key: string;
  build: "before" | "after";
  repeat: number;
  /** The cell's round (1, then up to two re-runs after a failure; missing: 1). */
  round?: number;
  stats: FrameStats;
}

export type MetricName = "p99Ms" | "worstMs" | "hitches";
export const VERDICT_METRICS: MetricName[] = ["p99Ms", "worstMs", "hitches"];

export interface MetricCompare {
  before: Spread | null;
  after: Spread | null;
  /** After's median is within before's spread (not above its highest run). */
  ok: boolean;
}

export type Verdict = "pass" | "SLOWER" | "incomplete";

export interface CellVerdict {
  verdict: Verdict;
  metrics: Record<MetricName, MetricCompare>;
  /** The metrics that came out slower. */
  slower: MetricName[];
  nBefore: number;
  nAfter: number;
}

export function compareMetric(before: readonly (number | null)[], after: readonly (number | null)[]): MetricCompare {
  const b = spread(before);
  const a = spread(after);
  return { before: b, after: a, ok: !!b && !!a && a.median <= b.max };
}

export function cellVerdict(before: readonly RunRecord[], after: readonly RunRecord[], wanted: number): CellVerdict {
  const metrics = {} as Record<MetricName, MetricCompare>;
  for (const m of VERDICT_METRICS) metrics[m] = compareMetric(before.map((r) => r.stats[m]), after.map((r) => r.stats[m]));
  const slower = VERDICT_METRICS.filter((m) => metrics[m].before && metrics[m].after && !metrics[m].ok);
  const complete = before.length >= wanted && after.length >= wanted && VERDICT_METRICS.every((m) => metrics[m].before && metrics[m].after);
  return { verdict: slower.length ? "SLOWER" : complete ? "pass" : "incomplete", metrics, slower, nBefore: before.length, nAfter: after.length };
}

/** Rounds a cell may have: the first, and up to two re-runs (Kyler, 2026-10-02). */
export const MAX_ROUNDS = 3;

export interface CellOutcome {
  /** pass, a real failure, or another round to run. */
  state: "pass" | "fail" | "more";
  /** Each finished round's own verdict, in order. */
  rounds: Verdict[];
  /** Every run of the cell together: the medians and ranges the report shows. */
  pooled: CellVerdict;
}

/** A cell's outcome under the re-run rule (Kyler, 2026-10-02): a cell that fails its first round runs again, up
 *  to twice more; it fails for real when two of its rounds fail; it passes only when its first round passes, or two
 *  of its rounds pass and the median of all its runs passes too (every run counted, none dropped). Noise alone fails
 *  one metric of a round about 8% of the time; two failing rounds, well under 1%. */
export function cellOutcome(runs: readonly RunRecord[], wanted: number): CellOutcome {
  const roundOf = (r: RunRecord) => r.round ?? 1;
  const all = cellVerdict(
    runs.filter((r) => r.build === "before"),
    runs.filter((r) => r.build === "after"),
    wanted,
  );
  const rounds: Verdict[] = [];
  for (let k = 1; k <= MAX_ROUNDS; k++) {
    const rs = runs.filter((r) => roundOf(r) === k);
    const v = cellVerdict(
      rs.filter((r) => r.build === "before"),
      rs.filter((r) => r.build === "after"),
      wanted,
    );
    if (v.verdict === "incomplete") break;
    rounds.push(v.verdict);
  }
  const pooled = { ...all, verdict: (rounds.length ? all.verdict : "incomplete") as Verdict };
  const passes = rounds.filter((v) => v === "pass").length;
  const fails = rounds.length - passes;
  let state: CellOutcome["state"];
  if (rounds[0] === "pass") state = "pass";
  else if (fails >= 2) state = "fail";
  else if (passes >= 2) state = pooled.verdict === "pass" ? "pass" : "fail";
  else state = rounds.length >= MAX_ROUNDS ? "fail" : "more";
  return { state, rounds, pooled };
}
