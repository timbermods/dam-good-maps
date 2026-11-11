// A premise's plan for a seed (docs/PREMISES.md §2.2, stage 0): prints the plan and which `plan` invariants hold, and
// draws its water-story diagram (sources, bodies, links, exits, regions, ridges, works, the start and its look).
//
//   npx tsx tools/premise-plan.ts [--premise lakeStair] [--seed 1 | --seeds 1-12] [--size 192] [--out .scratch/premise]
//                                 [--png] [--json] [--try t] [--plan file.json]
//
// `--seeds` draws several and prints one line each (structure, attempt, time). `--try t` draws one layout try of
// attempt 0 and draws it as far as it got, with the step that stopped it (for tuning). `--plan` reads a plan from a
// file instead (tests/fixtures/four-lakes.plan.json) and checks it with the size's default settings and its `top`. Diagrams go to
// `<out>/<premise>-<size>-<seed>.svg` (and `.png`, a pixel a tile, with `--png`); `--json` writes the plan too.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { failing, firstPlan } from "../src/core/premise/draw";
import { planRaster, planSvg } from "../src/core/premise/diagram";
import { pathLength } from "../src/core/premise/geom";
import { layoutTry } from "../src/core/premise/premises/lakeStair";
import { PREMISES } from "../src/core/premise/premises";
import type { PremiseId, PremisePlan } from "../src/core/premise/types";
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
if (!def) throw new Error(`No premise ${premise}`);
const side = Number(opt("size") ?? 192);
const out = opt("out") ?? ".scratch/premise";
const range = opt("seeds");
const seeds = range ? (([a, b]) => Array.from({ length: b - a + 1 }, (_, k) => a + k))(range.split("-").map(Number)) : [Number(opt("seed") ?? 1)];

function specFor(seed: number): MapSpec {
  const spec = makeSpec({ seed, size: { x: side, y: side }, theme: "any" });
  spec.premise = premise;
  return spec;
}

function write(plan: PremisePlan, name: string): string {
  mkdirSync(out, { recursive: true });
  const svg = join(out, `${name}.svg`);
  writeFileSync(svg, planSvg(plan));
  if (has("png")) {
    const r = planRaster(plan);
    writeFileSync(join(out, `${name}.png`), encodePng(r.rgb, r.width, r.height));
  }
  if (has("json")) writeFileSync(join(out, `${name}.json`), JSON.stringify(plan, null, 1));
  return svg;
}

function describe(plan: PremisePlan): string[] {
  const st = plan.stair;
  const lines: string[] = [];
  lines.push(`  ${plan.line}`);
  if (st) lines.push(`  stair: ${st.n} lakes, f ${st.f}, ${st.shape} turned ${st.turn}, start's lake ${plan.names[st.startLake]}, landmark ${st.H} from ${plan.names[st.landmarkSource] ?? st.landmarkSource}, flow ${st.flow}`);
  for (const b of plan.bodies) lines.push(`  body ${b.id.padEnd(8)} ${b.kind.padEnd(5)} sill ${String(b.sill).padStart(2)} deep ${b.deep} arms ${b.arms.length}${b.dry ? " dry" : ""}  ${plan.names[b.id] ?? ""}`);
  for (const l of plan.links) {
    const what = l.fall ? `fall ${l.fall.height} lip ${l.fall.width} facing ${l.fall.face}${l.fall.breach ? `, breach ${l.fall.breach}` : ""}` : `${l.wet ? "wet" : "dry"}${l.path ? ` ${Math.round(pathLength(l.path))} tiles` : ""}`;
    lines.push(`  link ${l.id.padEnd(12)} ${l.kind.padEnd(7)} ${l.from} → ${l.to}: ${what}${l.gates.length ? `, gate` : ""}${l.rows.length ? `, ${l.rows.length} rows` : ""}`);
  }
  const s = plan.frame.start;
  lines.push(`  start (${s.x}, ${s.y}) on ${s.z}, ${s.orientation}; the lip ${plan.frame.lipAhead} in front; bench ${plan.frame.bench}`);
  for (const w of plan.works) lines.push(`  work ${w.id.padEnd(4)} ${w.rung.padEnd(6)} ${w.kind.padEnd(10)} on ${w.on}${w.needs.length ? `, needs ${w.needs.join(", ")}` : ""}; green ${w.gives.green.join("–")}${w.gives.reservoir ? `, water ${w.gives.reservoir.join("–")}` : ""}`);
  return lines;
}

const t = opt("try");
const file = opt("plan");
if (file) {
  const plan = JSON.parse(readFileSync(file, "utf8")) as PremisePlan;
  const spec = makeSpec({ seed: plan.seed, size: { x: plan.W, y: plan.H }, theme: "any" });
  spec.premise = plan.premise;
  spec.settings.terrain.highestTerrain = plan.top;
  const held = failing(def.invariants, "plan", { spec, plan });
  console.log(`${file}: ${held.length ? held.map((f) => `${f.id}: ${f.reason}`).join("; ") : "every plan invariant holds"}`);
  for (const line of describe(plan)) console.log(line);
  console.log(write(plan, basename(file).replace(/\.json$/, "")));
} else if (t !== undefined) {
  const spec = specFor(seeds[0]);
  const r = layoutTry(spec, 0, Number(t));
  console.log(`${premise} seed ${seeds[0]} at ${side}², try ${t}: ${r.failed ?? "holds"}`);
  console.log(write(r.plan, `${premise}-${side}-${seeds[0]}-try${t}`));
} else {
  for (const seed of seeds) {
    const spec = specFor(seed);
    const t0 = performance.now();
    const r = firstPlan(def, spec);
    const ms = performance.now() - t0;
    if ("reason" in r) {
      console.log(`seed ${seed}: ${r.reason} (${ms.toFixed(0)} ms)`);
      continue;
    }
    const plan = r.plan;
    const st = plan.stair;
    const held = failing(def.invariants, "plan", { spec, plan });
    console.log(`seed ${seed}: attempt ${r.attempt}, ${ms.toFixed(0)} ms${st ? `; ${st.n} lakes, f ${st.f}, ${st.shape}, start on lake ${st.startLake.replace("lake", "")}, landmark ${st.H} from ${st.landmarkSource}` : ""}; ${held.length ? `FAILS ${held.map((f) => f.id).join(", ")}` : "every plan invariant holds"}`);
    const svg = write(plan, `${premise}-${side}-${seed}`);
    if (seeds.length === 1) {
      for (const line of describe(plan)) console.log(line);
      console.log(svg);
    }
  }
}
