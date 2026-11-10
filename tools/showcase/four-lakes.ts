// Four Lakes, the showcase map, authored as a script of operations (the showcase brief, concept A).
//
//   node tools/showcase/run.mjs four-lakes [--round r1] [--weather] [--save]      (fast: the core bundled once)
//   npx tsx tools/showcase/four-lakes.ts …                                        (the same, as any tool runs)
//
// It starts from blank ground (a flat 192² map, as the game's own editor starts) and makes the map only through
// the core's document engine, the operations the editor makes (D342): the land as selections set to a level, the
// sources, objects and plants as the shelf places them, the cave with the Block tool. The saved project replays
// to the same map byte for byte (D455). The design (every level and place, by number) is four-lakes-design.ts.
//
// Where DGM has no tool for what the map needs, the helper here is that tool, noted with "TOOL:".

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openingCamera, placeComponents, startMiddleTile, StartWaterDays, startWaterWithin, VISTA_ZOOM } from "./core";
import { applyOps, checksOf, emptySimulationSingletons, exportFiles, fallsOf, GAME_VERSION, HazardRun, LAYERS, MapSession, rowOf, TICKS_PER_DAY, voxelsFromHeights, writeTimber, type TimberFile } from "./core";
import { CHANNELS, designLand, FALLS, fbm, H, LAKES, measureLand, N, W, type Land } from "./four-lakes-design";
import { writePicture } from "./four-lakes-view";

const arg = (name: string, f: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : f;
};
const has = (name: string) => process.argv.includes(`--${name}`);
const ROUND = arg("round", "dev");
const OUT = arg("out", ".scratch/showcase/four-lakes");
const BASE_LEVEL = 8;

const log = (...a: unknown[]) => console.log(...a);
let t0 = performance.now();
const lap = (what: string) => {
  const t = performance.now();
  log(`  [${what}: ${((t - t0) / 1000).toFixed(1)} s]`);
  t0 = t;
};

/** Ids that are the same every run: a v4-shaped GUID from a counter. */
let idN = 0;
const newId = (): string => {
  const n = (++idN).toString(16).padStart(12, "0");
  return `4c414b45-0000-4000-8000-${n}`;
};

// ------------------------------------------------------------------------------------------- blank ground

/** TOOL: a blank start (the brief's change 2): flat ground of a size, nothing on it. */
function blank(): MapSession {
  const heights = new Uint8Array(N).fill(BASE_LEVEL);
  const file: TimberFile = {
    metadata: {},
    thumbnail: null,
    versionTxt: GAME_VERSION + "\r\n",
    world: { gameVersion: GAME_VERSION, timestamp: "2026-11-09 00:00:00", sizeX: W, sizeY: H, layers: LAYERS, voxels: voxelsFromHeights(heights, W, H), singletons: emptySimulationSingletons(W, H), entities: [] },
    extraFiles: [],
  };
  const s = MapSession.importMap(writeTimber(file), "Four Lakes.timber");
  s.setName("Four Lakes");
  return s;
}

// ------------------------------------------------------------------------------------------------ the land

/** Runs [y, x0, x1] of the tiles where `pick` holds. */
function runsWhere(pick: (i: number) => boolean): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let y = 0; y < H; y++) {
    let a = -1;
    for (let x = 0; x <= W; x++) {
      const on = x < W && pick(y * W + x);
      if (on && a < 0) a = x;
      if (!on && a >= 0) {
        out.push([y, a, x - 1]);
        a = -1;
      }
    }
  }
  return out;
}

/** TOOL: land from a design (changes 2 and 3): every tile set to its level, as one selection set to a level for
 *  each level (Select, Flatten to level, exact), lowest first. */
function shapeLand(s: MapSession, land: Land): void {
  const h = land.heights;
  for (let level = 0; level <= 22; level++) {
    if (level === BASE_LEVEL) continue;
    const cells = runsWhere((i) => h[i] === level);
    if (!cells.length) continue;
    applyOps(s, [{ op: "sculpt", params: { mode: "flatten", cells, level, exact: true }, label: `Land at level ${level}` }]);
  }
  const b = s.built.heights;
  let off = 0;
  for (let i = 0; i < N; i++) if (b[i] !== h[i]) off++;
  if (off) throw new Error(`${off} tiles are not at the design's level`);
}

// ------------------------------------------------------------------------------------------------- water

const SOURCES: [number, number, number][] = [
  [119, 141, 5],
  [121, 143, 5],
  [123, 145, 5],
  [120, 139, 5],
];

/** The old channel's plugs: Blockages across it, the first at its mouth on the springs' pool. */
function placePlugs(s: MapSession, land: Land): void {
  applyOps(
    s,
    land.plugs.flatMap((row, k) => row.map((i) => ({ op: "placeEntity", params: { id: newId(), template: "Blockage", x: i % W, y: Math.floor(i / W), orientation: "Cw0" }, label: `The old channel's ${["first", "second", "third"][k]} blockage` }))),
  );
}

/** The start: on the meadow under the Low Fall's west shoulder, turned so the game's first camera looks up the
 *  valley across Weir Lake at the Great Fall. */
const START = { x: 70, y: 88, orientation: "Cw0" as const };

function placeStart(s: MapSession): void {
  applyOps(s, [{ op: "placeEntity", params: { id: newId(), template: "StartingLocation", x: START.x, y: START.y, orientation: START.orientation }, label: "The start" }]);
}

/** The nearest place to (x, y) where a w x h footprint (its corner the returned tile) stands on level, dry, free
 *  ground of the design (no lake, channel or pool), a tile clear of anything already there. */
function levelSpot(s: MapSession, land: Land, x: number, y: number, w: number, hgt: number): [number, number] {
  const b = s.built;
  const taken = new Set<number>();
  for (const e of b.entities) for (let dy = -1; dy <= 5; dy++) for (let dx = -1; dx <= 5; dx++) taken.add((e.y + dy) * W + e.x + dx);
  const fits = (cx: number, cy: number): boolean => {
    if (cx < 2 || cy < 2 || cx + w > W - 2 || cy + hgt > H - 2) return false;
    const z = b.heights[cy * W + cx];
    for (let dy = -1; dy <= hgt; dy++)
      for (let dx = -1; dx <= w; dx++) {
        const i = (cy + dy) * W + cx + dx;
        const inside = dx >= 0 && dy >= 0 && dx < w && dy < hgt;
        if (land.lake[i] || land.channel[i] || land.pool[i] || b.water[i] > 0) return false;
        if (inside && (b.heights[i] !== z || taken.has(i))) return false;
      }
    return true;
  };
  for (let r = 0; r <= 14; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (fits(x + dx, y + dy)) return [x + dx, y + dy];
      }
  throw new Error(`no level ground for a ${w}x${hgt} near ${x},${y}`);
}

/** The springs, and the other water objects with them (a seep, the aquifers), as one step: the water settles once. */
function placeSources(s: MapSession, land: Land): void {
  const ops = [
    ...SOURCES.map(([x, y, strength]) => ({ op: "placeEntity", params: { id: newId(), template: "WaterSource", x, y, orientation: "Cw0", components: placeComponents("WaterSource", { strength }) } })),
    ...WATER_OBJECTS.map(([template, x, y, size]) => {
      const [px, py] = levelSpot(s, land, x, y, size, size);
      return { op: "placeEntity", params: { id: newId(), template, x: px, y: py, orientation: "Cw0", components: placeComponents(template) } };
    }),
  ];
  const r = s.applyBatch(ops as never, "user", "The springs");
  if (!r.ok) throw new Error(`the springs: ${r.errors[0]}`);
}

/** A seep over Steam Lake and the two aquifers by the springs (the drill stands on the first). */
const WATER_OBJECTS: [string, number, number, number][] = [
  ["Aquifer", 112, 146, 3],
  ["Aquifer", 127, 153, 3],
];

interface WaterReport {
  wetShare: number;
  lakes: { name: string; level: number; tiles: number; volume: number; over: number }[];
  falls: { name: string; drop: number; width: number; depth: number }[];
}

/** The lakes' levels, the falls' drops and the water's share, read from the settled water. */
function readWater(s: MapSession, land: Land, depth: ArrayLike<number> = s.built.water): WaterReport {
  const h = s.built.heights;
  let wet = 0;
  for (let i = 0; i < N; i++) if (depth[i] > 0.05) wet++;
  const lakes = LAKES.map((L, k) => {
    const levels: number[] = [];
    let volume = 0;
    for (let i = 0; i < N; i++) {
      if (land.lake[i] !== k + 1 || !(depth[i] > 0.05)) continue;
      if (h[i] <= L.sill - 1) levels.push(h[i] + depth[i]);
      volume += depth[i];
    }
    levels.sort((a, b) => a - b);
    const level = levels.length ? levels[levels.length >> 1] : NaN;
    return { name: L.name, level, tiles: levels.length, volume, over: level - L.sill };
  });
  const falls = FALLS.map((F, k) => {
    const crest = land.crests[k];
    let width = 0;
    let dsum = 0;
    let top = 0;
    for (const i of crest) {
      if (depth[i] > 0.02) {
        width++;
        dsum += depth[i];
        top = Math.max(top, h[i] + depth[i]);
      }
    }
    // the water below the lip: the lower lake's level
    const below = F.to >= 0 ? lakes[F.to].level : 0.9;
    return { name: F.name, drop: top - below, width, depth: width ? dsum / width : 0 };
  });
  return { wetShare: wet / N, lakes, falls };
}

function printWater(r: WaterReport): void {
  log(`  water on ${(r.wetShare * 100).toFixed(1)} % of the map`);
  for (const l of r.lakes) log(`  ${l.name.padEnd(11)} level ${l.level.toFixed(2)} (${l.over >= 0 ? "+" : ""}${l.over.toFixed(2)} over its sill)  volume ${Math.round(l.volume)}`);
  for (const f of r.falls) log(`  ${f.name.padEnd(11)} falls ${f.drop.toFixed(2)} levels, ${f.width} tiles wide, ${f.depth.toFixed(2)} deep on the lip`);
}

/** The map's cover: water, moist (green) ground and bare ground, as shares of the map. */
function cover(s: MapSession): { water: number; moist: number; bare: number } {
  const b = s.built;
  let wet = 0;
  let moist = 0;
  for (let i = 0; i < N; i++) {
    if (b.water[i] > 0.05) wet++;
    else if (b.moisture[i] > 0) moist++;
  }
  return { water: wet / N, moist: moist / N, bare: (N - wet - moist) / N };
}

/** A picture of where the ground is moist (green), dry (sand) and wet (blue), a tile a pixel ×3. */
function coverPicture(s: MapSession, file: string): void {
  const b = s.built;
  const marks: { x: number; y: number; rgb: [number, number, number] }[] = [];
  for (let i = 0; i < N; i++) {
    const x = i % W;
    const y = (i - x) / W;
    if (b.water[i] > 0.05) continue;
    marks.push({ x, y, rgb: b.moisture[i] > 0 ? [60, 150, 60] : [200, 180, 140] });
  }
  writePicture(file, b.heights, b.water, 2, marks);
}

/** Water where the design has none: each body's size, where it is and its level (a leak to find). */
function strayWater(s: MapSession, land: Land): { x: number; y: number; rgb: [number, number, number] }[] {
  const b = s.built;
  const seen = new Uint8Array(N);
  const marks: { x: number; y: number; rgb: [number, number, number] }[] = [];
  const dry = (i: number) => {
    const c = land.channel[i];
    return !land.lake[i] && !land.pool[i] && !(c && CHANNELS[c - 1].wet);
  };
  const bodies: string[] = [];
  for (let i0 = 0; i0 < N; i0++) {
    if (seen[i0] || !(b.water[i0] > 0.05) || !dry(i0)) continue;
    const stack = [i0];
    seen[i0] = 1;
    let n = 0, sx = 0, sy = 0, lo = Infinity, hi = -Infinity, x0 = W, x1 = 0, y0 = H, y1 = 0;
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % W, y = (i - x) / W;
      n++; sx += x; sy += y;
      const lv = b.heights[i] + b.water[i];
      lo = Math.min(lo, lv); hi = Math.max(hi, lv);
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      marks.push({ x, y, rgb: [230, 40, 40] });
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        if (j < 0 || j >= N || seen[j] || Math.abs((j % W) - x) > 1) continue;
        if (b.water[j] > 0.05 && dry(j)) { seen[j] = 1; stack.push(j); }
      }
    }
    if (n >= 3) bodies.push(`${n} tiles x ${x0}-${x1} y ${y0}-${y1}, level ${lo.toFixed(1)}-${hi.toFixed(1)}`);
  }
  if (bodies.length) log(`  stray water (${marks.length} tiles): ` + bodies.join("; "));
  return marks;
}

// ------------------------------------------------------------------------------------------------ weather

/** A drought or a badtide of `days` on the settled water: each lake's level and badwater, every `step` of a day
 *  for the first `fine` days and daily after, and the day the start's water goes or turns bad (the editor's own
 *  rule, sim/startWaterDay.ts). Returns the run's last water. */
function weather(s: MapSession, land: Land, hazard: "drought" | "badtide", days: number, fine = 0, step = 0.125): { depth: Float64Array; contamination: Float64Array; startDay: number; firstBad: number[]; fallsStop: number[] } {
  const b = s.built;
  const run = new HazardRun(b.waterModel, { depth: b.water, contamination: b.contamination } as never, hazard, days);
  log(`${hazard}, ${days} days:`);
  const st = startOf(s);
  const sw = new StartWaterDays(hazard, { depth: b.water, contamination: b.contamination }, { W, H, heights: b.heights, objects: b.entities as never, start: { x: st.x, y: st.y }, within: startWaterWithin(s) });
  const firstBad = LAKES.map(() => 0);
  const fallsStop = FALLS.map(() => 0);
  let t = 0;
  let last = run.water();
  while (t < days - 1e-9) {
    const dt = t < fine - 1e-9 ? step : 1;
    run.step(Math.round(TICKS_PER_DAY * dt));
    t += dt;
    const w = run.water();
    last = w;
    const whole = Math.abs(t - Math.round(t)) < 1e-9;
    if (whole) sw.see({ depth: w.depth, contamination: w.contamination });
    const r = readWater(s, land, w.depth);
    const bad = LAKES.map((_, k) => {
      let n = 0;
      let c = 0;
      for (let i = 0; i < N; i++)
        if (land.lake[i] === k + 1 && w.depth[i] > 0.05) {
          n++;
          if (w.contamination[i] > 0.05) c++;
        }
      return n ? c / n : 0;
    });
    bad.forEach((v, k) => {
      if (v > 0.5 && !firstBad[k]) firstBad[k] = t;
    });
    r.falls.forEach((f, k) => {
      if (!(f.width >= 3) && !fallsStop[k]) fallsStop[k] = t;
    });
    log(`  day ${t.toFixed(t < fine ? 3 : 0)}: ` + r.lakes.map((l, k) => `${l.name.split(" ")[0]} ${isNaN(l.level) ? "dry" : l.level.toFixed(2)}${hazard === "badtide" ? ` bad ${(bad[k] * 100).toFixed(0)}%` : ""}`).join("  ") + `  | falls ${r.falls.map((f) => (f.width ? `${f.width}w ${f.depth.toFixed(2)}` : "dry")).join(", ")}`);
  }
  run.dispose();
  if (hazard === "drought") log(`  falls stop (fewer than 3 tiles wet on the lip): ${FALLS.map((F, k) => `${F.name} day ${fallsStop[k] || ">" + days}`).join(", ")}`);
  else log(`  half of each lake bad: ${LAKES.map((L, k) => `${L.name} day ${firstBad[k] ? firstBad[k].toFixed(2) : ">" + days}`).join(", ")}`);
  log(`  the start's water ${hazard === "drought" ? "is gone" : "turns bad"}: ${sw.has ? (sw.day ? "day " + sw.day : "not in " + days + " days") : "the start has no water a pump reaches"}`);
  return { depth: last.depth, contamination: last.contamination, startDay: sw.day, firstBad, fallsStop };
}

/** The start as the opening camera reads it: its middle tile, its level, its turn. */
function startOf(s: MapSession): { x: number; y: number; z: number; orientation: "Cw0" | "Cw90" | "Cw180" | "Cw270" } {
  const e = s.built.entities.find((g) => g.template === "StartingLocation");
  if (!e) throw new Error("the map has no start");
  const [x, y] = startMiddleTile(e as never);
  return { x, y, z: e.z, orientation: e.orientation as "Cw0" };
}

// ------------------------------------------------------------------------------------------------- plants

/** Tiles' distance to water (4-neighbour steps), and how far each stands over that water's surface. */
function waterReach(s: MapSession): { dist: Int16Array; over: Int8Array } {
  const b = s.built;
  const dist = new Int16Array(N).fill(-1);
  const over = new Int8Array(N);
  const top = new Int8Array(N);
  let q: number[] = [];
  for (let i = 0; i < N; i++)
    if (b.water[i] > 0.05) {
      dist[i] = 0;
      top[i] = Math.ceil(b.heights[i] + b.water[i]);
      q.push(i);
    }
  while (q.length) {
    const next: number[] = [];
    for (const i of q) {
      const x = i % W;
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        if (j < 0 || j >= N || Math.abs((j % W) - x) > 1 || dist[j] >= 0) continue;
        dist[j] = dist[i] + 1;
        top[j] = top[i];
        over[j] = b.heights[j] - top[i];
        next.push(j);
      }
    }
    q = next;
  }
  return { dist, over };
}

/** TOOL: planting by zone (change 4): birch on the shores, oak groves and berry patches on the meadows, dark pine on
 *  the high moist ground; on the dry land succulent fields, thorns and dead woods along the old channel. Each is a
 *  stroke of the shelf's brush (`paintObjects`) over the tiles of its zone. */
function plant(s: MapSession, land: Land): void {
  const b = s.built;
  const st = startOf(s);
  const { dist, over } = waterReach(s);
  const moist = (i: number) => b.moisture[i] > 0 && !(b.water[i] > 0);
  const nearStart = (i: number, r: number) => Math.hypot((i % W) - st.x, Math.floor(i / W) - st.y) < r;
  const n = (i: number, scale: number, seed: number) => fbm(i % W, Math.floor(i / W), scale, 9000 + seed, 2);
  const oldBed = (i: number) => land.channel[i] > 0 && CHANNELS[land.channel[i] - 1].name === "Old channel";
  // how near the old channel: dead woods stand along it
  const oldDist = new Int16Array(N).fill(99);
  {
    let q: number[] = [];
    for (let i = 0; i < N; i++)
      if (oldBed(i)) {
        oldDist[i] = 0;
        q.push(i);
      }
    for (let d = 1; d <= 9 && q.length; d++) {
      const next: number[] = [];
      for (const i of q) {
        const x = i % W;
        for (const j of [i - 1, i + 1, i - W, i + W])
          if (j >= 0 && j < N && Math.abs((j % W) - x) <= 1 && oldDist[j] > d) {
            oldDist[j] = d;
            next.push(j);
          }
      }
      q = next;
    }
  }
  const paint = (kind: string, template: string | undefined, pick: (i: number) => boolean, density: number, seed: number, label: string, age?: string) => {
    const area = runsWhere(pick);
    if (!area.length) return 0;
    try {
      const r = applyOps(s, [{ op: "paintObjects", params: { kind, ...(template ? { template } : {}), area, density, seed, ...(age ? { age } : {}) }, label }]);
      return Object.values(r.objects.added).reduce((a, v) => a + v, 0);
    } catch (e) {
      log(`    (${label}: ${(e as Error).message})`);
      return 0;
    }
  };
  const meadow = (i: number) => moist(i) && over[i] <= 0 && dist[i] > 2;
  const grove = (i: number) => n(i, 17, 1) > 0.02;
  const berries = (i: number) => n(i, 9, 2) > 0.34 || (nearStart(i, 15) && !nearStart(i, 7) && n(i, 6, 3) > 0.1);
  const count: Record<string, number> = {};
  count.birch = paint("trees", "Birch", (i) => moist(i) && dist[i] <= 2 && !nearStart(i, 6), 0.5, 11, "Birch on the shores", "mixed");
  count.berries = paint("bushes", "BlueberryBush", (i) => meadow(i) && berries(i) && !nearStart(i, 5), 0.6, 12, "Blueberry patches on the meadows");
  count.oak = paint("trees", "Oak", (i) => meadow(i) && grove(i) && !berries(i) && !nearStart(i, 7), 0.62, 13, "Oak groves on the meadows", "mixed");
  count.birch2 = paint("trees", "Birch", (i) => meadow(i) && !grove(i) && !berries(i) && !nearStart(i, 7), 0.12, 14, "Birches in the open meadow");
  count.pine = paint("trees", "Pine", (i) => moist(i) && over[i] >= 1 && dist[i] > 2 && !nearStart(i, 7), 0.8, 15, "Pine on the high ground", "mixed");
  // the dry land, dressed on purpose
  const dry = (i: number) => !(b.moisture[i] > 0) && !(b.water[i] > 0) && !land.lake[i] && !land.pool[i];
  count.succulents = paint("succulents", "Succulent", (i) => dry(i) && oldDist[i] > 3 && n(i, 21, 4) > 0.08, 0.2, 16, "Succulent fields on the dry benches");
  count.thorns = paint("thorns", undefined, (i) => dry(i) && (oldBed(i) ? n(i, 12, 5) > 0.15 : oldDist[i] > 6 && n(i, 14, 6) > 0.52), 0.3, 17, "Thorns in the old channel and the dry gullies");
  // dead woods along the old channel: the wood that stood by its water
  const before = new Set(s.built.entities.map((e) => e.id));
  count.dead = paint("trees", "Birch", (i) => dry(i) && oldDist[i] >= 1 && oldDist[i] <= 6 && n(i, 10, 7) > -0.1, 0.3, 18, "The old channel's dead birches");
  count.dead += paint("trees", "Oak", (i) => dry(i) && oldDist[i] >= 3 && oldDist[i] <= 9 && n(i, 13, 8) > 0.25, 0.25, 19, "The old channel's dead oaks");
  const dead = s.built.entities.filter((e) => !before.has(e.id) && (e.template === "Birch" || e.template === "Oak"));
  if (dead.length) {
    const r = s.applyAll(dead.map((e) => ({ op: "setEntityProps", params: { id: e.id, components: { LivingNaturalResource: { IsDead: true } } } })) as never, "user", "The old channel's wood is dead");
    if (!r.ok) throw new Error(r.errors[0]);
  }
  log(`  planted: ${Object.entries(count).map(([k, v]) => `${k} ${v}`).join(", ")}`);
}

/** Trees and berry bushes on the map, alive and dead, per 10,000 tiles. */
function plantCount(s: MapSession): { trees: number; dead: number; berries: number; succulents: number; per10k: { trees: number; berries: number } } {
  let trees = 0;
  let deadN = 0;
  let berriesN = 0;
  let succ = 0;
  for (const e of s.built.entities) {
    const isDead = (e.components as { LivingNaturalResource?: { IsDead?: boolean } }).LivingNaturalResource?.IsDead === true;
    if (e.template === "Pine" || e.template === "Birch" || e.template === "Oak") {
      if (isDead) deadN++;
      else trees++;
    } else if (e.template === "BlueberryBush") berriesN++;
    else if (e.template === "Succulent") succ++;
  }
  return { trees, dead: deadN, berries: berriesN, succulents: succ, per10k: { trees: (trees * 10000) / N, berries: (berriesN * 10000) / N } };
}

// ------------------------------------------------------------------------------------------------ objects

/** The set pieces: each a place with a purpose on the route up the valley. */
function placeObjects(s: MapSession, land: Land): void {
  const put = (template: string, x0: number, y0: number, label: string, extra: Record<string, unknown> = {}, size: [number, number] | null = null) => {
    let x = x0;
    let y = y0;
    try {
      if (size) [x, y] = levelSpot(s, land, x0, y0, size[0], size[1]);
      applyOps(s, [{ op: "placeEntity", params: { id: newId(), template, x, y, orientation: "Cw0", ...extra }, label }]);
      return true;
    } catch (e) {
      log(`    (${label} at ${x},${y}: ${(e as Error).message})`);
      return false;
    }
  };
  const ruin = (hgt: number, x: number, y: number, label: string, variant = "A") =>
    put(`RuinColumnH${hgt}`, x, y, label, { components: { "Yielder:Ruin": { Yield: { Good: "ScrapMetal", Amount: 15 * hgt } }, RuinModels: { VariantId: variant } } });
  // the ruined weir on the Low Fall: piers in the gap and on both shoulders, tallest at the banks (the first metal)
  const F = FALLS[0];
  const [a, b] = F.span;
  let k = 0;
  for (const x of F.piers) for (const v of [0, 1]) ruin(v ? 3 : 4, x, F.at + v, "The ruined weir's piers", "ABCDE"[k++ % 5]);
  for (const [dx, hgt] of [[-1, 6], [-2, 5], [-3, 3]] as const) for (const v of [0, 1]) ruin(hgt - v, a + dx, F.at + v, "The ruined weir's west abutment", "ABCDE"[k++ % 5]);
  for (const [dx, hgt] of [[1, 6], [2, 4], [3, 2]] as const) for (const v of [0, 1]) ruin(hgt - v, b + dx, F.at + v, "The ruined weir's east abutment", "ABCDE"[k++ % 5]);
  // Steam Lake: the geothermal field, the underground ruins, a seep
  put("GeothermalField", 172, 98, "Steam Lake's geothermal field", {}, [3, 3]);
  put("UndergroundRuins", 131, 112, "The ruins under Steam Lake's shore", {}, [5, 5]);
  // the springs: aquifers, the old drill, unstable cores
  const aq = s.built.entities.find((e) => e.template === "Aquifer");
  if (aq) put("AncientAquiferDrill", aq.x, aq.y, "The ancient drill on the aquifer");
  put("UnstableCore", 113, 152, "An unstable core in the cirque", {}, [2, 2]);
  put("UnstableCore", 131, 140, "An unstable core in the cirque", {}, [2, 2]);
  // relics on the way
  put("MediumRelic", 49, 45, "The relic on Low Lake's island", {}, [3, 3]);
  put("SmallRelic", 46, 15, "The relic at the Gate", {}, [2, 2]);
}

// ------------------------------------------------------------------------------------------------ the shots

/** The cameras a round is judged from (tools/showcase/capture.ts): the game's first camera on the start, pulled
 *  back to its widest and as the game opens; the best side, up the diagonal; the whole map; top-down; each fall. */
function shots(s: MapSession, weatherDays: { drought: number; badtide: number }): unknown[] {
  const st = startOf(s);
  const cam = openingCamera(st, VISTA_ZOOM);
  const first = openingCamera(st);
  const deg = Math.PI / 180;
  const opening = (c: typeof cam) => ({ yaw: -35 * deg, pitch: 60 * deg, distance: c.distance, target: [c.target[0], c.target[2], c.target[1]] });
  const best = { yaw: -45 * deg, pitch: 27 * deg, distance: 215, target: [104, 6, 104] };
  const far = { yaw: -45 * deg, pitch: 52 * deg, distance: 330, target: [96, 5, 96] };
  return [
    { name: "01-opening", label: "The game's first camera, pulled back (vista)", view: opening(cam) },
    { name: "02-opening-first", label: "The game's first frame", view: opening(first) },
    { name: "03-best-side", label: "Best side: up the valley", view: best },
    { name: "04-far", label: "The whole map", view: far },
    { name: "05-top", label: "Top-down", top: true, view: { yaw: 0, pitch: 89 * deg, distance: 300, target: [96, 5, 96] } },
    { name: "06-great-fall", label: "The Great Fall", view: { yaw: -16 * deg, pitch: 24 * deg, distance: 62, target: [100, 9, 114] } },
    { name: "07-low-fall", label: "Low Fall (Weir Lake into Low Lake)", view: { yaw: 14 * deg, pitch: 26 * deg, distance: 44, target: [88.5, 4, 84] } },
    { name: "08-weir-fall", label: "Weir Fall (Steam Lake into Weir Lake)", view: { yaw: -70 * deg, pitch: 26 * deg, distance: 44, target: [124, 8, 100] } },
    { name: "09-crown-fall", label: "Crown Fall (Crown Lake into Steam Lake)", view: { yaw: -14 * deg, pitch: 26 * deg, distance: 44, target: [150, 12, 127] } },
    { name: "10-start", label: "The start's meadow", view: { yaw: -35 * deg, pitch: 38 * deg, distance: 70, target: [st.x, st.z, st.y] } },
    { name: "11-drought", label: `Drought, day ${weatherDays.drought}: best side`, hazard: "drought", day: weatherDays.drought, view: best },
    { name: "12-badtide", label: `Badtide, day ${weatherDays.badtide}: best side`, hazard: "badtide", day: weatherDays.badtide, view: best },
  ];
}

// --------------------------------------------------------------------------------------------------- main

function main(): void {
  mkdirSync(OUT, { recursive: true });
  const land = designLand();
  const m = measureLand(land.heights);
  log(`Four Lakes, round ${ROUND}`);
  log(`  guard raised ${land.guarded} tiles; plugs ${land.plugs.map((p) => p.length).join(", ")} tiles`);
  log(`  land: flat ${(m.flat8 * 100).toFixed(1)} % (8-neighbour; ${(m.flat4 * 100).toFixed(1)} % 4-neighbour), one-level steps ${(m.step1 * 100).toFixed(1)} %, top-3 levels ${(m.top3 * 100).toFixed(1)} %`);
  lap("design");
  const s = blank();
  lap("blank");
  shapeLand(s, land);
  lap("land");
  placePlugs(s, land);
  lap("plugs");
  placeSources(s, land);
  lap("sources and settle");
  placeStart(s);
  lap("start");
  if (!has("bare")) {
    placeObjects(s, land);
    lap("objects");
    plant(s, land);
    const pc = plantCount(s);
    log(`  plants: ${pc.trees} living trees (${Math.round(pc.per10k.trees)} per 10,000 tiles), ${pc.dead} dead, ${pc.berries} berry bushes (${Math.round(pc.per10k.berries)} per 10,000), ${pc.succulents} succulents`);
    lap("plants");
  }
  const settle = s.built.settle as unknown as { ticks: number; settled: boolean };
  log(`  settle: ${settle.ticks} ticks, settled ${settle.settled}`);
  const wr = readWater(s, land);
  printWater(wr);
  {
    let top = 0;
    for (let i = 0; i < N; i++) if (land.pool[i]) top = Math.max(top, s.built.heights[i] + s.built.water[i]);
    log(`  the springs' pool stands at ${top.toFixed(2)}`);
  }
  const falls = fallsOf(s.built.heights, s.built.water, W, H, 1.5);
  log(`  falls the core sees: ${falls.length} tiles, tallest ${falls.reduce((a, f) => Math.max(a, f.drop), 0).toFixed(1)}`);
  if (has("gorge")) {
    for (let y = 34; y >= 0; y--) {
      let row = `y ${String(y).padStart(2)}: `;
      for (let x = 33; x <= 47; x++) {
        const i = y * W + x;
        row += s.built.water[i] > 0.02 ? ` ${s.built.heights[i]}+${s.built.water[i].toFixed(1)}` : `  ${String(s.built.heights[i]).padStart(2)}  `;
      }
      log(row);
    }
  }
  const cv = cover(s);
  log(`  cover: water ${(cv.water * 100).toFixed(1)} %, moist ground ${(cv.moist * 100).toFixed(1)} %, bare ${(cv.bare * 100).toFixed(1)} %`);
  coverPicture(s, join(OUT, `${ROUND}-cover.png`));
  const stray = strayWater(s, land);
  writePicture(join(OUT, `${ROUND}-map.png`), s.built.heights, s.built.water, 4);
  if (stray.length) writePicture(join(OUT, `${ROUND}-stray.png`), s.built.heights, s.built.water, 4, stray.map((m) => ({ ...m })));
  lap("picture");
  if (has("weather")) {
    weather(s, land, "drought", 9, 2, 0.25);
    lap("drought");
    weather(s, land, "badtide", 8, 2, 0.125);
    lap("badtide");
  }
  if (has("checks") || has("save")) {
    const c = checksOf(s);
    log(`  checks: ${c.blocking.length} blocking, ${c.warnings.length} warnings`);
    for (const row of [...c.blocking, ...c.warnings].slice(0, 30)) log(`    ${c.blocking.includes(row) ? "BLOCK" : "warn "} ${rowOf(row).id}: ${rowOf(row).message} ${JSON.stringify(rowOf(row).where ?? "").slice(0, 300)}`);
    lap("checks");
  }
  if (has("save")) {
    const f = exportFiles(s);
    writeFileSync(join(OUT, `${ROUND}.timber`), f.timber);
    writeFileSync(join(OUT, `${ROUND}.damgoodmaps.json`), f.project);
    writeFileSync(join(OUT, `${ROUND}-shots.json`), JSON.stringify(shots(s, { drought: 9, badtide: 8 }), null, 1));
    log(`  saved ${join(OUT, `${ROUND}.timber`)} (${f.timber.length} bytes), project ${f.project.length} bytes`);
    lap("save");
  }
  void CHANNELS;
}

main();
