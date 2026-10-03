// The smoothness gate (PLAN §20 D380: nothing may get slower). Compares two builds of the app, "before" (a git ref,
// default origin/dev) and "after" (the working tree, or another ref), for frame smoothness across sizes, looks,
// browsers and scenarios, with the machine's load recorded beside every timing. Resumable. See README.md.
//
//   npm run smooth -- --sizes 128 --configs chromium --scenarios orbit --repeats 1
//   npm run smooth -- --before origin/dev --after worktree --record --label moving-water

import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { firefoxSetup, listGpus, pickIntegrated, launch, newPage, throttle, readEnv, CONFIGS, type Gpu } from "./browsers";
import { branchPoint, ensureBuild, serve, LOCAL, ROOT } from "./builds";
import { LoadMonitor, sleep } from "./monitor";
import { PROBE } from "./probe";
import { cellKey, expand, parseFilters, remaining, roundRuns, type BuildSide, type Cell, type Filters, type RunSpec } from "./plan";
import { machineLines, markdown, printSummary, summarize, type Discard, type Entry, type RunResult } from "./report";
import { DRIVERS, findSpots, openMap } from "./scenarios";
import { frameStats } from "./stats";
import { cellOutcome } from "./verdict";

// ---------------------------------------------------------------------------------------------------- arguments

interface Args {
  flags: Record<string, string | undefined>;
  bool: Set<string>;
  env: Record<BuildSide, Record<string, string>>;
}

const BOOLEANS = new Set(["record", "dry", "report", "help", "unqualified", "pause"]);

function parseArgs(argv: string[]): Args {
  const flags: Record<string, string | undefined> = {};
  const bool = new Set<string>();
  const env: Args["env"] = { before: {}, after: {} };
  for (let i = 0; i < argv.length; i++) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(argv[i]);
    if (!m) throw new Error(`unexpected argument "${argv[i]}" (npm run smooth -- --help)`);
    const [, name, inline] = m;
    if (BOOLEANS.has(name)) {
      bool.add(name);
      continue;
    }
    const value = inline ?? argv[++i];
    if (value === undefined) throw new Error(`--${name} needs a value`);
    if (name === "before-env" || name === "after-env") {
      const kv = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(value);
      if (!kv) throw new Error(`--${name} wants KEY=VALUE, got "${value}"`);
      env[name === "before-env" ? "before" : "after"][kv[1]] = kv[2];
    } else flags[name] = value;
  }
  return { flags, bool, env };
}

const HELP = `npm run smooth -- [options]
  --before <ref>        the build to beat (default: where this branch left origin/dev, git merge-base; pin a sha for a long series)
  --after <ref|worktree> the build under test (default worktree: the working tree)
  --before-env K=V      (repeatable) environment for building that side, e.g. VITE_X=off; same for --after-env
  --sizes 128,256       --looks standard,high   --configs chromium,chromium-4x,igpu-4x,firefox,webkit
  --scenarios orbit,brush,force   --repeats 5
  --cells "chromium|128|high|orbit,firefox|256|standard|brush"   only these cells (config|size|look|scenario)
  --unqualified         do not wait for a quiet machine or discard for load (to try the tool; not evidence; own series)
  --dry                 print the plan and the time estimate, run nothing
  --report              print the report of what is already measured, run nothing
  --record [--label x]  write results/<date>-<label>.md (a short summary; raw data stays in local/)
  --pause               ask the running series to stop after the cell it is on; the same command as before resumes it
                        at the first unfinished cell (every finished cell's runs are kept)
A cell that fails runs again, up to twice more (verdict.ts cellOutcome): it fails for real when two rounds fail.
Maps stop at 256 squared, so there is no 512 size.`;

// ---------------------------------------------------------------------------------------------------- series files

const readLines = <T>(file: string): T[] => (existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as T) : []);

/** Rough seconds per run when nothing has been measured yet: measured on this PC (Chrome, native, High, a busy machine), the other
 *  configurations scaled; replaced by the series' own medians as runs finish. */
function guessSeconds(spec: RunSpec): number {
  const big = spec.cell.size > 160;
  const base = { orbit: big ? 29 : 22, brush: big ? 100 : 29, force: big ? 62 : 28 }[spec.cell.scenario];
  const factor = { chromium: 1, "chromium-4x": big ? 2.5 : 1.3, "igpu-4x": big ? 2.5 : 1.3, firefox: big ? 2 : 1.4, webkit: big ? 1.5 : 1.2 }[spec.cell.config];
  return Math.round(base * factor);
}

function estimate(todo: RunSpec[], history: RunResult[]): number {
  const med = new Map<string, number>();
  const by = new Map<string, number[]>();
  for (const r of history) by.set(`${r.cell.config}|${r.cell.size}|${r.cell.scenario}`, [...(by.get(`${r.cell.config}|${r.cell.size}|${r.cell.scenario}`) ?? []), r.wallMs / 1000]);
  for (const [k, v] of by) med.set(k, [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]);
  return todo.reduce((s, r) => s + (med.get(`${r.cell.config}|${r.cell.size}|${r.cell.scenario}`) ?? guessSeconds(r)), 0);
}

const hm = (sec: number): string => `${Math.floor(sec / 3600)} h ${String(Math.round((sec % 3600) / 60)).padStart(2, "0")} min`;

class StopSeries extends Error {}

/** A run longer than this is stuck (a page that never answers): its browser is closed and the run
 *  retried, as any other error. The longest qualified runs take under 2 minutes; a quiet-machine wait
 *  inside a run can take up to 15. */
const RUN_LIMIT_MS = 20 * 60_000;

function withLimit<T>(p: Promise<T>, ms: number, onLimit: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      onLimit();
      reject(new Error(`the run took over ${ms / 60_000} minutes (stuck); its browser was closed`));
    }, ms);
  });
  return Promise.race([p, limit]).finally(() => clearTimeout(timer));
}

// ---------------------------------------------------------------------------------------------------- main

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.bool.has("help")) {
    console.log(HELP);
    return 0;
  }
  const filters: Filters = parseFilters(args.flags);
  const beforeRef = args.flags.before ?? branchPoint();
  const afterRef = args.flags.after ?? "worktree";
  const label = args.flags.label ?? "run";

  const lockFile = join(LOCAL, "smooth.lock");
  const pauseFile = join(LOCAL, "smooth.pause");
  mkdirSync(LOCAL, { recursive: true });
  if (args.bool.has("pause")) {
    writeFileSync(pauseFile, new Date().toISOString());
    console.log("asked the running series to stop after its current cell (run the series' own command again to resume)");
    return 0;
  }
  if (existsSync(pauseFile)) unlinkSync(pauseFile);
  if (existsSync(lockFile)) {
    const l = JSON.parse(readFileSync(lockFile, "utf8")) as { pid: number };
    try {
      process.kill(l.pid, 0);
      throw new Error(`another smoothness series is running (pid ${l.pid}); two at once would measure each other`);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw e;
    }
  }

  if (filters.configs.includes("firefox")) firefoxSetup(); // refuses Firefox runs, before anything is built or measured, if its debugger pins WebAssembly to baseline
  const before = ensureBuild(beforeRef, args.env.before);
  const after = ensureBuild(afterRef, args.env.after);
  const unq = args.bool.has("unqualified");
  const seriesId = `${before.id.slice(0, 10)}__${after.id.slice(0, 10)}${unq ? "__unqualified" : ""}`;
  const dir = join(LOCAL, "series", seriesId);
  mkdirSync(join(dir, "raw"), { recursive: true });
  const resultsFile = join(dir, "results.jsonl");
  const plan = expand(filters);
  writeFileSync(join(dir, "plan.json"), JSON.stringify({ before: { ref: before.ref, id: before.id, env: before.env }, after: { ref: after.ref, id: after.id, env: after.env }, filters, runs: plan.map((r) => r.key), updated: new Date().toISOString() }, null, 1));

  let entries = readLines<Entry>(resultsFile);
  const done = new Set(entries.filter((e): e is RunResult => e.kind === "run").map((e) => e.key));
  const todo = remaining(plan, done);
  const info = { unq, before: `${before.ref} ${before.id.slice(0, 10)}${Object.keys(before.env).length ? " " + JSON.stringify(before.env) : ""}`, after: `${after.ref} ${after.id.slice(0, 10)}${Object.keys(after.env).length ? " " + JSON.stringify(after.env) : ""}`, machine: [] as string[] };

  const history = entries.filter((e): e is RunResult => e.kind === "run");
  console.log(`series ${seriesId}: ${plan.length} runs planned, ${plan.length - todo.length} already measured, ${todo.length} to go`);
  console.log(`estimated time: ${hm(estimate(todo, history))} (without waiting for a quiet machine)`);

  const finish = (): number => {
    // (the plan's cells, re-run rounds included)
    const planned = new Set(plan.map((p) => cellKey(p.cell)));
    const e = readLines<Entry>(resultsFile).filter((x) => planned.has(x.key.split("|").slice(0, 4).join("|")));
    const gpus = gpuList.map((g) => g.name);
    info.machine = machineLines(e, gpus);
    const s = summarize(e, filters.repeats, info);
    printSummary(s);
    if (args.bool.has("record")) {
      const date = new Date().toISOString().slice(0, 10);
      const out = join(import.meta.dirname, "results", `${date}-${label}.md`);
      mkdirSync(join(import.meta.dirname, "results"), { recursive: true });
      writeFileSync(out, markdown(s, label, date));
      console.log(`wrote ${out.replace(ROOT + "\\", "")}`);
    }
    return s.slower ? 1 : 0;
  };
  let gpuList: Gpu[] = [];

  if (args.bool.has("dry")) return 0;
  if (args.bool.has("report")) return finish();

  writeFileSync(lockFile, JSON.stringify({ pid: process.pid }));
  const servers = { before: await serve(before.dist), after: await serve(after.dist) };
  const monitor = new LoadMonitor(join(dir, "load.jsonl"), undefined, !unq);
  let integrated: Gpu | null = null;
  if (filters.configs.includes("igpu-4x")) {
    gpuList = await listGpus();
    integrated = pickIntegrated(gpuList);
    console.log(`integrated GPU: ${integrated.name} (of ${gpuList.map((g) => g.name).join(", ")})`);
  }
  const cleanup = async () => {
    monitor.close();
    await servers.before.close();
    await servers.after.close();
    if (existsSync(lockFile)) unlinkSync(lockFile);
  };
  process.once("SIGINT", () => void cleanup().then(() => process.exit(130)));

  let stopped = false;
  try {
    if (!(await monitor.qualify())) throw new StopSeries("no 60 s with outside CPU at most 25% within 15 minutes");
    const attempts = new Map<string, number>();
    let n = 0;
    /** The browser of the run in progress (closed if the run outlasts RUN_LIMIT_MS). */
    let open: { close(): Promise<void> } | null = null;
    /** Measure these runs (a load-discarded run is requeued; an error retried up to three times); false when one
     *  could not be measured. */
    const measure = async (specs: RunSpec[]): Promise<boolean> => {
      const queue = [...specs];
      let complete = true;
      while (queue.length) {
        const spec = queue.shift()!;
        const tries = attempts.get(spec.key) ?? 0;
        if (tries >= 6) {
          console.log(`  giving up on ${spec.key} for now (6 attempts)`);
          complete = false;
          continue;
        }
        attempts.set(spec.key, tries + 1);
        const t0 = Date.now();
        const outcome = await withLimit(executeRun(spec, servers[spec.build].url, before.id, after.id, monitor, integrated, join(dir, "raw"), (b) => (open = b)), RUN_LIMIT_MS, () => open?.close().catch(() => undefined)).catch((e: unknown) => {
          if (e instanceof StopSeries) throw e;
          return { error: e instanceof Error ? e.message.split("\n")[0] : String(e) };
        });
        n++;
        const tag = `[${n}] ${spec.cell.config} ${spec.cell.size} ${spec.cell.look} ${spec.cell.scenario} ${spec.build}#${spec.repeat}${spec.round > 1 ? ` round ${spec.round}` : ""}`;
        if ("error" in outcome) {
          console.log(`${tag}: error, retried later: ${outcome.error}`);
          appendFileSync(resultsFile, JSON.stringify({ kind: "discard", key: spec.key, reason: `error: ${outcome.error}`, load: null, at: new Date().toISOString(), wallMs: Date.now() - t0 } satisfies Discard) + "\n");
          if ((attempts.get(spec.key) ?? 0) < 3) queue.unshift(spec);
          else complete = false;
          continue;
        }
        if (outcome.kind === "discard") {
          console.log(`${tag}: discarded, ${outcome.reason}${outcome.load?.worst ? " (" + outcome.load.worst.map((t) => `${t.name} ${t.cpu}%`).join(", ") + ")" : ""}; requeued`);
          appendFileSync(resultsFile, JSON.stringify(outcome) + "\n");
          queue.unshift(spec); // requalify (the monitor dropped its lease), then again
          continue;
        }
        appendFileSync(resultsFile, JSON.stringify(outcome) + "\n");
        const st = outcome.stats;
        const o = outcome.load.outside;
        console.log(`${tag}: p99 ${st.p99Ms?.toFixed(1)} worst ${st.worstMs?.toFixed(1)} hitches ${st.hitches} long tasks ${st.longTasks ?? "unavailable"}, outside CPU ${o ? `${o.min.toFixed(0)}/${o.median.toFixed(0)}/${o.max.toFixed(0)}%` : "n/a"}, ${Math.round(outcome.wallMs / 1000)} s`);
      }
      return complete;
    };
    // cell by cell, in the plan's order: its first round, then re-runs while the rule asks for them
    const cells: Cell[] = [];
    for (const r of plan) if (!cells.some((c) => cellKey(c) === cellKey(r.cell))) cells.push(r.cell);
    for (const cell of cells) {
      for (;;) {
        const mine = readLines<Entry>(resultsFile).filter((e): e is RunResult => e.kind === "run" && cellKey(e.cell) === cellKey(cell));
        const o = cellOutcome(mine, filters.repeats);
        if (o.state !== "more") break;
        if (existsSync(pauseFile)) {
          unlinkSync(pauseFile);
          throw new StopSeries(`paused before ${cellKey(cell)} (--pause)`);
        }
        const round = o.rounds.length + 1;
        if (round > 1 && !mine.some((r) => (r.round ?? 1) === round)) console.log(`  ${cellKey(cell)}: round ${round - 1} came out ${o.rounds[round - 2]}; running it again (round ${round})`);
        const have = new Set(mine.map((r) => r.key));
        if (!(await measure(roundRuns(cell, filters.repeats, round).filter((r) => !have.has(r.key))))) break;
      }
    }
  } catch (e) {
    if (!(e instanceof StopSeries)) throw e;
    console.log(`STOPPED: ${e.message}. Run the same command again to continue.`);
    stopped = true;
  } finally {
    await cleanup();
  }
  entries = readLines<Entry>(resultsFile);
  const code = finish();
  return stopped ? 2 : code;
}

// ---------------------------------------------------------------------------------------------------- one run

async function executeRun(spec: RunSpec, url: string, beforeId: string, afterId: string, monitor: LoadMonitor, integrated: Gpu | null, rawDir: string, opened: (b: { close(): Promise<void> }) => void = () => undefined): Promise<RunResult | Discard> {
  const def = CONFIGS[spec.cell.config];
  const driver = DRIVERS[spec.cell.scenario];
  const t0 = Date.now();
  const browser = await launch(def, integrated);
  opened(browser);
  try {
    const { context, page } = await newPage(browser, spec.cell.look, PROBE);
    let pageErrors = 0;
    page.on("pageerror", () => pageErrors++);
    page.on("console", (m) => m.type() === "error" && pageErrors++);
    await openMap(page, url, spec.cell.size, driver.topDown);
    const env = await readEnv(page, browser, def);
    if (def.integrated && integrated && !/radeon|amd/i.test(env.webgl)) throw new Error(`the integrated-GPU configuration ran on "${env.webgl}", not ${integrated.name}`);
    await throttle(context, page, def.throttle);
    const spots = driver.topDown ? await findSpots(page) : null;
    await driver.prepare(page, spots);
    if (!(await monitor.qualify())) throw new StopSeries("no 60 s with outside CPU at most 25% within 15 minutes");
    await page.bringToFront();
    await page.evaluate(() => window.__smooth.begin());
    const from = Date.now();
    const extras = await driver.timed(page, spots);
    const raw = await page.evaluate(() => window.__smooth.end());
    const to = Date.now();

    const load = await monitor.judge(from, to);
    const base = { key: spec.key, at: new Date().toISOString(), wallMs: Date.now() - t0 };
    if (!load.valid) return { kind: "discard", ...base, reason: load.reason ?? "load", load };
    if (raw.hidden > 0) return { kind: "discard", ...base, reason: `page hidden for ${raw.hidden} frames`, load };
    const stats = frameStats(raw.frames, raw.longTasks ? raw.tasks : null, raw.t1 - raw.t0);
    writeFileSync(join(rawDir, spec.key.replace(/[|]/g, "_") + ".json"), JSON.stringify({ spec: spec.key, env, from, to, extras, frames: raw.frames, tasks: raw.tasks, load }));
    return {
      kind: "run",
      ...base,
      build: spec.build,
      repeat: spec.repeat,
      round: spec.round,
      cell: spec.cell,
      buildId: spec.build === "before" ? beforeId : afterId,
      env,
      stats,
      load,
      settleMs: extras.settleMs,
      forceMs: extras.forceMs,
      heapMB: raw.heap0 !== null && raw.heap1 !== null ? { start: Math.round(raw.heap0 / 1048576), end: Math.round(raw.heap1 / 1048576) } : null,
      hidden: raw.hidden,
      unfocused: raw.unfocused,
      pageErrors,
    };
  } finally {
    await browser.close().catch(() => undefined);
    await sleep(300);
  }
}

declare global {
  interface Window {
    __smooth: {
      begin(): void;
      end(): { frames: number[]; tasks: [number, number][]; longTasks: boolean; t0: number; t1: number; hidden: number; unfocused: number; heap0: number | null; heap1: number | null };
    };
  }
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
