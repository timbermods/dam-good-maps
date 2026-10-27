// The smoothness gate's pure parts (tools/smooth): frame statistics, the machine-load rules, the verdict, the plan.
// The browser driving is checked by running the tool (tools/smooth/README.md), not here.

import { describe, expect, it } from "vitest";
import { busyProcesses, idleLine, isQualified, judgeRun, quietSuffix, RULES, type LoadSample } from "../../tools/smooth/load";
import { abbaOrder, expand, parseFilters, remaining, runKey } from "../../tools/smooth/plan";
import { buildRows, liveRuns, summarize, type Entry, type RunResult } from "../../tools/smooth/report";
import { deltas, frameStats, median, percentile, spread } from "../../tools/smooth/stats";
import { cellOutcome, cellVerdict, compareMetric, type RunRecord } from "../../tools/smooth/verdict";

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
  it("a sample of exactly 10% is still quiet (Kyler, 2026-10-02: 10%, not 25%)", () => {
    expect(quietSuffix([sample(0, 10), sample(1000, 10.1)]).length).toBe(0);
    expect(quietSuffix([sample(0, 10), sample(1000, 9)]).length).toBe(2);
  });
  it("outside GPU above 10% is not quiet either; a sample without GPU counters is judged on its CPU", () => {
    expect(quietSuffix([sample(0, 2, { gpu: 40 }), sample(1000, 2, { gpu: 1 })]).length).toBe(1);
    expect(quietSuffix([sample(0, 2, { gpu: null }), sample(1000, 2)]).length).toBe(2);
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
    const withBusy = rows.map((s) => (s.at >= 12_000 && s.at <= 14_000 ? sample(s.at, 8, { top: [{ name: "MsMpEng", cpu: 6 }, { name: "chrome", cpu: 2 }] }) : s));
    const j = judgeRun(withBusy, 10_500, 20_500);
    expect(j.valid).toBe(true);
    expect(j.over5).toBe(3);
    expect(busyProcesses(withBusy)[0]).toEqual({ name: "MsMpEng", maxCpu: 6, samples: 3 });
    expect(idleLine([judgeRun(rows, 10_500, 20_500)])).toMatchObject({ idle: true });
    expect(idleLine([judgeRun(rows, 10_500, 20_500)]).text).toMatch(/PC idle: yes/);
    // by the gate's own rule (Kyler, 2026-10-03): 8% is within its 10%, so idle, with the busy samples named
    const loud = idleLine([j, j, j]);
    expect(loud.idle).toBe(true);
    expect(loud.text).toMatch(/PC idle: yes.*at most 10% CPU and 10% GPU.*above 5% in 9 of .*MsMpEng 6%/);
    // above the rule, or the GPU above it, the line says NO
    const over = { ...j, outside: { min: 1, median: 3, max: 11 } };
    expect(idleLine([j, over]).idle).toBe(false);
    expect(idleLine([{ ...j, gpu: { min: 0, median: 1, max: 30 } }]).text).toMatch(/PC idle: NO.*outside GPU max 30.0%/);
    expect(idleLine([]).text).toMatch(/unknown/);
    expect(RULES.cpuMax).toBe(10);
    expect(RULES.gpuMax).toBe(10);
    // a game on the GPU voids the run even with the CPU quiet
    const game = rows.map((s) => (s.at >= 12_000 && s.at <= 14_000 ? sample(s.at, 2, { gpu: 60, gpuTop: [{ name: "game", gpu: 60 }] }) : s));
    expect(judgeRun(game, 10_500, 20_500)).toMatchObject({ valid: false, reason: "outside GPU 60% > 10%" });
  });
});

const run = (build: "before" | "after", repeat: number, p99: number, worst: number, hitches: number): RunRecord => ({
  key: `k|${build}|${repeat}`,
  build,
  repeat,
  stats: { frames: 600, medianMs: 16.7, p99Ms: p99, worstMs: worst, hitches, longTasks: null, longTaskMs: null, durationMs: 10000 },
});
const five = (build: "before" | "after", p99s: number[], worsts: number[], hitches: number[]) => p99s.map((p, i) => run(build, i + 1, p, worsts[i], hitches[i]));

describe("the verdict (Kyler, 2026-10-03: a clear regression only)", () => {
  const three = (build: "before" | "after", p99s: number[], hitches: number[]) => p99s.map((p, i) => run(build, i + 1, p, 99, hitches[i]));
  const before = three("before", [10, 11, 12], [0, 2, 1]);
  it("passes up to 20% worse median p99 and up to dev's highest hitch count", () => {
    expect(cellVerdict(before, three("after", [13.2, 13.2, 13.2], [2, 2, 2]), 3).verdict).toBe("pass");
  });
  it("fails on a median p99 more than 20% worse than dev's median, and names it", () => {
    const v = cellVerdict(before, three("after", [13.3, 13.3, 13.3], [0, 0, 0]), 3);
    expect(v.verdict).toBe("SLOWER");
    expect(v.slower).toEqual(["p99Ms"]);
  });
  it("fails on more hitches than dev's highest run (the branch's median)", () => {
    expect(cellVerdict(before, three("after", [10, 10, 10], [3, 3, 0]), 3).slower).toEqual(["hitches"]);
    expect(cellVerdict(before, three("after", [10, 10, 10], [3, 0, 0]), 3).verdict).toBe("pass");
  });
  it("shows the worst frame without judging it", () => {
    const after = [1, 2, 3].map((k) => run("after", k, 10, 900, 0));
    expect(cellVerdict(before, after, 3).verdict).toBe("pass");
    expect(compareMetric([1, 2, 3], [900, 900, 900], "worstMs").ok).toBe(true);
  });
  it("is incomplete with fewer runs than wanted", () => {
    expect(cellVerdict(before.slice(0, 2), three("after", [10, 10, 10], [0, 0, 0]), 3).verdict).toBe("incomplete");
    expect(cellVerdict([], [], 3).verdict).toBe("incomplete");
  });
});

describe("the plan", () => {
  it("orders a cell's runs ABBA so drift cancels, each build getting every repeat", () => {
    expect(abbaOrder(5)).toEqual(["before", "after", "after", "before", "before", "after", "after", "before", "before", "after"]);
    const runs = expand({ sizes: [128], looks: ["standard"], configs: ["chromium"], scenarios: ["orbit"], repeats: 5 });
    expect(runs.map((r) => `${r.build[0]}${r.repeat}`)).toEqual(["b1", "a1", "a2", "b2", "b3", "a3", "a4", "b4", "b5", "a5"]);
  });
  it("by default is the 6-cell gate: Chrome native, 256², both looks, 3 scenarios, 3 runs a build (Kyler, 2026-10-03)", () => {
    const f = parseFilters({});
    expect(f).toMatchObject({ sizes: [256], configs: ["chromium"], repeats: 3 });
    expect(expand(f).length).toBe(6 * 3 * 2);
    // the rest only when asked for
    expect(expand(parseFilters({ sizes: "128,256", configs: "chromium,chromium-4x,igpu-4x,firefox,webkit", repeats: "5" })).length).toBe(5 * 2 * 2 * 3 * 5 * 2);
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
    expect(parseFilters({ looks: "high", scenarios: "brush,force" })).toMatchObject({ looks: ["high"], scenarios: ["brush", "force"], repeats: 3 });
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
    const entries: Entry[] = [1, 2].flatMap((n) => [result("before", n, 17 + n), result("after", n, 25 + n)]);
    expect(buildRows(entries, 2)).toHaveLength(1);
    const s = summarize(entries, 2, { before: "origin/dev abc", after: "worktree def", machine: [] });
    expect(s.table[2]).toContain("19.0 [18.0-19.0]"); // upper median of 18, 19
    expect(s.table[2]).toContain("1/2/4 / 10/12/20");
    expect(s.idle.text).toMatch(/^PC idle: yes/);
    expect(s.slower).toBe(1); // after's p99 median 27 is more than 20% above before's 19
    expect(s.table[2]).toContain("**SLOWER** (p99)");
    expect(s.verdictLine).toContain("1 SLOWER");
  });
});

describe("a cell's outcome", () => {
  const r = (build: "before" | "after", repeat: number, p99: number) => ({ key: `k|${build}|${repeat}`, build, repeat, stats: { p99Ms: p99, worstMs: p99, hitches: 0 } as RunRecord["stats"] });
  const round = (after: number) => [1, 2, 3].flatMap((k) => [r("before", k, 10), r("after", k, after)]);
  it("is its one round's verdict, with no re-runs (Kyler, 2026-10-03)", () => {
    expect(cellOutcome(round(11), 3)).toMatchObject({ state: "pass" });
    expect(cellOutcome(round(13), 3)).toMatchObject({ state: "fail" });
  });
  it("waits for all its runs before judging", () => {
    expect(cellOutcome(round(13).slice(0, 5), 3).state).toBe("more");
  });
});

describe("measuring chosen cells", () => {
  it("--cells keeps only the cells named", () => {
    const f = parseFilters({ cells: "chromium|128|high|orbit, firefox|256|standard|brush", repeats: "1" });
    const keys = [...new Set(expand(f).map((r) => r.key.split("|").slice(0, 4).join("|")))];
    expect(keys).toEqual(["chromium|128|high|orbit", "firefox|256|standard|brush"]);
  });
});

describe("busy rounds and hangs (Kyler, 2026-10-02)", () => {
  const cell = { config: "chromium" as const, size: 128, look: "standard" as const, scenario: "orbit" as const };
  const res = (build: "before" | "after", repeat: number, attempt: number, extra: object = {}) =>
    ({ kind: "run", key: `k|${build}|${repeat}|a${attempt}`, build, repeat, round: 1, attempt, cell, stats: { p99Ms: 10, worstMs: 10, hitches: 0 }, ...extra }) as unknown as Entry;
  it("a voided round attempt counts for nothing; the next attempt's runs do", () => {
    const entries: Entry[] = [res("before", 1, 1), res("after", 1, 1), { kind: "void", key: "chromium|128|standard|orbit|r1|a1", reason: "outside CPU 30% > 10%", at: "", wallMs: 0 } as Entry, res("before", 1, 2)];
    expect(liveRuns(entries).map((r) => r.key)).toEqual(["k|before|1|a2"]);
  });
  it("a hang fails the cell on its own, whatever its frame times", () => {
    const runs = [1, 2, 3, 4, 5].flatMap((k) => [res("before", k, 1), res("after", k, 1, k === 3 ? { hang: "did not answer for 64.0 s" } : {})]) as unknown as RunRecord[];
    expect(cellOutcome(runs, 5)).toMatchObject({ state: "fail", hang: "after 3: did not answer for 64.0 s" });
  });
  it("attempts get their own keys", () => {
    expect(runKey(cell, "after", 2, 1, 2)).toBe("chromium|128|standard|orbit|after|2|a2");
    expect(runKey(cell, "after", 2, 3, 2)).toBe("chromium|128|standard|orbit|after|2|r3|a2");
  });
});
