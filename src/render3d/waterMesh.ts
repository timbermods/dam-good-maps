// Water surfaces (PLAN §14.2: "water surfaces as translucent quads at depth"), meshed per chunk
// like the terrain. Each wet tile gets a flat quad at its surface. Where it pours over a side into
// water at least FALL_MIN lower, a fall leaves the lip and arcs down into it (falls.ts, D201: the
// chunk's falls are listed with its water); where a neighbour's ground, or its water just below, is
// lower, a curtain hangs from the surface down to it, the water's side. Water in caves (below a
// tile's surface water) gets its top quad only. Each vertex carries a depth and badwater share,
// which the shader turns into colour and opacity (Map look, D86: a top's corners share depth with
// the tiles round the corner, so the water thins toward the shore; D177: the badwater share is
// blended over the connected water a few tiles round, then shared at the corners too, so where
// badwater meets clean water the colour turns in a soft gradient over several tiles, never tile by
// tile), and flags for the foam: which sides of a top meet the shore, which take a fall from higher
// water, and which a fall leaves over.

import { FALL_MIN, FALL_STRIDE, pushFall } from "./falls";
import { CHUNK } from "./mesh";
import type { SurfaceWater, WaterView } from "./model";

/** Foam flags of a water top: bits 0–3 the sides (east, west, north, south) where it meets the
 *  shore, bits 4–7 the sides where a fall comes down into it (its whitewater is the fall's splash),
 *  bits 8–11 the sides a fall leaves over (a line of foam along the brink). A curtain's flags are
 *  its drop (`dropFlags`); the map's edge has none. */
export const SHORE_BITS = [1, 2, 4, 8] as const;
export const FALL_IN_BITS = [16, 32, 64, 128] as const;
export const LIP_BITS = [256, 512, 1024, 2048] as const;

export interface WaterMeshData {
  positions: Float32Array;
  /** depth, contamination per vertex. */
  data: Float32Array;
  /** Foam flags per vertex (SHORE_BITS, FALL_IN_BITS, LIP_BITS). */
  flags: Float32Array;
  /** Axis normal per vertex. */
  normals: Int8Array;
  indices: Uint32Array;
  quads: number;
  /** The chunk's falls, FALL_STRIDE floats each (falls.ts `pushFall`), and how many. */
  falls: Float32Array;
  fallCount: number;
  /** Its bounding sphere (x, y, z, radius), when made beside it (the water worker). */
  sphere?: Float64Array;
}

class WaterBuffer {
  pos: number[] = [];
  data: number[] = [];
  nrm: number[] = [];
  flg: number[] = [];
  quads = 0;
  /** The falls (falls.ts `pushFall`), FALL_STRIDE floats each. */
  falls: number[] = [];
  quad(c: number[], depth: number, cont: number, nx: number, ny: number, nz: number, flags = 0): void {
    this.quad4(c, [depth, depth, depth, depth], [cont, cont, cont, cont], nx, ny, nz, flags);
  }
  /** A quad with its own depth and badwater share at each corner. */
  quad4(c: number[], depth: readonly number[], cont: readonly number[], nx: number, ny: number, nz: number, flags = 0): void {
    for (let k = 0; k < 12; k++) this.pos.push(c[k]);
    for (let v = 0; v < 4; v++) {
      this.data.push(depth[v], cont[v]);
      this.nrm.push(nx * 127, ny * 127, nz * 127);
      this.flg.push(flags);
    }
    this.quads++;
  }
  finish(): WaterMeshData {
    const n = this.quads;
    const indices = new Uint32Array(n * 6);
    for (let q = 0; q < n; q++) {
      const v = q * 4;
      indices.set([v, v + 1, v + 2, v, v + 2, v + 3], q * 6);
    }
    const falls = new Float32Array(this.falls);
    return { positions: new Float32Array(this.pos), data: new Float32Array(this.data), flags: new Float32Array(this.flg), normals: new Int8Array(this.nrm), indices, quads: n, falls, fallCount: falls.length / FALL_STRIDE };
  }
}

/** Lower than this below the surface, a neighbour gets a curtain. */
const STEP = 0.02;
/** Water within this of a tile's surface is the same water: it shares depth and badwater at the
 *  corners, and the badwater blend reaches across it. */
const SAME_WATER = 0.35;
/** Higher than this above the surface, a neighbour's water falls into a tile: a fall. */
const FALL = FALL_MIN;

/** How the badwater share is blended between tiles (D177): a binomial kernel along rows, then
 *  along columns, from the tile itself out to 3 tiles away. A clean/bad front becomes a gradient
 *  over about six tiles (four for the middle of it), no step between neighbouring tiles above a
 *  third of the way. */
export const BLEND_KERNEL = [20, 15, 6, 1] as const;

const blends = new WeakMap<SurfaceWater, Float32Array>();

/** The badwater share of each tile's surface water blended over the connected water round it
 *  (`BLEND_KERNEL`): each tile's share averaged with its neighbours' out to 3 tiles along the row,
 *  then along the column, over water at its own level (within `SAME_WATER`) that reaches it without
 *  crossing dry ground or a fall, the kernel's weights shared among the tiles it reaches. Clean
 *  water with no badwater within reach stays exactly 0, and badwater with no clean water within
 *  reach exactly its own share (a pool of pure badwater stays pure). Computed once for each
 *  surface-water state (the renderer makes a new one for every water update); 0 on dry tiles. */
export function blendedBadwater(W: number, H: number, sw: SurfaceWater): Float32Array {
  let out = blends.get(sw);
  if (!out) {
    out = blend(W, H, sw);
    blends.set(sw, out);
  }
  return out;
}

function blend(W: number, H: number, sw: SurfaceWater): Float32Array {
  const { surface, contamination } = sw;
  const N = W * H;
  const out = new Float32Array(N);
  let any = false;
  for (let i = 0; i < N && !any; i++) any = contamination[i] > 0 && surface[i] === surface[i];
  if (!any) return out;
  const K = BLEND_KERNEL;
  const R = K.length - 1;
  const rows = new Float32Array(N);
  /** One pass along a line of tiles (step 1: a row; step W: a column), from `src` into `dst`. */
  const pass = (src: Float32Array, dst: Float32Array, i: number, pos: number, len: number, step: number) => {
    const s = surface[i];
    let sum = K[0] * src[i];
    let weight = K[0];
    for (const dir of [1, -1])
      for (let k = 1; k <= R; k++) {
        const p = pos + dir * k;
        if (p < 0 || p >= len) break;
        const j = i + dir * k * step;
        if (!(Math.abs(surface[j] - s) <= SAME_WATER)) break;
        sum += K[k] * src[j];
        weight += K[k];
      }
    dst[i] = sum / weight;
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (surface[i] === surface[i]) pass(contamination, rows, i, x, W, 1);
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (surface[i] === surface[i]) pass(rows, out, i, y, H, W);
    }
  return out;
}

/** A curtain's flags: its drop in thirtieths of a level, to 254; 255 at the map's edge (the side
 *  of the water there, no fall). */
export const EDGE_CURTAIN = 255;
export function dropFlags(top: number, bottom: number, edge: boolean): number {
  return edge ? EDGE_CURTAIN : Math.min(254, Math.round((top - bottom) * 30));
}

export function meshWaterChunk(W: number, H: number, heights: Uint8Array, sw: SurfaceWater, view: WaterView, lowerByTile: Map<number, number[]> | null, cx: number, cy: number): WaterMeshData {
  const b = new WaterBuffer();
  const x0 = cx * CHUNK;
  const y0 = cy * CHUNK;
  const x1 = Math.min(W, x0 + CHUNK);
  const y1 = Math.min(H, y0 + CHUNK);
  const bad = blendedBadwater(W, H, sw);
  /** A top's corner (tile-corner coordinates) shares the water of the tiles round it at its own
   *  level: their mean depth, dry ground counting as none (so the water thins toward the shore),
   *  and their mean blended badwater share (so the colour runs on smoothly across the tile). */
  const corner = (cxx: number, cyy: number, s: number, d: number, c: number): [number, number] => {
    let dn = 0;
    let ds = 0;
    let cn = 0;
    let cs = 0;
    for (let yy = cyy - 1; yy <= cyy; yy++)
      for (let xx = cxx - 1; xx <= cxx; xx++) {
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        const ns = sw.surface[j];
        if (ns === ns) {
          if (Math.abs(ns - s) > SAME_WATER) continue;
          dn++;
          ds += sw.depth[j];
          cn++;
          cs += bad[j];
        } else if (heights[j] >= s - 0.05) dn++;
      }
    return [dn ? ds / dn : d, cn ? cs / cn : c];
  };
  /** What stands at a neighbour: its water surface, else its ground; off the map, nothing. */
  const level = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= W || y >= H) return -Infinity;
    const i = y * W + x;
    const s = sw.surface[i];
    return s === s ? s : heights[i];
  };
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * W + x;
      const s = sw.surface[i];
      if (s === s) {
        const d = sw.depth[i];
        const c = bad[i];
        const f = sw.floor[i];
        // foam: a side meets the shore where dry ground stands at the surface or above it, takes a
        // fall where the neighbour's water stands well above it, and pours over a lip where it
        // stands well below (a fall, falls.ts)
        let flags = 0;
        for (let k = 0; k < 4; k++) {
          const xx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
          const yy = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          const ns = sw.surface[j];
          if (ns === ns) {
            if (ns - s >= FALL) flags |= FALL_IN_BITS[k];
            if (pushFall(b.falls, W, H, heights, sw, bad, x, y, k)) flags |= LIP_BITS[k];
          } else if (heights[j] >= s - 0.05) flags |= SHORE_BITS[k];
        }
        const k0 = corner(x, y, s, d, c);
        const k1 = corner(x + 1, y, s, d, c);
        const k2 = corner(x + 1, y + 1, s, d, c);
        const k3 = corner(x, y + 1, s, d, c);
        // depth and the blended badwater share, shared with the tiles round each corner
        const c0 = k0[1];
        const c1 = k1[1];
        const c2 = k2[1];
        const c3 = k3[1];
        b.quad4([x, s, -y, x + 1, s, -y, x + 1, s, -(y + 1), x, s, -(y + 1)], [k0[0], k1[0], k2[0], k3[0]], [c0, c1, c2, c3], 0, 1, 0, flags);
        // curtains toward lower neighbours: down to the ground (never below the floor), or to the
        // water just below, in front of the cliff where it stands below the floor; each with the
        // badwater share of the top's edge it hangs from. Where the water falls into water well
        // below, the fall pours from the lip instead (above)
        const dd = [d, d, d, d];
        const drop = (xx: number, yy: number): number => {
          const lv = level(xx, yy);
          if (!(lv < s - STEP)) return NaN;
          const inside = xx >= 0 && yy >= 0 && xx < W && yy < H;
          const wetBelow = inside && sw.surface[yy * W + xx] === sw.surface[yy * W + xx];
          if (wetBelow && s - lv >= FALL) return NaN;
          return wetBelow ? lv : Math.max(lv, f);
        };
        const O = 0.015; // a curtain to lower water stands just off the cliff's face
        const e = drop(x + 1, y);
        if (e === e) {
          const X = e < f ? x + 1 + O : x + 1;
          b.quad4([X, e, -y, X, e, -(y + 1), X, s, -(y + 1), X, s, -y], dd, [c1, c2, c2, c1], 1, 0, 0, dropFlags(s, e, x + 1 >= W));
        }
        const wv = drop(x - 1, y);
        if (wv === wv) {
          const X = wv < f ? x - O : x;
          b.quad4([X, wv, -(y + 1), X, wv, -y, X, s, -y, X, s, -(y + 1)], dd, [c3, c0, c0, c3], -1, 0, 0, dropFlags(s, wv, x === 0));
        }
        const n = drop(x, y + 1);
        if (n === n) {
          const Z = n < f ? -(y + 1) - O : -(y + 1);
          b.quad4([x + 1, n, Z, x, n, Z, x, s, Z, x + 1, s, Z], dd, [c2, c3, c3, c2], 0, 0, -1, dropFlags(s, n, y + 1 >= H));
        }
        const so = drop(x, y - 1);
        if (so === so) {
          const Z = so < f ? -y + O : -y;
          b.quad4([x, so, Z, x + 1, so, Z, x + 1, s, Z, x, s, Z], dd, [c0, c1, c1, c0], 0, 0, 1, dropFlags(s, so, y === 0));
        }
      }
      const lower = lowerByTile?.get(i);
      if (lower) {
        for (const k of lower) {
          const ls = view.floor[k] + view.depth[k];
          b.quad([x, ls, -y, x + 1, ls, -y, x + 1, ls, -(y + 1), x, ls, -(y + 1)], view.depth[k], view.contamination[k], 0, 1, 0);
        }
      }
    }
  }
  return b.finish();
}

/** The water each tile's chunk was last drawn with: its surface (NaN where dry), depth and badwater
 *  share (the renderer's `drawWater`). */
export interface DrawnWater {
  surface: Float32Array;
  depth: Float32Array;
  contamination: Float32Array;
}

export function drawnWater(N: number): DrawnWater {
  return { surface: new Float32Array(N).fill(NaN), depth: new Float32Array(N), contamination: new Float32Array(N) };
}

/** A chunk drawn on `sw`: what it shows, tile by tile. */
export function drewChunk(W: number, H: number, drawn: DrawnWater, sw: SurfaceWater, cx: number, cy: number): void {
  for (let y = cy * CHUNK; y < Math.min(H, (cy + 1) * CHUNK); y++)
    for (let x = cx * CHUNK; x < Math.min(W, (cx + 1) * CHUNK); x++) {
      const i = y * W + x;
      drawn.surface[i] = sw.surface[i];
      drawn.depth[i] = sw.depth[i];
      drawn.contamination[i] = sw.contamination[i];
    }
}

/** How far the water may be from what is drawn before a moving water's chunk is drawn again: a
 *  two-hundredth of a level in its surface or depth, a hundredth in its badwater share; a tile turning
 *  wet or dry always counts. (0: any difference, the water in place.) */
export const MOVED_WATER = { level: 0.005, share: 0.01 };

/** Chunks whose drawn water differs from `sw` by more than `tol` (a tile's surface, depth or badwater
 *  share; wet or dry), with the chunks within six tiles (the badwater's blend reaches three, a top's
 *  corners, curtains and falls three more). */
export function waterMovedChunks(W: number, H: number, drawn: DrawnWater, sw: SurfaceWater, tol: { level: number; share: number }): Set<string> {
  const out = new Set<string>();
  const nx = Math.ceil(W / CHUNK);
  const ny = Math.ceil(H / CHUNK);
  const dirty = new Uint8Array(nx * ny);
  const R = 6;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const sa = drawn.surface[i];
      const sb = sw.surface[i];
      const wa = sa === sa;
      if (!wa && !(sb === sb)) continue;
      if (wa === (sb === sb) && Math.abs(sa - sb) <= tol.level && Math.abs(drawn.depth[i] - sw.depth[i]) <= tol.level && Math.abs(drawn.contamination[i] - sw.contamination[i]) <= tol.share) continue;
      const cx0 = Math.floor(Math.max(0, x - R) / CHUNK);
      const cx1 = Math.floor(Math.min(W - 1, x + R) / CHUNK);
      const cy0 = Math.floor(Math.max(0, y - R) / CHUNK);
      const cy1 = Math.floor(Math.min(H - 1, y + R) / CHUNK);
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) dirty[cy * nx + cx] = 1;
    }
  for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) if (dirty[cy * nx + cx]) out.add(`${cx},${cy}`);
  return out;
}

/** Lower water columns (in caves) grouped by tile. */
export function lowerByTile(sw: SurfaceWater, view: WaterView): Map<number, number[]> | null {
  if (!sw.lower.length) return null;
  const m = new Map<number, number[]>();
  for (const k of sw.lower) {
    const i = view.tile[k];
    const list = m.get(i);
    if (list) list.push(k);
    else m.set(i, [k]);
  }
  return m;
}

/** Chunks whose water differs between two surface-water states: a tile's surface, depth or
 *  blended badwater share changed (the blend reaches a few tiles past a change of badwater). A
 *  top's corners and curtains read the tiles round it, and a fall the flow of the lips beside it and
 *  round its corners (which reads the tiles round them) and the pool up to three tiles out (its
 *  splash's room), so a chunk is also dirty when a tile up to three away changed. `quick` (a stroke's
 *  water, many times a second): the raw badwater share compared instead of the blend, and every
 *  change reaching three tiles further (as far as the blend reaches), so no blend is made for it:
 *  every chunk the blend's comparison finds, and a few more. */
export function changedWaterChunks(W: number, H: number, a: SurfaceWater, b: SurfaceWater, aLower: number, bLower: number, quick = false): Set<string> {
  const out = new Set<string>();
  const nx = Math.ceil(W / CHUNK);
  const ny = Math.ceil(H / CHUNK);
  if (aLower || bLower) {
    // caves: rare; remesh everything
    for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) out.add(`${cx},${cy}`);
    return out;
  }
  const dirty = new Uint8Array(nx * ny);
  const R = quick ? 6 : 3;
  /** The chunks of the tiles up to R from (x, y). */
  const mark = (x: number, y: number) => {
    const cx0 = Math.floor(Math.max(0, x - R) / CHUNK);
    const cx1 = Math.floor(Math.min(W - 1, x + R) / CHUNK);
    const cy0 = Math.floor(Math.max(0, y - R) / CHUNK);
    const cy1 = Math.floor(Math.min(H - 1, y + R) / CHUNK);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) dirty[cy * nx + cx] = 1;
  };
  const ba = quick ? a.contamination : blendedBadwater(W, H, a);
  const bb = quick ? b.contamination : blendedBadwater(W, H, b);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const sa = a.surface[i];
      const sb = b.surface[i];
      const same = (sa !== sa && sb !== sb) || (sa === sb && ba[i] === bb[i] && a.depth[i] === b.depth[i]);
      if (!same) mark(x, y);
    }
  }
  for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) if (dirty[cy * nx + cx]) out.add(`${cx},${cy}`);
  return out;
}
