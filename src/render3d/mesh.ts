// Terrain meshing in 32×32 chunks (EDITOR_PLAN §8, PLAN §14.2; 3D terrain step 2, D126, D280 (2)):
// one mesher for terrain as runs, every tile alike, whether it is one plain run from the bottom or
// several solid runs with air between them (caves, overhangs, arches, a floating run). A tile's
// column is a mask (bit z set: voxel z solid, as `ColumnTerrain` holds it), and a face is drawn
// wherever solid meets air:
// - tops: the top of every run, and the map's floor (level 0) under a column with air at its
//   bottom; merged greedily into rectangles of one level, tile by tile in reading order;
// - undersides: the bottom of every run that does not stand on the map's floor (a cave's ceiling,
//   an overhang's roof, the inside of an arch), facing down, merged the same way;
// - walls: on each side, every span of the column that is solid where its neighbour is air (the
//   outside of the map is air), merged along the edge with the next tile's identical span.
// On a map without terrain above terrain this gives exactly the quads, in the same order, as the
// heightfield mesher it replaced (`tests/unit/meshEquivalence.test.ts`): a plain column has one top
// and one wall span a side, from its neighbour's height to its own.
//
// Each tile emits its own faces, so a chunk depends only on its tiles and their neighbours' columns:
// a terrain edit remeshes the chunks within one tile of the changed rectangle (`dirtyChunks`). A
// mine site's or seep's pit leaves its tiles' tops out (`cutout`), as the game hides the terrain under an
// object's cutout; the object's model draws the pit's walls and floor in the hole. Nothing else
// changes: the voxels, every wall and every other top stay, so the hole is only where the pit is.
//
// The light under roofs reads the same columns (caveLight.ts). Not here yet (docs/progress/3d-view.md):
// soil and the Map look per run top, and the level-slice cutaway's caps; today the shaders colour
// each face by its tile.
//
// World space: X = x, Y = height, Z = −y (north is −Z). Faces wind counter-clockwise seen from
// outside. Pure TypeScript, so it runs in Node tests and could run in a worker.

import { LAYERS } from "./model";

export const CHUNK = 32;

export interface TerrainSource {
  W: number;
  H: number;
  /** The top surface per tile; a plain tile's column is solid from 0 up to it. */
  heights: Uint8Array;
  /** Tile index → 23 voxels (1 = solid), for columns that are not one solid run from z = 0. */
  columns: ReadonlyMap<number, Uint8Array>;
  /** Tile index → a level whose top face is not drawn: a mine site's or a seep's pit, whose model draws the
   *  pit's walls and floor instead (as the game hides the terrain's top under an object's cutout).
   *  Only the top at exactly that level is left out; the voxels and every wall stay. */
  cutout?: ReadonlyMap<number, number>;
}

export interface MeshData {
  /** x, y, z per vertex. */
  positions: Float32Array;
  /** Axis normal per vertex (x, y, z in −127…127). */
  normals: Int8Array;
  indices: Uint32Array;
  quads: number;
}

/** A growable vertex and index buffer of quads. */
export class QuadBuffer {
  private pos: Float32Array;
  private nrm: Int8Array;
  quads = 0;

  constructor(capacity = 256) {
    this.pos = new Float32Array(capacity * 12);
    this.nrm = new Int8Array(capacity * 12);
  }

  private grow(): void {
    const pos = new Float32Array(this.pos.length * 2);
    pos.set(this.pos);
    this.pos = pos;
    const nrm = new Int8Array(this.nrm.length * 2);
    nrm.set(this.nrm);
    this.nrm = nrm;
  }

  /** Four corners, counter-clockwise seen from the side the normal points to. */
  quad(c: readonly number[], nx: number, ny: number, nz: number): void {
    if ((this.quads + 1) * 12 > this.pos.length) this.grow();
    const o = this.quads * 12;
    for (let k = 0; k < 12; k++) this.pos[o + k] = c[k];
    for (let v = 0; v < 4; v++) {
      this.nrm[o + v * 3] = nx * 127;
      this.nrm[o + v * 3 + 1] = ny * 127;
      this.nrm[o + v * 3 + 2] = nz * 127;
    }
    this.quads++;
  }

  finish(): MeshData {
    const n = this.quads;
    const indices = new Uint32Array(n * 6);
    for (let q = 0; q < n; q++) {
      const v = q * 4;
      const o = q * 6;
      indices[o] = v;
      indices[o + 1] = v + 1;
      indices[o + 2] = v + 2;
      indices[o + 3] = v;
      indices[o + 4] = v + 2;
      indices[o + 5] = v + 3;
    }
    return { positions: this.pos.slice(0, n * 12), normals: this.nrm.slice(0, n * 12), indices, quads: n };
  }
}

// face emitters, in tile coordinates (x east, y north, z up)
function top(b: QuadBuffer, x0: number, y0: number, x1: number, y1: number, z: number): void {
  b.quad([x0, z, -y0, x1, z, -y0, x1, z, -y1, x0, z, -y1], 0, 1, 0);
}
function bottom(b: QuadBuffer, x0: number, y0: number, x1: number, y1: number, z: number): void {
  b.quad([x0, z, -y0, x0, z, -y1, x1, z, -y1, x1, z, -y0], 0, -1, 0);
}
/** The east face of column x (at X = x + 1), over y0…y1, from za to zb. */
function east(b: QuadBuffer, x: number, y0: number, y1: number, za: number, zb: number): void {
  b.quad([x + 1, za, -y0, x + 1, za, -y1, x + 1, zb, -y1, x + 1, zb, -y0], 1, 0, 0);
}
function west(b: QuadBuffer, x: number, y0: number, y1: number, za: number, zb: number): void {
  b.quad([x, za, -y1, x, za, -y0, x, zb, -y0, x, zb, -y1], -1, 0, 0);
}
/** The north face of row y (at Z = −(y + 1)), over x0…x1. */
function north(b: QuadBuffer, y: number, x0: number, x1: number, za: number, zb: number): void {
  b.quad([x1, za, -(y + 1), x0, za, -(y + 1), x0, zb, -(y + 1), x1, zb, -(y + 1)], 0, 0, -1);
}
function south(b: QuadBuffer, y: number, x0: number, x1: number, za: number, zb: number): void {
  b.quad([x0, za, -y, x1, za, -y, x1, zb, -y, x0, zb, -y], 0, 0, 1);
}

type Side = 0 | 1 | 2 | 3; // east, west, north, south
const DX = [1, -1, 0, 0];
const DY = [0, 0, 1, -1];

/** The column at tile `i` as a mask: bit z set when voxel z is solid. */
export function columnMask(src: TerrainSource, i: number): number {
  const c = src.columns.size > 0 ? src.columns.get(i) : undefined;
  if (!c) {
    const h = src.heights[i];
    return h >= 31 ? 0x7fffffff : (1 << h) - 1;
  }
  let m = 0;
  for (let z = 0; z < LAYERS; z++) if (c[z]) m |= 1 << z;
  return m;
}

/** Bits lo…hi − 1 set. */
const span = (lo: number, hi: number): number => ((hi >= 31 ? 0x7fffffff : (1 << hi) - 1) ^ ((1 << lo) - 1));
/** The lowest set bit's index (x ≠ 0). */
const lowest = (x: number): number => 31 - Math.clz32(x & -x);

// scratch, reused across chunks (meshing is synchronous): the columns of a chunk and its one-tile
// border, the tops and undersides per tile, and what the greedy merge has covered
const SIDE = CHUNK + 2;
const masks = new Uint32Array(SIDE * SIDE);
const faces = new Uint32Array(CHUNK * CHUNK);
const covered = new Uint32Array(CHUNK * CHUNK);

/** Greedy rectangles over `faces` (a bit per level per tile), tile by tile in reading order and each
 *  tile's levels from the lowest, each rectangle grown along x, then along y. */
function mergeFaces(w: number, h: number, emit: (lx: number, ly: number, rw: number, rh: number, z: number) => void): void {
  covered.fill(0, 0, w * h);
  for (let ly = 0; ly < h; ly++) {
    for (let lx = 0; lx < w; lx++) {
      const t = ly * w + lx;
      let rest = faces[t] & ~covered[t];
      while (rest) {
        const z = lowest(rest);
        const bit = 1 << z;
        rest &= ~bit;
        let rw = 1;
        while (lx + rw < w && faces[t + rw] & ~covered[t + rw] & bit) rw++;
        let rh = 1;
        grow: while (ly + rh < h) {
          const row = (ly + rh) * w + lx;
          for (let k = 0; k < rw; k++) if (!(faces[row + k] & ~covered[row + k] & bit)) break grow;
          rh++;
        }
        for (let yy = 0; yy < rh; yy++) for (let xx = 0; xx < rw; xx++) covered[(ly + yy) * w + lx + xx] |= bit;
        emit(lx, ly, rw, rh, z);
      }
    }
  }
}

/** Mesh one chunk (cx, cy count chunks from the south-west corner). */
export function meshChunk(src: TerrainSource, cx: number, cy: number): MeshData {
  const { W, H } = src;
  const x0 = cx * CHUNK;
  const y0 = cy * CHUNK;
  const x1 = Math.min(W, x0 + CHUNK);
  const y1 = Math.min(H, y0 + CHUNK);
  const w = x1 - x0;
  const h = y1 - y0;
  const b = new QuadBuffer(w * h * 2);
  const cut = src.cutout && src.cutout.size > 0 ? src.cutout : null;

  // the columns of the chunk and its border (outside the map: air)
  const mw = w + 2;
  masks.fill(0, 0, mw * (h + 2));
  for (let y = Math.max(0, y0 - 1); y < Math.min(H, y1 + 1); y++)
    for (let x = Math.max(0, x0 - 1); x < Math.min(W, x1 + 1); x++) masks[(y - y0 + 1) * mw + x - x0 + 1] = columnMask(src, y * W + x);
  const at = (lx: number, ly: number) => (ly + 1) * mw + lx + 1;

  // tops: level L where voxel L − 1 is solid (or L = 0, the map's floor) and voxel L is air, less
  // a mine site's pit
  for (let ly = 0; ly < h; ly++)
    for (let lx = 0; lx < w; lx++) {
      const m = masks[at(lx, ly)];
      let f = ((m << 1) | 1) & ~m;
      const c = cut?.get((y0 + ly) * W + x0 + lx);
      if (c !== undefined) f &= ~(1 << c);
      faces[ly * w + lx] = f;
    }
  mergeFaces(w, h, (lx, ly, rw, rh, z) => top(b, x0 + lx, y0 + ly, x0 + lx + rw, y0 + ly + rh, z));

  // undersides: level z where voxel z is solid and voxel z − 1 air (never at the map's floor)
  let any = 0;
  for (let ly = 0; ly < h; ly++)
    for (let lx = 0; lx < w; lx++) {
      const m = masks[at(lx, ly)];
      const f = m & ~(m << 1) & ~1;
      faces[ly * w + lx] = f;
      any |= f;
    }
  if (any) mergeFaces(w, h, (lx, ly, rw, rh, z) => bottom(b, x0 + lx, y0 + ly, x0 + lx + rw, y0 + ly + rh, z));

  // walls: every span solid here and air at the neighbour, merged along the edge while the next
  // tile has the identical span
  const emit = (s: Side, line: number, a: number, e: number, za: number, zb: number) => {
    if (s === 0) east(b, line, a, e, za, zb);
    else if (s === 1) west(b, line, a, e, za, zb);
    else if (s === 2) north(b, line, a, e, za, zb);
    else south(b, line, a, e, za, zb);
  };
  // the spans open along the current line: where each started, its levels
  const openStart: number[] = [];
  const openLo: number[] = [];
  const openHi: number[] = [];
  for (let s = 0 as Side; s < 4; s = (s + 1) as Side) {
    const alongX = s >= 2; // north and south walls run along x
    const lines = alongX ? h : w;
    const len = alongX ? w : h;
    const step = DX[s] + DY[s] * mw; // to the neighbour, in `masks`
    for (let l = 0; l < lines; l++) {
      const line = alongX ? y0 + l : x0 + l;
      const base = alongX ? x0 : y0;
      let open = 0;
      for (let k = 0; k <= len; k++) {
        let exposed = 0;
        if (k < len) {
          const t = alongX ? at(k, l) : at(l, k);
          exposed = masks[t] & ~masks[t + step];
        }
        // the open spans this tile continues stay open; the others end here
        let kept = 0;
        for (let o = 0; o < open; o++) {
          const lo = openLo[o];
          const hi = openHi[o];
          const sp = span(lo, hi);
          // (the same span exactly: no solid just below or above it on this tile)
          if ((exposed & sp) === sp && !(exposed & (1 << hi)) && (lo === 0 || !(exposed & (1 << (lo - 1))))) {
            exposed &= ~sp;
            openStart[kept] = openStart[o];
            openLo[kept] = lo;
            openHi[kept] = hi;
            kept++;
          } else emit(s, line, base + openStart[o], base + k, lo, hi);
        }
        open = kept;
        // the tile's new spans
        while (exposed) {
          const lo = lowest(exposed);
          const hi = lo + lowest(~(exposed >>> lo));
          exposed &= ~span(lo, hi);
          openStart[open] = k;
          openLo[open] = lo;
          openHi[open] = hi;
          open++;
        }
      }
    }
  }
  return b.finish();
}

export function chunkCount(W: number, H: number): { nx: number; ny: number } {
  return { nx: Math.ceil(W / CHUNK), ny: Math.ceil(H / CHUNK) };
}

/** Chunks whose mesh can change when the tiles of `rect` change: its own chunks and those one
 *  tile around (their walls face the changed tiles). */
export function dirtyChunks(W: number, H: number, rect: { x0: number; y0: number; x1: number; y1: number }): [number, number][] {
  const { nx, ny } = chunkCount(W, H);
  const cx0 = Math.max(0, Math.floor((rect.x0 - 1) / CHUNK));
  const cy0 = Math.max(0, Math.floor((rect.y0 - 1) / CHUNK));
  const cx1 = Math.min(nx - 1, Math.floor((rect.x1 + 1) / CHUNK));
  const cy1 = Math.min(ny - 1, Math.floor((rect.y1 + 1) / CHUNK));
  const out: [number, number][] = [];
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) out.push([cx, cy]);
  return out;
}

/** The bounding rectangle of the tiles whose height differs (null: none). */
export function changedRect(W: number, H: number, a: Uint8Array, b: Uint8Array): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = W;
  let y0 = H;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (a[i] !== b[i]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  return x1 >= 0 ? { x0, y0, x1, y1 } : null;
}
