// The wall with one gate's water by number for a seed (docs/PREMISES.md §5.1, §2.2 stage 1): the first plan whose water
// holds (`gateFirstWater`), its water table, which `land` invariants hold, and a picture of its heights and water; with
// `--settle`, the water settled as the game plays it (`tests/contract/gateSettle.ts`): each body's level against its
// sill, the Veil's curtain, the Gate and the leat dry, stray water, water on the edge but the Low River's, and what
// leaves against what the springs give.
//
//   npx tsx tools/premise-gate-water.ts [--seed 1 | --seeds 1-12] [--size 128] [--out .scratch/premise] [--settle]
//
// The picture (`<out>/wallGate-<size>-<seed>.water.png`, three pixels a tile, y north): the ground shaded by height
// (the guard's least where stage 1 fixed none, dark where nothing is drawn), the water blue by its depth, each lip red,
// each row of Blockages black, the start's 5 × 5 yellow.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { failing } from "../src/core/premise/draw";
import { frameShallow, gateFirstWater } from "../src/core/premise/gateWater";
import { wallGate } from "../src/core/premise/premises/wallGate";
import type { PremisePlan } from "../src/core/premise/types";
import type { StageWater } from "../src/core/premise/water";
import { makeSpec } from "../src/core/spec/mapspec";
import { settleGate } from "../tests/contract/gateSettle";
import { encodePng } from "./png";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const k = args.indexOf(`--${name}`);
  return k >= 0 ? args[k + 1] : undefined;
};
const has = (name: string) => args.includes(`--${name}`);
const side = Number(opt("size") ?? 128);
const out = opt("out") ?? ".scratch/premise";
const range = opt("seeds");
const seeds = range ? (([a, b]) => Array.from({ length: b - a + 1 }, (_, k) => a + k))(range.split("-").map(Number)) : [Number(opt("seed") ?? 1)];

function picture(plan: PremisePlan, w: StageWater): { rgb: Uint8Array; width: number; height: number } {
  const r = w.raster;
  const S = 3;
  const width = r.W * S;
  const height = r.H * S;
  const rgb = new Uint8Array(width * height * 3);
  const top = Math.max(plan.sky ?? plan.top, 1);
  const lip = new Set(Object.values(r.lips).flat());
  const rows = new Set(Object.values(r.rows).flat(2));
  const { x: sx, y: sy } = plan.frame.start;
  for (let y = 0; y < r.H; y++)
    for (let x = 0; x < r.W; x++) {
      const i = y * r.W + x;
      const h = r.heights[i];
      const g = Math.round(40 + (180 * h) / top);
      let c: [number, number, number];
      if (rows.has(i)) c = [0, 0, 0];
      else if (lip.has(i)) c = [220, 40, 40];
      else if (Math.abs(x - sx) <= 2 && Math.abs(y - sy) <= 2) c = [240, 220, 60];
      else if ((r.lake[i] || r.channel[i]) && r.surface[i] === r.surface[i]) {
        const t = Math.max(0, Math.min(6, r.surface[i] - h)) / 6;
        c = [Math.round(90 - 70 * t + h * 3), Math.round(170 - 100 * t + h * 3), Math.round(230 - 60 * t)];
      } else if (r.fixed[i]) c = [Math.round(g * 0.95), Math.round(g * 0.85), Math.round(g * 0.7)];
      else c = h ? [Math.round(g * 0.75), Math.round(g * 0.8), Math.round(g * 0.65)] : [30, 30, 30];
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

for (const seed of seeds) {
  const spec = makeSpec({ seed, size: { x: side, y: side }, theme: "any", premise: "any" });
  const t0 = performance.now();
  const r = gateFirstWater(wallGate, spec);
  const ms = performance.now() - t0;
  if ("reason" in r) {
    console.log(`seed ${seed}: ${r.reason}`);
    continue;
  }
  const land = failing(wallGate.invariants, "land", { spec, plan: r.plan, water: r.water });
  const fs = frameShallow(r.plan, r.water);
  console.log(`seed ${seed}: attempt ${r.attempt}, ${ms.toFixed(0)} ms; ${land.length ? `FAILS ${land.map((f) => f.id).join(", ")}` : "every plan and land invariant holds"}; the frame's water ${fs.shallow} of ${fs.all} under two`);
  if (seeds.length === 1)
    for (const [id, b] of Object.entries(r.water.table.bodies)) console.log(`  ${id.padEnd(7)} sill ${b.sill} table ${b.level.toFixed(2)} inflow ${b.inflow.toFixed(2)}${b.dry ? " dry" : ""}`);
  if (has("settle")) {
    const s = settleGate(r.plan, r.water);
    console.log(`  settled in ${s.ms.toFixed(0)} ms: ${s.levels.map((l) => `${l.id} ${l.level.toFixed(2)} (sill ${l.sill})`).join(", ")}`);
    console.log(`  the Veil ${s.veil.ok ? "pours" : "FAILS"}: ${s.veil.note}; Gate ${s.gateWet} and leat ${s.leatWet} wet tiles past their bars; stray ${s.stray}; edge ${s.edge}; out ${s.out.toFixed(2)} of ${s.sources.toFixed(2)}`);
  }
  mkdirSync(out, { recursive: true });
  const p = picture(r.plan, r.water);
  const file = join(out, `wallGate-${side}-${seed}.water.png`);
  writeFileSync(file, encodePng(p.rgb, p.width, p.height));
  if (seeds.length === 1) console.log(file);
}
