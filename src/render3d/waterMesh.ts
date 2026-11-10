// Water surfaces (PLAN §14.2: "water surfaces as translucent quads at depth"), meshed per chunk
// like the terrain. Each wet tile gets a flat quad at its surface; where a neighbour's water stands over it, the
// game's grid of sixteen vertices instead, rising to meet that water, so a fall is the lower tile's own slope from the
// lip, as the game draws its falls (fallSlope.ts, its CalculateHeights; D154 as amended 2026-11-08). Where a
// neighbour's ground is lower and dry, or at the map's edge, a curtain hangs from the surface down to it, the water's
// side; where a wet neighbour's top meets this one's lower along their edge, a skirt down to it. With terrain above terrain
// every water column (a cave's pool, the lake on its roof) is drawn the same way on its own floor,
// seeing the water and ground at its own level round it (waterLayers.ts). Each vertex carries a depth and badwater share,
// which the shader turns into colour and opacity (Map look, D86: a top's corners share depth with
// the tiles round the corner, so the water thins toward the shore; D177: the badwater share is
// shared at the corners with the connected water round them, which a fall's face and water under a
// roof are coloured by; a top in the open takes the game's blend in the shader, about a tile wide,
// D154 as amended 2026-11-08), and flags: which sides of a top meet the shore.

import { CHUNK } from "./mesh";
import type { SurfaceWater, WaterView } from "./model";
import type { WaterLayer } from "./waterLayers";
import { cornerShift, filmDepthShare } from "./shoreFilm";
import { handOver, SLOPE_MIN, slopeGrid, slopeHeights, tileRise, type SlopeGrid } from "./fallSlope";

/** Flags of a water top: bits 0–3 the sides (east, west, north, south) where it meets the shore. A curtain's
 *  flags are its drop (`dropFlags`); the map's edge has none. */
export const SHORE_BITS = [1, 2, 4, 8] as const;

export interface WaterMeshData {
  positions: Float32Array;
  /** depth, contamination per vertex. */
  data: Float32Array;
  /** Flags per vertex (SHORE_BITS, or a curtain's drop). */
  flags: Float32Array;
  /** Per vertex, for a layer cut (cutWater.ts): the floor of its column, and on a top the corner's wet share (the share
   *  of the tiles its depth is shared with that are water, `corner`), 1 on a side. */
  cut: Float32Array;
  /** Per vertex, a still film's corner drawn back from the shore (shoreFilm.ts, Q9 V3): its shift (map axes x, y; tiles)
   *  × its depth's share, which the vertex shader takes × the flow's share there; 0 elsewhere. */
  shore: Float32Array;
  /** Axis normal per vertex. */
  normals: Int8Array;
  indices: Uint32Array;
  quads: number;
  /** Its bounding sphere (x, y, z, radius), when made beside it (the water worker). */
  sphere?: Float64Array;
}

class WaterBuffer {
  pos: number[] = [];
  data: number[] = [];
  nrm: number[] = [];
  flg: number[] = [];
  cut: number[] = [];
  shore: number[] = [];
  quads = 0;
  /** A quad of a column on `floor` with its own depth, badwater share and wet share (`WaterMeshData.cut`) at each
   *  corner. */
  quad4(c: number[], depth: readonly number[], cont: readonly number[], floor: number, share: readonly number[], nx: number, ny: number, nz: number, flags = 0, shore: readonly number[] = NO_SHIFT): void {
    for (let k = 0; k < 12; k++) this.pos.push(c[k]);
    for (let k = 0; k < 8; k++) this.shore.push(shore[k]);
    for (let v = 0; v < 4; v++) {
      this.data.push(depth[v], cont[v]);
      this.cut.push(floor, share[v]);
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
    return { positions: new Float32Array(this.pos), data: new Float32Array(this.data), flags: new Float32Array(this.flg), cut: new Float32Array(this.cut), shore: new Float32Array(this.shore), normals: new Int8Array(this.nrm), indices, quads: n };
  }
}

/** A quad none of whose corners moves (`WaterMeshData.shore`). */
const NO_SHIFT: readonly number[] = [0, 0, 0, 0, 0, 0, 0, 0];
const NO_SHIFT2: readonly [number, number] = [0, 0];

const lerp2 = (a: readonly number[], b: readonly number[], t: number): readonly number[] => [(1 - t) * a[0] + t * b[0], (1 - t) * a[1] + t * b[1]];

/** A top's sides, east, west, north (y + 1) and south (y − 1), as its curtains hang from them: the side's ends A and B
 *  (map axes, from the tile's corner x, y), the top's corners there (0 at x, y; 1 at x + 1, y; 2 at x + 1, y + 1; 3 at
 *  x, y + 1), a slope's grid vertices from A to B (fallSlope.ts, i + 4j), and its outward normal (world x, z). */
const CURTAIN_SIDES = [
  { ax: 1, ay: 0, bx: 1, by: 1, a: 1, b: 2, grid: [3, 7, 11, 15], nx: 1, nz: 0 },
  { ax: 0, ay: 1, bx: 0, by: 0, a: 3, b: 0, grid: [12, 8, 4, 0], nx: -1, nz: 0 },
  { ax: 1, ay: 1, bx: 0, by: 1, a: 2, b: 3, grid: [15, 14, 13, 12], nx: 0, nz: -1 },
  { ax: 0, ay: 0, bx: 1, by: 0, a: 0, b: 1, grid: [0, 1, 2, 3], nx: 0, nz: 1 },
] as const;

/** The grid `slopeHeights` fills, kept (one tile at a time), and a neighbour's (its skirts). */
const grid = slopeGrid();
const nearGrid = slopeGrid();

/** A slope's top (fallSlope.ts): the game's grid of sixteen vertices as nine quads, each split along the game's
 *  diagonal, from (i + 1, j) to (i, j + 1) in thirds; lit as any top (the up normal). A vertex at its own surface takes
 *  the top's corners' depth, wet share and still film's shift, bilinearly; one raised takes the depth seen there
 *  (`SlopeGrid.seen`) and, for its wet share, its cut share (`SlopeGrid.cut`: sliced by a layer cut, it takes the depth
 *  seen from the cut, cutWater.ts `cutSlopeDepth`). The badwater share is the corners',
 *  bilinearly: the water below a fall already has the fall's, handed over (`handOver`). */
function slopeTop(b: WaterBuffer, g: SlopeGrid, x: number, y: number, f: number, flags: number, k0: readonly number[], k1: readonly number[], k2: readonly number[], k3: readonly number[], m: readonly (readonly number[])[] | null): void {
  // (each vertex's weights on the top's four corners, bilinearly: SLOPE_WEIGHTS)
  const { vd, vc, vs, vm, pos, qd, qc, qs, qm } = SLOPE_SCRATCH;
  for (let q = 0; q < 16; q++) {
    const w0 = SLOPE_WEIGHTS[q * 4];
    const w1 = SLOPE_WEIGHTS[q * 4 + 1];
    const w2 = SLOPE_WEIGHTS[q * 4 + 2];
    const w3 = SLOPE_WEIGHTS[q * 4 + 3];
    const seen = g.seen[q];
    const up = seen === seen;
    vd[q] = up ? seen : w0 * k0[0] + w1 * k1[0] + w2 * k2[0] + w3 * k3[0];
    vs[q] = up ? g.cut[q] : w0 * k0[2] + w1 * k1[2] + w2 * k2[2] + w3 * k3[2];
    vc[q] = w0 * k0[1] + w1 * k1[1] + w2 * k2[1] + w3 * k3[1];
    if (m) {
      vm[q * 2] = w0 * m[0][0] + w1 * m[1][0] + w2 * m[2][0] + w3 * m[3][0];
      vm[q * 2 + 1] = w0 * m[0][1] + w1 * m[1][1] + w2 * m[2][1] + w3 * m[3][1];
    }
  }
  const h = g.height;
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 3; i++) {
      // (its corners from (i + 1, j) round to (i, j): the first and third on the game's diagonal)
      for (let c = 0; c < 4; c++) {
        const v = c === 0 ? i + 1 + 4 * j : c === 1 ? i + 1 + 4 * (j + 1) : c === 2 ? i + 4 * (j + 1) : i + 4 * j;
        pos[c * 3] = x + (v & 3) / 3;
        pos[c * 3 + 1] = h[v];
        pos[c * 3 + 2] = -(y + (v >> 2) / 3);
        qd[c] = vd[v];
        qc[c] = vc[v];
        qs[c] = vs[v];
        qm[c * 2] = vm[v * 2];
        qm[c * 2 + 1] = vm[v * 2 + 1];
      }
      // (quad4 copies what it is given, so the scratch is reused)
      b.quad4(pos, qd, qc, f, qs, 0, 1, 0, flags, m ? qm : NO_SHIFT);
    }
}

/** A slope's vertex q (i + 4j, at (i/3, j/3) across its tile)'s bilinear weights on the top's corners (0 at x, y; 1 at
 *  x + 1, y; 2 at x + 1, y + 1; 3 at x, y + 1), four a vertex. */
const SLOPE_WEIGHTS = (() => {
  const out = new Float64Array(64);
  for (let q = 0; q < 16; q++) {
    const fx = (q & 3) / 3;
    const fy = (q >> 2) / 3;
    out.set([(1 - fx) * (1 - fy), fx * (1 - fy), fx * fy, (1 - fx) * fy], q * 4);
  }
  return out;
})();

/** `slopeTop`'s working arrays (one tile at a time). */
const SLOPE_SCRATCH = {
  vd: new Array<number>(16).fill(0),
  vc: new Array<number>(16).fill(0),
  vs: new Array<number>(16).fill(0),
  vm: new Array<number>(32).fill(0),
  pos: new Array<number>(12).fill(0),
  qd: new Array<number>(4).fill(0),
  qc: new Array<number>(4).fill(0),
  qs: new Array<number>(4).fill(0),
  qm: new Array<number>(8).fill(0),
};

/** Lower than this below the surface, a dry neighbour gets a curtain. */
const STEP = 0.02;
/** Water within this of a tile's surface is the same water: it shares depth and badwater at the
 *  corners, and the badwater blend reaches across it. */
const SAME_WATER = 0.35;
/** A curtain this tall or more (its drop in its flags, `dropFlags`) is kept below a layer cut; a shorter one fades out
 *  as it shortens. Every curtain but the map's edge section is drawn as the water's surface going on, as the game's
 *  skirt (materials.ts, high/shaders.ts). Since falls are slopes (fallSlope.ts) a curtain hangs only toward lower dry
 *  ground and at the map's edge (toward water, a skirt: `SKIRT_FLAGS`). */
export const FALL = 0.3;

/** A skirt's flags (its drop, as a curtain's): never as tall as a fall, so it is drawn as the water's own surface going
 *  on (materials.ts), as the game's skirt shares its top's material. */
const SKIRT_FLAGS = Math.round(FALL * 30) - 1;

/** How the badwater share is blended between tiles before the corners share it (D177): a kernel along rows, then
 *  along columns, from the tile itself out. The tile's own share alone (D154 as amended 2026-11-08): the game blends
 *  its per-column contamination about a tile wide, centred on the tiles' edge (waterPalette.ts WATER_SHARE_BLEND),
 *  which a top in the open takes in the shader; the corners' sharing gives a face and water under a roof theirs. Until
 *  then [20, 15, 6, 1], a front over about four tiles. */
export const BLEND_KERNEL: readonly number[] = [1];

const blends = new WeakMap<SurfaceWater, Float32Array>();

/** The badwater share of each tile's surface water blended over the connected water round it
 *  (`BLEND_KERNEL`): each tile's share averaged with its neighbours' out to the kernel's reach along the row,
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
  const out = new Float32Array(W * H);
  blendInto(out, W, H, sw, 0, 0, W - 1, H - 1);
  return out;
}

/** Tiles round a chunk whose blend its mesh reads: a top's corner reads one past the chunk; three more for safety
 *  (as when a fall's lips read two, before D201's amendment). */
const BLEND_WINDOW = 4;

/** A map-sized array the row pass of `blendInto` works in (kept: a chunk's mesh asks for a window of the blend
 *  many times a second, and the page's thread must not allocate or walk a whole 512x512 map for each). */
let rowsScratch = new Float32Array(0);

/** What `blendInto` leaves for a chunk's mesh: kept between chunks (only the window of the chunk being meshed is read). */
let badScratch = new Float32Array(0);
/** The badwater share handed over (fallSlope.ts `handOver`) that the blend reads for a chunk's mesh: kept likewise. */
let handScratch = new Float32Array(0);

/** The blend (`blendedBadwater`) of the tiles x0..x1 by y0..y1 (clipped to the map) into `out`, a map-sized array whose
 *  other tiles are left as they were: the same arithmetic tile by tile as the whole map's, so any window holds the
 *  whole map's numbers (tests/unit/waterBlendWindow.test.ts). A tile's blend reads only the tiles within `BLEND_KERNEL`'s
 *  reach of it, so the work is the window's, never the map's (D357: a 512x512 map's moving water). */
export function blendInto(out: Float32Array, W: number, H: number, sw: SurfaceWater, x0: number, y0: number, x1: number, y1: number): void {
  const { surface, contamination } = sw;
  const K = BLEND_KERNEL;
  const R = K.length - 1;
  const xa = Math.max(0, x0);
  const xb = Math.min(W - 1, x1);
  const ya = Math.max(0, y0);
  const yb = Math.min(H - 1, y1);
  if (xa > xb || ya > yb) return;
  // (no badwater within reach of the window: exactly 0 everywhere in it)
  let any = false;
  for (let y = Math.max(0, ya - R); y <= Math.min(H - 1, yb + R) && !any; y++)
    for (let x = Math.max(0, xa - R); x <= Math.min(W - 1, xb + R); x++) {
      const i = y * W + x;
      if (contamination[i] > 0 && surface[i] === surface[i]) {
        any = true;
        break;
      }
    }
  if (!any) {
    for (let y = ya; y <= yb; y++) out.fill(0, y * W + xa, y * W + xb + 1);
    return;
  }
  if (rowsScratch.length < W * H) rowsScratch = new Float32Array(W * H);
  const rows = rowsScratch;
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
  // the rows the column pass reads: the window's, and R above and below it
  for (let y = Math.max(0, ya - R); y <= Math.min(H - 1, yb + R); y++)
    for (let x = xa; x <= xb; x++) {
      const i = y * W + x;
      if (surface[i] === surface[i]) pass(contamination, rows, i, x, W, 1);
    }
  for (let y = ya; y <= yb; y++)
    for (let x = xa; x <= xb; x++) {
      const i = y * W + x;
      if (surface[i] === surface[i]) pass(rows, out, i, y, H, W);
      else out[i] = 0;
    }
}

/** A curtain's flags: its drop in thirtieths of a level, to 254; 255 at the map's edge (the side
 *  of the water there, no fall). */
export const EDGE_CURTAIN = 255;
export function dropFlags(top: number, bottom: number, edge: boolean): number {
  return edge ? EDGE_CURTAIN : Math.min(254, Math.round((top - bottom) * 30));
}

/** A chunk's water (its tops, falls' slopes among them, and its curtains), layer by layer (waterLayers.ts): each layer's columns drawn on
 *  what they see round them. One layer, the open sky's, on a map without terrain above terrain (`plainLayers`). */
export function meshWaterChunk(W: number, H: number, layers: readonly WaterLayer[], cx: number, cy: number): WaterMeshData {
  const b = new WaterBuffer();
  const nx = Math.ceil(W / CHUNK);
  // (a still film draws back from the shore only in the open sky's layer, whose water on its tiles' tops the terrain's
  // water byte has: shoreFilm.ts)
  layers.forEach((layer, k) => {
    if (!layer.chunks || layer.chunks[cy * nx + cx]) meshLayer(b, W, H, layer.ground, layer.sw, layer.own, cx, cy, k === 0 ? (layer.wet ?? layer.sw) : null);
  });
  return b.finish();
}

/** One layer's water in a chunk: the tiles it draws (`own`; every wet tile when null), each seeing the water
 *  `sw` and the ground `heights` round it. */
function meshLayer(b: WaterBuffer, W: number, H: number, heights: Uint8Array, sw: SurfaceWater, own: Uint8Array | null, cx: number, cy: number, films: SurfaceWater | null): void {
  const x0 = cx * CHUNK;
  const y0 = cy * CHUNK;
  const x1 = Math.min(W, x0 + CHUNK);
  const y1 = Math.min(H, y0 + CHUNK);
  // the blend of the chunk's window only (a corner reads a tile past the chunk): the page's thread
  // blends no more of a 512x512 map than the chunk it meshes
  if (badScratch.length < W * H) badScratch = new Float32Array(W * H);
  const bad = badScratch;
  // (blended from the badwater share as the game's FindBestProperties hands it to the water below a fall, fallSlope.ts
  // `handOver`, over the tiles the blend reads)
  if (handScratch.length < W * H) handScratch = new Float32Array(W * H);
  const reach = BLEND_WINDOW + BLEND_KERNEL.length - 1;
  handOver(W, H, sw, sw.contamination, handScratch, 1, true, x0 - reach, y0 - reach, x1 + reach - 1, y1 + reach - 1);
  blendInto(bad, W, H, { ...sw, contamination: handScratch }, x0 - BLEND_WINDOW, y0 - BLEND_WINDOW, x1 + BLEND_WINDOW - 1, y1 + BLEND_WINDOW - 1);
  /** A top's corner (tile-corner coordinates) shares the water of the tiles round it at its own
   *  level: their mean depth, dry ground counting as none (so the water thins toward the shore),
   *  and their mean blended badwater share (so the colour runs on smoothly across the tile); and the
   *  share of those tiles that are water (a layer cut takes its depth off theirs only, cutWater.ts). */
  const corner = (cxx: number, cyy: number, s: number, d: number, c: number): [number, number, number] => {
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
    return [dn ? ds / dn : d, cn ? cs / cn : c, dn ? cn / dn : 1];
  };
  /** What stands at a neighbour: its water surface, else its ground; off the map, nothing. */
  const level = (x: number, y: number): number => {
    if (x < 0 || y < 0 || x >= W || y >= H) return -Infinity;
    const i = y * W + x;
    const s = sw.surface[i];
    return s === s ? s : heights[i];
  };
  /** Water standing on a tile's top in `w` (the terrain's water byte has it: light.ts `waterByte`). */
  const onTop = (w: SurfaceWater, j: number): boolean => w.surface[j] === w.surface[j] && !(w.floor[j] < heights[j] - 0.01);
  /** A side of a film's tile with no linked neighbour (shoreFilm.ts): a tile on the map with no water on its top, as
   *  the terrain's water byte has it (`films`: under a roof too, where this layer drops it). */
  const open = (xx: number, yy: number): boolean => xx >= 0 && yy >= 0 && xx < W && yy < H && !onTop(films!, yy * W + xx);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * W + x;
      const s = sw.surface[i];
      if (s === s && (!own || own[i])) {
        const d = sw.depth[i];
        const c = bad[i];
        const f = sw.floor[i];
        // a side meets the shore where dry ground stands at the surface or above it
        let flags = 0;
        for (let k = 0; k < 4; k++) {
          const xx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
          const yy = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          const ns = sw.surface[j];
          if (!(ns === ns) && heights[j] >= s - 0.05) flags |= SHORE_BITS[k];
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
        // a still film's corners drawn back from its open sides (shoreFilm.ts, Q9 V3): each corner's shift × the depth's
        // share, the corners k0 (x, y), k1 (x + 1, y), k2 (x + 1, y + 1), k3 (x, y + 1); the curtains hanging from its
        // edges move with them
        let m0 = NO_SHIFT2;
        let m1 = NO_SHIFT2;
        let m2 = NO_SHIFT2;
        let m3 = NO_SHIFT2;
        const share = films && onTop(sw, i) ? filmDepthShare(d) : 0;
        if (share > 0) {
          const oe = open(x + 1, y);
          const ow = open(x - 1, y);
          const on = open(x, y + 1);
          const os = open(x, y - 1);
          if (oe || ow || on || os) {
            const at = (sx: number, sy: number) => {
              const [mx, my] = cornerShift(sx, sy, sx > 0 ? oe : ow, sy > 0 ? on : os);
              return [mx * share, my * share] as const;
            };
            m0 = at(-1, -1);
            m1 = at(1, -1);
            m2 = at(1, 1);
            m3 = at(-1, 1);
          }
        }
        // (a quad's shifts: none for the most, with no array made)
        const moved = m0 !== NO_SHIFT2 || m1 !== NO_SHIFT2 || m2 !== NO_SHIFT2 || m3 !== NO_SHIFT2;
        const sh = (a: readonly number[], b2: readonly number[], c2: readonly number[], d2: readonly number[]) => (moved ? [...a, ...b2, ...c2, ...d2] : NO_SHIFT);
        // a fall's slope (fallSlope.ts, D154 as amended 2026-11-08): where a linked neighbour's surface stands over this
        // one's, the game's grid of sixteen vertices rising to meet it; elsewhere one flat quad
        const slope = tileRise(W, H, sw, x, y) >= SLOPE_MIN && slopeHeights(W, H, sw, x, y, grid);
        if (slope) slopeTop(b, grid, x, y, f, flags, k0, k1, k2, k3, moved ? [m0, m1, m2, m3] : null);
        else b.quad4([x, s, -y, x + 1, s, -y, x + 1, s, -(y + 1), x, s, -(y + 1)], [k0[0], k1[0], k2[0], k3[0]], [c0, c1, c2, c3], f, [k0[2], k1[2], k2[2], k3[2]], 0, 1, 0, flags, sh(m0, m1, m2, m3));
        // curtains toward lower dry neighbours and the map's edge: down to the ground, never below the floor, with the
        // tile's own badwater share, its top along the top's edge (a slope's too). Toward a wet
        // neighbour, a skirt where this top's edge stands over the neighbour's (`STEP` or more) at a vertex they share,
        // down to the neighbour's there, as the game's water vertex shader drops each tile's side skirt to the
        // neighbour's height at that vertex: water meets water by the slope, but where their corners' links differ (a
        // corner neighbour dry on one side only) or a neighbour is not linked, the two tops' edges part, and the skirt
        // closes the window between them
        const dd = [d, d, d, d];
        const side = [1, 1, 1, 1];
        for (let k = 0; k < 4; k++) {
          const xx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
          const yy = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
          const inside = xx >= 0 && yy >= 0 && xx < W && yy < H;
          const S = CURTAIN_SIDES[k];
          const wet = inside && sw.surface[yy * W + xx] === sw.surface[yy * W + xx];
          // (a skirt: its neighbour's heights along the side, a slope's grid or its surface; none where this top's edge
          // stands nowhere over the neighbour's surface, the most)
          let nearSlope = false;
          let sn = 0;
          if (wet) {
            sn = sw.surface[yy * W + xx];
            let hi = s;
            if (slope) for (let q = 0; q < 4; q++) hi = Math.max(hi, grid.height[S.grid[q]]);
            if (!(hi >= sn + STEP)) continue;
            nearSlope = tileRise(W, H, sw, xx, yy) >= SLOPE_MIN && slopeHeights(W, H, sw, xx, yy, nearGrid);
          }
          const lv = wet ? sn : level(xx, yy);
          const e = Math.max(lv, f);
          const edge = !inside;
          // the side's ends A and B (map axes), the corners there, and its vertices along it in a slope's grid (the
          // neighbour's same vertices: its opposite side's, backwards)
          const O = CURTAIN_SIDES[k ^ 1].grid;
          // (every side takes the tile's own badwater share, a fall's handed over, as the game's skirt takes its own
          // tile's properties: never the corners' blend with the water beside it, D154)
          const ca = c;
          const cb = c;
          const ma = [m0, m1, m2, m3][S.a];
          const mb = [m0, m1, m2, m3][S.b];
          const segments = slope || nearSlope ? 3 : 1;
          for (let q = 0; q < segments; q++) {
            const ta = q / segments;
            const tb = (q + 1) / segments;
            const ha = slope ? grid.height[S.grid[q]] : s;
            const hb = slope ? grid.height[S.grid[q + 1]] : s;
            if (wet) {
              const ea = Math.min(ha, Math.max(f, nearSlope ? nearGrid.height[O[3 - q]] : sn));
              const eb = Math.min(hb, Math.max(f, nearSlope ? nearGrid.height[O[2 - q]] : sn));
              if (!(Math.max(ha - ea, hb - eb) >= STEP)) continue;
              const ax = x + S.ax + (S.bx - S.ax) * ta;
              const ay = y + S.ay + (S.by - S.ay) * ta;
              const bx = x + S.ax + (S.bx - S.ax) * tb;
              const by = y + S.ay + (S.by - S.ay) * tb;
              const cqa = (1 - ta) * ca + ta * cb;
              const cqb = (1 - tb) * ca + tb * cb;
              const mqa = segments === 1 ? ma : lerp2(ma, mb, ta);
              const mqb = segments === 1 ? mb : lerp2(ma, mb, tb);
              b.quad4([ax, ea, -ay, bx, eb, -by, bx, hb, -by, ax, ha, -ay], dd, [cqa, cqb, cqb, cqa], f, side, S.nx, 0, S.nz, Math.min(SKIRT_FLAGS, dropFlags(Math.max(ha, hb), Math.min(ea, eb), false)), sh(mqa, mqb, mqb, mqa));
              continue;
            }
            if (!(lv < Math.max(ha, hb) - STEP)) continue;
            const ax = x + S.ax + (S.bx - S.ax) * ta;
            const ay = y + S.ay + (S.by - S.ay) * ta;
            const bx = x + S.ax + (S.bx - S.ax) * tb;
            const by = y + S.ay + (S.by - S.ay) * tb;
            const cqa = (1 - ta) * ca + ta * cb;
            const cqb = (1 - tb) * ca + tb * cb;
            const mqa = segments === 1 ? ma : lerp2(ma, mb, ta);
            const mqb = segments === 1 ? mb : lerp2(ma, mb, tb);
            b.quad4([ax, e, -ay, bx, e, -by, bx, hb, -by, ax, ha, -ay], dd, [cqa, cqb, cqb, cqa], f, side, S.nx, 0, S.nz, dropFlags(Math.max(ha, hb), e, edge), sh(mqa, mqb, mqb, mqa));
          }
        }
      }
    }
  }
}

/** The water each tile's chunk was last drawn with: its surface (NaN where dry), floor, depth and badwater
 *  share (the renderer's `drawWater`). The terrain's tile data reads its water from this, never from newer water
 *  still on its way to the mesh: the bed under water and the water drawn over it come and go together. */
export interface DrawnWater {
  surface: Float32Array;
  floor: Float32Array;
  depth: Float32Array;
  contamination: Float32Array;
}

export function drawnWater(N: number): DrawnWater {
  return { surface: new Float32Array(N).fill(NaN), floor: new Float32Array(N), depth: new Float32Array(N), contamination: new Float32Array(N) };
}

/** A chunk drawn on `sw`: what it shows, tile by tile. */
export function drewChunk(W: number, H: number, drawn: DrawnWater, sw: SurfaceWater, cx: number, cy: number): void {
  for (let y = cy * CHUNK; y < Math.min(H, (cy + 1) * CHUNK); y++)
    for (let x = cx * CHUNK; x < Math.min(W, (cx + 1) * CHUNK); x++) {
      const i = y * W + x;
      drawn.surface[i] = sw.surface[i];
      drawn.floor[i] = sw.floor[i];
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
 *  corners and curtains three more, kept from when a fall read its pool's room). */
export function waterMovedChunks(W: number, H: number, drawn: DrawnWater, sw: SurfaceWater, tol: { level: number; share: number }): Set<string> {
  const marks = chunkMarks(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const sa = drawn.surface[i];
      const sb = sw.surface[i];
      const wa = sa === sa;
      if (!wa && !(sb === sb)) continue;
      if (wa === (sb === sb) && Math.abs(sa - sb) <= tol.level && Math.abs(drawn.depth[i] - sw.depth[i]) <= tol.level && Math.abs(drawn.contamination[i] - sw.contamination[i]) <= tol.share) continue;
      marks.mark(x, y);
    }
  return marks.keys();
}

/** How far round a tile whose water moved the chunks are drawn again (`waterMovedChunks`). */
const MOVED_REACH = 6;

/** The chunks within MOVED_REACH of the tiles marked (`mark`), as "cx,cy" keys (`keys`). The tiles of a row in the
 *  same part of a chunk (within reach of its west edge, of its east edge, or of neither) mark the same chunks, so
 *  each part is marked once a row: water moving over thousands of tiles costs a comparison a tile. */
function chunkMarks(W: number, H: number): { mark(x: number, y: number): void; keys(): Set<string> } {
  const R = MOVED_REACH;
  const nx = Math.ceil(W / CHUNK);
  const ny = Math.ceil(H / CHUNK);
  const dirty = new Uint8Array(nx * ny);
  let row = -1;
  let part = -1;
  return {
    mark(x: number, y: number): void {
      const lx = x % CHUNK;
      const p = (x - lx) * 3 + (lx < R ? 0 : lx >= CHUNK - R ? 2 : 1);
      if (y === row && p === part) return;
      row = y;
      part = p;
      const cx0 = Math.floor(Math.max(0, x - R) / CHUNK);
      const cx1 = Math.floor(Math.min(W - 1, x + R) / CHUNK);
      const cy0 = Math.floor(Math.max(0, y - R) / CHUNK);
      const cy1 = Math.floor(Math.min(H - 1, y + R) / CHUNK);
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) dirty[cy * nx + cx] = 1;
    },
    keys(): Set<string> {
      const out = new Set<string>();
      for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) if (dirty[cy * nx + cx]) out.add(`${cx},${cy}`);
      return out;
    },
  };
}

/** Whether chunk (cx, cy) is among `waterMovedChunks`' answer: its drawn water, or a tile's within six of it, differs
 *  from `sw` by more than `tol`. Reads only the tiles round the chunk, and stops at the first that moved (the page's
 *  thread asks it of the chunks waiting to be drawn, never of the whole map). */
export function waterMovedChunk(W: number, H: number, drawn: DrawnWater, sw: SurfaceWater, tol: { level: number; share: number }, cx: number, cy: number): boolean {
  const R = MOVED_REACH;
  const x0 = Math.max(0, cx * CHUNK - R);
  const x1 = Math.min(W - 1, (cx + 1) * CHUNK - 1 + R);
  const y0 = Math.max(0, cy * CHUNK - R);
  const y1 = Math.min(H - 1, (cy + 1) * CHUNK - 1 + R);
  for (let y = y0; y <= y1; y++)
    for (let i = y * W + x0, end = y * W + x1; i <= end; i++) {
      const sa = drawn.surface[i];
      const sb = sw.surface[i];
      const wa = sa === sa;
      if (!wa && !(sb === sb)) continue;
      if (wa === (sb === sb) && Math.abs(sa - sb) <= tol.level && Math.abs(drawn.depth[i] - sw.depth[i]) <= tol.level && Math.abs(drawn.contamination[i] - sw.contamination[i]) <= tol.share) continue;
      return true;
    }
  return false;
}

/** The chunks water put in place draws again (renderer.updateWater): every chunk within six tiles of a tile whose
 *  water differs at all from what is drawn there (`waterMovedChunks` with no tolerance) or from the water before it,
 *  `before` (`changedWaterChunks`, quick: no blend is made). One pass over the map for both. */
export function exactWaterChunks(W: number, H: number, drawn: DrawnWater, before: SurfaceWater, after: SurfaceWater): Set<string> {
  const marks = chunkMarks(W, H);
  const { surface: sb, depth: db, contamination: cb } = after;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const s = sb[i];
      const wet = s === s;
      const sd = drawn.surface[i];
      const s0 = before.surface[i];
      // (dry before, drawn dry and dry now: nothing)
      if (!wet && !(sd === sd) && !(s0 === s0)) continue;
      const fromDrawn = wet !== (sd === sd) || (wet && (sd !== s || drawn.depth[i] !== db[i] || drawn.contamination[i] !== cb[i]));
      const fromBefore = wet !== (s0 === s0) || (wet && (s0 !== s || before.depth[i] !== db[i] || before.contamination[i] !== cb[i]));
      if (fromDrawn || fromBefore) marks.mark(x, y);
    }
  return marks.keys();
}

/** Chunks whose water differs between two surface-water states: a tile's surface, depth or
 *  blended badwater share changed (the blend reaches a few tiles past a change of badwater). A
 *  top's corners and curtains (a fall among them) read the tiles round it, so a chunk is also dirty when a
 *  tile up to three away changed (the reach kept from when a fall read its pool's room, three tiles out). `quick` (a stroke's
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

/** Water riding the ground it stands on: where the land under a wet tile changed from `was` to `now`,
 *  the water there stands on the new ground, its depth kept, as the water's simulation carries it the
 *  moment it sees that ground (a force's, a stroke's). So the land and its water change in the same
 *  frame, whichever of them reaches the page first. Only water standing on `was` moves (a file's water on
 *  something else keeps its own floor, so does water under a roof, whose floor is not the tile's top). Over the
 *  tiles of `rect` (all of them when left out); true when any moved. */
export function rideLand(W: number, sw: SurfaceWater, was: ArrayLike<number>, now: ArrayLike<number>, rect?: { x0: number; y0: number; x1: number; y1: number }): boolean {
  const H = now.length / W;
  const x0 = Math.max(0, rect?.x0 ?? 0);
  const y0 = Math.max(0, rect?.y0 ?? 0);
  const x1 = Math.min(W - 1, rect?.x1 ?? W - 1);
  const y1 = Math.min(H - 1, rect?.y1 ?? H - 1);
  let moved = false;
  for (let y = y0; y <= y1; y++)
    for (let i = y * W + x0, end = y * W + x1; i <= end; i++) {
      const a = was[i];
      const b = now[i];
      if (a === b || sw.floor[i] !== a) continue;
      sw.floor[i] = b;
      sw.surface[i] = b + sw.depth[i];
      moved = true;
    }
  return moved;
}

/** Wetter than this, a held tile's water is drawn (the 2D preview's threshold, model.ts `WET`). */
const HELD_WET = 0.001;

/** A held weather day's surface per tile (D133), from the day's water as it came (`view`, never the surface water drawn,
 *  which an edit changes): the level of the water standing on the tile's top (`top`, each tile's surface column in the
 *  view), on `heights` or on the land before its last change (`before`, water worked out a step behind it); NaN
 *  elsewhere (dry, or water under a roof, whose floor is not the tile's top). `holdLand` keeps it under any land. */
export function heldSurfaceOf(view: WaterView, top: ArrayLike<number>, heights: ArrayLike<number>, before?: ArrayLike<number> | null): Float32Array {
  const n = heights.length;
  const out = new Float32Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const k = top[i];
    if (k < 0) continue;
    const f = view.floor[k];
    const d = view.depth[k];
    if (d > HELD_WET && (f === heights[i] || (before && f === before[i]))) out[i] = f + d;
  }
  return out;
}

/** A held weather day's water on the land `now` (D133; while a drought or a badtide is held, until the edited map's
 *  own day comes): nothing simulates it, so it never rides the land as `rideLand` carries live water. Each tile's
 *  water stands at the day's surface (`held`, `heldSurfaceOf`), depth max(0, held − now): land raised to it or above
 *  holds none, land under it holds water up to it, lowered land fills deeper to it. A tile the day had dry, or water
 *  under a roof, is left as it is, so the land invents no water there. Worked out from `held` and `now` alone, so the
 *  same land always gives the same water (land put back, an undo, a flip of Compare and back). Writes `sw`, which must
 *  be the drawn copy, never the day's own water; over the tiles of `rect` (all of them when left out); true when any
 *  changed. */
export function holdLand(W: number, sw: SurfaceWater, held: ArrayLike<number>, now: ArrayLike<number>, rect?: { x0: number; y0: number; x1: number; y1: number }): boolean {
  const H = now.length / W;
  const x0 = Math.max(0, rect?.x0 ?? 0);
  const y0 = Math.max(0, rect?.y0 ?? 0);
  const x1 = Math.min(W - 1, rect?.x1 ?? W - 1);
  const y1 = Math.min(H - 1, rect?.y1 ?? H - 1);
  let changed = false;
  for (let y = y0; y <= y1; y++)
    for (let i = y * W + x0, end = y * W + x1; i <= end; i++) {
      const s = held[i];
      if (s !== s) continue;
      const b = now[i];
      const d = s - b;
      if (d > HELD_WET) {
        if (sw.floor[i] === b && sw.surface[i] === s) continue;
        sw.floor[i] = b;
        sw.depth[i] = d;
        sw.surface[i] = s;
      } else {
        if (sw.surface[i] !== sw.surface[i]) continue;
        sw.floor[i] = NaN;
        sw.depth[i] = 0;
        sw.surface[i] = NaN;
      }
      changed = true;
    }
  return changed;
}

/** The tiles whose water differs between `a` and `b` (wet or dry, its surface or its depth), as the rectangle round
 *  them, or null where none does. */
export function waterChangedRect(W: number, a: SurfaceWater, b: SurfaceWater): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = W;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  for (let i = 0; i < a.surface.length; i++) {
    const sa = a.surface[i];
    const sb = b.surface[i];
    if (sa !== sa ? sb !== sb : sa === sb && a.depth[i] === b.depth[i]) continue;
    const x = i % W;
    const y = (i - x) / W;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    y1 = y;
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** A copy of surface water whose levels can be written (`holdLand`) without touching the water it was made from. */
export function ownSurface(sw: SurfaceWater): SurfaceWater {
  return { ...sw, surface: sw.surface.slice(), floor: sw.floor.slice(), depth: sw.depth.slice() };
}
