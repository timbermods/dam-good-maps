// A premise map for a seed, outside the product (docs/PREMISES.md §7 step 3): stages 0 to 2 (the plan, its water by
// number, the relief between), the start where the plan's frame puts it, the plan's sources, its rows of Blockages,
// one canonical settle through the generator's own build (`buildMap`), the checks in profile "generate", and the
// generator's own writers: a `.timber` the game loads and a project (`.damgoodmaps`) the page opens.
//
//   npx tsx tools/premise-map.ts [--seed 1 | --seeds 1-3] [--size 128] [--plan file.json] [--out .scratch/premise-map]
//
// Prints each map's checks that fail (none should), its ground measures and its files. Nothing here is the
// generator's mode yet (step 4): Generate's maps do not change.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { measureGround } from "../src/core/analysis/ground";
import { encodeProject, generatedDocument } from "../src/core/doc/document";
import { premiseMap, type PremiseMap } from "../src/core/premise/map";
import { firstWater } from "../src/core/premise/draw";
import { PREMISES } from "../src/core/premise/premises";
import type { PremiseId, PremisePlan } from "../src/core/premise/types";
import { writeTimber } from "../src/core/format/timber";
import { makeSpec, type MapSpec } from "../src/core/spec/mapspec";
import { encodePng } from "./png";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const k = args.indexOf(`--${name}`);
  return k >= 0 ? args[k + 1] : undefined;
};

const premise = (opt("premise") ?? "lakeStair") as PremiseId;
const def = PREMISES[premise];
const side = Number(opt("size") ?? 128);
const out = opt("out") ?? ".scratch/premise-map";
const range = opt("seeds");
const seeds = range ? (([a, b]) => Array.from({ length: b - a + 1 }, (_, k) => a + k))(range.split("-").map(Number)) : [Number(opt("seed") ?? 1)];

function specFor(seed: number, plan?: PremisePlan): MapSpec {
  const spec = makeSpec({ seed, size: { x: plan?.W ?? side, y: plan?.H ?? side }, theme: "any" });
  spec.premise = premise;
  if (plan) spec.settings.terrain.highestTerrain = plan.top;
  return spec;
}

/** Top-down: the ground shaded by height and lit from the north-west, the settled water blue. */
function picture(m: PremiseMap): { rgb: Uint8Array; width: number; height: number } {
  const { W, H } = m.plan;
  const h = m.built.heights;
  const depth = m.built.settle.depth;
  const S = 3;
  const rgb = new Uint8Array(W * S * H * S * 3);
  const top = Math.max(1, m.plan.top);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const g = 60 + (170 * h[i]) / top;
      const wv = x > 0 && y + 1 < H ? h[i] - h[(y + 1) * W + x - 1] : 0;
      const shade = Math.max(-40, Math.min(40, wv * 18));
      let c: [number, number, number] = [g * 0.8 + shade, g * 0.82 + shade, g * 0.62 + shade];
      if (depth[i] > 0.05) {
        const t = Math.min(1, depth[i] / 3);
        c = [70 - 50 * t, 150 - 60 * t, 220 - 40 * t];
      }
      for (let a = 0; a < S; a++)
        for (let b = 0; b < S; b++) {
          const o = ((H - 1 - y) * S + a) * W * S * 3 + (x * S + b) * 3;
          rgb[o] = Math.max(0, Math.min(255, c[0]));
          rgb[o + 1] = Math.max(0, Math.min(255, c[1]));
          rgb[o + 2] = Math.max(0, Math.min(255, c[2]));
        }
    }
  return { rgb, width: W * S, height: H * S };
}

function run(plan: PremisePlan, spec: MapSpec, name: string): void {
  const t0 = performance.now();
  const m = premiseMap(spec, plan);
  const ms = performance.now() - t0;
  const { W, H } = plan;
  const g = measureGround(m.built.heights, W, H, (i) => m.built.settle.depth[i] > 0.05);
  const failed = m.report.checks.filter((c) => !c.ok && c.severity === "error");
  console.log(`${name}: ${ms.toFixed(0)} ms; ground: flat ${(100 * g.flat).toFixed(0)} %, one-level steps ${(100 * g.s1).toFixed(0)} %, three commonest levels ${(100 * g.top3).toFixed(0)} %, thin ${(100 * g.thin).toFixed(0)} %`);
  console.log(failed.length ? `  FAILS ${failed.map((c) => `${c.id}: ${c.message}`).join("; ")}` : "  every blocking check passes");
  for (const note of m.notes) console.log(`  note: ${note}`);
  mkdirSync(out, { recursive: true });
  const doc = generatedDocument({ spec, features: m.features, built: m.built, file: m.file, field: m.field, name: m.name, description: plan.line });
  const project = join(out, `${name}.damgoodmaps`);
  writeFileSync(project, encodeProject(doc));
  const timber = join(out, `${name}.timber`);
  writeFileSync(timber, writeTimber(m.file));
  const p = picture(m);
  const png = join(out, `${name}.png`);
  writeFileSync(png, encodePng(p.rgb, p.width, p.height));
  console.log(`  ${timber}\n  ${project}\n  ${png}`);
}

const file = opt("plan");
if (file) {
  const plan = JSON.parse(readFileSync(file, "utf8")) as PremisePlan;
  run(plan, specFor(plan.seed, plan), basename(file).replace(/\.(plan\.)?json$/, ""));
} else
  for (const seed of seeds) {
    const spec = specFor(seed);
    const r = firstWater(def, spec);
    if ("reason" in r) {
      console.log(`seed ${seed}: ${r.reason}`);
      continue;
    }
    spec.settings.terrain.highestTerrain = r.plan.top;
    run(r.plan, spec, `${premise}-${side}-${seed}`);
  }
