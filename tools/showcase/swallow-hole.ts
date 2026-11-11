// The Swallow Hole, the third premise map (planning's design, #236 2026-11-11), authored as a script of operations
// the way The Gate is (the-gate.ts): blank ground, then only the core's document engine (D342), so the saved project
// replays to the same map byte for byte (D455).
//
//   node tools/showcase/run.mjs swallow-hole [--round r2] [--save] [--dam] [--out <dir>]
//                                            [--game <snapshot.json.gz>] [--game-dam <snapshot.json.gz>]
//   npx tsx tools/showcase/swallow-hole.ts …
// `--game` and `--game-dam` read the game's own water from a probe run's whole-map records (the results folder's
// `<map>-<moment>.snapshot.json.gz`) beside ours, by the same parts: the river, every tunnel column, the spring, the
// spillway and the plain.
//
// The map (x east, y north). A river runs across an upland plain and vanishes into a cave under an overhang in the
// south face of a hill mid-map (the sink's mouth faces the opening camera, the start in front of it); it runs
// underground in a tunnel whose floor falls six levels and comes out at the foot of the escarpment, facing the camera,
// as a spring in the lowland far below. A dam before the sink floods the dry valley of the upper plain, and the spring
// runs dry; the lowland then lives on the old spillway's fall, which runs once the plain is full. The verb is *catch*.
//
// Rounds 1 and 2 prove the water only (planning's gate): 128², no dressing; the river enters the sink, runs
// underground and comes out at the spring, in our stacked engine and in the game alike; with a dam before the
// sink the plain floods and the spring runs dry. `--dam` saves the second map, the same land with the dam built.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { join } from "node:path";
import { applyOps, checksOf, emptySimulationSingletons, encodePng, frameAt, GAME_VERSION, LAYERS, MapSession, openingCamera, placeComponents, rowOf, startMiddleTile, VISTA_ZOOM, voxelsFromHeights, writeTimber, type TimberFile } from "./core";
import { hypot } from "../../src/core/math/portable";

const arg = (name: string, f: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : f;
};
const has = (name: string) => process.argv.includes(`--${name}`);
const ROUND = arg("round", "dev");
const OUT = arg("out", ".scratch/showcase/swallow-hole");

export const W = 128;
export const H = 128;
export const N = W * H;

const log = (...a: unknown[]) => console.log(...a);
let t0 = performance.now();
const lap = (what: string) => {
  const t = performance.now();
  log(`  [${what}: ${((t - t0) / 1000).toFixed(1)} s]`);
  t0 = t;
};

/** Ids that are the same every run: a v4-shaped GUID from a counter. */
let idN = 0;
const newId = (): string => `53574c4f-0000-4000-8000-${(++idN).toString(16).padStart(12, "0")}`;

type Pt = [number, number];

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const l2 = vx * vx + vy * vy;
  let t = l2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return hypot(px - (ax + vx * t), py - (ay + vy * t));
}
function pathDist(px: number, py: number, path: readonly Pt[]): number {
  let best = Infinity;
  for (let k = 0; k + 1 < path.length; k++) best = Math.min(best, segDist(px, py, path[k][0], path[k][1], path[k + 1][0], path[k + 1][1]));
  return best;
}

// ------------------------------------------------------------------------------------------------ the design
//
// (r2.) The lowland lies along the south edge, nearest the opening camera, under an escarpment eleven levels high
// that faces the camera; the upper plain fills the rest, with a rim along its edges. The river rises in a pool in the
// plain's north-west, comes south and east across it and turns north into the sink: a mouth five wide and four high
// in the south face of a hill, under an overhang three tiles deep between two buttresses. The tunnel runs north into
// the hill, east under it, then south under the plain, its floor falling six levels, and comes out at the foot of the
// escarpment as a spring facing the camera; its stream crosses the lowland to the east edge. A notch in the
// escarpment's rim a level over the plain is the old spillway: dry while the river goes under, it is where a dammed
// plain spills, a fall into the lowland: what the lowland lives on when the spring runs dry.

const PLAIN = 12;
const BED = 10;
const RISE = 14;
const RIM = 15;
const SPILL = 13;
const HILL = 18;
const LOW = 4;
const LOW_BED = 3;
const TOP = HILL;
/** The escarpment's rim (the plain's south edge), and the spillway's notch in it. */
const ESC_Y: [number, number] = [30, 32];
const NOTCH_X: [number, number] = [28, 31];
/** The hill, its south face at HILL_Y0; the buttresses either side of the mouth, and the overhang between them. */
const HILL_BOX: [number, number, number, number] = [50, 66, 92, 92];
const HILL_Y0 = HILL_BOX[1];
const MOUTH_X: [number, number] = [62, 66];
const BUTTRESS_Y0 = 61;
const CANOPY = 3;
const MOUTH_Y = HILL_Y0 - CANOPY;
const MOUTH_AIR = 4;
/** The tunnel's line from the mouth: north into the hill, east under it, south under the plain to the escarpment. */
const TUNNEL: Pt[] = [[64.5, MOUTH_Y + 0.5], [64.5, 72.5], [84.5, 72.5], [84.5, ESC_Y[0]]];
const TUNNEL_HALF = 1.6;
const AIR = 3;
/** The river: from the springs' pool in the north-west, south and east across the plain, north into the mouth. */
const POOL: Pt = [14.5, 104.5];
const POOL_R = 3.6;
const RIVER: Pt[] = [POOL, [16, 82], [24, 62], [36, 46], [52, 40], [64.5, 46], [64.5, BUTTRESS_Y0 + 1.5]];
const BED_HALF = 1.6;
/** The last reach, as wide as the mouth, from here to the mouth. */
const REACH_Y0 = 55;
/** The spring's stream (from the tunnel's exit to the east edge) and the spillway's (from the notch's fall). */
const STREAM: Pt[] = [[84.5, ESC_Y[0] - 0.5], [84.5, 14.5], [128.5, 14.5]];
const SPILL_BED: Pt[] = [[29.5, ESC_Y[0] - 0.5], [26, 18], [10, 12], [-0.5, 10]];
/** The plain's valley: the ground within VALLEY of the river (and of the old spillway's dry channel to the notch)
 *  lies at PLAIN, the rest at the terraces' level, so a dam floods the valley and not the whole upland. */
const VALLEY = 16;
const TERRACE = 14;
const SPILL_CHANNEL: Pt[] = [[34, 48], [29.5, ESC_Y[1] + 0.5]];
/** The start's rise, south-west of the mouth, over the flood a dam makes. */
const RISE_BOX: [number, number, number, number] = [46, 48, 59, 60];
const START_AT: Pt = [58, 54];
/** The dam: the recess's open rows between the buttresses, in front of the overhang. */
const DAM_Y: [number, number] = [BUTTRESS_Y0, MOUTH_Y - 1];
const SPRINGS: [number, number, number][] = [
  [13, 104, 2.0],
  [15, 105, 2.0],
  [14, 103, 2.0],
];

/** How far along a path the nearest point to (px, py) lies. */
function pathAlong(px: number, py: number, path: readonly Pt[]): { d: number; s: number } {
  let best = Infinity;
  let at = 0;
  let run = 0;
  for (let k = 0; k + 1 < path.length; k++) {
    const [ax, ay] = path[k];
    const [bx, by] = path[k + 1];
    const len = hypot(bx - ax, by - ay);
    const d = segDist(px, py, ax, ay, bx, by);
    if (d < best) {
      best = d;
      const t = len > 0 ? Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / (len * len))) : 0;
      at = run + t * len;
    }
    run += len;
  }
  return { d: best, s: at };
}
const TUNNEL_LEN = TUNNEL.slice(1).reduce((a, p, k) => a + hypot(p[0] - TUNNEL[k][0], p[1] - TUNNEL[k][1]), 0);

interface Land {
  heights: Uint8Array;
  bed: Uint8Array;
  stream: Uint8Array;
  spill: Uint8Array;
  /** Each tunnel tile's floor (-1 elsewhere), its air's height, and how far along the tunnel it lies. */
  floor: Int16Array;
  air: Uint8Array;
  along: Float32Array;
}

function designLand(): Land {
  const h = new Uint8Array(N);
  const bed = new Uint8Array(N);
  const stream = new Uint8Array(N);
  const spill = new Uint8Array(N);
  const floor = new Int16Array(N).fill(-1);
  const air = new Uint8Array(N);
  const along = new Float32Array(N);
  const inBox = (x: number, y: number, b: readonly number[]) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const px = x + 0.5;
      const py = y + 0.5;
      if (y < ESC_Y[0]) {
        h[i] = LOW;
        if (pathDist(px, py, STREAM) < BED_HALF) (h[i] = LOW_BED), (stream[i] = 1);
        else if (pathDist(px, py, SPILL_BED) < BED_HALF) (h[i] = LOW_BED), (spill[i] = 1);
      } else if (y <= ESC_Y[1]) h[i] = x >= NOTCH_X[0] && x <= NOTCH_X[1] ? SPILL : RIM;
      else if (x < 3 || x > W - 4 || y > H - 4) h[i] = RIM;
      else if (inBox(x, y, HILL_BOX) || (y >= BUTTRESS_Y0 && y < HILL_Y0 && x >= MOUTH_X[0] - 3 && x <= MOUTH_X[1] + 3 && (x < MOUTH_X[0] || x > MOUTH_X[1] || y >= MOUTH_Y))) h[i] = HILL;
      else {
        const r = pathDist(px, py, RIVER);
        h[i] = r < VALLEY || pathDist(px, py, SPILL_CHANNEL) < 4 ? PLAIN : TERRACE;
        if (inBox(x, y, RISE_BOX) && r >= BED_HALF + 2) h[i] = RISE;
        if (r < BED_HALF || hypot(px - POOL[0], py - POOL[1]) < POOL_R || (x >= MOUTH_X[0] && x <= MOUTH_X[1] && y >= REACH_Y0 && y < MOUTH_Y)) (h[i] = BED), (bed[i] = 1);
      }
      // the mouth under the overhang, and the tunnel
      if (y >= MOUTH_Y && y < HILL_Y0 && x >= MOUTH_X[0] && x <= MOUTH_X[1]) {
        floor[i] = BED;
        air[i] = MOUTH_AIR;
        along[i] = y - MOUTH_Y;
      } else if (y >= ESC_Y[0]) {
        const t = pathAlong(px, py, TUNNEL);
        if (t.d < TUNNEL_HALF && t.s >= CANOPY - 0.5) {
          floor[i] = BED - Math.round(((BED - LOW) * t.s) / TUNNEL_LEN);
          air[i] = AIR;
          along[i] = t.s;
        }
      }
    }
  for (let i = 0; i < N; i++) if (floor[i] >= 0 && floor[i] + air[i] >= h[i]) throw new Error(`the tunnel at X ${i % W} Y ${Math.floor(i / W)} has no roof (floor ${floor[i]}, ground ${h[i]})`);
  return { heights: h, bed, stream, spill, floor, air, along };
}

// ------------------------------------------------------------------------------------------------ the build

function blank(): MapSession {
  const heights = new Uint8Array(N).fill(PLAIN);
  const file: TimberFile = {
    metadata: {},
    thumbnail: null,
    versionTxt: GAME_VERSION + "\r\n",
    world: { gameVersion: GAME_VERSION, timestamp: "2026-11-11 00:00:00", sizeX: W, sizeY: H, layers: LAYERS, voxels: voxelsFromHeights(heights, W, H), singletons: emptySimulationSingletons(W, H), entities: [] },
    extraFiles: [],
  };
  const s = MapSession.importMap(writeTimber(file), "The Swallow Hole.timber");
  s.setName("The Swallow Hole");
  return s;
}

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

function shapeLand(s: MapSession, land: Land): void {
  const h = land.heights;
  for (let level = 0; level <= TOP; level++) {
    if (level === PLAIN) continue;
    const cells = runsWhere((i) => h[i] === level);
    if (cells.length) applyOps(s, [{ op: "sculpt", params: { mode: "flatten", cells, level, exact: true }, label: `Land at level ${level}` }]);
  }
  let off = 0;
  for (let i = 0; i < N; i++) if (s.built.heights[i] !== h[i]) off++;
  if (off) throw new Error(`${off} tiles are not at the design's level`);
}

type Side = "+x" | "-x" | "+y" | "-y" | "+z" | "-z";
const NORMAL: Record<Side, [number, number, number]> = { "+x": [1, 0, 0], "-x": [-1, 0, 0], "+y": [0, 1, 0], "-y": [0, -1, 0], "+z": [0, 0, 1], "-z": [0, 0, -1] };

/** Takes the blocks `cells` out with the Block tool, as a player digs: each block from a face that looks at air,
 *  the open ones first, until all are gone. */
function dig(s: MapSession, cells: [number, number, number][], label: string): number {
  let left = cells.filter(([x, y, z]) => s.terrain.solid(y * W + x, z));
  let taken = 0;
  while (left.length) {
    let moved = false;
    for (const side of ["-y", "+z", "-x", "+x", "+y", "-z"] as Side[]) {
      const n = NORMAL[side];
      const open = left.filter(([x, y, z]) => {
        const nx = x + n[0];
        const ny = y + n[1];
        const nz = z + n[2];
        return nx < 0 || ny < 0 || nx >= W || ny >= H || !s.terrain.solid(ny * W + nx, nz);
      });
      if (!open.length) continue;
      applyOps(s, [{ op: "blocks", params: { mode: "remove", side, at: open, size: 1 }, label }]);
      taken += open.length;
      left = left.filter(([x, y, z]) => s.terrain.solid(y * W + x, z));
      moved = true;
      break;
    }
    if (!moved) throw new Error(`${left.length} blocks of ${label} have no open face`);
  }
  return taken;
}

/** The sink and the tunnel: the mouth under the overhang dug first, then the tunnel slice by slice along its line,
 *  each block from a face that looks at air, as a player digs with the Block tool. */
function cutSink(s: MapSession, land: Land): void {
  const slices = new Map<number, [number, number, number][]>();
  for (let i = 0; i < N; i++) {
    if (land.floor[i] < 0) continue;
    const k = Math.floor(land.along[i]);
    if (!slices.has(k)) slices.set(k, []);
    for (let z = land.floor[i]; z < land.floor[i] + land.air[i]; z++) slices.get(k)!.push([i % W, Math.floor(i / W), z]);
  }
  let taken = 0;
  for (const k of [...slices.keys()].sort((a, b) => a - b)) taken += dig(s, slices.get(k)!, "The swallow hole");
  const n = land.floor.reduce((a, f) => a + (f >= 0 ? 1 : 0), 0);
  log(`  the sink: a mouth ${MOUTH_X[1] - MOUTH_X[0] + 1} wide and ${MOUTH_AIR} high under an overhang ${CANOPY} deep; a tunnel ${AIR} high and ${Math.round(TUNNEL_LEN)} long, floor ${BED} to ${LOW}; ${n} tiles, ${taken} blocks dug`);
}

const START = { x: START_AT[0], y: START_AT[1], orientation: "Cw0" as const };
function placeStart(s: MapSession): void {
  applyOps(s, [{ op: "placeEntity", params: { id: newId(), template: "StartingLocation", x: START.x, y: START.y, orientation: START.orientation }, label: "The start" }]);
}

function placeSources(s: MapSession): void {
  const ops = SPRINGS.map(([x, y, strength]) => ({ op: "placeEntity", params: { id: newId(), template: "WaterSource", x, y, orientation: "Cw0", components: placeComponents("WaterSource", { strength }) } }));
  const r = s.applyBatch(ops as never, "user", "The springs");
  if (!r.ok) throw new Error(`the springs: ${r.errors[0]}`);
}

function startOf(s: MapSession): { x: number; y: number; z: number; orientation: "Cw0" | "Cw90" | "Cw180" | "Cw270" } {
  const e = s.built.entities.find((g) => g.template === "StartingLocation");
  if (!e) throw new Error("the map has no start");
  const [x, y] = startMiddleTile(e as never);
  return { x, y, z: e.z, orientation: e.orientation as "Cw0" };
}

// ------------------------------------------------------------------------------------------------ the water

interface Stack {
  W: number;
  H: number;
  count: Uint8Array;
  floor: Int16Array;
  ceil: Int16Array;
  depth: Float64Array;
  overflow: Float64Array;
  settled: boolean;
  ticks: number;
}
const stackOf = (s: MapSession): Stack | null => {
  const st = (s.built.settle as unknown as { stack?: Stack & { stacked?: boolean } }).stack;
  return st && st.stacked ? st : null;
};

/** A map's water as the parts of the premise read it: each tile's top wet water (`depth`), and the depth of the
 *  column standing on a given floor (the tunnel's). Ours from the settle, the game's from DGM Probe's record. */
interface WaterView {
  depth: ArrayLike<number>;
  column: (i: number, floor: number) => number;
  pressured?: (i: number, floor: number) => boolean;
}
function oursView(s: MapSession): WaterView {
  const st = stackOf(s);
  const at = (i: number, floor: number) => {
    if (st) for (let q = 0; q < st.count[i]; q++) if (st.floor[q * N + i] === floor) return q * N + i;
    return -1;
  };
  return {
    depth: s.built.water,
    column: (i, f) => (at(i, f) >= 0 ? st!.depth[at(i, f)] : 0),
    pressured: (i, f) => at(i, f) >= 0 && st!.overflow[at(i, f)] > 0,
  };
}
interface GameSnapshot {
  day: number;
  depth: number[];
  floor: number[];
  layered: { x: number; y: number; columns: number[][] }[];
}
/** The game's: the record's per-tile depth is the top wet column's, which on a tile over the dry plain is the
 *  tunnel's; the surface's water is the depth only where that column stands on the tile's top. */
function gameView(g: GameSnapshot, heights: ArrayLike<number>): WaterView {
  const cols = new Map(g.layered.map((l) => [l.y * W + l.x, l.columns] as const));
  const depth = g.depth.map((d, i) => (g.floor[i] >= heights[i] - 0.01 ? d : 0));
  return { depth, column: (i, f) => (cols.get(i) ?? []).find((c) => Math.round(c[0]) === f)?.[1] ?? 0 };
}

/** The water by part: the river on the plain, the tunnel's columns, the spring's stream, the spillway's stream, and
 *  the plain's flooded tiles off the bed. */
function readWater(s: MapSession, land: Land, v: WaterView = oursView(s)): Record<string, string> {
  const b = s.built;
  const wet = (x: number) => x > 0.05;
  const out: Record<string, string> = {};
  let bedWet = 0;
  let bedN = 0;
  for (let i = 0; i < N; i++) if (land.bed[i] && Math.floor(i / W) < DAM_Y[0]) (bedN++), wet(v.depth[i]) && bedWet++;
  const mouth = (MOUTH_Y - 1) * W + 64;
  out.river = `${bedWet}/${bedN} bed tiles wet before the dam's site; at the mouth (64, ${MOUTH_Y - 1}) ${v.depth[mouth].toFixed(2)} deep`;
  let tw = 0;
  let tn = 0;
  let pressured = 0;
  const along: string[] = [];
  let next = 0;
  const line = [...land.floor.keys()].filter((i) => land.floor[i] >= 0 && pathAlong((i % W) + 0.5, Math.floor(i / W) + 0.5, TUNNEL).d < 0.6).sort((a, c) => land.along[a] - land.along[c]);
  for (let i = 0; i < N; i++) {
    if (land.floor[i] < 0) continue;
    tn++;
    if (wet(v.column(i, land.floor[i]))) tw++;
    if (v.pressured?.(i, land.floor[i])) pressured++;
  }
  for (const i of line)
    if (land.along[i] >= next) {
      along.push(`${Math.round(land.along[i])}: ${v.column(i, land.floor[i]).toFixed(2)}`);
      next += 12;
    }
  out.tunnel = `${tw}/${tn} columns wet${v.pressured ? `, ${pressured} under pressure` : ""}; along its line (tiles from the mouth: depth) ${along.join(", ")}`;
  const streamOf = (mask: Uint8Array) => {
    let n = 0;
    let w = 0;
    let vol = 0;
    for (let i = 0; i < N; i++) if (mask[i]) (n++), wet(v.depth[i]) && (w++, (vol += v.depth[i]));
    return `${w}/${n} tiles wet, ${vol.toFixed(1)} of water`;
  };
  const exit = (ESC_Y[0] - 1) * W + 84;
  out.spring = `${streamOf(land.stream)}; at the exit (84, ${ESC_Y[0] - 1}) ${v.depth[exit].toFixed(2)} deep`;
  out.spillway = streamOf(land.spill);
  let flooded = 0;
  let level = 0;
  for (let i = 0; i < N; i++) {
    if (Math.floor(i / W) <= ESC_Y[1] || land.bed[i] || b.heights[i] >= HILL || !wet(v.depth[i])) continue;
    flooded++;
    level = Math.max(level, b.heights[i] + v.depth[i]);
  }
  out.plain = `${flooded} tiles off the bed under water${flooded ? ` (surface up to ${level.toFixed(2)})` : ""}`;
  return out;
}

function printWater(name: string, r: Record<string, string>): void {
  log(`  water (${name}):`);
  for (const [k, val] of Object.entries(r)) log(`    ${k}: ${val}`);
}

/** The map from above: levels as grey, the water blue (the tunnel's water, under the ground, in cyan). */
function writePicture(file: string, s: MapSession, land: Land, scale = 4): void {
  const b = s.built;
  const v = oursView(s);
  const w = W * scale;
  const hgt = H * scale;
  const rgb = new Uint8Array(w * hgt * 3);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const lv = b.heights[i];
      const shade = (b.heights[Math.min(H - 1, y + 1) * W + x] - lv) * -10 + (lv - b.heights[y * W + Math.max(0, x - 1)]) * 10;
      let c: [number, number, number] = [60 + lv * 9 + shade, 70 + lv * 8 + shade, 50 + lv * 7 + shade];
      if (b.water[i] > 0.05) c = [30, 80, 170 - Math.min(80, b.water[i] * 40)];
      else if (land.floor[i] >= 0 && v.column(i, land.floor[i]) > 0.05) c = [40, 200, 220];
      if (land.bed[i] && !(b.water[i] > 0.05)) c = [c[0] + 30, c[1] + 10, c[2] - 10];
      for (let sy = 0; sy < scale; sy++)
        for (let sx = 0; sx < scale; sx++) {
          const p = (((H - 1 - y) * scale + sy) * w + x * scale + sx) * 3;
          rgb[p] = Math.max(0, Math.min(255, c[0]));
          rgb[p + 1] = Math.max(0, Math.min(255, c[1]));
          rgb[p + 2] = Math.max(0, Math.min(255, c[2]));
        }
    }
  writeFileSync(file, encodePng(rgb, w, hgt));
}

function firstFrame(s: MapSession): void {
  const st = startOf(s);
  for (const [name, cam] of [["first frame", openingCamera(st)], ["widest", openingCamera(st, VISTA_ZOOM)]] as const) {
    const f = (p: { u: number; v: number } | null) => (p ? `(${p.u.toFixed(2)}, ${p.v.toFixed(2)})` : "behind");
    const mouthL = frameAt(cam, MOUTH_X[0], MOUTH_Y, BED);
    const mouthR = frameAt(cam, MOUTH_X[1] + 1, MOUTH_Y, BED + MOUTH_AIR);
    const roof = frameAt(cam, 64.5, HILL_Y0, HILL);
    const spring = frameAt(cam, 84.5, ESC_Y[0], LOW);
    const fall = frameAt(cam, 29.5, ESC_Y[0], LOW);
    log(`  the sink's mouth in the ${name}: ${f(mouthL)} to ${f(mouthR)}; the hill's top over it ${f(roof)}; the spring ${f(spring)}; the spillway's fall ${f(fall)}`);
  }
}

function saveMap(s: MapSession, name: string): void {
  const c = checksOf(s);
  log(`  checks (${name}): ${c.blocking.length} blocking, ${c.warnings.length} warnings`);
  for (const row of [...c.blocking, ...c.warnings].slice(0, 20)) log(`    ${c.blocking.includes(row) ? "BLOCK" : "warn "} ${rowOf(row).id}: ${rowOf(row).message}`);
  if (!has("save")) return;
  if (c.blocking.length) throw new Error(`not saved: ${rowOf(c.blocking[0]).message}`);
  const timber = s.exportTimber({ warnings: [] }).bytes;
  writeFileSync(join(OUT, `${name}.timber`), timber);
  writeFileSync(join(OUT, `${name}.damgoodmaps.json`), s.project(9));
  log(`  saved ${join(OUT, `${name}.timber`)} (${timber.length} bytes)`);
}

/** The game's own water at a moment (DGM Probe's whole-map record, `<map>-<moment>.snapshot.json.gz` in the run's
 *  results folder), read by the same parts as ours, and every tunnel column set beside our settle's. */
function compareGame(file: string, s: MapSession, land: Land): void {
  const g = JSON.parse(gunzipSync(readFileSync(file)).toString("utf8")) as GameSnapshot;
  const gv = gameView(g, s.built.heights);
  const ov = oursView(s);
  let n = 0;
  let agree = 0;
  let worst = 0;
  let worstAt = "";
  for (let i = 0; i < N; i++) {
    if (land.floor[i] < 0) continue;
    const a = ov.column(i, land.floor[i]);
    const c = gv.column(i, land.floor[i]);
    n++;
    if (a > 0.05 === c > 0.05) agree++;
    if (Math.abs(a - c) > worst) (worst = Math.abs(a - c)), (worstAt = ` at (${i % W}, ${Math.floor(i / W)}): ours ${a.toFixed(3)}, the game's ${c.toFixed(3)}`);
  }
  let tiles = 0;
  let within = 0;
  for (let i = 0; i < N; i++) {
    if (!(ov.depth[i] > 0.05) && !(gv.depth[i] > 0.05)) continue;
    tiles++;
    if (Math.abs(ov.depth[i] - gv.depth[i]) <= 0.1) within++;
  }
  printWater(`the game, day ${g.day.toFixed(2)}`, readWater(s, land, gv));
  log(`    against ours: tunnel columns wet or dry alike ${agree}/${n}, largest depth difference ${worst.toFixed(3)}${worstAt}; top water within 0.1 on ${within}/${tiles} wet tiles`);
}

const DESCRIPTION =
  "A river runs across the upland and vanishes into a cave under the hill, runs underground, and comes out as a spring in the lowland far below. " +
  "Dam it before the sink and the dry plain becomes your reservoir; the spring below runs dry.";

// --------------------------------------------------------------------------------------------------- main

function main(): void {
  mkdirSync(OUT, { recursive: true });
  const land = designLand();
  log(`The Swallow Hole, round ${ROUND}`);
  const s = blank();
  shapeLand(s, land);
  lap("land");
  cutSink(s, land);
  lap("the sink");
  placeStart(s);
  firstFrame(s);
  placeSources(s);
  lap("sources and settle");
  applyOps(s, [{ op: "setDescription", params: { text: DESCRIPTION } }]);
  printWater("as built", readWater(s, land));
  log(`    settle: ${(s.built.settle as unknown as { ticks: number }).ticks} ticks, settled ${(s.built.settle as unknown as { settled: boolean }).settled}`);
  writePicture(join(OUT, `${ROUND}-map.png`), s, land);
  saveMap(s, ROUND);
  lap("saved");
  if (has("game")) compareGame(arg("game", ""), s, land);
  if (has("dam")) {
    const dam = new Set<number>();
    for (let y = DAM_Y[0]; y <= DAM_Y[1]; y++) for (let x = MOUTH_X[0]; x <= MOUTH_X[1]; x++) dam.add(y * W + x);
    applyOps(s, [{ op: "sculpt", params: { mode: "flatten", cells: runsWhere((i) => dam.has(i)), level: RISE, exact: true }, label: "A dam before the sink" }]);
    lap("the dam and settle");
    printWater(`with the dam (${dam.size} tiles to ${RISE})`, readWater(s, land));
    log(`    settle: ${(s.built.settle as unknown as { ticks: number }).ticks} ticks, settled ${(s.built.settle as unknown as { settled: boolean }).settled}`);
    writePicture(join(OUT, `${ROUND}-dam-map.png`), s, land);
    saveMap(s, `${ROUND}-dam`);
    if (has("game-dam")) compareGame(arg("game-dam", ""), s, land);
  }
}

main();
