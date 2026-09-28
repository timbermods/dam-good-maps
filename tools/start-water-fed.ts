// Which accepted maps meet the start's water rule (`start.water`, PLAN §11.4) only through water that no
// source feeds and that does not last the drought (Kyler's D302: the probe's finding on Canyon 128² seed
// 1, a sealed one-tile hole the rule counts as the start's water). Regenerates the batches' maps (the
// generator is deterministic) and, for each accepted map:
//
//   - the start's water: every clean tile a pump reaches (0.3 deep or more, under 5% badwater, its
//     surface 0–2 levels below the shore) beside a shore tile the start walks to within the rule's walk,
//     over the map's own ground and slopes: the tiles `start.water` counts (the same pieces as
//     checkStart in src/core/validate/playability.ts);
//   - its bodies: the 4-connected water (over 0.001 deep) those tiles are in; water that reaches a body
//     over any wet tile is part of it;
//   - a body is fed when a running source (a WaterSource, BadwaterSource or seep of strength > 0) is in it;
//   - a body lasts the drought when, after the difficulty's drought (9 days at Normal, 30 at Hard; the
//     sources off, water above each basin's spill level gone, evaporation by the game's rate:
//     `droughtStorage`), one of its counted tiles is still one a pump reaches from a shore within the
//     walk.
//
// A map is counted when every counted tile is in a body neither fed nor lasting the drought: it meets
// `start.water` only through sealed puddles. Also counted, as information: maps whose nearest counted
// water is such a puddle while other water qualifies (Canyon 128² seed 1).
//
//   npx tsx tools/start-water-fed.ts [--themes any,riverValley,...] [--sizes 96,128,192,256]
//        [--seeds 96=1-100,128=1-100,192=1-100,256=1-100] [--difficulty normal] [--jobs 3]
//        [--out investigation/m9a/local/start-water-fed]
//
// Writes one JSON line per seed (<out>/<size>-<theme>.jsonl) and <out>/summary.md; bulk results stay
// out of git (PLAN §20 D195).

import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PUMP_CLEAN, PUMP_DEPTH, PUMP_REACH, walkDistance } from "../src/core/analysis/walk";
import { footprintTiles, FOOTPRINTS, slopeHighSide, worldBlocks } from "../src/core/format/footprints";
import { surfaceOf } from "../src/core/format/world";
import { generate, type GenerateResult } from "../src/core/gen/generate";
import { droughtStorage } from "../src/core/sim/drought";
import { mapObjects } from "../src/core/sim/model";
import { AVAILABLE_THEMES, decodeSpecFragment, type Difficulty, type ThemeId } from "../src/core/spec/mapspec";
import { rulesFor, WALK_BLOCKERS } from "../src/core/validate/playability";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function parseSeeds(s: string): number[] {
  const out: number[] = [];
  for (const part of s.split(",")) {
    const m = /^(\d+)-(\d+)$/.exec(part);
    if (m) for (let k = Number(m[1]); k <= Number(m[2]); k++) out.push(k);
    else out.push(Number(part));
  }
  return out;
}

const WATER = 0.001;

export interface Body {
  tiles: number;
  volume: number;
  fed: boolean;
  lasts: boolean;
  /** The shortest walk to a shore of one of its counted tiles. */
  walk: number;
  /** A counted tile of it, nearest by walk. */
  at: [number, number];
}

export interface SeedResult {
  seed: number;
  accepted: boolean;
  attempts: number;
  /** The start's water: its bodies, nearest first. Empty when no tile qualifies. */
  bodies: Body[];
  /** Every counted tile in a body neither fed nor lasting the drought. */
  onlyPuddles: boolean;
  /** The nearest counted water is such a puddle (while other water may qualify). */
  nearestPuddle: boolean;
  /** For a map counted: the walk to the nearest fed or lasting water a pump reaches, up to the walk's limit (64). */
  realWaterWalk?: number;
}

/** The start's water on an accepted map, by the rule's pieces (see the header). */
export function startWaterBodies(r: GenerateResult): Omit<SeedResult, "seed" | "accepted" | "attempts"> {
  const w = r.file.world;
  const W = w.sizeX;
  const H = w.sizeY;
  const N = W * H;
  const h = surfaceOf(w);
  const objects = mapObjects(w);
  const D = r.built.water;
  const C = r.built.contamination;
  const rules = rulesFor(r.spec);
  const blocked = new Uint8Array(N);
  const links: [number, number][] = [];
  for (const o of objects) {
    if (WALK_BLOCKERS.has(o.template) && FOOTPRINTS[o.template]) for (const [x, y] of footprintTiles(o.template, o)) if (x >= 0 && x < W && y >= 0 && y < H) blocked[y * W + x] = 1;
    if (o.template !== "Slope" || o.x < 0 || o.x >= W || o.y < 0 || o.y >= H) continue;
    const [dx, dy] = slopeHighSide(o.orientation);
    const hx = o.x + dx;
    const hy = o.y + dy;
    if (hx >= 0 && hx < W && hy >= 0 && hy < H) links.push([o.y * W + o.x, hy * W + hx]);
  }
  const start = objects.find((o) => o.template === "StartingLocation");
  if (!start) return { bodies: [], onlyPuddles: false, nearestPuddle: false };
  const cells = worldBlocks(FOOTPRINTS.StartingLocation, start).filter((b) => b.localZ === 0);
  const sx = Math.round(cells.reduce((a, b) => a + b.x, 0) / cells.length);
  const sy = Math.round(cells.reduce((a, b) => a + b.y, 0) / cells.length);
  const walk = walkDistance(h, W, H, blocked, links, { x: sx, y: sy });
  // a tile's shortest walk to a shore a pump on it reaches, with the water `depth`
  const shoreWalk = (i: number, depth: number): number => {
    if (!(depth >= PUMP_DEPTH) || !(C[i] < PUMP_CLEAN)) return Infinity;
    const surface = h[i] + depth;
    const x = i % W;
    const y = (i - x) / W;
    let best = Infinity;
    for (const n of [x > 0 ? i - 1 : -1, x + 1 < W ? i + 1 : -1, y > 0 ? i - W : -1, y + 1 < H ? i + W : -1]) {
      if (n < 0 || !(walk[n] < best)) continue;
      if (surface >= h[n] - PUMP_REACH && surface <= h[n] + 0.01) best = walk[n];
    }
    return best;
  };
  // the bodies of water
  const body = new Int32Array(N).fill(-1);
  const size: number[] = [];
  const volume: number[] = [];
  const stack: number[] = [];
  for (let s = 0; s < N; s++) {
    if (body[s] >= 0 || !(D[s] > WATER)) continue;
    const k = size.length;
    size.push(0);
    volume.push(0);
    body[s] = k;
    stack.push(s);
    while (stack.length) {
      const i = stack.pop()!;
      size[k]++;
      volume[k] += D[i];
      const x = i % W;
      const y = (i - x) / W;
      for (const n of [x > 0 ? i - 1 : -1, x + 1 < W ? i + 1 : -1, y > 0 ? i - W : -1, y + 1 < H ? i + W : -1])
        if (n >= 0 && body[n] < 0 && D[n] > WATER) {
          body[n] = k;
          stack.push(n);
        }
    }
  }
  const fed = new Uint8Array(size.length);
  for (const e of r.built.waterModel.emitters) if (e.strength > 0) for (const c of e.cells) if (body[c] >= 0) fed[body[c]] = 1;
  const after = droughtStorage(r.built.waterModel, D, rules.droughtDays);
  const lasts = new Uint8Array(size.length);
  const walkOf = new Map<number, { walk: number; at: number }>();
  let nearest = { walk: Infinity, body: -1 };
  const real = { walk: Infinity };
  for (let i = 0; i < N; i++) {
    if (body[i] < 0) continue;
    const k = body[i];
    const now = shoreWalk(i, D[i]);
    if (now <= rules.waterWithin) {
      if (shoreWalk(i, after[i]) <= rules.waterWithin) lasts[k] = 1;
      const had = walkOf.get(k);
      if (!had || now < had.walk) walkOf.set(k, { walk: now, at: i });
      if (now < nearest.walk) nearest = { walk: now, body: k };
    }
  }
  const bodies: Body[] = [...walkOf].map(([k, v]) => ({ tiles: size[k], volume: Math.round(volume[k] * 10) / 10, fed: !!fed[k], lasts: !!lasts[k], walk: Math.round(v.walk * 10) / 10, at: [v.at % W, Math.floor(v.at / W)] as [number, number] }));
  // nearest first; at the same walk, fed or lasting water before a puddle (the start has it as near)
  bodies.sort((a, b) => a.walk - b.walk || Number(!a.fed && !a.lasts) - Number(!b.fed && !b.lasts));
  const puddle = (b: Body) => !b.fed && !b.lasts;
  const onlyPuddles = bodies.length > 0 && bodies.every(puddle);
  const res: Omit<SeedResult, "seed" | "accepted" | "attempts"> = { bodies, onlyPuddles, nearestPuddle: bodies.length > 0 && puddle(bodies[0]) };
  if (onlyPuddles) {
    // how far the start walks to real water (fed, or lasting the drought), within the walk's limit
    for (let i = 0; i < N; i++) {
      const k = body[i];
      if (k < 0 || !(fed[k] || shoreWalk(i, after[i]) < Infinity)) continue;
      const wk = shoreWalk(i, D[i]);
      if (wk < real.walk) real.walk = wk;
    }
    res.realWaterWalk = Number.isFinite(real.walk) ? Math.round(real.walk * 10) / 10 : undefined;
  }
  return res;
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function child(): Promise<void> {
  const theme = arg("theme", "any") as ThemeId;
  const size = Number(arg("size", "128"));
  const difficulty = arg("difficulty", "normal") as Difficulty;
  const extra = arg("set", "");
  for (const seed of parseSeeds(arg("seeds", "1-100"))) {
    const d = decodeSpecFragment(`s=${seed}&t=${theme}&z=${size}&d=${difficulty[0]}${extra ? "&" + extra : ""}`)!;
    const r = generate(d.spec);
    const out: SeedResult = r.report.passed
      ? { seed, accepted: true, attempts: r.attempts, ...startWaterBodies(r) }
      : { seed, accepted: false, attempts: r.attempts, bodies: [], onlyPuddles: false, nearestPuddle: false };
    process.stdout.write(JSON.stringify(out) + "\n");
  }
}

async function parent(): Promise<void> {
  const themes = arg("themes", AVAILABLE_THEMES.join(",")).split(",");
  const sizes = arg("sizes", "96,128,192,256").split(",").map(Number);
  const seedArg = arg("seeds", "96=1-100,128=1-100,192=1-100,256=1-100");
  const jobs = Math.max(1, Number(arg("jobs", "3")));
  const difficulty = arg("difficulty", "normal");
  const set = arg("set", "");
  const out = resolve(ROOT, arg("out", "investigation/m9a/local/start-water-fed"));
  mkdirSync(out, { recursive: true });
  const seedsFor = (size: number) => (seedArg.includes("=") ? (seedArg.split(",").find((p) => p.startsWith(`${size}=`)) ?? `${size}=1-100`).split("=")[1] : seedArg);
  const fileOf = (theme: string, size: number) => join(out, `${size}-${theme}.jsonl`);
  const tasks = sizes.flatMap((size) => themes.map((theme) => ({ theme, size })));
  // --resume: keep each file's complete lines and run only the seeds it lacks
  const resume = process.argv.includes("--resume");
  const run = (t: { theme: string; size: number }) =>
    new Promise<void>((done) => {
      const f = fileOf(t.theme, t.size);
      let seeds = seedsFor(t.size);
      if (resume && existsSync(f)) {
        const kept = readFileSync(f, "utf8").split("\n").filter((l) => {
          try {
            return !!l && typeof (JSON.parse(l) as SeedResult).seed === "number";
          } catch {
            return false;
          }
        });
        writeFileSync(f, kept.map((l) => l + "\n").join(""));
        const have = new Set(kept.map((l) => (JSON.parse(l) as SeedResult).seed));
        const left = parseSeeds(seeds).filter((s) => !have.has(s));
        if (!left.length) return done();
        seeds = left.join(",");
      }
      const argv = ["--import", "tsx", resolve(ROOT, "tools", "start-water-fed.ts"), "--child", "--theme", t.theme, "--size", String(t.size), "--seeds", seeds, "--difficulty", difficulty];
      if (set) argv.push("--set", set);
      const t0 = performance.now();
      const p = spawn(process.execPath, argv, { stdio: ["ignore", "pipe", "pipe"], cwd: ROOT });
      p.stdout.pipe(createWriteStream(f, { flags: resume ? "a" : "w" }));
      let err = "";
      p.stderr.on("data", (d) => (err += String(d)));
      p.on("close", (code) => {
        console.log(`${t.size}² ${t.theme}: exit ${code} in ${Math.round((performance.now() - t0) / 60000)} min${code && err ? `\n${err.trim().split("\n").slice(-5).join("\n")}` : ""}`);
        done();
      });
    });
  if (!process.argv.includes("--summary-only")) {
    const queue = [...tasks];
    await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, async () => {
      for (let t = queue.shift(); t; t = queue.shift()) await run(t);
    }));
  }
  // the summary
  const lines = [`# The start's water only in sealed puddles (D302), ${difficulty}${set ? `, ${set}` : ""}`, "", "| Size | Option | Accepted | Only puddles | Nearest is a puddle |", "|---|---|---|---|---|"];
  const worst: { key: string; r: SeedResult }[] = [];
  const nearestOnes: { key: string; r: SeedResult }[] = [];
  for (const t of tasks) {
    const f = fileOf(t.theme, t.size);
    const rows = existsSync(f) ? readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as SeedResult) : [];
    const acc = rows.filter((r) => r.accepted);
    const only = acc.filter((r) => r.onlyPuddles);
    const near = acc.filter((r) => r.nearestPuddle);
    for (const r of only) worst.push({ key: `${t.theme} ${t.size}² seed ${r.seed}`, r });
    for (const r of near) if (!r.onlyPuddles) nearestOnes.push({ key: `${t.theme} ${t.size}² seed ${r.seed}`, r });
    lines.push(`| ${t.size}² | ${t.theme} | ${acc.length}/${rows.length} | ${only.length} | ${near.length} |`);
  }
  const text = (r: SeedResult) => r.bodies.map((b) => `${b.tiles} tiles, ${b.volume} water, ${b.fed ? "fed" : "no source"}, ${b.lasts ? "lasts the drought" : "dries"}, ${b.walk} tiles' walk at (${b.at.join(", ")})`).join("; ");
  lines.push("", `Maps meeting start.water only through sealed puddles: ${worst.length}.`);
  for (const w of worst.sort((a, b) => a.r.bodies.reduce((v, x) => v + x.volume, 0) - b.r.bodies.reduce((v, x) => v + x.volume, 0))) lines.push(`- ${w.key}: ${text(w.r)}; real water ${w.r.realWaterWalk ?? "none"} tiles' walk`);
  lines.push("", `Maps whose nearest counted water is a puddle, with other water that qualifies: ${nearestOnes.length}.`);
  for (const w of nearestOnes.slice(0, 12)) lines.push(`- ${w.key}: ${text(w.r).split("; ").slice(0, 3).join("; ")}`);
  writeFileSync(join(out, "summary.md"), lines.join("\n") + "\n");
  console.log(lines.join("\n"));
}

if (process.argv.includes("--child")) void child();
else void parent();
