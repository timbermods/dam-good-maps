// A mesher for terrain as runs (investigation/terrain3d DESIGN §7, from its proto/mesher.ts), for
// the product to adopt: every tile meshed alike, heightfield or not.
// - Faces: a solid voxel gets a face toward each air neighbour: tops, undersides (cave ceilings,
//   the roof of an overhang, the inside of an arch) and all four sides. The bottom layer's
//   underside is never seen and gets none; the map's border gets walls.
// - Greedy merging per face plane and direction in each 32 × 32 chunk, so a heightfield's flat tops
//   and long walls stay a few quads and cave ceilings merge the same way. An edit remeshes only
//   the chunks it touched.
// - Light is not in the mesh: a small 3D texture per cell (lightVolume) holds the sky light and the
//   sun's light, sampled by the shader half a cell in front of each face, so caves, undersides and
//   overhang shadows darken without breaking any merge.
//
// World space as the product's (D45): X = x, Y = height, Z = −y. Pure TypeScript.

import { LAYERS, Terrain } from "./terrain";

export const CHUNK = 32;

export interface ChunkMesh {
  positions: Float32Array;
  normals: Int8Array;
  indices: Uint32Array;
  quads: number;
}

class Quads {
  pos: Float32Array;
  nrm: Int8Array;
  n = 0;
  constructor(cap = 1024) {
    this.pos = new Float32Array(cap * 12);
    this.nrm = new Int8Array(cap * 12);
  }
  /** A quad p, p+u, p+u+v, p+v, with u × v along the outward normal. */
  add(px: number, py: number, pz: number, ux: number, uy: number, uz: number, vx: number, vy: number, vz: number, nx: number, ny: number, nz: number): void {
    if ((this.n + 1) * 12 > this.pos.length) {
      const p = new Float32Array(this.pos.length * 2);
      p.set(this.pos);
      this.pos = p;
      const q = new Int8Array(this.nrm.length * 2);
      q.set(this.nrm);
      this.nrm = q;
    }
    const o = this.n * 12;
    const P = this.pos, Nn = this.nrm;
    P[o] = px; P[o + 1] = py; P[o + 2] = pz;
    P[o + 3] = px + ux; P[o + 4] = py + uy; P[o + 5] = pz + uz;
    P[o + 6] = px + ux + vx; P[o + 7] = py + uy + vy; P[o + 8] = pz + uz + vz;
    P[o + 9] = px + vx; P[o + 10] = py + vy; P[o + 11] = pz + vz;
    for (let k = 0; k < 4; k++) {
      Nn[o + 3 * k] = nx * 127;
      Nn[o + 3 * k + 1] = ny * 127;
      Nn[o + 3 * k + 2] = nz * 127;
    }
    this.n++;
  }
  mesh(): ChunkMesh {
    const idx = new Uint32Array(this.n * 6);
    for (let q = 0; q < this.n; q++) {
      const b = q * 4, o = q * 6;
      idx[o] = b; idx[o + 1] = b + 1; idx[o + 2] = b + 2; idx[o + 3] = b; idx[o + 4] = b + 2; idx[o + 5] = b + 3;
    }
    return { positions: this.pos.slice(0, this.n * 12), normals: this.nrm.slice(0, this.n * 12), indices: idx, quads: this.n };
  }
}

/** Greedy rectangles over a mask of A × B cells (row-major, a fastest). */
function greedy(mask: Uint8Array, A: number, B: number, emit: (a: number, b: number, da: number, db: number) => void): void {
  for (let b = 0; b < B; b++) {
    for (let a = 0; a < A; ) {
      if (!mask[b * A + a]) {
        a++;
        continue;
      }
      let da = 1;
      while (a + da < A && mask[b * A + a + da]) da++;
      let db = 1;
      outer: while (b + db < B) {
        for (let k = 0; k < da; k++) if (!mask[(b + db) * A + a + k]) break outer;
        db++;
      }
      for (let j = 0; j < db; j++) for (let k = 0; k < da; k++) mask[(b + j) * A + a + k] = 0;
      emit(a, b, da, db);
      a += da;
    }
  }
}

/** The mesh of one chunk: every face of its voxels toward air, merged per plane. */
export function meshChunk(t: Terrain, cx: number, cy: number): ChunkMesh {
  const x0 = cx * CHUNK, y0 = cy * CHUNK;
  const X = Math.min(CHUNK, t.W - x0), Y = Math.min(CHUNK, t.H - y0);
  // the highest level any column here or beside it reaches
  let L = 1;
  for (let y = Math.max(0, y0 - 1); y < Math.min(t.H, y0 + Y + 1); y++) for (let x = Math.max(0, x0 - 1); x < Math.min(t.W, x0 + X + 1); x++) L = Math.max(L, t.surface(y * t.W + x));
  L = Math.min(LAYERS, L + 1);
  const q = new Quads(Math.max(256, X * Y));
  const s = (x: number, y: number, z: number) => t.solid(x, y, z);
  const mxy = new Uint8Array(X * Y);
  for (let z = 0; z < L; z++) {
    let any = 0;
    for (let y = 0; y < Y; y++)
      for (let x = 0; x < X; x++) {
        const m = s(x0 + x, y0 + y, z) && !s(x0 + x, y0 + y, z + 1) ? 1 : 0;
        mxy[y * X + x] = m;
        any |= m;
      }
    if (any) greedy(mxy, X, Y, (a, b, da, db) => q.add(x0 + a, z + 1, -(y0 + b), da, 0, 0, 0, 0, -db, 0, 1, 0));
    if (z === 0) continue;
    any = 0;
    for (let y = 0; y < Y; y++)
      for (let x = 0; x < X; x++) {
        const m = s(x0 + x, y0 + y, z) && !s(x0 + x, y0 + y, z - 1) ? 1 : 0;
        mxy[y * X + x] = m;
        any |= m;
      }
    if (any) greedy(mxy, X, Y, (a, b, da, db) => q.add(x0 + a, z, -(y0 + b), 0, 0, -db, da, 0, 0, 0, -1, 0));
  }
  const myz = new Uint8Array(Y * L);
  for (let x = 0; x < X; x++) {
    for (const dir of [1, -1]) {
      let any = 0;
      for (let z = 0; z < L; z++)
        for (let y = 0; y < Y; y++) {
          const m = s(x0 + x, y0 + y, z) && !s(x0 + x + dir, y0 + y, z) ? 1 : 0;
          myz[z * Y + y] = m;
          any |= m;
        }
      if (!any) continue;
      if (dir === 1) greedy(myz, Y, L, (a, b, da, db) => q.add(x0 + x + 1, b, -(y0 + a), 0, 0, -da, 0, db, 0, 1, 0, 0));
      else greedy(myz, Y, L, (a, b, da, db) => q.add(x0 + x, b, -(y0 + a), 0, db, 0, 0, 0, -da, -1, 0, 0));
    }
  }
  const mxz = new Uint8Array(X * L);
  for (let y = 0; y < Y; y++) {
    for (const dir of [1, -1]) {
      let any = 0;
      for (let z = 0; z < L; z++)
        for (let x = 0; x < X; x++) {
          const m = s(x0 + x, y0 + y, z) && !s(x0 + x, y0 + y + dir, z) ? 1 : 0;
          mxz[z * X + x] = m;
          any |= m;
        }
      if (!any) continue;
      if (dir === 1) greedy(mxz, X, L, (a, b, da, db) => q.add(x0 + a, b, -(y0 + y + 1), 0, db, 0, da, 0, 0, 0, 0, -1));
      else greedy(mxz, X, L, (a, b, da, db) => q.add(x0 + a, b, -(y0 + y), da, 0, 0, 0, db, 0, 0, 0, 1));
    }
  }
  return q.mesh();
}

/** The chunks a set of changed tiles touches (a face on a chunk's edge reads its neighbour). */
export function dirtyChunks(W: number, H: number, box: { x0: number; y0: number; x1: number; y1: number }): [number, number][] {
  const out: [number, number][] = [];
  const cx0 = Math.max(0, Math.floor((box.x0 - 1) / CHUNK)), cx1 = Math.min(Math.ceil(W / CHUNK) - 1, Math.floor((box.x1 + 1) / CHUNK));
  const cy0 = Math.max(0, Math.floor((box.y0 - 1) / CHUNK)), cy1 = Math.min(Math.ceil(H / CHUNK) - 1, Math.floor((box.y1 + 1) / CHUNK));
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) out.push([cx, cy]);
  return out;
}

/** Levels in the light volume: the 23 layers and one of open sky over them. */
export const LIGHT_LEVELS = LAYERS + 1;

/** Toward the sun in tile space (x east, y north, z up): the editor's warm sun from the north-west,
 *  50° up (src/render3d/palette.ts LIGHT). */
export const SUN_TILE = (() => {
  const az = [-Math.SQRT1_2, Math.SQRT1_2];
  const e = (50 * Math.PI) / 180;
  return [az[0] * Math.cos(e), az[1] * Math.cos(e), Math.sin(e)] as const;
})();

/**
 * Light per cell, two bytes (sky, sun), W × H × LIGHT_LEVELS cells, x fastest, then y, then level:
 * - sky: 255 under open sky, then 26 less per step through air from the nearest sky-lit cell, never
 *   below 64; 0 in rock (a cave's depths are dim, its mouth bright);
 * - sun: 255 where a ray toward the sun leaves the land without meeting rock, else 0 (overhangs
 *   and cliffs cast their shadows; trilinear filtering softens the edges).
 * `box`: only recompute the cells an edit there can change (the sky walk is local; the sun's shadows
 * reach down-sun), into `into`.
 */
export function lightVolume(t: Terrain, into?: Uint8Array, box?: { x0: number; y0: number; x1: number; y1: number }): Uint8Array {
  const { W, H, N } = t;
  const D = LIGHT_LEVELS;
  const out = into ?? new Uint8Array(N * D * 2);
  const reach = 22; // down-sun shadow reach, and more than the sky walk's (255 − 64) / 26 steps
  const bx0 = box ? Math.max(0, box.x0 - reach) : 0, bx1 = box ? Math.min(W - 1, box.x1 + reach) : W - 1;
  const by0 = box ? Math.max(0, box.y0 - reach) : 0, by1 = box ? Math.min(H - 1, box.y1 + reach) : H - 1;
  const FLOOR = 64, STEP = 26;
  const idx = (i: number, z: number) => (z * N + i) * 2;
  // 1. sky: open above each column's top; roofed air starts at the floor
  const queue: number[] = [];
  for (let y = by0; y <= by1; y++)
    for (let x = bx0; x <= bx1; x++) {
      const i = y * W + x;
      const top = t.surface(i);
      for (let z = 0; z < D; z++) out[idx(i, z)] = z >= top ? 255 : t.at(i, z) ? 0 : FLOOR;
    }
  for (let y = by0; y <= by1; y++)
    for (let x = bx0; x <= bx1; x++) {
      const i = y * W + x;
      const top = t.surface(i);
      for (let z = 0; z < top; z++) {
        if (out[idx(i, z)] !== FLOOR) continue;
        const lit = (x > 0 && out[idx(i - 1, z)] === 255) || (x < W - 1 && out[idx(i + 1, z)] === 255) || (y > 0 && out[idx(i - W, z)] === 255) || (y < H - 1 && out[idx(i + W, z)] === 255);
        if (lit) {
          out[idx(i, z)] = 255 - STEP;
          queue.push(z * N + i);
        }
      }
    }
  for (let h = 0; h < queue.length; h++) {
    const c = queue[h];
    const z = Math.floor(c / N), i = c - z * N, x = i % W, y = (i - x) / W;
    const next = out[c * 2] - STEP;
    if (next <= FLOOR) continue;
    const nb = [x > bx0 ? c - 1 : -1, x < bx1 ? c + 1 : -1, y > by0 ? c - W : -1, y < by1 ? c + W : -1, z > 0 ? c - N : -1, z < D - 1 ? c + N : -1];
    for (const n of nb) {
      if (n < 0) continue;
      const o = out[n * 2];
      if (o === 0 || o === 255 || o >= next) continue;
      out[n * 2] = next;
      queue.push(n);
    }
  }
  // 2. sun: march each air cell's centre toward the sun
  const [sx, sy, sz] = SUN_TILE;
  const stepLen = 0.34;
  let maxTop = 0;
  for (let i = 0; i < N; i++) maxTop = Math.max(maxTop, t.surface(i));
  for (let y = by0; y <= by1; y++)
    for (let x = bx0; x <= bx1; x++) {
      const i = y * W + x;
      for (let z = 0; z < D; z++) {
        const o = idx(i, z) + 1;
        if (z < LAYERS && t.at(i, z)) {
          out[o] = 0;
          continue;
        }
        if (z >= maxTop) {
          out[o] = 255;
          continue;
        }
        let px = x + 0.5, py = y + 0.5, pz = z + 0.5;
        let lit = 255;
        for (;;) {
          px += sx * stepLen;
          py += sy * stepLen;
          pz += sz * stepLen;
          if (pz >= maxTop || px < 0 || py < 0 || px >= W || py >= H) break;
          if (t.solid(Math.floor(px), Math.floor(py), Math.floor(pz))) {
            lit = 0;
            break;
          }
        }
        out[o] = lit;
      }
    }
  return out;
}
