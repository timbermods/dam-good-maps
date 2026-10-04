// The verdict (Kyler's decision, 2026-10-03, replacing the within-spread rule of PLAN §20 D380's first gate): a cell
// fails only on a clear regression: the branch's ("after") median p99 frame more than 20% above dev's ("before")
// median, or the branch's median hitch count above dev's highest run. The worst frame is shown, not judged. One
// round, no re-runs; a hang (run.ts) fails the cell on its own. Pure; tested in tests/unit/smooth.test.ts.

import { spread, type FrameStats, type Spread } from "./stats";

export interface RunRecord {
  key: string;
  build: "before" | "after";
  repeat: number;
  /** The cell's round (1, then up to two re-runs after a failure; missing: 1). */
  round?: number;
  /** The round's attempt (missing: 1). */
  attempt?: number;
  /** The page hung during the run (it stopped answering, drew nothing for seconds, or lost its WebGL context):
   *  the cell fails outright, whatever its frame times. */
  hang?: string;
  stats: FrameStats;
}

export type MetricName = "p99Ms" | "worstMs" | "hitches";
/** The metrics shown; of them, only p99 and hitches are judged (JUDGED). */
export const VERDICT_METRICS: MetricName[] = ["p99Ms", "worstMs", "hitches"];
export const JUDGED: MetricName[] = ["p99Ms", "hitches"];
/** How much worse the branch's median p99 may be than dev's median before it is a regression. */
export const P99_MARGIN = 1.2;

export interface MetricCompare {
  before: Spread | null;
  after: Spread | null;
  /** Not a clear regression (p99: after's median at most 20% above before's; hitches: after's median at most
   *  before's highest run; worst frame: always, as it is not judged). */
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

export function compareMetric(before: readonly (number | null)[], after: readonly (number | null)[], metric: MetricName = "hitches"): MetricCompare {
  const b = spread(before);
  const a = spread(after);
  if (!b || !a) return { before: b, after: a, ok: false };
  const ok = metric === "p99Ms" ? a.median <= b.median * P99_MARGIN : metric === "hitches" ? a.median <= b.max : true;
  return { before: b, after: a, ok };
}

export function cellVerdict(before: readonly RunRecord[], after: readonly RunRecord[], wanted: number): CellVerdict {
  const metrics = {} as Record<MetricName, MetricCompare>;
  for (const m of VERDICT_METRICS) metrics[m] = compareMetric(before.map((r) => r.stats[m]), after.map((r) => r.stats[m]), m);
  const slower = JUDGED.filter((m) => metrics[m].before && metrics[m].after && !metrics[m].ok);
  const complete = before.length >= wanted && after.length >= wanted && JUDGED.every((m) => metrics[m].before && metrics[m].after);
  return { verdict: slower.length ? "SLOWER" : complete ? "pass" : "incomplete", metrics, slower, nBefore: before.length, nAfter: after.length };
}

/** Rounds a cell has: one (Kyler, 2026-10-03: no re-runs; the clear-regression rule needs none). */
export const MAX_ROUNDS = 1;

export interface CellOutcome {
  /** pass, a real failure, or another round to run. */
  state: "pass" | "fail" | "more";
  /** A run's hang, when one hung (the cell fails on it alone). */
  hang?: string;
  /** Each finished round's own verdict, in order. */
  rounds: Verdict[];
  /** Every run of the cell together: the medians and ranges the report shows. */
  pooled: CellVerdict;
}

/** A cell's outcome: its round's verdict once all its runs are in (more: still measuring); a hang fails it on its own. */
export function cellOutcome(runs: readonly RunRecord[], wanted: number): CellOutcome {
  const before = runs.filter((r) => r.build === "before");
  const after = runs.filter((r) => r.build === "after");
  const pooled = cellVerdict(before, after, wanted);
  const hung = runs.find((r) => r.hang);
  if (hung) return { state: "fail", hang: `${hung.build} ${hung.repeat}: ${hung.hang}`, rounds: [], pooled };
  if (before.length < wanted || after.length < wanted) return { state: "more", rounds: [], pooled: { ...pooled, verdict: "incomplete" } };
  return { state: pooled.verdict === "pass" ? "pass" : "fail", rounds: [pooled.verdict], pooled };
}
