// The chunk mesher as it was before the one mesher for runs (3D view, part 1), kept unedited as the
// reference `meshEquivalence.test.ts` compares against: on a map without terrain above terrain the
// new mesher (src/render3d/mesh.ts) gives these exact quads. Only this header and the import path
// changed; chunkCount, dirtyChunks and changedRect, unchanged in the product, are left out.
//
// Its own description: top faces merged greedily into rectangles of one height, side walls merged
// along their edge, and a voxel mesher only for the columns with caves or overhangs (a solid voxel
// gets a face wherever its neighbour is air).

import { LAYERS } from "../../src/render3d/model";

export const CHUNK = 32;

export interface TerrainSource {
  W: number;
  H: number;
  heights: Uint8Array;
  /** Tile index → 23 voxels (1 = solid), for columns that are not one solid run from z = 0. */
  columns: ReadonlyMap<number, Uint8Array>;
  /** Tile index → a level whose top face is not drawn: a mine site's pit, whose model draws the
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

/** Mesh one chunk (cx, cy count chunks from the south-west corner). */
export function meshChunk(src: TerrainSource, cx: number, cy: number): MeshData {
  const { W, H, heights, columns } = src;
  const x0 = cx * CHUNK;
  const y0 = cy * CHUNK;
  const x1 = Math.min(W, x0 + CHUNK);
  const y1 = Math.min(H, y0 + CHUNK);
  const w = x1 - x0;
  const h = y1 - y0;
  const b = new QuadBuffer(w * h * 2);
  const hasColumns = columns.size > 0;
  const isCol = (i: number) => hasColumns && columns.has(i);
  const cut = src.cutout && src.cutout.size > 0 ? src.cutout : null;
  /** A heightfield tile whose top is cut out (it gets no top face, and merges with none). */
  const isCut = (i: number) => !!cut && cut.get(i) === heights[i];
  /** Solid at (x, y, z)? Outside the map is air. */
  const solid = (x: number, y: number, z: number): boolean => {
    if (x < 0 || y < 0 || x >= W || y >= H || z < 0) return false;
    const i = y * W + x;
    const c = hasColumns ? columns.get(i) : undefined;
    return c ? z < LAYERS && c[z] === 1 : z < heights[i];
  };

  // top faces: greedy rectangles of one height (heightfield tiles only)
  const done = new Uint8Array(w * h);
  for (let ly = 0; ly < h; ly++) {
    for (let lx = 0; lx < w; lx++) {
      if (done[ly * w + lx]) continue;
      const i = (y0 + ly) * W + x0 + lx;
      if (isCol(i) || isCut(i)) {
        done[ly * w + lx] = 1;
        continue;
      }
      const z = heights[i];
      let rw = 1;
      while (lx + rw < w && !done[ly * w + lx + rw] && heights[i + rw] === z && !isCol(i + rw) && !isCut(i + rw)) rw++;
      let rh = 1;
      grow: while (ly + rh < h) {
        const row = (y0 + ly + rh) * W + x0 + lx;
        for (let k = 0; k < rw; k++) if (done[(ly + rh) * w + lx + k] || heights[row + k] !== z || isCol(row + k) || isCut(row + k)) break grow;
        rh++;
      }
      for (let yy = 0; yy < rh; yy++) for (let xx = 0; xx < rw; xx++) done[(ly + yy) * w + lx + xx] = 1;
      top(b, x0 + lx, y0 + ly, x0 + lx + rw, y0 + ly + rh, z);
    }
  }

  // walls of heightfield tiles: toward a heightfield neighbour (or the outside) one quad from the
  // neighbour's height up, merged along the edge; toward a voxel column one quad per air run
  const wallRange = (x: number, y: number, s: Side): number => {
    const nx = x + DX[s];
    const ny = y + DY[s];
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) return 0;
    return heights[ny * W + nx];
  };
  const emit = (s: Side, line: number, a: number, e: number, za: number, zb: number) => {
    if (s === 0) east(b, line, a, e, za, zb);
    else if (s === 1) west(b, line, a, e, za, zb);
    else if (s === 2) north(b, line, a, e, za, zb);
    else south(b, line, a, e, za, zb);
  };
  for (let s = 0 as Side; s < 4; s = (s + 1) as Side) {
    const alongX = s >= 2; // north and south walls run along x
    const lines = alongX ? h : w;
    const len = alongX ? w : h;
    for (let l = 0; l < lines; l++) {
      let runStart = -1;
      let runLo = 0;
      let runHi = 0;
      const flush = (end: number) => {
        if (runStart < 0) return;
        const line = alongX ? y0 + l : x0 + l;
        const a = alongX ? x0 + runStart : y0 + runStart;
        const e = alongX ? x0 + end : y0 + end;
        emit(s, line, a, e, runLo, runHi);
        runStart = -1;
      };
      for (let k = 0; k < len; k++) {
        const x = alongX ? x0 + k : x0 + l;
        const y = alongX ? y0 + l : y0 + k;
        const i = y * W + x;
        if (isCol(i)) {
          flush(k);
          continue;
        }
        const hz = heights[i];
        const nx = x + DX[s];
        const ny = y + DY[s];
        const ni = ny * W + nx;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && isCol(ni)) {
          flush(k);
          // per air run of the neighbouring voxel column
          const c = columns.get(ni)!;
          let z = 0;
          while (z < hz) {
            if (c[z]) {
              z++;
              continue;
            }
            let ze = z;
            while (ze < hz && !c[ze]) ze++;
            emit(s, alongX ? y : x, alongX ? x : y, (alongX ? x : y) + 1, z, ze);
            z = ze;
          }
          continue;
        }
        const lo = wallRange(x, y, s);
        if (lo >= hz) {
          flush(k);
          continue;
        }
        if (runStart >= 0 && lo === runLo && hz === runHi) continue;
        flush(k);
        runStart = k;
        runLo = lo;
        runHi = hz;
      }
      flush(len);
    }
  }

  // voxel columns: a face wherever a solid voxel meets air
  if (hasColumns) {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const c = columns.get(y * W + x);
        if (!c) continue;
        const cutAt = cut?.get(y * W + x);
        for (let z = 0; z < LAYERS; z++) {
          if (!c[z]) continue;
          if ((z + 1 >= LAYERS || !c[z + 1]) && cutAt !== z + 1) top(b, x, y, x + 1, y + 1, z + 1);
          if (z > 0 && !c[z - 1]) bottom(b, x, y, x + 1, y + 1, z);
          if (!solid(x + 1, y, z)) east(b, x, y, y + 1, z, z + 1);
          if (!solid(x - 1, y, z)) west(b, x, y, y + 1, z, z + 1);
          if (!solid(x, y + 1, z)) north(b, y, x, x + 1, z, z + 1);
          if (!solid(x, y - 1, z)) south(b, y, x, x + 1, z, z + 1);
        }
      }
    }
  }
  return b.finish();
}

