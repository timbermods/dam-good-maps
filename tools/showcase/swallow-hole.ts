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
import { applyOps, checksOf, emptySimulationSingletons, encodePng, frameAt, GAME_VERSION, HazardRun, LAYERS, MapSession, openingCamera, orientationForHigh, placeComponents, reachWalk, rowOf, startMiddleTile, TICKS_PER_DAY, VISTA_ZOOM, voxelsFromHeights, writeTimber, type TimberFile } from "./core";
import { fbm } from "./four-lakes-design";
import { hypot } from "../../src/core/math/portable";

const arg = (name: string, f: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : f;
};
const has = (name: string) => process.argv.includes(`--${name}`);
const ROUND = arg("round", "dev");
const OUT = arg("out", ".scratch/showcase/swallow-hole");

export const W = 192;
export const H = 192;
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
// (r3, the first full round; r2's layout grown into a map.) The lowland lies along the south edge at 4, nearest the
// opening camera, under an escarpment that runs along the grid in straight runs joined by bold jogs, its face toward
// the camera. The upland rises in steps that follow the river: the valley floor at 12 within about sixteen tiles of
// the river, terraces at 14, the upland at 16, a rim at 18 along the far edges. The river rises in a pool in the
// north-west, runs south down the valley, swings east and turns north into the sink: a mouth five wide and four high
// in the south face of a hill at 20, under an overhang three deep between two buttresses. The tunnel runs north into
// the hill, east under it and south under the terraces to the escarpment, its floor falling from 10 to 4, and comes
// out at the escarpment's foot as the spring, facing the camera; its stream crosses the lowland to the east edge. A
// dry channel from the valley to a notch at 13 in the escarpment's edge is the old spillway, its bed in the lowland
// dry. The start stands on a rise at 14 in front of the mouth, a ramp down to the valley floor; its water is a side
// pool off the river, joined by an inlet one tile wide.

const LOW = 4;
const LOW_BED = 3;
const PLAIN = 12;
const BED = 10;
const RISE = 14;
const TERRACE = 14;
const UPLAND = 16;
const RIM = 18;
const SPILL = 13;
const HILL = 20;
const TOP = HILL;
/** The escarpment: the upland's south edge, along the grid: [x from, the first upland row]. */
const FACE: Pt[] = [[0, 50], [26, 47], [52, 51], [84, 48], [118, 52], [146, 49], [170, 51]];
const escY = (x: number): number => {
  let y = FACE[0][1];
  for (const [x0, y0] of FACE) if (x >= x0) y = y0;
  return y;
};
/** The old spillway: its channel from the valley to the notch in the escarpment's edge. */
const NOTCH_X: [number, number] = [40, 43];
const SPILL_CHANNEL: Pt[] = [[44, 92], [41.5, 62], [41.5, escY(41) + 0.5]];
const SPILL_HALF = 2.2;
/** The hill: its south face along the grid at HILL_Y0; the buttresses either side of the mouth, the overhang between. */
const HILL_BOX: [number, number, number, number] = [82, 108, 140, 150];
const HILL_Y0 = HILL_BOX[1];
const MOUTH_X: [number, number] = [94, 98];
const BUTTRESS_Y0 = 103;
const CANOPY = 3;
const MOUTH_Y = HILL_Y0 - CANOPY;
const MOUTH_AIR = 4;
/** The tunnel's line from the mouth: north into the hill, east under it, south under the terraces. */
const EXIT_X = 120.5;
const TUNNEL: Pt[] = [[96.5, MOUTH_Y + 0.5], [96.5, 116.5], [EXIT_X, 116.5], [EXIT_X, escY(EXIT_X)]];
const TUNNEL_HALF = 1.6;
const AIR = 3;
/** The river: from the springs' pool in the north-west, down the valley, east and north into the mouth. */
const POOL: Pt = [32.5, 140.5];
const POOL_R = 3.6;
const RIVER: Pt[] = [POOL, [30, 118], [42, 98], [62, 86], [84, 84], [96.5, 90], [96.5, BUTTRESS_Y0 + 1.5]];
const BED_HALF = 1.6;
/** The last reach, as wide as the mouth. */
const REACH_Y0 = 95;
/** The valley's half-width round the river (with a wander), and the terraces'. */
const VALLEY = 16;
const TERRACES = 30;
/** The spring's stream (from the tunnel's exit to the east edge) and the spillway's dry bed (to the west edge). */
const STREAM: Pt[] = [[EXIT_X, escY(EXIT_X) - 0.5], [134, 36], [150, 24], [172, 20], [192.5, 16]];
const SPILL_BED: Pt[] = [[41.5, escY(41) - 0.5], [38, 32], [24, 22], [8, 18], [-0.5, 16]];
const LOW_HALF = 2.6;
/** The start's rise in front of the mouth, its ramp to the valley floor, and its side pool with a neck. */
const RISE_BOX: [number, number, number, number] = [82, 91, 92, 102];
const START_AT: Pt = [90, 96];
const RAMP: { x: number; y: number; ux: number; uy: number } = { x: 82, y: 97, ux: -1, uy: 0 };
const NECK_POOL: Pt = [78.5, 90.6];
const NECK_POOL_R = 2.6;
const NECK: number[] = [86 * W + 78, 87 * W + 78];
/** The dam's site: the recess's open rows between the buttresses, in front of the overhang. */
const DAM_Y: [number, number] = [BUTTRESS_Y0, MOUTH_Y - 1];
const SPRINGS: [number, number, number][] = [
  [31, 140, 2.0],
  [33, 141, 2.0],
  [32, 139, 2.0],
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
  /** The river's bed (the springs' pool and the last reach with it). */
  bed: Uint8Array;
  /** The start's side pool. */
  pool: Uint8Array;
  /** The spring's stream in the lowland, the spillway's dry bed in the lowland, the spillway's channel on the upland. */
  stream: Uint8Array;
  spill: Uint8Array;
  channel: Uint8Array;
  /** Each tunnel tile's floor (-1 elsewhere), its air's height, and how far along the tunnel it lies. */
  floor: Int16Array;
  air: Uint8Array;
  along: Float32Array;
}
const lowland = (i: number) => Math.floor(i / W) < escY(i % W);

function designLand(): Land {
  const h = new Uint8Array(N);
  const bed = new Uint8Array(N);
  const pool = new Uint8Array(N);
  const stream = new Uint8Array(N);
  const spill = new Uint8Array(N);
  const channel = new Uint8Array(N);
  const floor = new Int16Array(N).fill(-1);
  const air = new Uint8Array(N);
  const along = new Float32Array(N);
  const inBox = (x: number, y: number, b: readonly number[]) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const px = x + 0.5;
      const py = y + 0.5;
      const ey = escY(x);
      if (y < ey) {
        h[i] = LOW;
        // (the lowland's beds five wide, a level under the lowland, a second level down past their first third, so
        // the spring's water runs off the map and does not spread as a sheet over the flat)
        const sa = pathAlong(px, py, STREAM);
        const sb = pathAlong(px, py, SPILL_BED);
        if (sa.d < LOW_HALF) (h[i] = sa.s > 30 ? LOW_BED - 1 : LOW_BED), (stream[i] = 1);
        else if (sb.d < LOW_HALF) (h[i] = sb.s > 30 ? LOW_BED - 1 : LOW_BED), (spill[i] = 1);
      } else if (y < ey + 3 && x >= NOTCH_X[0] && x <= NOTCH_X[1]) h[i] = SPILL;
      else if (x < 4 || x > W - 5 || y > H - 5) h[i] = RIM;
      else if (inBox(x, y, HILL_BOX) || (y >= BUTTRESS_Y0 && y < HILL_Y0 && x >= MOUTH_X[0] - 3 && x <= MOUTH_X[1] + 3 && (x < MOUTH_X[0] || x > MOUTH_X[1] || y >= MOUTH_Y))) h[i] = HILL;
      else {
        const r = pathDist(px, py, RIVER);
        const c = pathDist(px, py, SPILL_CHANNEL);
        const wander = 3 * fbm(x, y, 14, 4401, 2);
        h[i] = r < VALLEY + wander || c < SPILL_HALF ? PLAIN : r < TERRACES + wander ? TERRACE : UPLAND;
        if (c < SPILL_HALF) channel[i] = 1;
        if (inBox(x, y, RISE_BOX) && r >= BED_HALF + 2) h[i] = RISE;
        if (r < BED_HALF || hypot(px - POOL[0], py - POOL[1]) < POOL_R || (x >= MOUTH_X[0] && x <= MOUTH_X[1] && y >= REACH_Y0 && y < MOUTH_Y)) (h[i] = BED), (bed[i] = 1);
        if (hypot(px - NECK_POOL[0], py - NECK_POOL[1]) < NECK_POOL_R || NECK.includes(i)) (h[i] = BED), (pool[i] = 1);
      }
      // the mouth under the overhang, and the tunnel
      if (y >= MOUTH_Y && y < HILL_Y0 && x >= MOUTH_X[0] && x <= MOUTH_X[1]) {
        floor[i] = BED;
        air[i] = MOUTH_AIR;
        along[i] = y - MOUTH_Y;
      } else if (y >= ey) {
        const t = pathAlong(px, py, TUNNEL);
        if (t.d < TUNNEL_HALF && t.s >= CANOPY - 0.5) {
          floor[i] = BED - Math.round(((BED - LOW) * t.s) / TUNNEL_LEN);
          air[i] = AIR;
          along[i] = t.s;
        }
      }
    }
  for (let i = 0; i < N; i++) if (floor[i] >= 0 && floor[i] + air[i] >= h[i]) throw new Error(`the tunnel at X ${i % W} Y ${Math.floor(i / W)} has no roof (floor ${floor[i]}, ground ${h[i]})`);
  return { heights: h, bed, pool, stream, spill, channel, floor, air, along };
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
  const mouth = (MOUTH_Y - 1) * W + 96;
  out.river = `${bedWet}/${bedN} bed tiles wet before the dam's site; at the mouth (96, ${MOUTH_Y - 1}) ${v.depth[mouth].toFixed(2)} deep`;
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
  const ex = Math.floor(EXIT_X);
  const exit = (escY(ex) - 1) * W + ex;
  out.spring = `${streamOf(land.stream)}; at the exit (${ex}, ${escY(ex) - 1}) ${v.depth[exit].toFixed(2)} deep`;
  out.spillway = streamOf(land.spill);
  let flooded = 0;
  let level = 0;
  for (let i = 0; i < N; i++) {
    if (lowland(i) || land.bed[i] || land.pool[i] || b.heights[i] >= HILL || !wet(v.depth[i])) continue;
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
    const roof = frameAt(cam, 96.5, HILL_Y0, HILL);
    const spring = frameAt(cam, EXIT_X, escY(EXIT_X), LOW);
    const fall = frameAt(cam, 41.5, escY(41), LOW);
    log(`  the sink's mouth in the ${name}: ${f(mouthL)} to ${f(mouthR)}; the hill's top over it ${f(roof)}; the spring ${f(spring)}; the spillway's fall ${f(fall)}`);
  }
}

function saveMap(s: MapSession, name: string): void {
  const c = checksOf(s);
  log(`  checks (${name}): ${c.blocking.length} blocking, ${c.warnings.length} warnings`);
  for (const row of [...c.blocking, ...c.warnings].slice(0, 20)) log(`    ${c.blocking.includes(row) ? "BLOCK" : "warn "} ${rowOf(row).id}: ${rowOf(row).message}`);
  if (!has("save")) return;
  if (c.blocking.length) throw new Error(`not saved: ${rowOf(c.blocking[0]).message}`);
  const timber = s.exportTimber().bytes;
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

// ------------------------------------------------------------------------------------------------ the start

/** The start's ramp: from the rise's edge down to the valley floor, a level a tile, a Slope on each. */
function buildRamp(s: MapSession): void {
  const { x: px, y: py, ux, uy } = RAMP;
  const hi = s.built.heights[py * W + px];
  const n = hi - PLAIN;
  for (let k = 1; k < n; k++) applyOps(s, [{ op: "sculpt", params: { mode: "flatten", cells: [[py + uy * k, px + ux * k, px + ux * k]], level: hi - k, exact: true }, label: "The way down from the rise" }]);
  for (let k = 1; k <= n; k++) applyOps(s, [{ op: "placeEntity", params: { id: newId(), template: "Slope", x: px + ux * k, y: py + uy * k, orientation: orientationForHigh(-ux, -uy) }, label: "The way down from the rise" }]);
}

/** The walk from the start, by the core's own walking graph (water is no way). */
function walkFromStart(s: MapSession): Float64Array | Int32Array | number[] {
  const st = startOf(s);
  const b = s.built;
  const h = Uint8Array.from(b.heights);
  for (let i = 0; i < N; i++) if (b.water[i] > 0.1) h[i] = 40;
  return reachWalk(h, W, H, b.entities as never, { x: st.x, y: st.y }) as never;
}

// ------------------------------------------------------------------------------------------------ life

/** Planting with a purpose: the start's oak stand and berries on the moist valley floor by its pool; birch along
 *  the river and the spring's stream; pine on the moist terraces' edges; dead woods along the spillway's dry bed in
 *  the lowland and in clumps on the dry terraces; succulents on the upland. Wood is a budget, never a carpet. */
function plant(s: MapSession, land: Land): void {
  const b = s.built;
  const st = startOf(s);
  const moist = (i: number) => b.moisture[i] > 0 && !(b.water[i] > 0) && !land.bed[i] && !land.pool[i];
  const dry = (i: number) => !(b.moisture[i] > 0) && !(b.water[i] > 0);
  const x = (i: number) => i % W;
  const y = (i: number) => Math.floor(i / W);
  const near = (i: number, r: number) => hypot(x(i) - st.x, y(i) - st.y) < r;
  const n = (i: number, scale: number, seed: number) => fbm(x(i), y(i), scale, 9100 + seed, 2);
  const ramp = (i: number) => y(i) >= RAMP.y - 2 && y(i) <= RAMP.y + 2 && x(i) >= RAMP.x - 4 && x(i) <= RAMP.x;
  const mouthView = (i: number) => x(i) >= MOUTH_X[0] - 6 && x(i) <= MOUTH_X[1] + 6 && y(i) >= st.y - 2 && y(i) < HILL_Y0;
  const count: Record<string, number> = {};
  const paint = (kind: string, template: string | undefined, pick: (i: number) => boolean, density: number, seed: number, label: string, age?: string) => {
    const area = runsWhere((i) => pick(i) && !ramp(i) && !mouthView(i));
    if (!area.length) return 0;
    try {
      const r = applyOps(s, [{ op: "paintObjects", params: { kind, ...(template ? { template } : {}), area, density, seed, ...(age ? { age } : {}) }, label }]);
      return Object.values(r.objects.added).reduce((a, v) => a + v, 0);
    } catch (e) {
      log(`    (${label}: ${(e as Error).message})`);
      return 0;
    }
  };
  const valley = (i: number) => b.heights[i] === PLAIN && !lowland(i);
  const reach = walkFromStart(s);
  count.startBerries = paint("bushes", "BlueberryBush", (i) => valley(i) && moist(i) && reach[i] <= 18 && n(i, 6, 2) > -0.45, 0.9, 22, "The start's berries");
  count.startOak = paint("trees", "Oak", (i) => valley(i) && moist(i) && reach[i] <= 22 && !near(i, 6) && x(i) < st.x - 4 && n(i, 7, 1) > -0.25, 0.75, 21, "The start's oak stand");
  count.birch = paint("trees", "Birch", (i) => moist(i) && !near(i, 22) && n(i, 11, 3) > -0.1, 0.5, 23, "Birch along the water", "mixed");
  count.lowBirch = paint("trees", "Birch", (i) => lowland(i) && moist(i) && n(i, 9, 5) > -0.1, 0.4, 25, "Birch along the spring's stream", "mixed");
  count.lowBerries = paint("bushes", "BlueberryBush", (i) => lowland(i) && moist(i) && n(i, 8, 6) > 0.35, 0.6, 26, "Berries in the lowland");
  const before = new Set(s.built.entities.map((e) => e.id));
  const dSpill = spreadFrom((i) => land.spill[i] === 1, 4);
  count.dead = paint("trees", "Birch", (i) => lowland(i) && dry(i) && dSpill[i] <= 3 && n(i, 6, 7) > -0.15, 0.6, 27, "Dead birch along the old spillway's bed");
  count.dead += paint("trees", "Oak", (i) => !lowland(i) && dry(i) && b.heights[i] === TERRACE && n(i, 13, 8) > 0.42, 0.5, 28, "Dead oak in clumps on the dry terraces");
  const dead = s.built.entities.filter((e) => !before.has(e.id) && (e.template === "Birch" || e.template === "Oak" || e.template === "Pine"));
  if (dead.length) {
    const r = s.applyAll(dead.map((e) => ({ op: "setEntityProps", params: { id: e.id, components: { LivingNaturalResource: { IsDead: true } } } })) as never, "user", "The dry ground's wood is dead");
    if (!r.ok) throw new Error(r.errors[0]);
  }
  count.succulents = paint("succulents", "Succulent", (i) => dry(i) && b.heights[i] === UPLAND && n(i, 22, 9) > 0.15, 0.25, 29, "Succulents on the dry upland");
  log(`  planted: ${Object.entries(count).map(([k, v]) => `${k} ${v}`).join(", ")}`);
}

function spreadFrom(pick: (i: number) => boolean, max: number): Int16Array {
  const d = new Int16Array(N).fill(99);
  let q: number[] = [];
  for (let i = 0; i < N; i++) if (pick(i)) (d[i] = 0), q.push(i);
  for (let step = 1; step <= max && q.length; step++) {
    const next: number[] = [];
    for (const i of q) {
      const x = i % W;
      for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < N && Math.abs((j % W) - x) <= 1 && d[j] > step) (d[j] = step), next.push(j);
    }
    q = next;
  }
  return d;
}

function woodReport(s: MapSession): void {
  const LOGS: Record<string, number> = { Oak: 8, Pine: 2, Birch: 1 };
  let living = 0;
  let dead = 0;
  let logs = 0;
  let berries = 0;
  for (const e of s.built.entities) {
    if (e.template === "BlueberryBush") berries++;
    if (LOGS[e.template] === undefined) continue;
    if ((e.components as { LivingNaturalResource?: { IsDead?: boolean } }).LivingNaturalResource?.IsDead === true) dead++;
    else (living++), (logs += LOGS[e.template]);
  }
  log(`  wood: ${living} living trees (${Math.round((living * 10000) / N)} per 10,000 tiles), ${dead} dead, ${logs} logs when grown; ${berries} berry bushes`);
}

// ------------------------------------------------------------------------------------------------ how it plays

const greenNow = (s: MapSession): Uint8Array => {
  const b = s.built;
  const g = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (b.water[i] > 0.05 || b.moisture[i] > 0) g[i] = 1;
  return g;
};

/** The ladder: each work done in turn on this session after the round is saved, the water settled, and the tiles
 *  that turn green or wet counted (and those that dry), the upland and the lowland apart. */
function ladder(s: MapSession, land: Land): void {
  const count = (g: Uint8Array, pick: (i: number) => boolean) => {
    let c = 0;
    for (let i = 0; i < N; i++) if (g[i] && pick(i)) c++;
    return c;
  };
  let prev = greenNow(s);
  const up = (i: number) => !lowland(i);
  log(`ladder: day 1 green or wet ${count(prev, () => true)} tiles (${((100 * count(prev, () => true)) / N).toFixed(1)} %): the upland ${count(prev, up)}, the lowland ${count(prev, lowland)}`);
  const dam = (level: number, label: string) => {
    const cells: number[] = [];
    for (let y = DAM_Y[0]; y <= DAM_Y[1]; y++) for (let x = MOUTH_X[0]; x <= MOUTH_X[1]; x++) cells.push(y * W + x);
    const set = new Set(cells);
    applyOps(s, [{ op: "sculpt", params: { mode: "flatten", cells: runsWhere((i) => set.has(i)), level, exact: true }, label }]);
  };
  const step = (rung: string, name: string, act: () => void) => {
    act();
    const g = greenNow(s);
    let moreUp = 0;
    let moreLow = 0;
    let lessUp = 0;
    let lessLow = 0;
    for (let i = 0; i < N; i++) {
      if (g[i] && !prev[i]) lowland(i) ? moreLow++ : moreUp++;
      if (!g[i] && prev[i]) lowland(i) ? lessLow++ : lessUp++;
    }
    const w = readWater(s, land);
    log(`  ${rung}: ${name}: the upland +${moreUp}${lessUp ? `/-${lessUp}` : ""}, the lowland +${moreLow}${lessLow ? `/-${lessLow}` : ""} [spring ${w.spring}; spillway ${w.spillway}; plain ${w.plain}]`);
    prev = g;
  };
  step("medium", "a weir before the sink (10 tiles, a level over the bed, to 11)", () => dam(BED + 1, "A weir before the sink"));
  step("medium", "the weir raised to the valley floor (12)", () => dam(PLAIN, "The weir raised"));
  step("large", "the catch: the dam to 14 (the rise's level)", () => dam(RISE, "The catch"));
  log(`  after every work: ${((100 * count(prev, () => true)) / N).toFixed(1)} % green or wet`);
}

/** The start's water through a badtide (the editor's own hazard model on the settled water), with the pool's inlet
 *  shut by a levee to the valley floor while the water is clean, and left open. */
function neckBadtide(s: MapSession, land: Land, days: number): void {
  const b0 = s.built;
  const full = { depth: Float64Array.from(b0.water), contamination: Float64Array.from(b0.contamination), stack: (b0.settle as unknown as { stack?: unknown }).stack ?? null };
  const poolBad = (levee: boolean) => {
    // (the map settles again with the levee, so the run's water model has it; the hazard runs from the water as it
    // stood before, the inlet's taken out: the pool cut off keeps the water it had)
    const depth = Float64Array.from(full.depth);
    if (levee) {
      applyOps(s, [{ op: "sculpt", params: { mode: "flatten", cells: runsWhere((i) => NECK.includes(i)), level: PLAIN, exact: true }, label: "A levee on the pool's inlet" }]);
      for (const i of NECK) depth[i] = 0;
    }
    const b = s.built;
    const run = new HazardRun(b.waterModel, { depth, contamination: full.contamination, stack: full.stack } as never, "badtide", days);
    const out: string[] = [];
    const tiles = [...land.pool.keys()].filter((i) => land.pool[i] && !NECK.includes(i));
    for (let d = 1; d <= days; d++) {
      run.step(TICKS_PER_DAY);
      const w = run.water();
      let wv = 0;
      let bad = 0;
      for (const i of tiles) (wv += w.depth[i]), (bad += w.depth[i] * w.contamination[i]);
      if (d === 1 || d === days) out.push(`day ${d}: ${wv.toFixed(1)} of water, ${wv > 0 ? ((100 * bad) / wv).toFixed(0) : "-"} % bad`);
    }
    run.dispose();
    if (levee) s.undo();
    return out.join("; ");
  };
  log(`  the start's pool in a badtide of ${days} days: open ${poolBad(false)}; its inlet shut by a levee ${poolBad(true)}`);
}

/** Where the settled water still moves: a badtide (the water flowing on as it is, only its colour changing) run two
 *  days from the settle, and the tiles whose surface water moved by more than 0.02, by region. */
function drift(s: MapSession): void {
  const b = s.built;
  const run = new HazardRun(b.waterModel, { depth: b.water, contamination: b.contamination, stack: (b.settle as unknown as { stack?: unknown }).stack ?? null } as never, "badtide", 2);
  run.step(2 * TICKS_PER_DAY);
  const w = run.water();
  const moved: number[] = [];
  for (let i = 0; i < N; i++) if (Math.abs(w.depth[i] - b.water[i]) > 0.02) moved.push(i);
  run.dispose();
  const box = (t: number[]) => (t.length ? `X ${Math.min(...t.map((i) => i % W))}-${Math.max(...t.map((i) => i % W))} Y ${Math.min(...t.map((i) => Math.floor(i / W)))}-${Math.max(...t.map((i) => Math.floor(i / W)))}` : "");
  const top = moved.slice().sort((a, c) => Math.abs(w.depth[c] - b.water[c]) - Math.abs(w.depth[a] - b.water[a])).slice(0, 8);
  log(`  drift over two more days: ${moved.length} tiles moved more than 0.02 (${box(moved)}); most: ${top.map((i) => `(${i % W}, ${Math.floor(i / W)}) ${b.water[i].toFixed(2)} to ${w.depth[i].toFixed(2)}`).join(", ")}`);
}

/** The map's own words (600 characters at most). */
const DESCRIPTION =
  "The river crosses the dry upland and vanishes into the swallow hole under the hill at your door. It runs underground and comes out as a spring at the foot of the escarpment, the lowland's one water. " +
  "Catch it: a weir before the sink waters the valley, a dam turns the valley into a lake, and the spring below runs dry until the lake spills over the old fall. " +
  "Before the first badtide, shut the inlet of the pool by your rise: it keeps clean water.";

/** The cameras of our own view (tools/showcase/capture.ts): the game's first frame and its widest. */
function writeShots(s: MapSession): void {
  const st = startOf(s);
  const deg = Math.PI / 180;
  const opening = (c: ReturnType<typeof openingCamera>) => ({ yaw: -35 * deg, pitch: 60 * deg, distance: c.distance, target: [c.target[0], c.target[2], c.target[1]] });
  writeFileSync(join(OUT, `${ROUND}-shots.json`), JSON.stringify([
    { name: "first", label: "The game's first frame (its own camera)", view: opening(openingCamera(st)) },
    { name: "widest", label: "The game's first camera pulled back to its widest", view: opening(openingCamera(st, VISTA_ZOOM)) },
  ], null, 1));
}

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
  buildRamp(s);
  firstFrame(s);
  placeSources(s);
  lap("sources and settle");
  printWater("as built", readWater(s, land));
  log(`    settle: ${(s.built.settle as unknown as { ticks: number }).ticks} ticks, settled ${(s.built.settle as unknown as { settled: boolean }).settled}`);
  if (has("drift")) drift(s);
  if (!has("bare")) {
    plant(s, land);
    woodReport(s);
    lap("plants");
  }
  {
    const reach = walkFromStart(s);
    const st = startOf(s);
    const walk = (pick: (i: number) => boolean) => {
      let best = Infinity;
      for (let i = 0; i < N; i++) if (pick(i)) for (const j of [i - 1, i + 1, i - W, i + W]) if (j >= 0 && j < N && reach[j] < best) best = reach[j];
      return Number.isFinite(best) ? `${Math.round(best)} tiles` : "no walk";
    };
    log(`  walk from the start (${st.x}, ${st.y}, level ${st.z}): to its pool ${walk((i) => land.pool[i] === 1)}, to the last reach's bank ${walk((i) => (i % W) === MOUTH_X[0] - 1 && Math.floor(i / W) >= REACH_Y0 && Math.floor(i / W) < BUTTRESS_Y0)}, to the notch ${walk((i) => land.channel[i] === 1 && Math.floor(i / W) < escY(i % W) + 6)}`);
  }
  applyOps(s, [{ op: "setDescription", params: { text: DESCRIPTION } }]);
  writePicture(join(OUT, `${ROUND}-map.png`), s, land);
  saveMap(s, ROUND);
  if (has("save")) writeShots(s);
  lap("saved");
  if (has("game")) compareGame(arg("game", ""), s, land);
  if (has("weather")) {
    neckBadtide(s, land, 8);
    lap("the neck's badtide");
  }
  if (has("dam")) {
    const dam = new Set<number>();
    for (let y = DAM_Y[0]; y <= DAM_Y[1]; y++) for (let x = MOUTH_X[0]; x <= MOUTH_X[1]; x++) dam.add(y * W + x);
    applyOps(s, [{ op: "sculpt", params: { mode: "flatten", cells: runsWhere((i) => dam.has(i)), level: RISE, exact: true }, label: "The catch: a dam before the sink" }]);
    lap("the dam and settle");
    if (has("drift")) drift(s);
    printWater(`with the dam (${dam.size} tiles to ${RISE})`, readWater(s, land));
    log(`    settle: ${(s.built.settle as unknown as { ticks: number }).ticks} ticks, settled ${(s.built.settle as unknown as { settled: boolean }).settled}`);
    writePicture(join(OUT, `${ROUND}-dam-map.png`), s, land);
    saveMap(s, `${ROUND}-dam`);
    if (has("game-dam")) compareGame(arg("game-dam", ""), s, land);
    s.undo();
  }
  if (has("ladder")) {
    ladder(s, land);
    lap("the ladder");
  }
}

main();
