// The series' report: one row per cell (before and after, each median [min-max]), the machine load, a verdict.
// Also written, short, to results/<date>-<label>.md by --record. Raw frames stay in local/.

import { cpus, release, totalmem } from "node:os";
import { idleLine, type RunLoad, type Triple } from "./load";
import { cellKey, CONFIG_LABELS, type Cell } from "./plan";
import type { Env } from "./probe";
import type { FrameStats } from "./stats";
import { cellOutcome, VERDICT_METRICS, type CellOutcome, type CellVerdict, type MetricName, type RunRecord } from "./verdict";

export interface RunResult extends RunRecord {
  kind: "run";
  cell: Cell;
  buildId: string;
  env: Env;
  stats: FrameStats;
  load: RunLoad;
  /** Wall time from the action to the water settled (ms), by step; the force's own time. Information, not in the verdict. */
  settleMs: Record<string, number>;
  forceMs?: number;
  heapMB: { start: number; end: number } | null;
  /** Frames drawn while the page was hidden or unfocused. */
  hidden: number;
  unfocused: number;
  /** Errors the page logged during the run. */
  pageErrors: number;
  wallMs: number;
  at: string;
}

export interface Discard {
  kind: "discard";
  key: string;
  reason: string;
  load: RunLoad | null;
  at: string;
  wallMs: number;
}

export type Entry = RunResult | Discard;

const f1 = (v: number | null | undefined): string => (v === null || v === undefined ? "n/a" : v.toFixed(1));
const f0 = (v: number | null | undefined): string => (v === null || v === undefined ? "n/a" : String(Math.round(v)));

function cellText(v: CellVerdict, m: MetricName, side: "before" | "after", digits: 0 | 1): string {
  const s = v.metrics[m][side];
  if (!s) return "n/a";
  const f = digits ? f1 : f0;
  return `${f(s.median)} [${f(s.min)}-${f(s.max)}]`;
}

function mergeTriples(ts: (Triple | null)[]): Triple | null {
  const t = ts.filter((x): x is Triple => !!x);
  if (!t.length) return null;
  const meds = t.map((x) => x.median).sort((a, b) => a - b);
  return { min: Math.min(...t.map((x) => x.min)), median: meds[Math.floor(meds.length / 2)], max: Math.max(...t.map((x) => x.max)) };
}

const tri = (t: Triple | null): string => (t ? `${t.min.toFixed(0)}/${t.median.toFixed(0)}/${t.max.toFixed(0)}` : "n/a");

export interface CellRow {
  cell: Cell;
  /** Every run of the cell together (the medians and ranges shown); its verdict is the cell's outcome. */
  verdict: CellVerdict;
  outcome: CellOutcome;
  outside: Triple | null;
  total: Triple | null;
  /** The medians of the information columns. */
  longTasks: { before: number | null; after: number | null };
  settleMs: { before: number | null; after: number | null };
  drewLook: string | null;
  failedLook: boolean;
}

const median = (a: number[]): number | null => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : null);

export function buildRows(entries: readonly Entry[], repeats: number): CellRow[] {
  const runs = entries.filter((e): e is RunResult => e.kind === "run");
  const cells = new Map<string, RunResult[]>();
  for (const r of runs) cells.set(cellKey(r.cell), [...(cells.get(cellKey(r.cell)) ?? []), r]);
  const rows: CellRow[] = [];
  for (const rs of cells.values()) {
    const before = rs.filter((r) => r.build === "before");
    const after = rs.filter((r) => r.build === "after");
    const outcome = cellOutcome(rs, repeats);
    // (a round that failed and waits for its re-run reads slower until the re-run says otherwise)
    const failing = outcome.state === "fail" || (outcome.state === "more" && outcome.rounds[outcome.rounds.length - 1] === "SLOWER");
    const v: CellVerdict = { ...outcome.pooled, verdict: outcome.state === "pass" ? "pass" : failing ? "SLOWER" : "incomplete" };
    const lt = (side: RunResult[]) => (side.length && side.every((r) => r.stats.longTasks !== null) ? median(side.map((r) => r.stats.longTasks as number)) : null);
    const st = (side: RunResult[]) => median(side.map((r) => Object.values(r.settleMs).reduce((s, x) => s + x, 0)));
    const looks = new Set(rs.map((r) => r.env.look));
    rows.push({
      cell: rs[0].cell,
      verdict: v,
      outcome,
      outside: mergeTriples(rs.map((r) => r.load.outside)),
      total: mergeTriples(rs.map((r) => r.load.total)),
      longTasks: { before: lt(before), after: lt(after) },
      settleMs: { before: st(before), after: st(after) },
      drewLook: [...looks].join("/"),
      failedLook: rs.some((r) => r.env.look !== null && r.env.look !== r.cell.look),
    });
  }
  return rows;
}

export interface Summary {
  header: string[];
  idle: { idle: boolean; text: string };
  table: string[];
  verdictLine: string;
  slower: number;
  incomplete: number;
}

export function summarize(entries: readonly Entry[], repeats: number, info: { before: string; after: string; machine: string[]; unq?: boolean }): Summary {
  const rows = buildRows(entries, repeats);
  const runs = entries.filter((e): e is RunResult => e.kind === "run");
  const discards = entries.filter((e): e is Discard => e.kind === "discard");
  const idle = idleLine([...runs.map((r) => r.load), ...discards.flatMap((d) => (d.load ? [d.load] : []))]);
  const tableHead = [
    "| size | look | configuration | scenario | p99 ms before | p99 ms after | worst ms before | worst ms after | hitches before | hitches after | CPU outside / total % (min/med/max) | verdict |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  const lines = rows.map((r) => {
    const v = r.verdict;
    const names = (ms: MetricName[]) => ms.map((m) => ({ p99Ms: "p99", worstMs: "worst", hitches: "hitches" })[m]).join(", ");
    const rounds = (r.outcome.rounds.length > 1 ? ` (rounds: ${r.outcome.rounds.join(", ")})` : "") + (r.outcome.state === "more" && v.verdict === "SLOWER" ? " (re-run pending)" : "");
    const verdict = (v.verdict === "SLOWER" ? `**SLOWER**${v.slower.length ? ` (${names(v.slower)})` : ""}` : v.verdict === "incomplete" ? `incomplete (${v.nBefore}+${v.nAfter} runs)` : "pass") + rounds;
    const note = r.failedLook ? ` (drew ${r.drewLook})` : "";
    return `| ${r.cell.size} | ${r.cell.look}${note} | ${CONFIG_LABELS[r.cell.config]} | ${r.cell.scenario} | ${cellText(v, "p99Ms", "before", 1)} | ${cellText(v, "p99Ms", "after", 1)} | ${cellText(v, "worstMs", "before", 1)} | ${cellText(v, "worstMs", "after", 1)} | ${cellText(v, "hitches", "before", 0)} | ${cellText(v, "hitches", "after", 0)} | ${tri(r.outside)} / ${tri(r.total)} | ${verdict} |`;
  });
  const slower = rows.filter((r) => r.verdict.verdict === "SLOWER").length;
  const incomplete = rows.filter((r) => r.verdict.verdict === "incomplete").length;
  const passed = rows.length - slower - incomplete;
  const header = [...(info.unq ? ["UNQUALIFIED: load rules off (--unqualified), not evidence"] : []), `before: ${info.before}`, `after: ${info.after}`, ...info.machine];
  return {
    header,
    idle,
    table: [...tableHead, ...lines],
    slower,
    incomplete,
    verdictLine: `${rows.length} cells: ${passed} pass, ${slower} SLOWER, ${incomplete} incomplete; ${runs.length} runs kept, ${discards.length} discarded`,
  };
}

export function machineLines(entries: readonly Entry[], gpus: string[]): string[] {
  const runs = entries.filter((e): e is RunResult => e.kind === "run");
  const seen = new Map<string, string>();
  for (const r of runs) seen.set(r.cell.config, `${CONFIG_LABELS[r.cell.config]}: ${r.env.engine} ${r.env.browser}, WebGL "${r.env.webgl}", ${r.env.refreshHz} Hz, DPR ${r.env.dpr}`);
  const ff = runs.find((r) => r.env.firefox)?.env.firefox;
  const c = cpus();
  return [
    `machine: ${c[0]?.model.trim()}, ${c.length} threads, ${Math.round(totalmem() / 2 ** 30)} GB, Windows ${release()}; GPUs: ${gpus.join(", ") || "n/a"}`,
    "window 1440x900, DPR 1, headed; map seed 4242, River Valley, normal difficulty",
    ...[...seen.values()],
    ...(ff ? [`Firefox setup: prefs ${JSON.stringify(ff.prefs)}; debugger unpinned from baseline: ${ff.runtimeUnpinned ? "checked (Runtime.js allowUnobservedWasm and allowUnobservedAsmJS)" : "NOT checked"}; omni.ja sha256 ${ff.omniJaSha256.slice(0, 12)}, Runtime.js ${ff.runtimeJsSha256.slice(0, 12)}`] : []),
  ];
}

export function printSummary(s: Summary): void {
  for (const h of s.header) console.log(h);
  console.log(s.idle.text);
  console.log("");
  // terminal: the same rows, padded
  const rows = s.table.filter((_, i) => i !== 1).map((l) => l.split("|").slice(1, -1).map((c) => c.trim()));
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
  for (const r of rows) console.log(r.map((c, i) => c.padEnd(widths[i])).join("  "));
  console.log("");
  console.log(s.verdictLine);
}

export function markdown(s: Summary, label: string, date: string): string {
  return [
    `# Smoothness: ${label} (${date})`,
    "",
    ...s.header.map((h) => `- ${h}`),
    `- **${s.idle.text}**`,
    "",
    "Each metric is median [min-max] over the runs of that build. A round passes when after's median p99, worst frame and hitch count are each no higher than before's highest run; a cell that fails runs again, up to twice more, and fails for real when two rounds fail (it passes after a failure only with two passing rounds and every run together passing; verdict.ts cellOutcome, tools/smooth/README.md).",
    "",
    ...s.table,
    "",
    s.verdictLine,
    "",
  ].join("\n");
}
