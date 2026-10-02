// The verdict (agreed with Kyler, PLAN §20 D380: nothing may get slower): per cell, "after" passes when its median p99,
// its median worst frame and its median hitch count are each no higher than the highest value among the "before" runs
// (that is, within before's own spread). Pure; tested in tests/unit/smooth.test.ts.

import { spread, type FrameStats, type Spread } from "./stats";

export interface RunRecord {
  key: string;
  build: "before" | "after";
  repeat: number;
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
