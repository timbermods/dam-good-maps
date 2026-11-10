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
import { applyOps, checksOf, emptySimulationSingletons, exportFiles, fallsOf, GAME_VERSION, HazardRun, LAYERS, MapSession, rowOf, TICKS_PER_DAY, voxelsFromHeights, writeTimber, type TimberFile } from "./core";
import { CHANNELS, designLand, FALLS, H, LAKES, measureLand, N, W, type Land } from "./four-lakes-design";
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
  [166, 169, 4],
  [168, 171, 4],
  [170, 172, 4],
  [167, 167, 4],
];

function placeSources(s: MapSession): void {
  applyOps(
    s,
    SOURCES.map(([x, y, strength]) => ({ op: "placeEntity", params: { id: newId(), template: "WaterSource", x, y, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: strength, CurrentStrength: strength } } }, label: "The springs" })),
  );
}

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
    const below = lakes[F.to].level;
    return { name: F.name, drop: top - below, width, depth: width ? dsum / width : 0 };
  });
  return { wetShare: wet / N, lakes, falls };
}

function printWater(r: WaterReport): void {
  log(`  water on ${(r.wetShare * 100).toFixed(1)} % of the map`);
  for (const l of r.lakes) log(`  ${l.name.padEnd(11)} level ${l.level.toFixed(2)} (${l.over >= 0 ? "+" : ""}${l.over.toFixed(2)} over its sill)  volume ${Math.round(l.volume)}`);
  for (const f of r.falls) log(`  ${f.name.padEnd(11)} falls ${f.drop.toFixed(2)} levels, ${f.width} tiles wide, ${f.depth.toFixed(2)} deep on the lip`);
}

/** Water where the design has none: each body's size, where it is and its level (a leak to find). */
function strayWater(s: MapSession, land: Land): { x: number; y: number; rgb: [number, number, number] }[] {
  const b = s.built;
  const seen = new Uint8Array(N);
  const marks: { x: number; y: number; rgb: [number, number, number] }[] = [];
  const dry = (i: number) => {
    const c = land.channel[i];
    return !land.lake[i] && !land.pool[i] && !(c && CHANNELS[c - 1].name !== "Old channel");
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

/** A drought or a badtide of `days` on the settled water: each lake's level and badwater day by day. */
function weather(s: MapSession, land: Land, hazard: "drought" | "badtide", days: number): void {
  const b = s.built;
  const run = new HazardRun(b.waterModel, { depth: b.water, contamination: b.contamination, out: (b.settle as unknown as { out?: Float64Array }).out } as never, hazard, days);
  log(`${hazard}, ${days} days:`);
  const h = b.heights;
  for (let day = 1; day <= days; day++) {
    run.step(TICKS_PER_DAY);
    const w = run.water();
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
    void h;
    log(`  day ${day}: ` + r.lakes.map((l, k) => `${l.name.split(" ")[0]} ${isNaN(l.level) ? "dry" : l.level.toFixed(2)}${hazard === "badtide" ? ` bad ${(bad[k] * 100).toFixed(0)}%` : ""}`).join("  ") + `  | falls ${r.falls.map((f) => (f.width ? `${f.width}w ${f.depth.toFixed(2)}` : "dry")).join(", ")}`);
  }
  run.dispose();
}

// --------------------------------------------------------------------------------------------------- main

function main(): void {
  mkdirSync(OUT, { recursive: true });
  const land = designLand();
  const m = measureLand(land.heights);
  log(`Four Lakes, round ${ROUND}`);
  log(`  land: flat ${(m.flat8 * 100).toFixed(1)} % (8-neighbour; ${(m.flat4 * 100).toFixed(1)} % 4-neighbour), one-level steps ${(m.step1 * 100).toFixed(1)} %, top-3 levels ${(m.top3 * 100).toFixed(1)} %`);
  lap("design");
  const s = blank();
  lap("blank");
  shapeLand(s, land);
  lap("land");
  placeSources(s);
  lap("sources and settle");
  const settle = s.built.settle as unknown as { ticks: number; settled: boolean };
  log(`  settle: ${settle.ticks} ticks, settled ${settle.settled}`);
  const wr = readWater(s, land);
  printWater(wr);
  const falls = fallsOf(s.built.heights, s.built.water, W, H, 1.5);
  log(`  falls the core sees: ${falls.length} tiles, tallest ${falls.reduce((a, f) => Math.max(a, f.drop), 0).toFixed(1)}`);
  const stray = strayWater(s, land);
  writePicture(join(OUT, `${ROUND}-map.png`), s.built.heights, s.built.water, 4);
  if (stray.length) writePicture(join(OUT, `${ROUND}-stray.png`), s.built.heights, s.built.water, 4, stray.map((m) => ({ ...m })));
  lap("picture");
  if (has("weather")) {
    weather(s, land, "drought", 9);
    lap("drought");
    weather(s, land, "badtide", 8);
    lap("badtide");
  }
  if (has("checks") || has("save")) {
    const c = checksOf(s);
    log(`  checks: ${c.blocking.length} blocking, ${c.warnings.length} warnings`);
    for (const row of [...c.blocking, ...c.warnings].slice(0, 30)) log(`    ${c.blocking.includes(row) ? "BLOCK" : "warn "} ${rowOf(row).id}: ${rowOf(row).message}`);
    lap("checks");
  }
  if (has("save")) {
    const f = exportFiles(s);
    writeFileSync(join(OUT, `${ROUND}.timber`), f.timber);
    writeFileSync(join(OUT, `${ROUND}.damgoodmaps.json`), f.project);
    log(`  saved ${join(OUT, `${ROUND}.timber`)} (${f.timber.length} bytes), project ${f.project.length} bytes`);
    lap("save");
  }
  void CHANNELS;
}

main();
