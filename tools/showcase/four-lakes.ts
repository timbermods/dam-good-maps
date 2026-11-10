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
import { DAYS_TO_DIE_DRY, easyStartMeasures, easyTargets, frameAt, hazardSoil, orientationForHigh, reachWalk, seenThroughRoofs, witheredByDay } from "./core";
import { openingCamera, placeComponents, startMiddleTile, StartWaterDays, startWaterWithin, VISTA_ZOOM } from "./core";
import { applyOps, checksOf, emptySimulationSingletons, exportFiles, fallsOf, GAME_VERSION, HazardRun, LAYERS, MapSession, rowOf, TICKS_PER_DAY, voxelsFromHeights, writeTimber, type TimberFile } from "./core";
import { CHANNELS, designLand, FALLS, fbm, GREAT_ROWS, H, LAKES, measureLand, N, START_AT, TARNS, W, type Land } from "./four-lakes-design";
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

/** The springs: four in the pool at the head of the hanging valley, and each tarn's own. */
const SOURCES: [number, number, number][] = [
  // (3.4 each since r11: the West Leat is blocked at its head, so the falls carry what they carried before)
  [104, 127, 3.4],
  [106, 129, 3.4],
  [108, 131, 3.4],
  [105, 125, 3.4],
  ...TARNS.filter((t) => t.spring).map((t) => t.spring!),
];

/** The old channel's plugs: Blockages across it, the first at its mouth on the springs' pool. */
const OLD_PLUGS: string[] = [];
function placePlugs(s: MapSession, land: Land): void {
  applyOps(
    s,
    land.plugs.flatMap((row, k) =>
      row.map((i) => {
        const id = newId();
        OLD_PLUGS.push(id);
        return { op: "placeEntity", params: { id, template: "Blockage", x: i % W, y: Math.floor(i / W), orientation: "Cw0" }, label: `The old channel's ${["first", "second", "third"][k]} blockage` };
      }),
    ),
  );
}

/** The dry heads (Kyler, r11: the land beyond the lakes is dry, and irrigable by design): a row of Blockages across
 *  the head of each leat that fed the side valleys, and of two branches. Behind each the water stands; below it the
 *  tarns are empty basins and the brooks dry beds, until the player clears it. Each is at a chain's source or at a
 *  second way out of a tarn, so no water is left without an outlet. */
const DRY_HEADS: { name: string; waters: string; ids: string[] }[] = [
  // (r11 also tried a blockage on Crag Brook's head and on the South Leat's: clearing either changed nothing in
  // the model once its leat ran, so they are not there: two works, each a whole side of the valley)
  { name: "West Leat", waters: "the west side: High Tarn, High Brook, Birch Tarn, Hill Tarn, their brooks down to Low Lake and the kettle in the start's bench", ids: [] },
  { name: "Steam Leat", waters: "the east side: Bench Tarn, South Tarn and their brooks down to Low Lake", ids: [] },
];
function placeDryHeads(s: MapSession, land: Land): void {
  const brooks = CHANNELS.filter((c) => c.brook).map((c) => c.name);
  for (const head of DRY_HEADS) {
    const row = head.name === "West Leat" ? land.gates[2] : land.brookHeads[brooks.indexOf(head.name)];
    if (!row.length) throw new Error(`the ${head.name} has no head row`);
    const ops = row.map((i) => {
      const id = newId();
      head.ids.push(id);
      return { op: "placeEntity", params: { id, template: "Blockage", x: i % W, y: Math.floor(i / W), orientation: "Cw0" }, label: `The ${head.name}'s blockage` };
    });
    applyOps(s, ops);
    log(`  the ${head.name} is blocked at its head: ${row.length} blockages`);
  }
}

/** The start: on the meadow under the Low Fall's west shoulder, turned so the game's first camera looks up the
 *  valley across Weir Lake at the Great Fall. */
const START = { x: START_AT[0], y: START_AT[1], orientation: "Cw0" as const };

function placeStart(s: MapSession): void {
  applyOps(s, [{ op: "placeEntity", params: { id: newId(), template: "StartingLocation", x: START.x, y: START.y, orientation: START.orientation }, label: "The start" }]);
}

/** The nearest place to (x, y) where a w x h footprint (its corner the returned tile) stands on level, dry, free
 *  ground of the design (no lake, channel or pool), a tile clear of anything already there. */
function levelSpot(s: MapSession, land: Land, x: number, y: number, w: number, hgt: number, exact = true): [number, number] {
  const b = s.built;
  const taken = new Set<number>();
  for (const e of b.entities) for (let dy = -1; dy <= 5; dy++) for (let dx = -1; dx <= 5; dx++) taken.add((e.y + dy) * W + e.x + dx);
  const fits = (cx: number, cy: number): boolean => {
    if (cx < 2 || cy < 2 || cx + w > W - 2 || cy + hgt > H - 2) return false;
    const z = b.heights[cy * W + cx];
    const ring = exact ? 1 : 3;
    for (let dy = -ring; dy < hgt + ring; dy++)
      for (let dx = -ring; dx < w + ring; dx++) {
        const i = (cy + dy) * W + cx + dx;
        const inside = dx >= 0 && dy >= 0 && dx < w && dy < hgt;
        if (land.lake[i] || land.channel[i] || land.pool[i] || b.water[i] > 0) return false;
        if (inside && (taken.has(i) || (exact ? b.heights[i] !== z : Math.abs(b.heights[i] - z) > 1))) return false;
      }
    return true;
  };
  for (let r = 0; r <= 22; r++)
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
function weather(s: MapSession, land: Land, hazard: "drought" | "badtide", days: number, fine = 0, step = 0.125, from: { depth: Float64Array; contamination: Float64Array; stack?: unknown } | null = null): { depth: Float64Array; contamination: Float64Array; startDay: number; firstBad: number[]; fallsStop: number[] } {
  const b = from ? { ...s.built, water: from.depth, contamination: from.contamination } : s.built;
  const run = new HazardRun(b.waterModel, { depth: b.water, contamination: b.contamination, stack: from ? from.stack ?? null : (b.settle as unknown as { stack?: unknown }).stack ?? null } as never, hazard, days);
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
  const oldBed = (i: number) => land.channel[i] > 0 && (CHANNELS[land.channel[i] - 1].name === "Old channel" || (CHANNELS[land.channel[i] - 1].brook !== undefined && !(b.water[i] > 0.05) && n(i, 9, 44) > 0.1));
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
  // Wood is the map's economy, not its paint (Kyler, r11): about the official maps' trees for this size and under
  // the Workshop's, and green ground needs no tree. Massed pine on the high ground (a level or more over its water),
  // in woods with glades; parkland oak on the meadows, a tree in five tiles inside small groves; birch in broken
  // ribbons along the water; the meadows between them open, which is where a player builds.
  const meadow = (i: number) => moist(i) && over[i] <= 0 && dist[i] > 2 && dist[i] <= 8;
  const highGround = (i: number) => moist(i) && dist[i] > 2 && over[i] >= 1;
  const grove = (i: number) => n(i, 17, 1) > 0.2;
  const berries = (i: number) => n(i, 9, 2) > 0.24 || (nearStart(i, 15) && !nearStart(i, 7) && n(i, 6, 3) > 0.1);
  // (the start's views of the Great Fall and the ruined weir stay open: no oak or pine south and east of it)
  const sight = (i: number) => nearStart(i, 26) && (i % W) >= st.x - 5 && Math.floor(i / W) <= st.y + 3;
  const count: Record<string, number> = {};
  count.birch = paint("trees", "Birch", (i) => moist(i) && dist[i] <= 2 && !nearStart(i, 7) && n(i, 11, 31) > -0.05, 0.45, 11, "Birch in ribbons along the water", "mixed");
  count.berries = paint("bushes", "BlueberryBush", (i) => meadow(i) && berries(i) && !nearStart(i, 6), 0.6, 12, "Blueberry patches on the meadows");
  count.oak = paint("trees", "Oak", (i) => meadow(i) && grove(i) && !berries(i) && !nearStart(i, 21) && !sight(i), 0.2, 13, "Parkland oak on the meadows", "mixed");
  count.pine = paint("trees", "Pine", (i) => highGround(i) && !nearStart(i, 21) && !sight(i) && n(i, 15, 9) > 0.05, 0.7, 15, "Pine woods on the high ground", "mixed");
  // the start's own: berries, and one wood on the bench's west side, a short walk from the door: generous and finite
  // (about 300 logs grown; a forester takes over)
  const level = (i: number) => b.heights[i] === st.z && moist(i);
  count.startBerries = paint("bushes", "BlueberryBush", (i) => level(i) && !nearStart(i, 6) && nearStart(i, 14) && Math.floor(i / W) < st.y - 4 && (i % W) > st.x - 9, 0.95, 21, "The start's berries");
  count.startOaks = paint("trees", "Oak", (i) => level(i) && !nearStart(i, 9) && nearStart(i, 19) && (i % W) <= st.x - 9 && n(i, 8, 33) > 0.1, 0.7, 22, "The start's oaks");
  count.startPines = paint("trees", "Pine", (i) => level(i) && !nearStart(i, 9) && nearStart(i, 20) && (i % W) <= st.x - 9 && n(i, 8, 33) <= 0.1, 0.7, 24, "The start's pine wood", "mixed");
  // the dry land, dressed on purpose
  const dry = (i: number) => !(b.moisture[i] > 0) && !(b.water[i] > 0) && !land.lake[i] && !land.pool[i];
  count.succulents = paint("succulents", "Succulent", (i) => dry(i) && oldDist[i] > 3 && n(i, 26, 4) > 0.03 && n(i, 7, 41) > -0.12, 0.5, 16, "Succulent drifts on the dry benches");
  count.thorns = paint("thorns", undefined, (i) => dry(i) && !nearStart(i, 34) && (oldBed(i) ? n(i, 12, 5) > 0.15 : oldDist[i] > 6 && n(i, 14, 6) > 0.52), 0.3, 17, "Thorns in the old channel and the dry gullies");
  // dead woods along the old channel: the wood that stood by its water
  const before = new Set(s.built.entities.map((e) => e.id));
  count.dead = paint("trees", "Birch", (i) => dry(i) && oldDist[i] >= 1 && oldDist[i] <= 6 && n(i, 10, 7) > -0.1, 0.3, 18, "The old channel's dead birches");
  count.dead += paint("trees", "Oak", (i) => dry(i) && oldDist[i] >= 3 && oldDist[i] <= 9 && n(i, 13, 8) > 0.25, 0.25, 19, "The old channel's dead oaks");
  // the dead wood: one stand of it, by the old aqueduct on the dry benches
  count.dead += paint("trees", "Pine", (i) => dry(i) && Math.hypot((i % W) - 157, Math.floor(i / W) - 44) < 10 && oldDist[i] > 1, 0.6, 23, "The dead wood by the old aqueduct");
  const dead = s.built.entities.filter((e) => !before.has(e.id) && (e.template === "Birch" || e.template === "Oak" || e.template === "Pine"));
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

/** The wood as an economy: the living trees by species and their logs when grown (oak 8, pine 2, birch 1), by
 *  region (each lake's shore: within 12 tiles of its water; the tarns and brooks; the uplands), and the share of
 *  the level moist ground that stands under a tree. */
function woodReport(s: MapSession, land: Land): void {
  const b = s.built;
  const LOGS: Record<string, number> = { Oak: 8, Pine: 2, Birch: 1 };
  const owner = new Int8Array(N).fill(-1);
  let q: number[] = [];
  for (let i = 0; i < N; i++)
    if (land.lake[i]) {
      owner[i] = Math.min(land.lake[i], 5) - 1;
      q.push(i);
    } else if (land.channel[i] && CHANNELS[land.channel[i] - 1].brook) {
      owner[i] = 4;
      q.push(i);
    }
  for (let d = 1; d <= 12 && q.length; d++) {
    const next: number[] = [];
    for (const i of q) {
      const x = i % W;
      for (const j of [i - 1, i + 1, i - W, i + W])
        if (j >= 0 && j < N && Math.abs((j % W) - x) <= 1 && owner[j] < 0) {
          owner[j] = owner[i];
          next.push(j);
        }
    }
    q = next;
  }
  const names = [...LAKES.map((L) => `${L.name}'s shore`), "the tarns and brooks", "the uplands"];
  const trees = names.map(() => 0);
  const logs = names.map(() => 0);
  const kinds: Record<string, number> = { Oak: 0, Pine: 0, Birch: 0 };
  const under = new Uint8Array(N);
  let all = 0;
  let deadN = 0;
  for (const e of b.entities) {
    if (LOGS[e.template] === undefined) continue;
    all++;
    if ((e.components as { LivingNaturalResource?: { IsDead?: boolean } }).LivingNaturalResource?.IsDead === true) {
      deadN++;
      continue;
    }
    const i = e.y * W + e.x;
    under[i] = 1;
    const r = owner[i] < 0 ? 5 : owner[i];
    trees[r]++;
    logs[r] += LOGS[e.template];
    kinds[e.template]++;
  }
  let levelMoist = 0;
  let wooded = 0;
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (!(b.moisture[i] > 0) || b.water[i] > 0.05) continue;
      let flat = true;
      for (const j of [i - 1, i + 1, i - W, i + W, i - W - 1, i - W + 1, i + W - 1, i + W + 1]) if (b.heights[j] !== b.heights[i]) flat = false;
      if (!flat) continue;
      levelMoist++;
      if (under[i]) wooded++;
    }
  const living = all - deadN;
  const total = logs.reduce((a, v) => a + v, 0);
  log(`  wood: ${living} living trees (${Math.round((living * 10000) / N)} per 10,000 tiles; with the ${deadN} dead ${Math.round((all * 10000) / N)}): ${kinds.Pine} pine, ${kinds.Oak} oak, ${kinds.Birch} birch; ${total} logs when grown (${Math.round((total * 10000) / N)} per 10,000 tiles)`);
  log(`  wood by region: ${names.map((nm, k) => `${nm} ${trees[k]} trees, ${logs[k]} logs`).join("; ")}`);
  log(`  level moist ground: ${levelMoist} tiles, ${wooded} under a tree (${Math.round((100 * wooded) / levelMoist)} %)`);
  log(`  against this size (192 x 192): official medium maps 1,061 trees per 10,000 tiles, a third of them alive (3,911 trees, about 1,300 living; living trees on 16 % of the moist land); the Workshop 1,243 per 10,000 (4,582)`);
}

// ------------------------------------------------------------------------------------------------ objects

/** TOOL: a cave behind a fall (change 7): the Block tool takes the rock out of the Great Fall's cliff from its
 *  face, as one arch: five rows of the lip's middle, three levels high at the ends and five in the middle, three
 *  tiles deep at the ends and five in the middle; its floor is the bench's level (7), dry over the lake; the large
 *  relic stands at its mouth under the arch's crown. */
const CAVE: { y: number; high: number; deep: number }[] = [
  { y: 103, high: 5, deep: 5 },
  { y: 104, high: 4, deep: 5 },
  { y: 102, high: 4, deep: 5 },
  { y: 105, high: 3, deep: 3 },
  { y: 101, high: 3, deep: 3 },
];
function greatCave(s: MapSession): void {
  try {
    // each row is opened from its first tile's west face and then inward (east), a tile at a time; the roof steps
    // down toward the back, so the chamber is a vault and not a box
    let cut = 0;
    for (const { y, high, deep } of CAVE) {
      const x = GREAT_ROWS.find((r) => r[0] === y)![1];
      for (let d = 0; d <= deep; d++) {
        const hgt = Math.max(2, high - Math.floor(d / 3));
        const cells: [number, number, number][] = Array.from({ length: hgt }, (_, q) => [x + d, y, 7 + q] as [number, number, number]);
        applyOps(s, [{ op: "blocks", params: { mode: "remove", side: "-x", at: cells, size: 1 }, label: "The cave behind the Great Fall" }]);
        cut += hgt;
      }
    }
    const [rx, ry] = [84, 102];
    applyOps(s, [{ op: "placeEntity", params: { id: newId(), template: "LargeRelic", x: rx, y: ry, z: 7, orientation: "Cw0" }, label: "The relic in the cave" }]);
    log(`  the cave behind the Great Fall is cut (${cut} blocks, an arch three to five levels high over level 7), the large relic at its mouth at X ${rx} Y ${ry}`);
  } catch (e) {
    log(`    (the cave behind the Great Fall: ${(e as Error).message})`);
  }
}

/** TOOL: a way up (natural slopes): near (x, y), where ground at `hi` stands straight over ground at `lo`, a ramp
 *  of rock is raised out from the cliff's foot, a level a tile, with a Slope on each tile: a walk from `lo` to `hi`. */
function ramp(s: MapSession, land: Land, x0: number, y0: number, lo: number, hi: number, label: string): boolean {
  const b = s.built;
  const n = hi - lo;
  const taken = new Set<number>();
  for (const e of b.entities) taken.add(e.y * W + e.x);
  const open = (i: number) => !land.lake[i] && !land.channel[i] && !land.pool[i] && !(b.water[i] > 0) && !taken.has(i);
  for (let r = 0; r <= 26; r++)
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const px = x0 + dx;
        const py = y0 + dy;
        if (px < n + 3 || py < n + 3 || px >= W - n - 3 || py >= H - n - 3) continue;
        if (b.heights[py * W + px] !== hi || !open(py * W + px)) continue;
        for (const [ux, uy] of [[0, -1], [-1, 0], [1, 0], [0, 1]] as const) {
          let ok = true;
          for (let k = 1; k <= n + 2 && ok; k++) {
            const i = (py + uy * k) * W + px + ux * k;
            // (the ramp's own tiles and two of landing: ground at `lo`, dry, free, and so are the tiles beside them)
            if (b.heights[i] !== lo || !open(i) || !open(i + uy + ux * W) || !open(i - uy - ux * W)) ok = false;
          }
          if (!ok) continue;
          const ops: unknown[] = [];
          for (let k = 1; k < n; k++) ops.push({ op: "sculpt", params: { mode: "flatten", cells: [[py + uy * k, px + ux * k, px + ux * k]], level: hi - k, exact: true }, label });
          if (ops.length) applyOps(s, ops);
          for (let k = 1; k <= n; k++) applyOps(s, [{ op: "placeEntity", params: { id: newId(), template: "Slope", x: px + ux * k, y: py + uy * k, orientation: orientationForHigh(-ux, -uy) }, label }]);
          log(`  ${label}: ${n} slopes from X ${px + ux * n} Y ${py + uy * n} (level ${lo}) up to X ${px} Y ${py} (level ${hi})`);
          return true;
        }
      }
  log(`    (${label}: no cliff from ${lo} to ${hi} with room for a ramp near ${x0},${y0})`);
  return false;
}

/** A ramp of rock out from a cliff's foot: from the top tile P, `n` tiles along (ux, uy), a level a tile, a Slope on each. */
function buildRamp(s: MapSession, px: number, py: number, ux: number, uy: number, n: number, label: string): void {
  const hi = s.built.heights[py * W + px];
  const ops: unknown[] = [];
  for (let k = 1; k < n; k++) ops.push({ op: "sculpt", params: { mode: "flatten", cells: [[py + uy * k, px + ux * k, px + ux * k]], level: hi - k, exact: true }, label });
  if (ops.length) applyOps(s, ops);
  for (let k = 1; k <= n; k++) applyOps(s, [{ op: "placeEntity", params: { id: newId(), template: "Slope", x: px + ux * k, y: py + uy * k, orientation: orientationForHigh(-ux, -uy) }, label }]);
}

/** TOOL: the route (change 6): the walk from the start to each place by the core's own walking graph (the ground and
 *  the natural slopes). Where a place can't be walked to, ways are made toward it one at a time: a ramp of one or two
 *  slopes wherever ground the walk reaches stands a step from ground it doesn't, nearest the place first; then the
 *  walk is read again. Water is never crossed: what lies over the river stays for a bridge. */
function walkRoute(s: MapSession, land: Land, places: { name: string; tiles: number[]; far?: boolean }[], from: { x: number; y: number; name: string } | null = null): void {
  const dirs = [[0, -1], [-1, 0], [1, 0], [0, 1]] as const;
  const reachNow = () => {
    const st = from ?? startOf(s);
    return reachWalk(s.built.heights, W, H, s.built.entities as never, { x: st.x, y: st.y });
  };
  const origin = from ? from.name : "the start";
  const around = (tiles: number[]) => [...new Set(tiles.flatMap((i) => [i, i - 1, i + 1, i - W, i + W, i - 2, i + 2, i - 2 * W, i + 2 * W]))].filter((i) => i >= 0 && i < N);
  let made = 0;
  for (const place of places) {
    if (!place.tiles.length) continue;
    const near = around(place.tiles);
    const cx = place.tiles.reduce((a, i) => a + (i % W), 0) / place.tiles.length;
    const cy = place.tiles.reduce((a, i) => a + Math.floor(i / W), 0) / place.tiles.length;
    const far = (i: number) => Math.hypot((i % W) - cx, Math.floor(i / W) - cy);
    let found = Infinity;
    for (let round = 0; round < (place.far ? 1 : 40); round++) {
      const b = s.built;
      const reach = reachNow();
      found = Infinity;
      for (const i of near) if (reach[i] < found) found = reach[i];
      if (Number.isFinite(found) || place.far) break;
      const taken = new Set<number>();
      for (const e of b.entities) taken.add(e.y * W + e.x);
      const open = (i: number) => !land.lake[i] && !land.channel[i] && !land.pool[i] && !(b.water[i] > 0) && !taken.has(i);
      // how near the walk already comes
      let reached = Infinity;
      for (let i = 0; i < N; i++) if (Number.isFinite(reach[i]) && far(i) < reached) reached = far(i);
      let best: { px: number; py: number; ux: number; uy: number; n: number; score: number } | null = null;
      for (let y = 9; y < H - 9; y++)
        for (let x = 9; x < W - 9; x++) {
          const P = y * W + x;
          if (!open(P)) continue;
          for (const [ux, uy] of dirs)
            for (let n = 1; n <= 2; n++) {
              const end = (y + uy * (n + 1)) * W + x + ux * (n + 1);
              const pIn = Number.isFinite(reach[P]);
              const eIn = Number.isFinite(reach[end]);
              if (pIn === eIn) continue;
              let ok = true;
              for (let k = 1; k <= n + 1 && ok; k++) {
                const j = (y + uy * k) * W + x + ux * k;
                if (b.heights[j] !== b.heights[P] - n || !open(j)) ok = false;
              }
              if (!ok) continue;
              const score = far(pIn ? end : P) + (n - 1) * 2;
              if (score < reached + 4 && (!best || score < best.score)) best = { px: x, py: y, ux, uy, n, score };
            }
        }
      if (!best) break;
      buildRamp(s, best.px, best.py, best.ux, best.uy, best.n, `The way to ${place.name}`);
      made += best.n;
    }
    log(Number.isFinite(found) ? `  walk from ${origin} to ${place.name}: ${Math.round(found)} tiles` : `  walk to ${place.name}: no walk from ${origin}${place.far ? " (over the river: a bridge)" : ""}`);
  }
  log(`  ways made for the route from ${origin}: ${made} natural slopes`);
}

/** With a cave on the map the settle leaves water in closed hollows near the top water that no source feeds (the
 *  same map without the cave has them dry). It is taken away with the editor's own Remove unfed water, over every
 *  tile that holds water where the design has none (the old channel's mouth, which the pool feeds, is refused and
 *  stays). */
function dryStray(s: MapSession, land: Land): void {
  const b = s.built;
  const wet = (i: number) => {
    const c = land.channel[i];
    return b.water[i] > 0.05 && !land.lake[i] && !land.pool[i] && !c;
  };
  const area = runsWhere(wet);
  if (!area.length) return;
  let n = 0;
  for (const [, x0, x1] of area) n += x1 - x0 + 1;
  // one body at a time (a body a source feeds is refused; the others go)
  const seen = new Uint8Array(N);
  let taken = 0;
  for (let i0 = 0; i0 < N; i0++) {
    if (seen[i0] || !wet(i0)) continue;
    const body: number[] = [i0];
    seen[i0] = 1;
    for (let q = 0; q < body.length; q++) {
      const i = body[q];
      const x = i % W;
      for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < N && Math.abs((j % W) - x) <= 1 && !seen[j] && wet(j)) (seen[j] = 1), body.push(j);
    }
    const set = new Set(body);
    try {
      applyOps(s, [{ op: "removeUnfedWater", params: { area: runsWhere((i) => set.has(i)) }, label: "Unfed water taken away" }]);
      taken += body.length;
      log(`  unfed water taken away: ${body.length} tiles round X ${body[0] % W} Y ${Math.floor(body[0] / W)}`);
    } catch (err) {
      log(`  water where the design has none, ${body.length} tiles round X ${body[0] % W} Y ${Math.floor(body[0] / W)}: kept (${(err as Error).message})`);
    }
  }
  void n;
  void taken;
}

/** The far bank's first ground: by the ruined weir's east abutment. */
const FAR_BANK: [number, number] = [101, 86];

/** The set pieces: each a place with a purpose on the route up the valley. */
function placeObjects(s: MapSession, land: Land): void {
  const put = (template: string, x0: number, y0: number, label: string, extra: Record<string, unknown> = {}, size: [number, number] | null = null) => {
    let x = x0;
    let y = y0;
    try {
      if (size) [x, y] = levelSpot(s, land, x0, y0, size[0], size[1], size[0] < 3);
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
  put("GeothermalField", 174, 100, "Steam Lake's geothermal field", {}, [3, 3]);
  put("UndergroundRuins", 134, 116, "The ruins under Steam Lake's shore", {}, [5, 5]);
  // (a seep is left out: wherever it stood on open ground its water ran off into the old channel; it needs a basin)
  if (!has("no-cave")) greatCave(s);
  // the springs: aquifers, the old drill, unstable cores
  const aq = s.built.entities.find((e) => e.template === "Aquifer");
  if (aq) put("AncientAquiferDrill", aq.x, aq.y, "The ancient drill on the aquifer");
  put("UnstableCore", 113, 152, "An unstable core in the cirque", {}, [2, 2]);
  put("UnstableCore", 131, 140, "An unstable core in the cirque", {}, [2, 2]);
  // the ways up: natural slopes from Low Lake's meadows to the start's bench, and on to Steam Lake and Crown Lake
  try {
    ramp(s, land, 66, 86, 3, 7, "The way up from Low Lake to the bench");
    ramp(s, land, 126, 88, 7, 11, "The way up from Weir Lake to Steam Lake");
    if (!ramp(s, land, 138, 128, 11, 15, "The way up from Steam Lake to Crown Lake")) {
      // (no straight cliff: two shorter ramps by way of a bench)
      for (const mid of [13, 12, 14]) {
        if (ramp(s, land, 138, 128, 11, mid, "The way up from Steam Lake, first half") && ramp(s, land, 138, 132, mid, 15, "The way up to Crown Lake, second half")) break;
      }
    }
  } catch (e) {
    log(`    (a way up: ${(e as Error).message})`);
  }
  // the old aqueduct: piers across the old channel on the dry benches, tallest in the middle (why anyone was here)
  {
    const hs = [2, 3, 5, 7, 8, 7, 5, 3, 2];
    hs.forEach((hgt, q) => {
      const t = (q - 4) * 1.5;
      ruin(hgt, Math.round(152 + 0.64 * t), Math.round(47.5 - 0.77 * t), "The old aqueduct's piers", "ABCDE"[q % 5]);
    });
    put("SmallRelic", 160, 40, "The relic by the old aqueduct", {}, [2, 2]);
  }
  // the Gate's towers: two piers each side of the gorge's slot
  ruin(8, 36, 16, "The Gate's west tower", "A");
  ruin(6, 36, 15, "The Gate's west tower", "B");
  ruin(8, 44, 16, "The Gate's east tower", "C");
  ruin(6, 44, 15, "The Gate's east tower", "D");
  // relics on the way
  put("MediumRelic", 49, 45, "The relic on Low Lake's island", {}, [3, 3]);
  put("SmallRelic", 46, 15, "The relic at the Gate", {}, [2, 2]);
}

/** The old channel opened, as a player would: the blockages cleared and gates (ground two levels up) across the
 *  neck and the hanging valley; with `brooks`, a dam at each brook's head too. A what-if on this session: run
 *  after the round is saved, never saved itself. */
function openBypass(s: MapSession, land: Land, brooks: boolean): void {
  const plugs = s.built.entities.filter((e) => e.template === "Blockage" && OLD_PLUGS.includes(e.id)).map((e) => e.id);
  applyOps(s, [{ op: "deleteEntities", params: { entities: plugs }, label: "Clear the blockages" }]);
  const rows = [...land.gates, ...(brooks ? land.brookHeads : [])];
  for (const row of rows) {
    if (!row.length) continue;
    const set = new Set(row);
    const level = Math.max(...row.map((i) => s.built.heights[i])) + 2;
    applyOps(s, [{ op: "sculpt", params: { mode: "flatten", cells: runsWhere((i) => set.has(i)), level, exact: true }, label: "A gate" }]);
  }
}

/** Where the Great Fall stands in the game's first camera (analysis/opening.ts): its lip's ends and its foot, in the
 *  first frame and pulled back to the widest (u across, v up, each -1 to 1 inside the frame). */
function firstFrame(s: MapSession, land: Land): void {
  const st = startOf(s);
  const lip = land.crests[3];
  const xs = lip.map((i) => i % W);
  const ys = lip.map((i) => Math.floor(i / W));
  const top = 14.2;
  const foot = 6.4;
  void xs;
  void ys;
  const a = lip[0];
  const z = lip[lip.length - 1];
  for (const [name, cam] of [["first frame", openingCamera(st)], ["widest", openingCamera(st, VISTA_ZOOM)]] as const) {
    const pts = [
      frameAt(cam, (a % W) + 0.5, Math.floor(a / W) + 0.5, top),
      frameAt(cam, (z % W) + 0.5, Math.floor(z / W) + 0.5, top),
      frameAt(cam, (a % W) - 0.5, Math.floor(a / W) - 0.5, foot),
      frameAt(cam, (z % W) - 0.5, Math.floor(z / W) - 0.5, foot),
    ];
    const f = (p: { u: number; v: number } | null) => (p ? `(${p.u.toFixed(2)}, ${p.v.toFixed(2)})` : "behind");
    const inside = pts.every((p) => p && Math.abs(p.u) <= 1 && Math.abs(p.v) <= 1);
    // (every lip tile's far corner: the lip is no longer one line)
    let vmax = -Infinity;
    for (const i of lip) {
      const p = frameAt(cam, (i % W) + 1, Math.floor(i / W) + 1, top);
      if (p && p.v > vmax) vmax = p.v;
    }
    log(`    the lip's highest corner in the ${name}: v ${vmax.toFixed(2)}`);
    log(`  the Great Fall in the ${name}: lip ${f(pts[0])} to ${f(pts[1])}, foot ${f(pts[2])} to ${f(pts[3])}${inside ? ": whole in the frame" : ": cut by the frame"}`);
  }
}

// ------------------------------------------------------------------------------------------------ the shots

/** The cameras a round is judged from (tools/showcase/capture.ts): the game's first camera on the start, pulled
 *  back to its widest and as the game opens; the best side, up the diagonal; the whole map; top-down; each fall. */
function shots(s: MapSession, weatherDays: { drought: number; badtide: number }): unknown[] {
  const st = startOf(s);
  const cam = openingCamera(st, VISTA_ZOOM);
  const deg = Math.PI / 180;
  const opening = (c: typeof cam) => ({ yaw: -35 * deg, pitch: 60 * deg, distance: c.distance, target: [c.target[0], c.target[2], c.target[1]] });
  const best = { yaw: -45 * deg, pitch: 27 * deg, distance: 215, target: [104, 6, 104] };
  const far = { yaw: -45 * deg, pitch: 52 * deg, distance: 330, target: [96, 5, 96] };
  return [
    { name: "01-opening", label: "The game's first camera, pulled back (vista)", view: opening(cam) },
    { name: "02-opening-first", label: "The game's first frame (its own camera)", view: opening(openingCamera(st)) },
    { name: "03-best-side", label: "Best side: up the valley", view: best },
    { name: "04-far", label: "The whole map", view: far },
    { name: "05-top", label: "Top-down", top: true, view: { yaw: 0, pitch: 89 * deg, distance: 300, target: [96, 5, 96] } },
    { name: "06-great-fall", label: "The Great Fall", view: { yaw: -45 * deg, pitch: 24 * deg, distance: 56, target: [82, 9, 103] } },
    { name: "07-low-fall", label: "Low Fall (Weir Lake into Low Lake)", view: { yaw: 14 * deg, pitch: 26 * deg, distance: 50, target: [90.5, 4, 83] } },
    { name: "08-weir-fall", label: "Weir Fall (Steam Lake into Weir Lake)", view: { yaw: -70 * deg, pitch: 26 * deg, distance: 50, target: [124, 8, 99.5] } },
    { name: "09-crown-fall", label: "Crown Fall (Crown Lake into Steam Lake)", view: { yaw: -14 * deg, pitch: 26 * deg, distance: 50, target: [149.5, 12, 127] } },
    { name: "10-start", label: "The start's meadow", view: { yaw: -35 * deg, pitch: 38 * deg, distance: 70, target: [st.x, st.z, st.y] } },
    { name: "11-drought", label: `Drought, day ${weatherDays.drought}: best side`, hazard: "drought", day: weatherDays.drought, view: best },
    { name: "12-badtide", label: `Badtide, day ${weatherDays.badtide}: best side`, hazard: "badtide", day: weatherDays.badtide, view: best },
  ];
}

/** The map's own words, as the game shows them with the map (600 characters at most). */
const DESCRIPTION =
  "Four lakes step down a wooded valley over rock sills and falls; your first home stands at the foot of the Great Fall, a cave and a relic behind it. " +
  "Beyond the lakes the land is dry, and every dry valley has its answer: a blocked leat to clear, an empty tarn to fill, an old channel to open. " +
  "In a drought each lake sinks through the gap in its sill: mend the old weir's breach, plug a notch, raise a sill. " +
  "In a badtide the red comes down the whole stair in a day: clear the old channel, shut the gates at the springs, and it runs round every lake. " +
  "The ridge behind Crown Lake stands over level 16.";

/** The start's bench through a Normal drought, day by day: how much of it is still moist, Weir Lake's level, and
 *  the day the start's water goes by the editor's own rule. */
function benchReport(s: MapSession, land: Land): void {
  const b = s.built;
  const st = startOf(s);
  const h = b.heights;
  const seen = new Uint8Array(N);
  const q = [st.y * W + st.x];
  seen[q[0]] = 1;
  for (let k = 0; k < q.length; k++) {
    const i = q[k];
    const x = i % W;
    for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < N && Math.abs((j % W) - x) <= 1 && !seen[j] && h[j] === st.z && !(b.water[j] > 0.05)) (seen[j] = 1), q.push(j);
  }
  const near = q.filter((i) => Math.hypot((i % W) - st.x, Math.floor(i / W) - st.y) <= 12);
  const share = (m: ArrayLike<number>, tiles: number[]) => Math.round((100 * tiles.filter((i) => m[i] > 0).length) / tiles.length);
  log(`  the start's bench: ${q.length} level tiles at level ${st.z} (${near.length} within 12 tiles); moist now ${share(b.moisture, q)} % (${share(b.moisture, near)} % within 12)`);
  const run = new HazardRun(b.waterModel, { depth: b.water, contamination: b.contamination, stack: (b.settle as unknown as { stack?: unknown }).stack ?? null } as never, "drought", 9);
  const sw = new StartWaterDays("drought", { depth: b.water, contamination: b.contamination }, { W, H, heights: h, objects: b.entities as never, start: { x: st.x, y: st.y }, within: startWaterWithin(s) });
  for (let day = 1; day <= 9; day++) {
    run.step(TICKS_PER_DAY);
    const w = run.water();
    sw.see({ depth: w.depth, contamination: w.contamination });
    const soil = hazardSoil(b.waterModel, h, w as never, b.entities as never);
    const weir = readWater(s, land, w.depth).lakes[1];
    if (day === 3) {
      const on = new Set(q);
      for (let y = 109; y >= 83; y--) {
        let row = `    y ${String(y).padStart(3)} `;
        for (let x = 54; x <= 84; x++) {
          const i = y * W + x;
          row += on.has(i) ? (soil.moisture[i] > 0 ? "m" : ".") : w.depth[i] > 0.05 ? "~" : " ";
        }
        log(row);
      }
    }
    log(`  drought day ${day}: bench moist ${share(soil.moisture, q)} % (${share(soil.moisture, near)} % within 12 tiles of the start); Weir Lake ${weir.level.toFixed(2)} (${Math.round(weir.volume)})`);
  }
  run.dispose();
  log(`  the start's water is gone: ${sw.has ? (sw.day ? "day " + sw.day : "not in 9 days") : "no water a pump reaches"}`);
}

// ------------------------------------------------------------------------------------------- how it plays

/** TOOL: the first cycles, measured (the brief's change 6). What the checks measured at the start (walks, wood,
 *  berries, storage), Easy start's targets, a Normal drought day by day at the start (the water a pump still draws,
 *  what has withered), the reservoir each raised sill makes and the megadam in the gorge's slot. */
function play(s: MapSession, land: Land): void {
  const b = s.built;
  const st = startOf(s);
  const h = b.heights;
  log("how it plays:");
  const v = s.validate("export", { water: { model: b.waterModel, settled: b.settle } } as never) as unknown as {
    report: { checks: { id: string; ok: boolean; value?: number; limit?: number; message: string }[] };
    analysis: { moisture: Float64Array; soilContamination: Float64Array; waterDistance: number; treesNear: number; bushesNear: number; woodNear: number; naturalStorage: number; bestDam: { x: number; y: number; length: number; height: number; volume: number } | null; storage: Record<string, number> | null } | null;
  };
  const a = v.analysis!;
  for (const c of v.report.checks) if (/^(start|water|plants)\./.test(c.id)) log(`  ${c.ok ? "ok  " : "FAIL"} ${c.id}: ${c.message}${c.value !== undefined ? ` (${Math.round(c.value * 100) / 100}${c.limit !== undefined ? ` against ${c.limit}` : ""})` : ""}`);
  log(`  at the start: clean water a pump draws ${a.waterDistance.toFixed(0)} tiles' walk; within 20 tiles' walk ${a.treesNear} trees (${Math.round(a.woodNear)} logs grown), ${a.bushesNear} berry bushes`);
  if (a.storage) log(`  storage by the checks: running ${a.storage.running.toFixed(2)} (needs ${a.storage.runningNeed.toFixed(2)}), natural ${Math.round(a.storage.natural)}, best dam ${Math.round(a.storage.dam)}, levees ${Math.round(a.storage.levee)}, against a need of ${Math.round(a.storage.need)}`);
  if (a.bestDam) log(`  the checks' best dam near the start: ${a.bestDam.length} tiles long, ${a.bestDam.height} high at X ${a.bestDam.x} Y ${a.bestDam.y}, holding ${Math.round(a.bestDam.volume)}`);
  try {
    const stack = (b.settle as unknown as { stack?: { stacked?: unknown } }).stack;
    const water = stack?.stacked ? { ...seenThroughRoofs(stack as never), stack } : b.settle;
    const rows = easyStartMeasures({ W, H, heights: h, objects: b.entities as never, water: water as never, model: b.waterModel, moisture: a.moisture, soilContamination: a.soilContamination, woodNear: a.woodNear, badtide: false }, easyTargets(W, H));
    for (const m of rows) log(`  ${m.ok ? "ok  " : "SHORT"} ${m.id}: ${m.message} (${Math.round(m.value * 100) / 100} against ${m.limit})`);
  } catch (e) {
    log(`  (Easy start's targets: ${(e as Error).message})`);
  }
  // the start's own ground: level tiles joined to it, and what stands on them
  {
    const seen = new Uint8Array(N);
    const q = [st.y * W + st.x];
    seen[q[0]] = 1;
    for (let k = 0; k < q.length; k++) {
      const i = q[k];
      const x = i % W;
      for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < N && Math.abs((j % W) - x) <= 1 && !seen[j] && h[j] === st.z && !(b.water[j] > 0.05)) (seen[j] = 1), q.push(j);
    }
    const near = (r: number) => q.filter((i) => Math.hypot((i % W) - st.x, Math.floor(i / W) - st.y) <= r).length;
    const on = (t: string, r: number) => b.entities.filter((e) => e.template === t && seen[e.y * W + e.x] && Math.hypot(e.x - st.x, e.y - st.y) <= r).length;
    const taken = new Set(b.entities.map((e) => e.y * W + e.x));
    const free = (r: number) => q.filter((i) => Math.hypot((i % W) - st.x, Math.floor(i / W) - st.y) <= r && !taken.has(i)).length;
    log(`  the start's bench: ${q.length} level tiles joined to it at level ${st.z}; within 14 tiles ${near(14)} (${free(14)} free of plants), within 8 tiles ${near(8)} (${free(8)} free); on it within 20: ${on("BlueberryBush", 20)} berry bushes, ${on("Oak", 20)} oaks, ${on("Pine", 20)} pines, ${on("Birch", 20)} birches`);
  }
  // a Normal drought at its longest (9 days), day by day: the water a pump at the start still draws, what withers
  {
    const run = new HazardRun(b.waterModel, { depth: b.water, contamination: b.contamination, stack: (b.settle as unknown as { stack?: unknown }).stack ?? null } as never, "drought", 9);
    const plants = b.entities.filter((e) => DAYS_TO_DIE_DRY[e.template] !== undefined && !(e.components as { LivingNaturalResource?: { IsDead?: boolean } }).LivingNaturalResource?.IsDead).map((e) => ({ tile: e.y * W + e.x, template: e.template }));
    const nearStart = plants.map((p) => Math.hypot((p.tile % W) - st.x, Math.floor(p.tile / W) - st.y) <= 20);
    const soils: { moisture: ArrayLike<number>; contamination: ArrayLike<number> }[] = [{ moisture: b.moisture, contamination: a.soilContamination }];
    const pump = (depth: ArrayLike<number>, r: number) => {
      let n = 0;
      let vol = 0;
      let nearest = Infinity;
      for (let i = 0; i < N; i++) {
        if (!(depth[i] >= 0.3)) continue;
        const d = Math.hypot((i % W) - st.x, Math.floor(i / W) - st.y);
        if (d > r) continue;
        n++;
        vol += depth[i];
        if (d < nearest) nearest = d;
      }
      return { n, vol, nearest };
    };
    const p0 = pump(b.water, 12);
    log(`  day 0: within 12 tiles of the start ${p0.n} tiles a pump draws (0.3 deep or more), ${Math.round(p0.vol)} of water, the nearest ${p0.nearest.toFixed(1)} tiles off`);
    for (let day = 1; day <= 9; day++) {
      run.step(TICKS_PER_DAY);
      const w = run.water();
      const soil = hazardSoil(b.waterModel, h, w as never, b.entities as never);
      soils.push({ moisture: Float64Array.from(soil.moisture), contamination: Float64Array.from(soil.contamination) });
      if (![2, 3, 4, 6, 9].includes(day)) continue;
      const p = pump(w.depth, 12);
      const dead = witheredByDay(soils, plants);
      let all = 0;
      let nearN = 0;
      const kinds: Record<string, number> = {};
      dead.forEach((d, k) => {
        if (!d) return;
        all++;
        if (nearStart[k]) nearN++;
        kinds[plants[k].template] = (kinds[plants[k].template] ?? 0) + 1;
      });
      let dry = 0;
      let dryNear = 0;
      plants.forEach((pl, k) => {
        if (!(soil.moisture[pl.tile] > 0)) {
          dry++;
          if (nearStart[k]) dryNear++;
        }
      });
      const wl = readWater(s, land, w.depth).lakes.map((l) => `${l.name.split(" ")[0]} ${isNaN(l.level) ? "dry" : l.level.toFixed(2)} (${Math.round(l.volume)})`).join(", ");
      log(`  drought day ${day}: a pump draws ${p.n} tiles within 12 of the start (${Math.round(p.vol)} of water, nearest ${Number.isFinite(p.nearest) ? p.nearest.toFixed(1) : "none"}); plants on dry soil ${dry} of ${plants.length} (${dryNear} of ${nearStart.filter(Boolean).length} within 20 of the start); withered ${all} (${nearN} near the start${all ? ": " + Object.entries(kinds).map(([k, n]) => `${k} ${n}`).join(", ") : ""}); lakes ${wl}`);
    }
    run.dispose();
  }
  // the reservoirs: each lake's sill raised (a dam along its lip between the rock shoulders), and the megadam in
  // the gorge's slot: the dam's length, the land it floods, the water it adds; whether the water gets out elsewhere
  {
    const surface = (i: number) => h[i] + (b.water[i] > 0.05 ? b.water[i] : 0);
    const flood = (seed: number, level: number, dam: Set<number>): { area: number; added: number; out: boolean; land: number } => {
      const seen = new Uint8Array(N);
      const q = [seed];
      seen[seed] = 1;
      let added = 0;
      let out = false;
      let landN = 0;
      for (let k = 0; k < q.length; k++) {
        const i = q[k];
        const x = i % W;
        const y = (i - x) / W;
        added += Math.max(0, level - surface(i));
        if (!(b.water[i] > 0.05)) landN++;
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1) out = true;
        for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < N && Math.abs((j % W) - x) <= 1 && !seen[j] && !dam.has(j) && h[j] < level) (seen[j] = 1), q.push(j);
      }
      return { area: q.length, added, out, land: landN };
    };
    const seedOf = (k: number) => LAKES[k].seed[1] * W + LAKES[k].seed[0];
    // (every way out the design has: the falls' lips, the three gates' places at the springs, each brook's head; a
    // raised lake needs a dam on each of them its water reaches)
    const lines: { name: string; tiles: number[] }[] = [
      ...FALLS.map((F, k) => ({ name: `the ${F.name}'s lip`, tiles: land.crests[k] })),
      ...["the neck", "the hanging valley", "the West Leat"].map((n, k) => ({ name: `${n}'s gate`, tiles: land.gates[k] })),
      ...CHANNELS.filter((c) => c.brook).map((c, k) => ({ name: `the ${c.name}'s head`, tiles: land.brookHeads[k] })),
    ];
    const lineOf = new Map<number, number>();
    lines.forEach((l, k) => l.tiles.forEach((i) => lineOf.set(i, k)));
    LAKES.forEach((L, lk) => {
      for (const up of [1, 2]) {
        const level = L.sill + up;
        const dam = new Set<number>([...lineOf.keys()].filter((i) => h[i] < level));
        const f = flood(seedOf(lk), level, dam);
        // the dams its water reaches
        const seen = new Uint8Array(N);
        const q = [seedOf(lk)];
        seen[q[0]] = 1;
        const used = new Map<number, number>();
        for (let k = 0; k < q.length; k++) {
          const i = q[k];
          const x = i % W;
          for (const j of [i - 1, i + 1, i - W, i + W]) {
            if (j < 0 || j >= N || Math.abs((j % W) - x) > 1 || seen[j] || h[j] >= level) continue;
            seen[j] = 1;
            if (dam.has(j)) used.set(lineOf.get(j)!, (used.get(lineOf.get(j)!) ?? 0) + 1);
            else q.push(j);
          }
        }
        const dams = [...used.entries()].map(([k, n]) => `${n} on ${lines[k].name}`).join(", ");
        const total = [...used.values()].reduce((a2, n) => a2 + n, 0);
        log(`  ${L.name} raised ${up} (to ${level}): dams of ${total} tiles (${dams}); ${f.out ? "the water still gets out" : `holds ${Math.round(f.added)} more over ${f.area} tiles (${f.land} of them land now): ${Math.round(f.added / 0.424 / 100)} days of drink for 100 beavers`}`);
      }
    });
    // the megadam: across the gorge where it is narrowest
    const g = CHANNELS.findIndex((c) => c.name === "Gorge") + 1;
    let bestY = -1;
    let bestN = Infinity;
    for (let y = 3; y <= 20; y++) {
      let n = 0;
      for (let x = 0; x < W; x++) if (land.channel[y * W + x] === g) n++;
      if (n && n < bestN) (bestN = n), (bestY = y);
    }
    for (const level of [4, 6, 8, 10]) {
      const dam = new Set<number>();
      for (let x = 0; x < W; x++) {
        const i = bestY * W + x;
        if (land.channel[i] === g || (h[i] < level && Math.abs(x - 40) < 12)) dam.add(i);
      }
      const f = flood(seedOf(0), level, dam);
      log(`  the megadam in the gorge (row Y ${bestY}) to level ${level}: ${dam.size} tiles long; ${f.out ? "the water gets out round it" : `holds ${Math.round(f.added)} more over ${f.area} tiles (${f.land} of them land now)`}`);
    }
  }
}

/** TOOL: what each work waters (Kyler, r11): the blockages at the dry heads cleared one after another on the saved
 *  map, the water settled each time, and the tiles that turn green or wet counted; then the map's totals. A what-if
 *  on this session after the round is saved, never saved itself. */
function irrigation(s: MapSession, land: Land): void {
  const greenNow = () => {
    const b = s.built;
    const g = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (b.water[i] > 0.05 || b.moisture[i] > 0) g[i] = 1;
    return g;
  };
  const count = (g: Uint8Array) => g.reduce((a, v) => a + v, 0);
  const day1 = greenNow();
  let prev = day1;
  log(`irrigation: green or wet on day 1: ${count(day1)} tiles (${((100 * count(day1)) / N).toFixed(1)} % of the map)`);
  let small = 0;
  for (const head of DRY_HEADS) {
    if (!head.ids.length) continue;
    applyOps(s, [{ op: "deleteEntities", params: { entities: head.ids }, label: `Clear the ${head.name}'s blockage` }]);
    const g = greenNow();
    let more = 0;
    let water = 0;
    for (let i = 0; i < N; i++)
      if (g[i] && !prev[i]) {
        more++;
        if (s.built.water[i] > 0.05) water++;
      }
    small += more;
    log(`  the ${head.name}'s blockage cleared (${head.ids.length} tiles): ${more} more tiles green or wet (${water} of them water): ${head.waters}`);
    prev = g;
  }
  // the old channel: the dry ground within 12 tiles of its bed and at most a level over it (what its water reaches)
  let old = 0;
  {
    const k = CHANNELS.findIndex((c) => c.name === "Old channel") + 1;
    const dist = new Int16Array(N).fill(-1);
    const bedOf = new Int8Array(N);
    let q: number[] = [];
    for (let i = 0; i < N; i++)
      if (land.channel[i] === k) {
        dist[i] = 0;
        bedOf[i] = s.built.heights[i];
        q.push(i);
      }
    for (let d = 1; d <= 12 && q.length; d++) {
      const next: number[] = [];
      for (const i of q) {
        const x = i % W;
        for (const j of [i - 1, i + 1, i - W, i + W])
          if (j >= 0 && j < N && Math.abs((j % W) - x) <= 1 && dist[j] < 0 && s.built.heights[j] <= bedOf[i] + 1) {
            dist[j] = d;
            bedOf[j] = bedOf[i];
            next.push(j);
          }
      }
      q = next;
    }
    for (let i = 0; i < N; i++) if (dist[i] >= 0 && !prev[i]) old++;
  }
  const after = count(prev);
  log(`  the old channel opened (3 blockages of ${land.plugs.map((r) => r.length).join(", ")} tiles and the gates): about ${old} more tiles within its water's reach (its bed and the ground a level over it, 12 tiles each side)`);
  log(`  totals: green or wet on day 1 ${((100 * count(day1)) / N).toFixed(1)} %; irrigable by small works (the two leats' blockages) ${((100 * small) / N).toFixed(1)} %; by large works (the old channel) ${((100 * old) / N).toFixed(1)} %; the rest ${((100 * (N - after - old)) / N).toFixed(1)} % (dry benches, crags and ridges; a pump, a canal or a raised sill for some, dry for good where it stands two or more levels over any water)`);
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
  if (!has("wet")) placeDryHeads(s, land);
  lap("plugs");
  placeSources(s, land);
  lap("sources and settle");
  {
    const early = readWater(s, land);
    const stray0 = strayWater(s, land);
    if (stray0.length) {
      printWater(early);
      writePicture(join(OUT, `${ROUND}-stray.png`), s.built.heights, s.built.water, 4, stray0);
    }
  }
  placeStart(s);
  firstFrame(s, land);
  lap("start");
  if (!has("bare")) {
    placeObjects(s, land);
    lap("objects");
    {
      const tilesOf = (pick: (i: number) => boolean, every = 7) => {
        const out: number[] = [];
        for (let i = 0, c = 0; i < N; i++) if (pick(i) && c++ % every === 0) out.push(i);
        return out;
      };
      const ent = (template: string) => s.built.entities.filter((e) => e.template === template).map((e) => e.y * W + e.x);
      // up the west side first (the start's bank): the tarns' valleys climb to the springs without crossing water
      walkRoute(s, land, [
        // the first metal: the ruined weir's west abutment, up from the bench
        { name: "the ruined weir's west abutment", tiles: s.built.entities.filter((e) => e.template.startsWith("RuinColumn") && e.x <= 83 && e.x >= 80 && e.y >= 83 && e.y <= 86).map((e) => e.y * W + e.x) },
        { name: "Low Lake", tiles: tilesOf((i) => land.lake[i] === 1 && s.built.heights[i] === 2) },
        { name: "Weir Lake", tiles: tilesOf((i) => land.lake[i] === 2 && s.built.heights[i] === 6) },
        { name: "Hill Tarn", tiles: tilesOf((i) => land.lake[i] === 7, 3) },
        { name: "Birch Tarn", tiles: tilesOf((i) => land.lake[i] === 6, 3) },
        { name: "High Tarn", tiles: tilesOf((i) => land.lake[i] === 5, 3) },
        { name: "the springs' pool", tiles: tilesOf((i) => land.pool[i] === 1, 5) },
        { name: "the gate on the West Leat", tiles: land.gates[2] },
        { name: "the gate on the hanging valley", tiles: land.gates[1] },
        { name: "the gate on the neck", tiles: land.gates[0] },
        { name: "the old channel's first blockage", tiles: land.plugs[0] },
        { name: "the ancient drill", tiles: ent("AncientAquiferDrill") },
        { name: "Crown Lake", tiles: tilesOf((i) => land.lake[i] === 4 && s.built.heights[i] === 14) },
        { name: "Steam Lake", tiles: tilesOf((i) => land.lake[i] === 3 && s.built.heights[i] === 10) },
        { name: "the underground ruins", tiles: ent("UndergroundRuins") },
        { name: "the geothermal field", tiles: ent("GeothermalField"), far: true },
        { name: "the old channel's second blockage", tiles: land.plugs[1], far: true },
        { name: "the old channel's third blockage", tiles: land.plugs[2], far: true },
        { name: "the old aqueduct", tiles: ent("SmallRelic"), far: true },
      ]);
      // the far bank: one bridge at the ruined weir (its piers stand three tiles apart) and then a walk: from the
      // weir's east end, natural slopes up the whole east side
      walkRoute(
        s,
        land,
        [
          { name: "Steam Lake", tiles: tilesOf((i) => land.lake[i] === 3 && s.built.heights[i] === 10) },
          { name: "the underground ruins", tiles: ent("UndergroundRuins") },
          { name: "the geothermal field", tiles: ent("GeothermalField") },
          { name: "the old channel's third blockage", tiles: land.plugs[2] },
          { name: "the old aqueduct", tiles: ent("SmallRelic").filter((i) => i % W > 100) },
          { name: "the old channel's second blockage", tiles: land.plugs[1] },
          { name: "Crown Lake", tiles: tilesOf((i) => land.lake[i] === 4 && s.built.heights[i] === 14) },
          { name: "the gate on the neck", tiles: land.gates[0] },
          { name: "the ancient drill", tiles: ent("AncientAquiferDrill") },
          { name: "the old channel's first blockage", tiles: land.plugs[0] },
        ],
        { x: FAR_BANK[0], y: FAR_BANK[1], name: "the weir's east end" },
      );
      lap("the route");
    }
    plant(s, land);
    const pc = plantCount(s);
    log(`  plants: ${pc.trees} living trees (${Math.round(pc.per10k.trees)} per 10,000 tiles), ${pc.dead} dead, ${pc.berries} berry bushes (${Math.round(pc.per10k.berries)} per 10,000), ${pc.succulents} succulents`);
    woodReport(s, land);
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
  if (has("window")) {
    // the water's surface in a window (north up): the ground's level where it is dry
    const [x0, y0, x1, y1] = arg("window", "70,96,90,110").split(",").map(Number);
    for (let y = y1; y >= y0; y--) {
      let row = `y ${String(y).padStart(3)}: `;
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        row += s.built.water[i] > 0.02 ? (s.built.heights[i] + s.built.water[i]).toFixed(1).padStart(5) : `  ${String(s.built.heights[i]).padStart(2)} `;
      }
      log(row);
    }
  }
  if (has("bench")) benchReport(s, land);
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
  applyOps(s, [{ op: "setDescription", params: { text: DESCRIPTION } }]);
  if (has("play")) {
    play(s, land);
    lap("play");
  }
  if (has("checks") || has("save")) {
    const c = checksOf(s);
    log(`  checks: ${c.blocking.length} blocking, ${c.warnings.length} warnings`);
    for (const row of [...c.blocking, ...c.warnings].slice(0, 30)) log(`    ${c.blocking.includes(row) ? "BLOCK" : "warn "} ${rowOf(row).id}: ${rowOf(row).message} ${JSON.stringify(rowOf(row).where ?? "").slice(0, 300)}`);
    lap("checks");
  }
  if (has("save")) {
    const c = checksOf(s);
    if (c.blocking.length) throw new Error(`not saved: ${rowOf(c.blocking[0]).message}`);
    const f = { timber: s.exportTimber({ warnings: [] }).bytes, project: s.project(9) };
    writeFileSync(join(OUT, `${ROUND}.timber`), f.timber);
    writeFileSync(join(OUT, `${ROUND}.damgoodmaps.json`), f.project);
    writeFileSync(join(OUT, `${ROUND}-shots.json`), JSON.stringify(shots(s, { drought: 9, badtide: 8 }), null, 1));
    log(`  saved ${join(OUT, `${ROUND}.timber`)} (${f.timber.length} bytes), project ${f.project.length} bytes`);
    lap("save");
  }
  if (has("irrigate")) {
    irrigation(s, land);
    lap("irrigation");
  }
  if (has("bypass")) {
    // the lakes as they stand on the day the player opens the channel: full (with a cave, the water on every column)
    const full = { depth: Float64Array.from(s.built.water), contamination: Float64Array.from(s.built.contamination), stack: (s.built.settle as unknown as { stack?: unknown }).stack };
    s.setWaterMode("defer");
    log("the old channel opened on a full valley (blockages cleared, gates on the neck, the hanging valley and the West Leat):");
    openBypass(s, land, false);
    try {
      weather(s, land, "badtide", 8, 1, 0.25, full);
    } catch (e) {
      log(`  (the bypass run from full lakes: ${(e as Error).message})`);
    }
    lap("bypass badtide");
    // and where the water stands once it has all gone round (the settled map with the bypass open): no stray water
    s.setWaterMode("canonical");
    applyOps(s, [{ op: "setDescription", params: { text: DESCRIPTION + " " } }]);
    {
      let top = 0;
      for (let i = 0; i < N; i++) if (land.pool[i]) top = Math.max(top, s.built.heights[i] + s.built.water[i]);
      log(`  with the bypass open the springs' pool stands at ${top.toFixed(2)}`);
    }
  }
  void CHANNELS;
}

function openBypass2(s: MapSession, land: Land): void {
  for (const row of land.brookHeads) {
    if (!row.length) continue;
    const set = new Set(row);
    const level = Math.max(...row.map((i) => s.built.heights[i])) + 2;
    applyOps(s, [{ op: "sculpt", params: { mode: "flatten", cells: runsWhere((i) => set.has(i)), level, exact: true }, label: "A dam on a brook" }]);
  }
}

main();
