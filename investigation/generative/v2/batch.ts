/* eslint-disable @typescript-eslint/no-explicit-any */
// Batches of design version 2's prototype, measured the way the workshop study measures every map
// (investigation/workshop/lib/measures.ts) plus version 2's own records (relief and verticality,
// intentions, settles and timings). Local only: <ROOT>\maps\<set>\<theme>-<seed>.{json,timber,f32}.
// Several processes run side by side (`--jobs`), each taking every n-th seed.
//
//   npx tsx investigation/generative/v2/batch.ts --set v2-128 [--themes …] [--seeds 1-200] [--size 128]
//        [--vt 85] [--unlocked] [--variety 70] [--drought prefer|require|off] [--jobs 8] [--resume]

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { generate as generateCurrent, type GenerateResult } from "../../../src/core/gen/generate";
import { makeSpec } from "../../../src/core/spec/mapspec";
import { blocks } from "../../../src/core/validate/report";
import { AVAILABLE_THEMES, type ThemeId } from "../../../src/core/spec/mapspec";
import { measureFile } from "../../workshop/lib/measures";
import { arg, lowPriority, MAPS, parseSeeds } from "../lib/paths";
import { generateProto } from "../proto/generate";
import { cheapCycle } from "./cycle";
import { generateV2, type DroughtPolicy, type ProtoResultV2 } from "./generate";
import type { IntentionId } from "./intentions";
import { startingWood } from "./rules";
import { vertical } from "./vertical";

/** The mechanics study's axes (investigation/mechanics/measure.ts, merged on dev). */
export const AXIS_BINS: [string, number[]][] = [
  ["storageRatio", [0.25, 1, 3]],
  ["peakAxialFlow64", [0.5, 1, 2]],
  ["flatDry40", [150, 500, 1200]],
  ["fertilityPersistence", [0.25, 0.75]],
  ["badwaterDistance", [15, 30, 60]],
  ["logs20", [80, 160, 320]],
  ["frontierComponents", [1.5, 3.5]],
  ["deepPumpExtraShore", [0.5, 10, 50]],
  // D164: the woods' character, oak's share of the starting wood's logs (an oak yields 8, so the
  // default mix, a fifth oak by trees, is 57% oak by logs): below 0.35 pine and birch, quick to
  // regrow; 0.75 and above oak, plenty of wood and slow to regrow; mixed between
  ["oakShare20", [0.35, 0.75]],
];
export async function loadAxes(): Promise<((r: GenerateResult) => Record<string, unknown>) | null> {
  const p = resolve("investigation", "mechanics", "measure.ts");
  if (!existsSync(p)) return null;
  const m = await import(pathToFileURL(p).href);
  return m.measureOpening;
}
export function axesOf(m: Record<string, unknown>): { values: Record<string, number | null>; bins: (number | null)[]; joint: string } {
  const values: Record<string, number | null> = {};
  const bins: (number | null)[] = [];
  for (const [k, cuts] of AXIS_BINS) {
    const v = m[k];
    const num = typeof v === "number" && Number.isFinite(v) ? v : null;
    values[k] = num;
    bins.push(num === null ? null : cuts.filter((c) => num >= c).length);
  }
  return { values, bins, joint: bins.map((b) => (b === null ? "n" : String(b))).join("") };
}

export interface V2Rec {
  key: string;
  theme: string;
  seed: number;
  passed: boolean;
}

async function parent(): Promise<void> {
  const jobs = Number(arg("jobs", "1"));
  const args = process.argv.slice(2).filter((a, i, all) => a !== "--jobs" && all[i - 1] !== "--jobs");
  if (jobs <= 1) {
    await child(0, 1);
    return;
  }
  const kids = Array.from({ length: jobs }, (_, k) =>
    new Promise<void>((res) => {
      const p = spawn(process.execPath, [...process.execArgv, process.argv[1], ...args, "--worker", `${k}/${jobs}`], { stdio: ["ignore", "inherit", "inherit"] });
      p.on("exit", () => res());
    }),
  );
  await Promise.all(kids);
  console.log("ALL DONE");
}

async function child(k: number, n: number): Promise<void> {
  lowPriority();
  const gen = arg("gen", "proto2");
  const axesFn = await loadAxes();
  const set = arg("set", "v2-128");
  const size = Number(arg("size", "128"));
  const seeds = parseSeeds(arg("seeds", "1-200"));
  const themes = arg("themes", AVAILABLE_THEMES.join(",")).split(",") as ThemeId[];
  const vtArg = arg("vt", "");
  const vt = vtArg ? Number(vtArg) : undefined;
  const unlocked = process.argv.includes("--unlocked");
  const variety = Number(arg("variety", "70"));
  const drought = arg("drought", "prefer") as DroughtPolicy;
  const files = !process.argv.includes("--no-files");
  // forced intentions (steering tests): --intentions a,b; "none" for none
  const intArg = arg("intentions", "");
  const intentions = intArg ? (intArg === "none" ? [] : (intArg.split(",") as IntentionId[])) : undefined;
  const dir = join(MAPS, set);
  mkdirSync(dir, { recursive: true });
  let idx = 0;
  for (const theme of themes)
    for (const seed of seeds) {
      if (idx++ % n !== k) continue;
      const key = `${theme}-${seed}`;
      if (process.argv.includes("--resume") && existsSync(join(dir, `${key}.json`))) continue;
      const t0 = performance.now();
      const any: any =
        gen === "proto2"
          ? generateV2(theme, seed, size, "normal", { vt, unlocked, variety, drought, intentions })
          : gen === "proto"
            ? generateProto(theme, seed, size, "normal", { variety })
            : generateCurrent(makeSpec({ seed, theme, size: { x: size, y: size } }));
      const ms = Math.round(performance.now() - t0);
      const stageOk = gen !== "proto" || any.info?.stage !== "dam wall";
      const passed = gen === "current" ? any.report.passed && any.bytes.length > 0 : any.bytes.length > 0 && (any.storage?.ok ?? true) && stageOk;
      // version 2 applies Kyler's start water and starting wood rules in place of the validators'
      // start.water and start.wood (rules.ts)
      const failed = any.report.checks.filter((c: any) => blocks("generate", c) && !(gen === "proto2" && (c.id === "start.water" || c.id === "start.wood"))).map((c: any) => c.id);
      if (gen !== "proto2") {
        const base0 = { key, gen, set, theme, seed, size, passed, attempts: any.attempts, failures: any.failures, failed, ms, recipe: any.recipe ?? null, storage: any.storage ? { ok: any.storage.ok, value: any.storage.value ?? null, message: any.storage.message } : null, info: any.info ? { start: any.info.start, badwater: any.info.badwater, hydro: any.info.hydro, stage: any.info.stage, ms: any.info.ms } : null };
        if (!passed) {
          writeFileSync(join(dir, `${key}.json`), JSON.stringify(base0));
          console.log(`${set} ${key.padEnd(16)} FAIL ${any.attempts}`);
          continue;
        }
        writeFileSync(join(dir, `${key}.json`), JSON.stringify({ ...base0, ...measured(any, axesFn) }));
        if (files) writeFiles(dir, key, any);
        console.log(`${set} ${key.padEnd(16)} pass ${any.attempts} ${ms} ms`);
        continue;
      }
      const r = any as ProtoResultV2;
      const g = r.genome;
      const base = {
        key,
        gen: "proto2",
        set,
        theme,
        seed,
        size,
        passed,
        attempts: r.attempts,
        failures: r.failures,
        failed,
        ms,
        recipe: r.recipe ?? null,
        genome: { vt: g.vt, vtSetting: g.vtSetting, unlocked: g.unlocked, top: Math.round(g.top * 100) / 100, base: Math.round(g.base * 100) / 100, step: g.terrace.step, terraceShare: Math.round(g.terrace.share * 100) / 100, cap: Math.round(g.cap.share * 100) / 100, weathering: Math.round(g.weathering * 100) / 100, hanging: Math.round(g.hanging * 100) / 100, tiltKind: g.tiltKind, flowDir: g.flowDir, parts: g.parts.map((p) => p.kind), intentions: g.intentions, variety: g.variety },
        intentions: r.intentions,
        storage: { ok: r.storage.ok, value: r.storage.value ?? null, message: r.storage.message },
        info: { start: r.info.start, badwater: r.info.badwater, hydro: r.info.hydro, stage: r.info.stage, ms: r.info.ms, ramps: r.info.ramps, settles: r.info.settles, startDrought: r.info.startDrought, startWater: r.info.startWater ?? null, startWood: r.info.startWood ?? null, edgeWalls: r.info.edgeWalls ?? null, genomes: r.info.genomes },
        timings: r.timings,
      };
      if (!passed) {
        writeFileSync(join(dir, `${key}.json`), JSON.stringify(base));
        console.log(`${set} ${key.padEnd(16)} FAIL ${r.attempts} ${failed.join(",")} ${r.info.stage}`);
        continue;
      }
      const meas = measured(r, axesFn);
      writeFileSync(join(dir, `${key}.json`), JSON.stringify({ ...base, ...meas }));
      if (files) writeFiles(dir, key, r);
      console.log(`${set} ${key.padEnd(16)} pass ${r.attempts} ${ms} ms range ${meas.vertical.range} fall ${meas.vertical.tallestFall} ${r.intentions.map((i) => `${i.id}:${i.outcome}`).join(" ")}`);
    }
}

/** The workshop study's record, relief and verticality, the cheap cycle signature and the axes. */
function measured(r: GenerateResult, axesFn: ((r: GenerateResult) => Record<string, unknown>) | null) {
  const { m } = measureFile(r.file, { spec: r.spec, features: r.features, water: { model: r.built.waterModel, settled: r.built.settle } });
  const b = r.built;
  const objs = b.entities.map((e) => ({ template: e.template, x: e.x, y: e.y, orientation: e.orientation }));
  const vert = vertical(b.heights, b.W, b.H, b.water, objs, b.start ?? null);
  const cyc = cheapCycle(b, r.spec.settings.start.rules.waterWithin);
  const wood = b.start ? startingWood(b.heights, b.W, b.H, b.entities, b.start) : null;
  let axes: ReturnType<typeof axesOf> | null = null;
  if (axesFn) {
    try {
      axes = axesOf({ ...axesFn(r), oakShare20: wood && wood.logs ? wood.oakShare : null });
    } catch {
      axes = null;
    }
  }
  return { ...m, vertical: vert, cheapCycle: cyc, axes, wood };
}

function writeFiles(dir: string, key: string, r: GenerateResult): void {
  const b = r.built;
  const N = b.W * b.H;
  const buf = new Float32Array(3 * N);
  buf.set(b.water, 0);
  buf.set(b.contamination, N);
  buf.set(b.moisture, 2 * N);
  writeFileSync(join(dir, `${key}.f32`), new Uint8Array(buf.buffer));
  writeFileSync(join(dir, `${key}.timber`), r.bytes);
  writeFileSync(join(dir, `${key}.features.json`), JSON.stringify({ spec: r.spec, features: r.features }));
}

if (process.argv[1] && /batch\.ts$/.test(process.argv[1])) {
  const w = arg("worker", "");
  if (w) {
    const [k, n] = w.split("/").map(Number);
    void child(k, n);
  } else void parent();
}
