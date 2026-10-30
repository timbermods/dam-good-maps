// Water per column (3D view, part 4; D280 (2)): on a map with terrain above terrain a tile can hold water at
// several levels (a cave's pool under the lake on its roof, a river through a tunnel under a dry hill, water
// under an arch), each column standing on its own floor and never above its ceiling (the stacked engine's
// slots, sim/stackWater.ts; the file's own water likewise). The water mesher draws a column by looking at the
// tiles round it (waterMesh.ts: its shores, curtains, corners, falls and the badwater's blend), so what a
// column sees round it must be the water and ground at its own level: for a cave's pool, the cave's floor and
// walls and the cave's water beside it, never the lake on the roof above or the roof's own ground.
//
// What a column sees at a tile is one air gap of that tile's column (an air span between two solid runs, or
// the open one above its top): the gap holding the column's surface (a hair under it, and never above its
// ceiling); where rock stands there, the lowest gap above it still under the column's ceiling; where rock
// stands up to the ceiling, a wall (`WALL`: the water meets rock, a shore). On a plain tile that is its one
// gap, its top, whatever the level, unless the column is under a roof lower than that top (a wall). So on a
// map without terrain above terrain every column sees exactly what the heightfield mesher saw, and the map
// draws exactly as before (`plainLayers`; tests/unit/waterLayers.test.ts).
//
// The mesher reads per-tile arrays, so the columns are dealt into layers: in each, every tile holds one gap,
// and every column drawn in it sees, within `LAYER_REACH` tiles, exactly the gaps it would resolve itself. The
// first layer is the open sky's (each tile's top and the water on it), as the heightfield mesher had it; every
// column under a roof, and an open one whose view round a cave differs from that, goes into the first other
// layer that agrees with its view (a new one where none does). A column's mesh depends only on what it sees,
// never on which layer holds it, so a chunk is meshed again only where the water within reach of it changed
// (`changedColumnChunks`). Where no column needs a layer of its own (`needsLayers`: no water under a roof, none
// beside one), the map's water is drawn as a heightfield's, with its moving water meshed in the workers.
//
// Pure TypeScript, no three.js: the water mesh workers deal and mesh it too (waterMesh.worker.ts).

import { CHUNK } from "./mesh";
import { LAYERS, type SurfaceWater, type WaterView } from "./model";

/** The ground a column sees where rock stands at its level: higher than any water. */
export const WALL = 255;

/** How far round a column (tiles, either way) its mesh reads the water and ground: a fall's lips and their ends,
 *  their pools and outflows (four), and the badwater's blend round them (three more, less what overlaps). */
export const LAYER_REACH = 4;

export interface WaterLayer {
  /** The water seen from this layer at each tile (NaN where none), `top` its column in the view. */
  sw: SurfaceWater;
  /** The ground seen from it at each tile: the floor of the gap it sees there, `WALL` where it sees rock. */
  ground: Uint8Array;
  /** Tiles whose water this layer draws (1); null: every wet tile. */
  own: Uint8Array | null;
  /** Chunks this layer draws water in (`cy · ⌈W / CHUNK⌉ + cx`, 1); null: every chunk. */
  chunks: Uint8Array | null;
}

/** A map without terrain above terrain: one layer, its surface water on its heights. */
export function plainLayers(heights: Uint8Array, sw: SurfaceWater): WaterLayer[] {
  return [{ sw, ground: heights, own: null, chunks: null }];
}

/** The top of the open gap (the sky). */
const SKY = 99;
/** A view's key for a wall. */
const ROCK = -2;
const UNSET = -1;

/** The air gaps of a map's columns, made once for them (they change only when an edit reshapes a roof) and kept:
 *  tile i's [bottom, top) pairs, bottom up, the last open to the sky (`SKY`), from gapAt[i] (−1: a plain tile) to
 *  gapEnd[i] in `gaps`; and the highest ceiling of a gap under a roof within `R` tiles of each tile (`nearRoof`). */
export interface WaterGaps {
  W: number;
  R: number;
  gapAt: Int32Array;
  gapEnd: Int32Array;
  gaps: Int16Array;
  tiles: Int32Array;
  nearRoof: Uint8Array;
}

const gapsKept = new WeakMap<object, WaterGaps[]>();

/** The gaps of `columns` (tile → its 23 voxels, 1 solid, for the tiles that are not one plain run from the
 *  bottom), kept with that map of columns. */
export function waterGaps(W: number, H: number, columns: ReadonlyMap<number, ArrayLike<number>>, R = LAYER_REACH): WaterGaps {
  const kept = gapsKept.get(columns);
  const found = kept?.find((g) => g.R === R && g.W === W && g.gapAt.length === W * H);
  if (found) return found;
  const N = W * H;
  const gapAt = new Int32Array(N).fill(-1);
  const gapEnd = new Int32Array(N);
  const flat: number[] = [];
  const tiles: number[] = [];
  for (const [i, v] of columns) {
    tiles.push(i);
    gapAt[i] = flat.length;
    let z = 0;
    while (z < LAYERS) {
      if (v[z]) {
        z++;
        continue;
      }
      const b = z;
      while (z < LAYERS && !v[z]) z++;
      flat.push(b, z >= LAYERS ? SKY : z);
    }
    if (flat.length === gapAt[i] || flat[flat.length - 1] !== SKY) flat.push(LAYERS, SKY);
    gapEnd[i] = flat.length;
  }
  const gaps = Int16Array.from(flat);
  // a column on the open gap (seeing from z, under the sky) sees a tile's top unless z is under that tile's highest
  // roof's ceiling (then it sees into the air under the roof); so it sees what the heightfield mesher saw if z stands
  // above every such ceiling within reach: their highest, over the tiles within R of each tile
  const roofed = new Uint8Array(N);
  for (const i of tiles) {
    const end = gapEnd[i];
    // (the highest gap under a roof: the one before the open one)
    if (end - gapAt[i] >= 4) roofed[i] = gaps[end - 3];
  }
  const g: WaterGaps = { W, R, gapAt, gapEnd, gaps, tiles: Int32Array.from(tiles), nearRoof: maxWithin(W, H, roofed, R) };
  if (kept) kept.push(g);
  else gapsKept.set(columns, [g]);
  return g;
}

/** The gap (its floor) tile j shows a column at level z under ceiling c: the gap holding z; where rock stands at z,
 *  the lowest gap above it whose floor is under c; else rock. */
function resolve(g: WaterGaps, heights: Uint8Array, j: number, z: number, c: number): number {
  const q0 = g.gapAt[j];
  if (q0 < 0) {
    const h = heights[j];
    return z >= h || h < c ? h : ROCK;
  }
  const gaps = g.gaps;
  for (let q = q0, end = g.gapEnd[j]; q < end; q += 2) {
    const b = gaps[q];
    if (z < b) return b < c ? b : ROCK;
    if (z < gaps[q + 1]) return b;
  }
  return ROCK;
}

function ceilingOf(g: WaterGaps, j: number, b: number): number {
  const q0 = g.gapAt[j];
  if (q0 >= 0) for (let q = q0, end = g.gapEnd[j]; q < end; q += 2) if (g.gaps[q] === b) return g.gaps[q + 1] === SKY ? Infinity : g.gaps[q + 1];
  return Infinity;
}

/** Whether any column of `view` needs a layer of its own: water under a roof, or open water beside one that sees
 *  into the air under it. Without, the map's water is a heightfield's (`plainLayers`). Cheap: only the columns on
 *  or near a tile that is not plain are looked at. */
export function needsLayers(W: number, H: number, heights: Uint8Array, columns: ReadonlyMap<number, ArrayLike<number>>, view: WaterView): boolean {
  if (!columns.size) return false;
  const g = waterGaps(W, H, columns);
  for (let k = 0; k < view.count; k++) {
    const i = view.tile[k];
    if (g.gapAt[i] < 0 && g.nearRoof[i] === 0) continue;
    const f = view.floor[k];
    if (resolve(g, heights, i, f + 0.0005, Infinity) !== heights[i]) return true;
    if (Math.max(f + 0.0005, f + view.depth[k] - 0.01) < g.nearRoof[i]) return true;
  }
  return false;
}

/** The water of `view` dealt into layers over the terrain (`columns`: tile → its 23 voxels, 1 solid, for the
 *  tiles that are not one plain run from the bottom). `sw` is the view's surface water as the renderer holds it
 *  (`surfaceWater`, ridden onto new land: a tile's open column is drawn where `sw` has it); on a map where no
 *  column needs a layer of its own it is the only layer (`plainLayers`). */
export function waterLayers(W: number, H: number, heights: Uint8Array, columns: ReadonlyMap<number, ArrayLike<number>>, view: WaterView, sw: SurfaceWater, R = LAYER_REACH): WaterLayer[] {
  if (!columns.size) return plainLayers(heights, sw);
  const N = W * H;
  const g = waterGaps(W, H, columns, R);
  // each wet column's gap (the one holding its floor, or the first above it where the land rose under it) and
  // what it sees from: a hair under its surface, never above its ceiling, never below its floor
  const n = view.count;
  const gapOf = new Int16Array(n);
  const refZ = new Float64Array(n);
  const refC = new Float64Array(n);
  /** The columns under a roof on each tile, a list through `nextIn` (−1: none). */
  const firstIn = new Int32Array(N).fill(-1);
  const nextIn = new Int32Array(n).fill(-1);
  /** The column on each tile's open gap (−1: none). */
  const openCol = new Int32Array(N).fill(-1);
  for (let k = 0; k < n; k++) {
    const i = view.tile[k];
    const f = view.floor[k];
    const b = resolve(g, heights, i, f + 0.0005, Infinity);
    gapOf[k] = b;
    const c = ceilingOf(g, i, b);
    refC[k] = c;
    refZ[k] = Math.max(f + 0.0005, Math.min(f + view.depth[k], c) - 0.01);
    if (b === heights[i]) {
      const o = openCol[i];
      if (o < 0 || view.floor[o] < f) openCol[i] = k;
      continue;
    }
    nextIn[k] = firstIn[i];
    firstIn[i] = k;
  }
  /** The wet column standing in gap b of tile j, −1 where none. */
  const waterIn = (j: number, b: number): number => {
    if (b === heights[j]) return openCol[j];
    let best = -1;
    for (let k = firstIn[j]; k >= 0; k = nextIn[k]) if (gapOf[k] === b && (best < 0 || view.floor[best] < view.floor[k])) best = k;
    return best;
  };
  const nearRoof = g.nearRoof;
  // the open sky's layer: every tile's top and the water on it; a column on it near a roof stays only if it sees the
  // same round it
  const own0 = new Uint8Array(N);
  let moved = false;
  const rest: number[] = [];
  for (let k = 0; k < n; k++) {
    const i = view.tile[k];
    if (openCol[i] !== k) {
      // (a second column in one gap, which no settle gives: the higher one stands for both)
      if (gapOf[k] !== heights[i] && waterIn(i, gapOf[k]) === k) rest.push(k);
      continue;
    }
    if (refZ[k] >= nearRoof[i]) own0[i] = 1;
    else {
      moved = true;
      rest.push(k);
    }
  }
  // (a plain map's water stood on its surface as the renderer rode it onto new land: it is the one layer)
  if (!rest.length) return plainLayers(heights, sw);
  rest.sort((a, b) => view.tile[a] - view.tile[b] || gapOf[a] - gapOf[b]);
  // the other layers: each column into the first whose gaps agree with what it sees within reach
  const keys: Int16Array[] = [];
  const owns: Uint8Array[] = [];
  /** The tiles each layer holds gaps for: [x0, y0, x1, y1]. */
  const boxes: number[][] = [];
  const seen = new Int16Array((2 * R + 1) * (2 * R + 1));
  /** Whether `key` agrees with `seen` over the tiles x0..x1 by y0..y1. */
  const fits = (key: Int16Array, x0: number, y0: number, x1: number, y1: number): boolean => {
    let q = 0;
    for (let yy = y0; yy <= y1; yy++)
      for (let j = yy * W + x0, end = yy * W + x1; j <= end; j++, q++) {
        const e = key[j];
        if (e !== UNSET && e !== seen[q]) return false;
      }
    return true;
  };
  // (what a column sees depends on its level only through the level's floor, the gaps' bounds being whole levels: a
  // column seeing as the one just west of it, in the same layer, sees the same there, and only the column of tiles
  // newly in reach on its east is looked at)
  let last = 0;
  let lastTile = -2;
  let lastClass = -1;
  for (const k of rest) {
    const i = view.tile[k];
    const x = i % W;
    const y = (i - x) / W;
    const x0 = Math.max(0, x - R);
    const x1 = Math.min(W - 1, x + R);
    const y0 = Math.max(0, y - R);
    const y1 = Math.min(H - 1, y + R);
    const z = refZ[k];
    const c = refC[k];
    const cls = Math.floor(z) * 64 + (c === Infinity ? 63 : c);
    if (i === lastTile + 1 && x > 0 && cls === lastClass) {
      lastTile = i;
      if (x + R > W - 1) {
        owns[last][i] = 1;
        continue;
      }
      let m = 0;
      for (let yy = y0; yy <= y1; yy++) seen[m++] = resolve(g, heights, yy * W + x1, z, c);
      const key = keys[last];
      let ok = true;
      for (let yy = y0, q = 0; yy <= y1; yy++, q++) {
        const e = key[yy * W + x1];
        if (e !== UNSET && e !== seen[q]) {
          ok = false;
          break;
        }
      }
      if (ok) {
        for (let yy = y0, q = 0; yy <= y1; yy++, q++) key[yy * W + x1] = seen[q];
        const box = boxes[last];
        if (box[2] < x1) box[2] = x1;
        owns[last][i] = 1;
        continue;
      }
    }
    lastTile = i;
    lastClass = cls;
    // what it sees round it, once
    let m = 0;
    for (let yy = y0; yy <= y1; yy++) for (let j = yy * W + x0, end = yy * W + x1; j <= end; j++) seen[m++] = resolve(g, heights, j, z, c);
    // (the layer the last column went into first: the next along its row is most often the same water)
    let L = last < keys.length && fits(keys[last], x0, y0, x1, y1) ? last : -1;
    if (L < 0) for (L = 0; L < keys.length && !fits(keys[L], x0, y0, x1, y1); L++);
    if (L === keys.length) {
      keys.push(new Int16Array(N).fill(UNSET));
      owns.push(new Uint8Array(N));
      boxes.push([x0, y0, x1, y1]);
    }
    const box = boxes[L];
    box[0] = Math.min(box[0], x0);
    box[1] = Math.min(box[1], y0);
    box[2] = Math.max(box[2], x1);
    box[3] = Math.max(box[3], y1);
    last = L;
    const key = keys[L];
    m = 0;
    for (let yy = y0; yy <= y1; yy++) for (let j = yy * W + x0, end = yy * W + x1; j <= end; j++) key[j] = seen[m++];
    owns[L][i] = 1;
  }
  const nx = Math.ceil(W / CHUNK);
  const ny = Math.ceil(H / CHUNK);
  const chunksOf = (own: Uint8Array, box: readonly number[]): Uint8Array => {
    const c = new Uint8Array(nx * ny);
    for (let y = box[1]; y <= box[3]; y++) for (let x = box[0]; x <= box[2]; x++) if (own[y * W + x]) c[Math.floor(y / CHUNK) * nx + Math.floor(x / CHUNK)] = 1;
    return c;
  };
  const layers: WaterLayer[] = [];
  // the first: the open sky's, as the renderer's surface water has it where every tile's top is its only water
  // (the renderer's surface water, its open columns only: a tile whose highest water is under a roof has none here)
  const first: SurfaceWater = { surface: sw.surface.slice(), floor: sw.floor.slice(), depth: sw.depth.slice(), contamination: sw.contamination.slice(), top: sw.top.slice(), outflow: view.outflow ?? null, lower: [] };
  for (const k of rest) {
    const i = view.tile[k];
    if (first.top[i] !== k) continue;
    first.top[i] = openCol[i];
    if (openCol[i] >= 0) continue;
    first.surface[i] = NaN;
    first.floor[i] = NaN;
    first.depth[i] = 0;
    first.contamination[i] = 0;
  }
  layers.push({ sw: first, ground: heights, own: moved ? own0 : null, chunks: null });
  for (let L = 0; L < keys.length; L++) {
    const key = keys[L];
    const box = boxes[L];
    const ground = new Uint8Array(N).fill(WALL);
    for (let y = box[1]; y <= box[3]; y++) for (let j = y * W + box[0], end = y * W + box[2]; j <= end; j++) if (key[j] >= 0) ground[j] = key[j];
    const lsw = surfaceOn(W, H, view, sw, (j) => (key[j] >= 0 ? waterIn(j, key[j]) : -1), refC, box);
    layers.push({ sw: lsw, ground, own: owns[L], chunks: chunksOf(owns[L], box) });
  }
  return layers;
}

/** A layer's surface water: each tile's column `colAt(j)` (−1: none) of the view, over the tiles of `box`
 *  ([x0, y0, x1, y1]; none elsewhere): where it is the renderer's surface water's column there, as that has it
 *  (ridden onto new land), and never above its ceiling (`ceiling`, by column). */
function surfaceOn(W: number, H: number, view: WaterView, sw: SurfaceWater, colAt: (j: number) => number, ceiling: Float64Array, box: readonly number[]): SurfaceWater {
  const N = W * H;
  const surface = new Float32Array(N).fill(NaN);
  const floor = new Float32Array(N).fill(NaN);
  const depth = new Float32Array(N);
  const contamination = new Float32Array(N);
  const top = new Int32Array(N).fill(-1);
  for (let y = box[1]; y <= box[3]; y++)
    for (let j = y * W + box[0], end = y * W + box[2]; j <= end; j++) {
      const k = colAt(j);
      if (k < 0) continue;
      top[j] = k;
      contamination[j] = view.contamination[k];
      if (sw.top[j] === k && ceiling[k] === Infinity) {
        floor[j] = sw.floor[j];
        depth[j] = sw.depth[j];
        surface[j] = sw.surface[j];
        continue;
      }
      const f = view.floor[k];
      const d = Math.min(view.depth[k], ceiling[k] - f);
      floor[j] = f;
      depth[j] = d;
      surface[j] = f + d;
    }
  return { surface, floor, depth, contamination, top, outflow: view.outflow ?? null, lower: [] };
}

/** The land under water changed and `sw` rode it (waterMesh.ts `rideLand`), or a held day's water was kept on it
 *  (`holdLand`), over the tiles of `rect`: the layers' open columns there follow it, as they were made from it. */
export function rideLayers(W: number, layers: readonly WaterLayer[], sw: SurfaceWater, rect: { x0: number; y0: number; x1: number; y1: number }): void {
  const H = sw.surface.length / W;
  for (const l of layers) {
    if (l.sw === sw) continue;
    for (let y = Math.max(0, rect.y0); y <= Math.min(H - 1, rect.y1); y++)
      for (let j = y * W + Math.max(0, rect.x0), end = y * W + Math.min(W - 1, rect.x1); j <= end; j++) {
        const k = l.sw.top[j];
        if (k < 0 || sw.top[j] !== k) continue;
        l.sw.floor[j] = sw.floor[j];
        l.sw.depth[j] = sw.depth[j];
        l.sw.surface[j] = sw.surface[j];
      }
  }
}

/** The land changed over `rect` (a stroke): the other layers' view of its plain tiles follows their new tops, as a
 *  column there sees the top (a tile it saw as rock stays so until the water worked out on the new land comes). */
export function followLand(W: number, layers: readonly WaterLayer[], heights: Uint8Array, columns: ReadonlyMap<number, unknown>, rect: { x0: number; y0: number; x1: number; y1: number }): void {
  const H = heights.length / W;
  for (let L = 1; L < layers.length; L++) {
    const ground = layers[L].ground;
    for (let y = Math.max(0, rect.y0); y <= Math.min(H - 1, rect.y1); y++)
      for (let j = y * W + Math.max(0, rect.x0), end = y * W + Math.min(W - 1, rect.x1); j <= end; j++) if (ground[j] !== WALL && !columns.has(j)) ground[j] = heights[j];
  }
}

/** Chunks whose water a change from view `a` to view `b` reaches (a map with water in layers): every tile whose
 *  columns differ (their count, floor, depth, badwater share or outflows), and the chunks within `LAYER_REACH` of it,
 *  since a column's mesh reads only what is within that reach. */
export function changedColumnChunks(W: number, H: number, a: WaterView, b: WaterView): Set<string> {
  const N = W * H;
  const first = (v: WaterView) => {
    const f = new Int32Array(N + 1);
    for (let k = 0; k < v.count; k++) f[v.tile[k] + 1]++;
    for (let i = 0; i < N; i++) f[i + 1] += f[i];
    return f;
  };
  // (the views list each tile's columns together, in the same order frame to frame: compared in place, a tile
  // listed apart counts as changed)
  const sorted = (v: WaterView) => {
    for (let k = 1; k < v.count; k++) if (v.tile[k] < v.tile[k - 1]) return false;
    return true;
  };
  const nx = Math.ceil(W / CHUNK);
  const ny = Math.ceil(H / CHUNK);
  const dirty = new Uint8Array(nx * ny);
  const R = LAYER_REACH;
  const mark = (i: number) => {
    const x = i % W;
    const y = (i - x) / W;
    for (let cy = Math.floor(Math.max(0, y - R) / CHUNK); cy <= Math.floor(Math.min(H - 1, y + R) / CHUNK); cy++)
      for (let cx = Math.floor(Math.max(0, x - R) / CHUNK); cx <= Math.floor(Math.min(W - 1, x + R) / CHUNK); cx++) dirty[cy * nx + cx] = 1;
  };
  if (!sorted(a) || !sorted(b)) dirty.fill(1);
  else {
    const fa = first(a);
    const fb = first(b);
    const oa = a.outflow;
    const ob = b.outflow;
    for (let i = 0; i < N; i++) {
      const na = fa[i + 1] - fa[i];
      const nb = fb[i + 1] - fb[i];
      if (!na && !nb) continue;
      let same = na === nb;
      for (let q = 0; q < na && same; q++) {
        const ka = fa[i] + q;
        const kb = fb[i] + q;
        if (a.floor[ka] !== b.floor[kb] || a.depth[ka] !== b.depth[kb] || a.contamination[ka] !== b.contamination[kb]) same = false;
        else if (!oa !== !ob) same = false;
        else if (oa && ob) for (let c = 0; c < 4; c++) if (oa[ka * 4 + c] !== ob[kb * 4 + c]) same = false;
      }
      if (!same) mark(i);
    }
  }
  const out = new Set<string>();
  for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) if (dirty[cy * nx + cx]) out.add(`${cx},${cy}`);
  return out;
}

/** The largest of `v` within r tiles (either way, a square) of each tile. */
function maxWithin(W: number, H: number, v: Uint8Array, r: number): Uint8Array {
  const rows = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let m = 0;
      for (let xx = Math.max(0, x - r), end = Math.min(W - 1, x + r); xx <= end; xx++) if (v[y * W + xx] > m) m = v[y * W + xx];
      rows[y * W + x] = m;
    }
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let m = 0;
      for (let yy = Math.max(0, y - r), end = Math.min(H - 1, y + r); yy <= end; yy++) if (rows[yy * W + x] > m) m = rows[yy * W + x];
      out[y * W + x] = m;
    }
  return out;
}
