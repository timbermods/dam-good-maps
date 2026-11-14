// A premise map for a seed (docs/PREMISES.md §2.2): made by the generator's premise mode (`generatePremise`, what a
// share link with `p=lakeStair` opens: the plan, its water by number, the relief between, the start for the first
// frame, one canonical settle through the generator's own build, the checks in profile "generate", re-rolls), and
// written by the generator's own writers: a `.timber` the game loads, a project (`.damgoodmaps`) the page opens, a
// top-down picture and the share link. `--plan` builds a plan file (the Four Lakes fixture) through the same stages
// without the mode's loop.
//
//   npx tsx tools/premise-map.ts [--seed 1 | --seeds 1-3] [--size 128] [--premise lakeStair|any] [--theme any|canyon …]
//     [--plan file.json] [--out .scratch/premise-map] [--drought] [--plain] [--one-thread]
//
// `--theme` is the land's style (PREMISES §1.5; Any, the default, resolved from the seed); `--plain` leaves the works
// off the picture, so the land reads.
// A seed's map is made as the page's generator makes it (tools/rust/page-path.ts): the water on the threads the page
// gives it on this machine, the start's drought run beside the map in a worker of its own, so its time is the wait a
// player has; `--one-thread` makes it all on this thread (`generatePremise`), as WebKit's page would but for the
// drought beside it. The same map either way, byte for byte (D455).
// Prints each map's time, its checks that fail or wait for a later step, its ground measures and its files. With
// `--drought`, the difficulty's longest drought is run on the settled water (`HazardRun`, as the editor's Drought
// view runs it): each lake's volume kept at its worst day, and the day the start's water goes (D133's rule).

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { measureGround } from "../src/core/analysis/ground";
import { encodeProject, generatedDocument } from "../src/core/doc/document";
import type { BuildResult } from "../src/core/features/build";
import { writeTimber } from "../src/core/format/timber";
import { generatePremise, generatePremiseAsync } from "../src/core/premise/generate";
import type { LifeReport } from "../src/core/premise/life";
import { premiseMap } from "../src/core/premise/map";
import type { PremisePlan } from "../src/core/premise/types";
import { makeSpec, shareLink, type MapSpec, type PremiseChoice, type ThemeId } from "../src/core/spec/mapspec";
import type { GenerateResult } from "../src/core/gen/generate";
import { encodePng } from "./png";
import { runsToTiles } from "../src/core/math/grid";
import type { Ladder } from "../src/core/premise/ladder";
import { droughtHold } from "../src/core/premise/hold";
import { waterByNumber, type StageWater } from "../src/core/premise/water";
import { pagePath } from "./rust/page-path";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const k = args.indexOf(`--${name}`);
  return k >= 0 ? args[k + 1] : undefined;
};

const premise = (opt("premise") ?? "lakeStair") as PremiseChoice;
const theme = (opt("theme") ?? "any") as ThemeId;
const plain = args.includes("--plain");
const side = Number(opt("size") ?? 128);
const out = opt("out") ?? ".scratch/premise-map";
const range = opt("seeds");
const seeds = range ? (([a, b]) => Array.from({ length: b - a + 1 }, (_, k) => a + k))(range.split("-").map(Number)) : [Number(opt("seed") ?? 1)];
/** The page the share links open (the local dev server's port). */
const PAGE = opt("page") ?? "http://localhost:5191/";
const drought = args.includes("--drought");
const oneThread = args.includes("--one-thread");

/** The difficulty's longest drought on the settled water: each lake's volume (its stage 1 tiles) kept at its worst
 *  day, and the day the start's water goes. */
function droughtReadout(spec: MapSpec, plan: PremisePlan, b: BuildResult, water: StageWater): void {
  const h = droughtHold(spec, plan, b, water);
  const kept = h.lakes.map((l) => `${plan.names[l.id] ?? l.id} ${Math.round(l.day0)} → ${Math.round(l.worst)} (${l.day0 > 0 ? Math.round((100 * l.worst) / l.day0) : 0} %)`);
  console.log(`  drought of ${h.days} days, each lake's volume kept at its worst day: ${kept.join("; ")}`);
  console.log(`  the start's water: ${h.has ? (h.gone ? `gone on day ${h.gone}` : `held all ${h.days} days`) : "none a pump reaches on day 0"}`);
}

function specFor(seed: number, plan?: PremisePlan): MapSpec {
  const spec = makeSpec({ seed, size: { x: plan?.W ?? side, y: plan?.H ?? side }, theme, premise });
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
 *  green; each work's site in its kind's colour and the ground it would turn green hatched in it (`ladder`); each
 *  tree a dot (living dark green, dead brown, succulent olive), each berry bush a red dot, each mine site black. */
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
  const plant = new Map<number, [number, number, number]>();
  for (const e of b.entities) {
    const dead = !!(e.components.LivingNaturalResource as { IsDead?: boolean } | undefined)?.IsDead;
    const c: [number, number, number] | null = e.template === "UndergroundRuins" ? [0, 0, 0] : e.template === "BlueberryBush" ? [200, 30, 60] : e.template === "Succulent" ? [130, 130, 40] : ["Pine", "Birch", "Oak"].includes(e.template) ? (dead ? [120, 80, 40] : [10, 70, 20]) : null;
    if (!c) continue;
    if (e.template === "UndergroundRuins") {
      for (let dy = 0; dy < 5; dy++) for (let dx = 0; dx < 5; dx++) plant.set((e.y + dy) * W + e.x + dx, c);
    } else plant.set(e.y * W + e.x, c);
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
          const pc = plant.get(i);
          if (sc) px = a === 0 || bb === 0 ? [0, 0, 0] : sc;
          else if (pc && a > 0 && a < S - 1 && bb > 0 && bb < S - 1) px = pc;
          else if (rc && (a + bb) % 2 === 0) px = rc;
          const o = ((H - 1 - y) * S + a) * W * S * 3 + (x * S + bb) * 3;
          rgb[o] = Math.max(0, Math.min(255, px[0]));
          rgb[o + 1] = Math.max(0, Math.min(255, px[1]));
          rgb[o + 2] = Math.max(0, Math.min(255, px[2]));
        }
    }
  return { rgb, width: W * S, height: H * S };
}

function write(r: Pick<GenerateResult, "spec" | "features" | "built" | "file" | "field" | "report" | "name" | "description">, top: number, name: string, ms: number, notes: string[], ladder?: Ladder, life?: LifeReport): void {
  const { W, H } = r.built;
  const g = measureGround(r.built.heights, W, H, (i) => r.built.settle.depth[i] > 0.05);
  console.log(`${name}: ${ms.toFixed(0)} ms; ground: flat ${(100 * g.flat).toFixed(0)} %, one-level steps ${(100 * g.s1).toFixed(0)} %, three commonest levels ${(100 * g.top3).toFixed(0)} %, thin ${(100 * g.thin).toFixed(0)} %`);
  const failed = r.report.checks.filter((c) => !c.ok && c.severity === "error");
  const later = r.report.checks.filter((c) => !c.ok && c.advisory && c.message.includes("a premise map:"));
  console.log(failed.length ? `  FAILS ${failed.map((c) => `${c.id}: ${c.message}`).join("; ")}` : "  every blocking check passes");
  if (later.length) console.log(`  later steps: ${later.map((c) => c.id).join(", ")}`);
  for (const note of notes) console.log(`  note: ${note}`);
  if (life) {
    const msg = (id: string) => r.report.checks.find((c) => c.id === id)?.message ?? "";
    console.log(`  life (${life.ms} ms): living ${life.living} (${life.livingPer10k} per 10k, ${life.want.living} asked), cover ${(100 * life.cover).toFixed(1)} %, dead ${life.dead} (shores ${life.shores.clumps} clumps, ${life.shores.trees} trees), succulents ${life.succulents}; bushes ${life.bushes} (${life.bushesPer10k} per 10k, ${life.want.bushes} asked); mine sites ${life.mineSites}`);
    for (const id of ["start.wood", "start.wood_floor", "start.food", "resources.mine_site"]) console.log(`    ${id}: ${msg(id)}`);
  }
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
      console.log(`  ${w.id} ${w.rung} ${w.kind} on ${w.on}: ${w.does} ${w.tiles.length} tiles${w.level !== undefined ? ` to ${w.level}` : ""}; green ${w.green}${w.reservoir ? `, holds ${w.reservoir}` : ""}${w.estimate !== undefined ? ` (estimated ${w.estimate})` : ""}${w.paid ? "" : ` (${w.note ?? "under its floor"})`}`);
  }
  const p = picture(r.built, top, plain ? undefined : ladder);
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
  write({ spec, features: m.features, built: m.built, file: m.file, field: m.field, report: m.report, name: m.name, description: plan.line }, plan.top, basename(file).replace(/\.(plan\.)?json$/, ""), performance.now() - t0, m.notes, undefined, m.life);
  if (drought) droughtReadout(spec, plan, m.built, m.water);
} else {
  const page = oneThread ? null : await pagePath();
  console.log(page ? `made as the page makes it: the water on ${page.threads} threads, the start's drought beside the map` : "made on one thread");
  for (const seed of seeds) {
    const spec = specFor(seed);
    const t0 = performance.now();
    const r = page ? await generatePremiseAsync(spec, {}, page.runner) : generatePremise(spec);
    const ms = performance.now() - t0;
    if ("reason" in r) {
      console.log(`seed ${seed}: ${r.reason}`);
      continue;
    }
    const pi = r.result.info.premise!;
    if (pi.card) console.log(`seed ${seed}: ${pi.card.name} in ${pi.card.style}. ${pi.card.landmark}. First: ${pi.card.first ?? "none"}`);
    console.log(`seed ${seed}: plan ${pi.attempt}, ${r.result.info.settles} settle(s), start moved ${pi.start?.moved} (bench ${pi.start?.bench}, moist land ${pi.start?.moist}, frame water shallow ${pi.start?.shallow}); failed before: ${r.result.failures.map((f) => f.failed[0]).join(", ") || "none"}`);
    write(r.result, spec.settings.terrain.highestTerrain, `${pi.id}-${pi.theme}-${side}-${seed}`, ms, pi.notes ?? [], pi.ladder, pi.life);
    if (drought && pi.plan) droughtReadout(r.result.spec, pi.plan, r.result.built, waterByNumber(pi.plan));
  }
  await page?.close();
}
