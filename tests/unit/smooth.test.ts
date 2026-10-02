// The smoothness gate's pure parts (tools/smooth): frame statistics, the machine-load rules, the verdict, the plan.
// The browser driving is checked by running the tool (tools/smooth/README.md), not here.

import { describe, expect, it } from "vitest";
import { busyProcesses, idleLine, isQualified, judgeRun, quietSuffix, RULES, type LoadSample } from "../../tools/smooth/load";
import { abbaOrder, expand, parseFilters, remaining, runKey } from "../../tools/smooth/plan";
import { buildRows, summarize, type Entry, type RunResult } from "../../tools/smooth/report";
import { deltas, frameStats, median, percentile, spread } from "../../tools/smooth/stats";
import { cellVerdict, compareMetric, type RunRecord } from "../../tools/smooth/verdict";

describe("frame statistics", () => {
  it("takes the gaps between frame stamps", () => {
    expect(deltas([0, 16, 33, 50])).toEqual([16, 17, 17]);
    expect(deltas([5])).toEqual([]);
  });
  it("uses the nearest-rank percentile and the upper median", () => {
    const a = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(a, 0.99)).toBe(99);
    expect(percentile(a, 1)).toBe(100);
    expect(median([3, 1, 2, 10])).toBe(3);
    expect(median([])).toBeNull();
  });
  it("counts hitches over 50 ms, finds the worst frame, and reports long tasks as unavailable (never 0) without the observer", () => {
    const stamps = [0, 16, 32, 100, 116, 132]; // gaps 16 16 68 16 16
    const s = frameStats(stamps, null, 132);
    expect(s).toMatchObject({ frames: 5, medianMs: 16, worstMs: 68, hitches: 1, longTasks: null, longTaskMs: null, durationMs: 132 });
    const t = frameStats(stamps, [[10, 60], [90, 55]]);
    expect(t.longTasks).toBe(2);
    expect(t.longTaskMs).toBe(115);
    expect(frameStats([0, 50, 100], []).hitches).toBe(0); // exactly 50 ms is not a hitch
  });
  it("gives a spread only when every run has the number", () => {
    expect(spread([1, 5, 3])).toEqual({ median: 3, min: 1, max: 5 });
    expect(spread([1, null])).toBeNull();
  });
});

const sample = (at: number, outside: number | null, extra: Partial<LoadSample> = {}): LoadSample => ({ at, outside, total: 30, ownership: true, ...extra });
const quiet = (from: number, to: number, outside = 3, step = 1000): LoadSample[] => {
  const out: LoadSample[] = [];
  for (let t = from; t <= to; t += step) out.push(sample(t, outside));
  return out;
};

describe("load rules", () => {
  it("qualifies after 60 consecutive quiet seconds, and not before", () => {
    expect(isQualified(quiet(0, 59_000), 59_000)).toBe(false);
    expect(isQualified(quiet(0, 60_000), 61_000)).toBe(true);
  });
  it("restarts the minute at any busy sample, missing accounting or gap over 30 s", () => {
    const busy = [...quiet(0, 40_000), sample(41_000, 26), ...quiet(42_000, 90_000)];
    expect(isQualified(busy, 90_000)).toBe(false); // only 48 s since the spike
    expect(isQualified(quiet(0, 60_000), 95_000)).toBe(false); // the sampler went quiet: the minute is stale
    expect(isQualified([...quiet(0, 40_000), sample(41_000, 5, { ownership: false }), ...quiet(42_000, 103_000)], 103_000)).toBe(true);
    expect(isQualified([...quiet(0, 40_000), sample(41_000, null), ...quiet(42_000, 60_000)], 60_000)).toBe(false);
    const gap = [...quiet(0, 40_000), ...quiet(75_000, 100_000)]; // a 35 s hole
    expect(quietSuffix(gap)[0].at).toBe(75_000);
    expect(isQualified(gap, 100_000)).toBe(false);
  });
  it("a sample of exactly 25% is still quiet", () => {
    expect(quietSuffix([sample(0, 25), sample(1000, 25.1)]).length).toBe(0);
    expect(quietSuffix([sample(0, 25), sample(1000, 24)]).length).toBe(2);
  });
});

describe("a run's load", () => {
  const rows = quiet(0, 60_000, 4);
  it("keeps a run whose interval is bracketed by quiet samples, with outside and total CPU", () => {
    const j = judgeRun(rows, 10_500, 20_500);
    expect(j.valid).toBe(true);
    expect(j.outside).toEqual({ min: 4, median: 4, max: 4 });
    expect(j.total).toEqual({ min: 30, median: 30, max: 30 });
    expect(j.over5).toBe(0);
  });
  it("discards a run that saw outside CPU above 25% and names the busy process", () => {
    const spiked = rows.map((s) => (s.at === 15_000 ? sample(15_000, 40, { top: [{ name: "node", cpu: 35 }] }) : s));
    const j = judgeRun(spiked, 10_500, 20_500);
    expect(j.valid).toBe(false);
    expect(j.reason).toMatch(/outside CPU 40%/);
    expect(j.worst?.[0].name).toBe("node");
    // the same spike outside the run's interval does not matter
    expect(judgeRun(spiked, 20_500, 30_500).valid).toBe(true);
  });
  it("discards a run with missing samples at its start or end", () => {
    expect(judgeRun(rows, -5000, 20_000).valid).toBe(false); // nothing at or before the start
    expect(judgeRun(rows, 50_000, 70_000).valid).toBe(false); // nothing after the end
    expect(judgeRun([], 0, 1).reason).toBe("missing load samples");
  });
  it("discards a run across a gap of over 30 s, or samples without process accounting", () => {
    const gapped = [...quiet(0, 10_000), ...quiet(50_000, 60_000)];
    expect(judgeRun(gapped, 12_000, 55_000).reason).toBe("gap in load samples");
    const noOwner = rows.map((s) => (s.at === 15_000 ? { ...s, ownership: false } : s));
    expect(judgeRun(noOwner, 10_500, 20_500).reason).toMatch(/accounting/);
  });
  it("reports busy outside processes above 5% and phrases the PC idle line", () => {
    const withBusy = rows.map((s) => (s.at >= 12_000 && s.at <= 14_000 ? sample(s.at, 12, { top: [{ name: "MsMpEng", cpu: 9 }, { name: "chrome", cpu: 3 }] }) : s));
    const j = judgeRun(withBusy, 10_500, 20_500);
    expect(j.valid).toBe(true);
    expect(j.over5).toBe(3);
    expect(busyProcesses(withBusy)[0]).toEqual({ name: "MsMpEng", maxCpu: 9, samples: 3 });
    expect(idleLine([judgeRun(rows, 10_500, 20_500)])).toMatchObject({ idle: true });
    expect(idleLine([judgeRun(rows, 10_500, 20_500)]).text).toMatch(/PC idle: yes/);
    const loud = idleLine([j, j, j]);
    expect(loud.idle).toBe(false);
    expect(loud.text).toMatch(/PC idle: NO.*MsMpEng 9%/);
    expect(idleLine([]).text).toMatch(/unknown/);
    expect(RULES.cpuMax).toBe(25);
  });
});

const run = (build: "before" | "after", repeat: number, p99: number, worst: number, hitches: number): RunRecord => ({
  key: `k|${build}|${repeat}`,
  build,
  repeat,
  stats: { frames: 600, medianMs: 16.7, p99Ms: p99, worstMs: worst, hitches, longTasks: null, longTaskMs: null, durationMs: 10000 },
});
const five = (build: "before" | "after", p99s: number[], worsts: number[], hitches: number[]) => p99s.map((p, i) => run(build, i + 1, p, worsts[i], hitches[i]));

describe("the verdict", () => {
  const before = five("before", [17, 18, 17.5, 19, 17], [30, 35, 33, 40, 31], [0, 1, 0, 2, 0]);
  it("passes when after's medians are within before's spread (no higher than its highest run)", () => {
    const after = five("after", [18, 19, 17, 18, 17], [33, 38, 30, 36, 32], [0, 1, 1, 0, 1]);
    const v = cellVerdict(before, after, 5);
    expect(v.verdict).toBe("pass");
    expect(v.slower).toEqual([]);
  });
  it("is SLOWER when any one median goes above before's highest run, and names the metric", () => {
    const after = five("after", [17, 17, 17, 17, 17], [50, 52, 48, 55, 60], [0, 0, 0, 0, 0]);
    const v = cellVerdict(before, after, 5);
    expect(v.verdict).toBe("SLOWER");
    expect(v.slower).toEqual(["worstMs"]);
    const hitchy = cellVerdict(before, five("after", [17, 17, 17, 17, 17], [30, 30, 30, 30, 30], [3, 4, 3, 5, 3]), 5);
    expect(hitchy.slower).toEqual(["hitches"]);
  });
  it("compares the median, so one slow run among five does not fail, three do", () => {
    expect(cellVerdict(before, five("after", [17, 17, 17, 25, 17], [30, 30, 30, 90, 30], [0, 0, 0, 0, 0]), 5).verdict).toBe("pass");
    expect(cellVerdict(before, five("after", [25, 25, 25, 17, 17], [30, 30, 30, 90, 30], [0, 0, 0, 0, 0]), 5).slower).toEqual(["p99Ms"]);
  });
  it("equal to before's highest run passes (no higher than)", () => {
    expect(compareMetric([1, 2, 3], [3, 3, 3]).ok).toBe(true);
    expect(compareMetric([1, 2, 3], [3.1, 3.1, 3.1]).ok).toBe(false);
  });
  it("is incomplete with fewer runs than wanted, but still reports a regression it can already see", () => {
    expect(cellVerdict(before.slice(0, 3), five("after", [17, 17, 17, 17, 17], [30, 30, 30, 30, 30], [0, 0, 0, 0, 0]), 5).verdict).toBe("incomplete");
    expect(cellVerdict(before, five("after", [30, 30], [90, 90], [9, 9]), 5).verdict).toBe("SLOWER");
    expect(cellVerdict([], [], 5).verdict).toBe("incomplete");
  });
});

describe("the plan", () => {
  it("orders a cell's runs ABBA so drift cancels, each build getting every repeat", () => {
    expect(abbaOrder(5)).toEqual(["before", "after", "after", "before", "before", "after", "after", "before", "before", "after"]);
    const runs = expand({ sizes: [128], looks: ["standard"], configs: ["chromium"], scenarios: ["orbit"], repeats: 5 });
    expect(runs.map((r) => `${r.build[0]}${r.repeat}`)).toEqual(["b1", "a1", "a2", "b2", "b3", "a3", "a4", "b4", "b5", "a5"]);
  });
  it("expands the full matrix: 5 configurations x 2 looks x 2 sizes x 3 scenarios x 5 repeats x 2 builds (maps stop at 256, so no 512)", () => {
    const f = parseFilters({});
    expect(f.sizes).toEqual([128, 256]);
    expect(expand(f).length).toBe(5 * 2 * 2 * 3 * 5 * 2);
    expect(new Set(expand(f).map((r) => r.key)).size).toBe(600);
  });
  it("resumes: runs already measured are skipped", () => {
    const runs = expand(parseFilters({ sizes: "128", configs: "chromium", scenarios: "orbit", repeats: "2" }));
    expect(runs.length).toBe(8);
    const done = new Set([runKey(runs[0].cell, "before", 1), runKey(runs[0].cell, "after", 1)]);
    expect(remaining(runs, done).length).toBe(6);
  });
  it("checks the filters and refuses sizes the maps don't have", () => {
    expect(() => parseFilters({ sizes: "512" })).toThrow(/256/);
    expect(() => parseFilters({ configs: "opera" })).toThrow(/unknown configuration/);
    expect(() => parseFilters({ looks: "med" })).toThrow(/unknown look/);
    expect(() => parseFilters({ repeats: "0" })).toThrow(/repeats/);
    expect(parseFilters({ looks: "high", scenarios: "brush,force" })).toMatchObject({ looks: ["high"], scenarios: ["brush", "force"], repeats: 5 });
  });
});

describe("the report", () => {
  const result = (build: "before" | "after", repeat: number, p99: number): RunResult => ({
    kind: "run",
    key: `chromium|128|high|orbit|${build}|${repeat}`,
    build,
    repeat,
    cell: { config: "chromium", size: 128, look: "high", scenario: "orbit" },
    buildId: build,
    env: { browser: "1", engine: "chromium", webgl: "ANGLE (test)", refreshHz: 60, dpr: 1, look: "high" },
    stats: { frames: 600, medianMs: 16.7, p99Ms: p99, worstMs: 30, hitches: 0, longTasks: null, longTaskMs: null, durationMs: 10000 },
    load: { valid: true, samples: 8, outside: { min: 1, median: 2, max: 4 }, total: { min: 10, median: 12, max: 20 }, over5: 0, busy: [] },
    settleMs: {},
    heapMB: null,
    hidden: 0,
    unfocused: 0,
    pageErrors: 0,
    wallMs: 30000,
    at: "2026-10-02T00:00:00Z",
  });
  it("prints a row per cell with before and after as median [min-max], the CPU, the verdict and the PC idle line", () => {
    const entries: Entry[] = [1, 2].flatMap((n) => [result("before", n, 17 + n), result("after", n, 18 + n)]);
    expect(buildRows(entries, 2)).toHaveLength(1);
    const s = summarize(entries, 2, { before: "origin/dev abc", after: "worktree def", machine: [] });
    expect(s.table[2]).toContain("19.0 [18.0-19.0]"); // upper median of 18, 19
    expect(s.table[2]).toContain("1/2/4 / 10/12/20");
    expect(s.idle.text).toMatch(/^PC idle: yes/);
    expect(s.slower).toBe(1); // after's p99 median 20 is above before's highest 19
    expect(s.table[2]).toContain("**SLOWER** (p99)");
    expect(s.verdictLine).toContain("1 SLOWER");
  });
});
