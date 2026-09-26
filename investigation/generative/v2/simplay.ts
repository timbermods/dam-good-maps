// Simulated play with the exact cycle model (investigation/cycles, PR #15; task d): the full
// simulation as the validation of the generator's cheap signature (cycle.ts), on seeds 1–15 of
// each theme at 128² for design version 2 and version 1 (15, not 30: each map takes 30–100 s on
// the shared machine). The current generator's signatures are
// the cycles study's own (results/signatures.json: the same model, the same seeds and weather seed).
//
// Three probes, as the study's summarize.ts: the first Normal drought, the first Normal badtide and
// a later Hard drought; its eleven-value signature, its distance (mean absolute difference) and its
// fixed group bins. With `--weather 1729,7,99` the probes run under several weather seeds and the
// signature keeps the worst of them (the study's INTEGRATION.md: the worst of several matters more
// than one lucky badtide); the briefs use that.
//
//   npx tsx investigation/generative/v2/simplay.ts --gen proto2|proto [--seeds 1-30] [--themes …] [--jobs 6]
//   npx tsx investigation/generative/v2/simplay.ts --summary

/* eslint-disable @typescript-eslint/no-explicit-any */

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AVAILABLE_THEMES, type ThemeId } from "../../../src/core/spec/mapspec";
import { CycleModel } from "../../cycles/model";
import { Measures } from "../../cycles/measures";
import { cases, runStretch } from "../../cycles/stretch";
import { arg, lowPriority, parseSeeds } from "../lib/paths";
import { generateProto } from "../proto/generate";
import { cheapCycle } from "./cycle";
import { generateV2 } from "./generate";
import { V2_ROOT } from "./refs";

const HERE = join(process.cwd(), "investigation", "generative");
const DIR = join(V2_ROOT, "simplay");
const PROBES = ["first-normal", "first-badtide", "late-hard"];
const r3 = (v: number) => Math.round(v * 1000) / 1000;

/** The exact model's probes on one built map, and the study's signature. */
export function exactCycle(r: any, weatherSeed = 1729) {
  const scen: Record<string, any> = {};
  let baseline: any = null;
  for (const spec of cases(r.built, weatherSeed)) {
    if (!PROBES.includes(spec.id)) continue;
    const model = new CycleModel(r.built, spec.start);
    const measure = new Measures(model, r.spec.settings.start.rules.waterWithin);
    baseline = measure.sample(0);
    const days: any[] = [];
    runStretch(model, spec.days, (row) => {
      days.push({ ...measure.sample(row.day), phase: row.phase, phaseDay: row.phaseDay });
    });
    const hazard = days.filter((x) => x.phase !== "normal").at(-1);
    const recovery = hazard ? days.filter((x) => x.day >= hazard.day && x.phase === "normal") : [];
    const back = recovery.find((x) => x.volume >= baseline.volume * 0.95 && x.badTiles <= baseline.badTiles + Math.max(1, baseline.wetTiles * 0.01) && x.moistTiles >= baseline.moistTiles * 0.95);
    const hazardStart = days.find((x) => x.phase !== "normal")?.day ?? 0;
    scen[spec.id] = { days, hazard, hazardStart, firstWaterLost: measure.firstWaterLost, recoveryDays: back ? back.day - hazard.day : null };
  }
  const s = scen["first-normal"].hazard;
  const d = scen["late-hard"].hazard;
  const b = scen["first-badtide"].hazard;
  const long = scen["late-hard"];
  const clean = (day: any) => day.regionCleanVolume.reduce((a: number, v: number) => a + v, 0);
  const startDays = long.firstWaterLost === null ? 26 : Math.max(0, long.firstWaterLost - long.hazardStart);
  const N = r.built.W * r.built.H;
  const values = {
    shortRetention: s.volume / baseline.volume,
    longRetention: d.volume / baseline.volume,
    cleanLongRetention: clean(d) / Math.max(1, clean(baseline)),
    startDays,
    driedShare: d.driedTiles / Math.max(1, baseline.wetTiles),
    fragments: Math.max(...long.days.map((x: any) => x.maxFragments)),
    badwaterExposure: Math.max(0, b.badTiles - baseline.badTiles) / Math.max(1, baseline.wetTiles - baseline.badTiles),
    soilExposure: Math.max(0, b.soilTiles - baseline.soilTiles) / N,
    treesLost: d.plants.treesLost / Math.max(1, d.plants.originalTrees),
    bushesLost: d.plants.bushesLost / Math.max(1, d.plants.originalBushes),
    badRecovery: scen["first-badtide"].recoveryDays ?? 6,
  };
  const vector = [values.shortRetention, values.longRetention, values.cleanLongRetention, startDays / 26, values.driedShare, Math.min(1, values.fragments / 20), values.badwaterExposure, values.soilExposure, values.treesLost, values.bushesLost, values.badRecovery / 6].map((x) => Math.min(1, Math.max(0, x)));
  const bin = (v: number, cuts: number[]) => cuts.filter((c) => v >= c).length;
  const group = [bin(values.longRetention, [0.05, 0.25, 0.5, 0.75]), bin(values.badwaterExposure, [0.25, 0.5, 0.75]), bin(startDays, [1, 7, 14, 26])].join("/");
  // the start's pumpable water in the first Normal drought, counted from the drought's first day
  const fn = scen["first-normal"];
  const firstLost = fn.firstWaterLost === null ? null : Math.max(0, fn.firstWaterLost - fn.hazardStart);
  const timeline = Object.fromEntries(
    Object.entries(scen).map(([id, v]: [string, any]) => [id, { firstWaterLost: v.firstWaterLost === null ? null : Math.max(0, v.firstWaterLost - v.hazardStart), recoveryDays: v.recoveryDays, days: v.days.map((x: any) => ({ day: x.day, phase: x.phase, kept: r3(x.volume / baseline.volume), bad: x.badTiles, pump: x.pumpTiles ?? null, moist: x.moistTiles })) }]),
  );
  return { values: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, r3(v)])), vector: vector.map(r3), group, firstNormalLost: firstLost, timeline };
}

async function run(): Promise<void> {
  const jobs = Number(arg("jobs", "1"));
  const w = arg("worker", "");
  if (jobs > 1 && !w) {
    const args = process.argv.slice(2).filter((a, i, all) => a !== "--jobs" && all[i - 1] !== "--jobs");
    await Promise.all(
      Array.from({ length: jobs }, (_, k) => new Promise<void>((res) => spawn(process.execPath, [...process.execArgv, process.argv[1], ...args, "--worker", `${k}/${jobs}`], { stdio: ["ignore", "inherit", "inherit"] }).on("exit", () => res()))),
    );
    return;
  }
  const [k, n] = w ? w.split("/").map(Number) : [0, 1];
  lowPriority();
  const gen = arg("gen", "proto2");
  const seeds = parseSeeds(arg("seeds", "1-30"));
  const themes = arg("themes", AVAILABLE_THEMES.join(",")).split(",") as ThemeId[];
  const weather = arg("weather", "1729").split(",").map(Number);
  const vtArg = arg("vt", "");
  mkdirSync(DIR, { recursive: true });
  let idx = 0;
  for (const theme of themes)
    for (const seed of seeds) {
      if (idx++ % n !== k) continue;
      const tag = `${gen}${vtArg ? `-vt${vtArg}` : ""}-${theme}-${seed}${weather.length > 1 ? "-w" : ""}`;
      const out = join(DIR, `${tag}.json`);
      if (existsSync(out) && !process.argv.includes("--force")) continue;
      const t0 = performance.now();
      const r: any = gen === "proto2" ? generateV2(theme, seed, 128, "normal", vtArg ? { vt: Number(vtArg) } : {}) : generateProto(theme, seed, 128);
      if (!r.bytes.length) continue;
      const runs = weather.map((ws) => ({ ws, ...exactCycle(r, ws) }));
      // the worst of the weather seeds: the least water kept through the Hard drought
      const worst = runs.reduce((a, b) => (b.values.longRetention < a.values.longRetention ? b : a));
      const cheap = cheapCycle(r.built, r.spec.settings.start.rules.waterWithin);
      writeFileSync(out, JSON.stringify({ gen, theme, seed, weather, exact: runs.map(({ timeline, ...x }) => x), worst: { ...worst }, cheap }));
      console.log(`${tag}: ${Math.round(performance.now() - t0)} ms, exact ${worst.group}, cheap ${cheap.group}`);
    }
}

function summary(): void {
  const q = (v: number[], p: number) => {
    const s = v.filter(Number.isFinite).sort((a, b) => a - b);
    return s.length ? s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] : NaN;
  };
  const dist = (a: number[], b: number[]) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length;
  const corr = (a: number[], b: number[]) => {
    const n = a.length;
    const ma = a.reduce((s, v) => s + v, 0) / n;
    const mb = b.reduce((s, v) => s + v, 0) / n;
    let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < n; i++) {
      sab += (a[i] - ma) * (b[i] - mb);
      saa += (a[i] - ma) ** 2;
      sbb += (b[i] - mb) ** 2;
    }
    return saa && sbb ? r3(sab / Math.sqrt(saa * sbb)) : NaN;
  };
  const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith(".json") && !f.includes("-w.")) : [];
  const recs = files.map((f) => JSON.parse(readFileSync(join(DIR, f), "utf8")));
  const res: any = { note: `exact cycle model (investigation/cycles), weather seed 1729, probes first-normal, first-badtide, late-hard; seeds ${arg("seeds", "1-15")} per theme at 128²; current: the study's own results/signatures.json for the same seeds`, gens: {} };
  const byGen: Record<string, any[]> = {};
  // the same seeds for every generator (the sample the prototypes ran)
  const seeds = new Set(parseSeeds(arg("seeds", "1-15")));
  for (const r of recs) if (seeds.has(r.seed)) (byGen[r.gen] ??= []).push({ theme: r.theme, seed: r.seed, exact: r.worst, cheap: r.cheap });
  try {
    const cur = JSON.parse(readFileSync(join(process.cwd(), "investigation", "cycles", "results", "signatures.json"), "utf8"));
    byGen.current = cur.filter((x: any) => seeds.has(x.seed)).map((x: any) => ({ theme: x.theme, seed: x.seed, exact: { values: x, vector: x.vector, group: x.group }, cheap: null }));
  } catch {
    /* none */
  }
  for (const [gen, list] of Object.entries(byGen)) {
    const themes: any = {};
    for (const t of [...new Set(list.map((x) => x.theme))].sort()) {
      const set = list.filter((x) => x.theme === t);
      const groups = new Map<string, number>();
      for (const x of set) groups.set(x.exact.group, (groups.get(x.exact.group) ?? 0) + 1);
      const nn = set.map((a, i) => Math.min(...set.filter((_, j) => j !== i).map((b) => dist(a.exact.vector, b.exact.vector))));
      themes[t] = {
        maps: set.length,
        groups: groups.size,
        largestGroupShare: r3(Math.max(...groups.values()) / set.length),
        nearestPeerMedian: r3(q(nn, 0.5)),
        longRetention: [r3(q(set.map((x) => x.exact.values.longRetention), 0)), r3(q(set.map((x) => x.exact.values.longRetention), 1))],
        startDays: [q(set.map((x) => x.exact.values.startDays), 0), q(set.map((x) => x.exact.values.startDays), 1)],
        firstNormalKept: set.some((x) => "firstNormalLost" in x.exact) ? r3(set.filter((x) => x.exact.firstNormalLost === null).length / set.length) : null,
      };
    }
    const withCheap = list.filter((x) => x.cheap);
    const agree = withCheap.length
      ? {
          maps: withCheap.length,
          longRetentionCorrelation: corr(withCheap.map((x) => x.cheap.longRetention), withCheap.map((x) => x.exact.values.longRetention)),
          shortRetentionCorrelation: corr(withCheap.map((x) => x.cheap.shortRetention), withCheap.map((x) => x.exact.values.shortRetention)),
          startDaysCorrelation: corr(withCheap.map((x) => x.cheap.startDays), withCheap.map((x) => x.exact.values.startDays)),
          exposureCorrelation: corr(withCheap.map((x) => x.cheap.riverShare), withCheap.map((x) => x.exact.values.badwaterExposure)),
          retentionBinAgreement: r3(withCheap.filter((x) => x.cheap.group.split("/")[0] === x.exact.group.split("/")[0]).length / withCheap.length),
          startBinAgreement: r3(withCheap.filter((x) => x.cheap.group.split("/")[2] === x.exact.group.split("/")[2]).length / withCheap.length),
          firstDroughtAgreement: r3(withCheap.filter((x) => x.cheap.startFirstDrought === (x.exact.firstNormalLost === null)).length / withCheap.length),
        }
      : null;
    res.gens[gen] = { themes, cheapAgainstExact: agree };
  }
  writeFileSync(join(HERE, "simplay-v2.json"), JSON.stringify(res, null, 1) + "\n");
  console.log(JSON.stringify(res, null, 1));
}

if (process.argv[1] && /simplay\.ts$/.test(process.argv[1])) {
  if (process.argv.includes("--summary")) summary();
  else void run();
}
