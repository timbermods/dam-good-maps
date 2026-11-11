// A premise map for a seed (docs/PREMISES.md §2.2): made by the generator's premise mode (`generatePremise`, what a
// share link with `p=lakeStair` opens: the plan, its water by number, the relief between, the start for the first
// frame, one canonical settle through the generator's own build, the checks in profile "generate", re-rolls), and
// written by the generator's own writers: a `.timber` the game loads, a project (`.damgoodmaps`) the page opens, a
// top-down picture and the share link. `--plan` builds a plan file (the Four Lakes fixture) through the same stages
// without the mode's loop.
//
//   npx tsx tools/premise-map.ts [--seed 1 | --seeds 1-3] [--size 128] [--plan file.json] [--out .scratch/premise-map]
//
// Prints each map's time, its checks that fail or wait for a later step, its ground measures and its files.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { measureGround } from "../src/core/analysis/ground";
import { encodeProject, generatedDocument } from "../src/core/doc/document";
import type { BuildResult } from "../src/core/features/build";
import { writeTimber } from "../src/core/format/timber";
import { generatePremise } from "../src/core/premise/generate";
import { premiseMap } from "../src/core/premise/map";
import type { PremiseId, PremisePlan } from "../src/core/premise/types";
import { makeSpec, shareLink, type MapSpec } from "../src/core/spec/mapspec";
import type { GenerateResult } from "../src/core/gen/generate";
import { encodePng } from "./png";
import { runsToTiles } from "../src/core/math/grid";
import type { Ladder } from "../src/core/premise/ladder";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const k = args.indexOf(`--${name}`);
  return k >= 0 ? args[k + 1] : undefined;
};

const premise = (opt("premise") ?? "lakeStair") as PremiseId;
const side = Number(opt("size") ?? 128);
const out = opt("out") ?? ".scratch/premise-map";
const range = opt("seeds");
const seeds = range ? (([a, b]) => Array.from({ length: b - a + 1 }, (_, k) => a + k))(range.split("-").map(Number)) : [Number(opt("seed") ?? 1)];
/** The page the share links open (the local dev server's port). */
const PAGE = opt("page") ?? "http://localhost:5191/";

function specFor(seed: number, plan?: PremisePlan): MapSpec {
  const spec = makeSpec({ seed, size: { x: plan?.W ?? side, y: plan?.H ?? side }, theme: "any" });
  spec.premise = premise;
  if (plan) spec.settings.terrain.highestTerrain = plan.top;
  return spec;
}

/** Each work kind's colour on the picture: its site solid, its estimated green hatched. */
const KIND_RGB: Record<string, [number, number, number]> = {
  notch: [255, 140, 0],
  damToPond: [230, 40, 200],
  levee: [0, 230, 230],
  leat: [255, 235, 0],
  bypass: [150, 80, 255],
  breach: [230, 30, 30],
  raisedSill: [230, 30, 30],
  megadam: [230, 30, 30],
};

/** Top-down: the ground shaded by height and lit from the north-west, the settled water blue, its moist ground
 *  green; each work's site in its kind's colour and the ground it would turn green hatched in it (`ladder`). */
function picture(b: BuildResult, top: number, ladder?: Ladder): { rgb: Uint8Array; width: number; height: number } {
  const { W, H } = b;
  const h = b.heights;
  const depth = b.settle.depth;
  const S = 4;
  const rgb = new Uint8Array(W * S * H * S * 3);
  const t = Math.max(1, top);
  const site = new Map<number, [number, number, number]>();
  const reach = new Map<number, [number, number, number]>();
  for (const w of ladder?.works ?? []) {
    const c = KIND_RGB[w.kind] ?? [255, 255, 255];
    for (const i of runsToTiles(w.reach, W)) if (!reach.has(i)) reach.set(i, c);
    for (const i of w.tiles) site.set(i, c);
  }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const g = 60 + (170 * h[i]) / t;
      const wv = x > 0 && y + 1 < H ? h[i] - h[(y + 1) * W + x - 1] : 0;
      const shade = Math.max(-40, Math.min(40, wv * 18));
      let c: [number, number, number] = [g * 0.8 + shade, g * 0.82 + shade, g * 0.62 + shade];
      if (depth[i] > 0.05) {
        const k = Math.min(1, depth[i] / 3);
        c = [70 - 50 * k, 150 - 60 * k, 220 - 40 * k];
      } else if (b.moisture[i] > 0) c = [c[0] * 0.55, c[1] * 0.95 + 10, c[2] * 0.45];
      const sc = site.get(i);
      const rc = reach.get(i);
      for (let a = 0; a < S; a++)
        for (let bb = 0; bb < S; bb++) {
          let px = c;
          if (sc) px = a === 0 || bb === 0 ? [0, 0, 0] : sc;
          else if (rc && (a + bb) % 2 === 0) px = rc;
          const o = ((H - 1 - y) * S + a) * W * S * 3 + (x * S + bb) * 3;
          rgb[o] = Math.max(0, Math.min(255, px[0]));
          rgb[o + 1] = Math.max(0, Math.min(255, px[1]));
          rgb[o + 2] = Math.max(0, Math.min(255, px[2]));
        }
    }
  return { rgb, width: W * S, height: H * S };
}

function write(r: Pick<GenerateResult, "spec" | "features" | "built" | "file" | "field" | "report" | "name" | "description">, top: number, name: string, ms: number, notes: string[], ladder?: Ladder): void {
  const { W, H } = r.built;
  const g = measureGround(r.built.heights, W, H, (i) => r.built.settle.depth[i] > 0.05);
  console.log(`${name}: ${ms.toFixed(0)} ms; ground: flat ${(100 * g.flat).toFixed(0)} %, one-level steps ${(100 * g.s1).toFixed(0)} %, three commonest levels ${(100 * g.top3).toFixed(0)} %, thin ${(100 * g.thin).toFixed(0)} %`);
  const failed = r.report.checks.filter((c) => !c.ok && c.severity === "error");
  const later = r.report.checks.filter((c) => !c.ok && c.advisory && c.message.includes("a premise map:"));
  console.log(failed.length ? `  FAILS ${failed.map((c) => `${c.id}: ${c.message}`).join("; ")}` : "  every blocking check passes");
  if (later.length) console.log(`  later steps: ${later.map((c) => c.id).join(", ")}`);
  for (const note of notes) console.log(`  note: ${note}`);
  mkdirSync(out, { recursive: true });
  const doc = generatedDocument({ spec: r.spec, features: r.features, built: r.built, file: r.file, field: r.field, ...(r.name ? { name: r.name } : {}), ...(r.description ? { description: r.description } : {}) });
  const project = join(out, `${name}.damgoodmaps`);
  writeFileSync(project, encodeProject(doc));
  const timber = join(out, `${name}.timber`);
  writeFileSync(timber, writeTimber(r.file));
  if (ladder) {
    let wet = 0;
    let moist = 0;
    for (let i = 0; i < W * H; i++) {
      if (r.built.settle.depth[i] > 0) wet++;
      else if (r.built.moisture[i] > 0) moist++;
    }
    const pc = (v: number) => `${(100 * v).toFixed(1)} %`;
    console.log(`  day 1: water ${pc(wet / (W * H))}, moist ${pc(moist / (W * H))} settled (by number ${pc(ladder.day1.water)}, ${pc(ladder.day1.moist)}); small works green ${pc(ladder.small)}, all works ${pc(ladder.together)}`);
    for (const w of ladder.works)
      console.log(`  ${w.id} ${w.rung} ${w.kind} on ${w.on}: ${w.does} ${w.tiles.length} tiles${w.level !== undefined ? ` to ${w.level}` : ""}; green ${w.green}${w.reservoir ? `, holds ${w.reservoir}` : ""}${w.inRange ? "" : ` (${w.note ?? "out of range"})`}`);
  }
  const p = picture(r.built, top, ladder);
  const png = join(out, `${name}.png`);
  writeFileSync(png, encodePng(p.rgb, p.width, p.height));
  console.log(`  ${shareLink(PAGE, r.spec)}\n  ${timber}\n  ${project}\n  ${png}`);
}

const file = opt("plan");
if (file) {
  const plan = JSON.parse(readFileSync(file, "utf8")) as PremisePlan;
  const spec = specFor(plan.seed, plan);
  const t0 = performance.now();
  const m = premiseMap(spec, plan);
  write({ spec, features: m.features, built: m.built, file: m.file, field: m.field, report: m.report, name: m.name, description: plan.line }, plan.top, basename(file).replace(/\.(plan\.)?json$/, ""), performance.now() - t0, m.notes);
} else
  for (const seed of seeds) {
    const spec = specFor(seed);
    const t0 = performance.now();
    const r = generatePremise(spec);
    const ms = performance.now() - t0;
    if ("reason" in r) {
      console.log(`seed ${seed}: ${r.reason}`);
      continue;
    }
    const pi = r.result.info.premise!;
    console.log(`seed ${seed}: plan ${pi.attempt}, ${r.result.info.settles} settle(s), start moved ${pi.start?.moved} (level land ${pi.start?.level}, farmland ${pi.start?.farmland}, frame water shallow ${pi.start?.shallow}); failed before: ${r.result.failures.map((f) => f.failed[0]).join(", ") || "none"}`);
    write(r.result, spec.settings.terrain.highestTerrain, `${premise}-${side}-${seed}`, ms, pi.notes ?? [], pi.ladder);
  }
