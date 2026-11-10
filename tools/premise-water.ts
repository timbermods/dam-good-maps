// A premise's water by number for a seed (docs/PREMISES.md §2.2, stage 1): the first plan whose water holds, the water
// table, which `land` invariants hold, stage 1's time, and a picture of its heights and water.
//
//   npx tsx tools/premise-water.ts [--seed 1 | --seeds 1-12] [--size 192] [--plan file.json] [--out .scratch/premise]
//                                  [--settle]
//
// The picture (`<out>/<premise>-<size>-<seed>.water.png`, three pixels a tile) shades the ground by its height (the
// guard's least where stage 1 fixed none), the water blue by its depth to its planned surface, each lip red (a notch
// or breach orange, a pier white), each row of Blockages black, and the start's 5 × 5 yellow. `--settle` settles the
// water as the game plays it and prints each body's settled level against its sill and the table's.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { failing, firstWater } from "../src/core/premise/draw";
import { PREMISES } from "../src/core/premise/premises";
import type { PremiseId, PremisePlan } from "../src/core/premise/types";
import { stageModel, waterByNumber, type StageWater } from "../src/core/premise/water";
import { canonicalSettle } from "../src/core/sim/prefill";
import { stageFlow } from "../src/core/premise/waterChecks";
import { makeSpec, type MapSpec } from "../src/core/spec/mapspec";
import { encodePng } from "./png";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const k = args.indexOf(`--${name}`);
  return k >= 0 ? args[k + 1] : undefined;
};
const has = (name: string) => args.includes(`--${name}`);

const premise = (opt("premise") ?? "lakeStair") as PremiseId;
const def = PREMISES[premise];
const side = Number(opt("size") ?? 192);
const out = opt("out") ?? ".scratch/premise";
const range = opt("seeds");
const seeds = range ? (([a, b]) => Array.from({ length: b - a + 1 }, (_, k) => a + k))(range.split("-").map(Number)) : [Number(opt("seed") ?? 1)];

function specFor(seed: number, plan?: PremisePlan): MapSpec {
  const spec = makeSpec({ seed, size: { x: plan?.W ?? side, y: plan?.H ?? side }, theme: "any" });
  spec.premise = premise;
  if (plan) spec.settings.terrain.highestTerrain = plan.top;
  return spec;
}

/** Stage 1 and its `land` checks' flow, timed as the pipeline runs them. */
function stage(plan: PremisePlan): { w: StageWater; ms: number } {
  const t0 = performance.now();
  const w = waterByNumber(plan);
  stageFlow(w);
  return { w, ms: performance.now() - t0 };
}

function picture(plan: PremisePlan, w: StageWater): { rgb: Uint8Array; width: number; height: number } {
  const r = w.raster;
  const S = 3;
  const width = r.W * S;
  const height = r.H * S;
  const rgb = new Uint8Array(width * height * 3);
  const top = Math.max(plan.top, 1);
  const lip = new Set(Object.values(r.lips).flat());
  const low = new Set(Object.values(r.notches).flat());
  const high = new Set(Object.values(r.piers).flat());
  const rows = new Set(Object.values(r.rows).flat(2));
  const { x: sx, y: sy } = plan.frame.start;
  for (let y = 0; y < r.H; y++)
    for (let x = 0; x < r.W; x++) {
      const i = y * r.W + x;
      const h = r.heights[i];
      let c: [number, number, number];
      const g = Math.round(40 + (180 * h) / top);
      if (rows.has(i)) c = [0, 0, 0];
      else if (high.has(i)) c = [255, 255, 255];
      else if (low.has(i)) c = [255, 150, 30];
      else if (lip.has(i)) c = [220, 40, 40];
      else if (Math.abs(x - sx) <= 2 && Math.abs(y - sy) <= 2) c = [240, 220, 60];
      else if (r.lake[i] || r.channel[i]) {
        const d = Math.max(0, Math.min(6, r.surface[i] - h));
        const t = d / 6;
        c = [Math.round(90 - 70 * t + h * 3), Math.round(170 - 100 * t + h * 3), Math.round(230 - 60 * t)];
        if (r.pool[i]) c = [c[0] + 20, c[1], c[2]];
      } else if (r.fixed[i]) c = [Math.round(g * 0.95), Math.round(g * 0.85), Math.round(g * 0.7)];
      else c = h ? [Math.round(g * 0.75), Math.round(g * 0.8), Math.round(g * 0.65)] : [30, 30, 30];
      // (y north: the picture's top row is the map's last)
      for (let a = 0; a < S; a++)
        for (let b = 0; b < S; b++) {
          const o = ((r.H - 1 - y) * S + a) * width * 3 + (x * S + b) * 3;
          rgb[o] = c[0];
          rgb[o + 1] = c[1];
          rgb[o + 2] = c[2];
        }
    }
  return { rgb, width, height };
}

function settle(plan: PremisePlan, w: StageWater): void {
  const t0 = performance.now();
  const s = canonicalSettle(stageModel(w));
  const ms = performance.now() - t0;
  const r = w.raster;
  for (const [k, b] of plan.bodies.entries()) {
    const lv: number[] = [];
    for (let i = 0; i < r.W * r.H; i++) if (r.lake[i] === k + 1 && !r.crest[i] && s.depth[i] > 0.05) lv.push(r.heights[i] + s.depth[i]);
    lv.sort((p, q) => p - q);
    const mid = lv.length ? lv[lv.length >> 1] : NaN;
    const t = w.table.bodies[b.id];
    console.log(`  settled ${b.id.padEnd(8)} sill ${b.sill} table ${t.level.toFixed(2)} settled ${mid.toFixed(2)} (${lv.length} wet tiles)${t.dry ? " dry" : ""}`);
  }
  console.log(`  settle ${ms.toFixed(0)} ms`);
}

function run(plan: PremisePlan, spec: MapSpec, name: string, verbose: boolean): void {
  const { w, ms } = stage(plan);
  const held = failing(def.invariants, "land", { spec, plan, water: w });
  console.log(`${name}: stage 1 ${ms.toFixed(0)} ms, parted ${w.raster.parted}; ${held.length ? `FAILS ${held.map((f) => `${f.id}: ${f.reason}`).join("; ")}` : "every land invariant holds"}`);
  if (verbose) {
    for (const b of Object.values(w.table.bodies)) console.log(`  body ${b.id.padEnd(8)} sill ${b.sill} level ${b.level.toFixed(2)} in ${b.inflow.toFixed(1)}${b.bad ? ` (bad ${b.bad.toFixed(1)})` : ""}${b.dry ? " dry" : ""} out ${b.outlets.join(", ")}`);
    for (const l of Object.values(w.table.links)) if (l.wet || l.shut) console.log(`  link ${l.id.padEnd(12)} flow ${l.flow.toFixed(1)} width ${l.width} depth ${l.depth.toFixed(2)}${l.shut ? " shut" : ""}`);
    mkdirSync(out, { recursive: true });
    const p = picture(plan, w);
    const file = join(out, `${name}.water.png`);
    writeFileSync(file, encodePng(p.rgb, p.width, p.height));
    console.log(file);
    if (has("settle")) settle(plan, w);
  }
}

const file = opt("plan");
if (file) {
  const plan = JSON.parse(readFileSync(file, "utf8")) as PremisePlan;
  run(plan, specFor(plan.seed, plan), basename(file).replace(/\.json$/, ""), true);
} else
  for (const seed of seeds) {
    const spec = specFor(seed);
    // (the first plan whose water holds: a plan that fails a land invariant is drawn again)
    const r = firstWater(def, spec);
    if ("reason" in r) {
      console.log(`seed ${seed}: ${r.reason}`);
      continue;
    }
    if (r.attempt) console.log(`seed ${seed}: drawn ${r.attempt + 1} times (${r.failed.map((f) => f.id).join(", ")})`);
    run(r.plan, spec, `${premise}-${side}-${seed}`, seeds.length === 1);
  }
