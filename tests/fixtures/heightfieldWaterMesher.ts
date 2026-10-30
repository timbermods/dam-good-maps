// The water mesher as it was before water per column (3D view, part 4), kept to prove that a map without
// terrain above terrain draws its water exactly as before (tests/unit/waterLayers.test.ts), as
// heightfieldMesher.ts does for the terrain. Its lower water (columns below a tile's surface water) is left
// out: such a map has none. Since D201's amendment (2026-10-29) it draws a fall as the main mesher does, a curtain down
// to the water below, with no fall instances or foam flags (D148).

import { CHUNK } from "../../src/render3d/mesh";
import type { SurfaceWater } from "../../src/render3d/model";
import { blendInto, dropFlags, SHORE_BITS, type WaterMeshData } from "../../src/render3d/waterMesh";

const STEP = 0.02;
const SAME_WATER = 0.35;
const BLEND_WINDOW = 4;
let badScratch = new Float32Array(0);

class WaterBuffer {
  pos: number[] = [];
  data: number[] = [];
  nrm: number[] = [];
  flg: number[] = [];
  quads = 0;
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
  finish(): HeightfieldWaterMesh {
    const n = this.quads;
    const indices = new Uint32Array(n * 6);
    for (let q = 0; q < n; q++) {
      const v = q * 4;
      indices.set([v, v + 1, v + 2, v, v + 2, v + 3], q * 6);
    }
    return { positions: new Float32Array(this.pos), data: new Float32Array(this.data), flags: new Float32Array(this.flg), normals: new Int8Array(this.nrm), indices, quads: n };
  }
}

/** A chunk's water as the mesher drew it then (the layer cut's per-vertex columns came later: cutWater.ts). */
export type HeightfieldWaterMesh = Omit<WaterMeshData, "cut">;

export function heightfieldWaterChunk(W: number, H: number, heights: Uint8Array, sw: SurfaceWater, cx: number, cy: number): HeightfieldWaterMesh {
  const b = new WaterBuffer();
  const x0 = cx * CHUNK;
  const y0 = cy * CHUNK;
  const x1 = Math.min(W, x0 + CHUNK);
  const y1 = Math.min(H, y0 + CHUNK);
  // the blend of the chunk's window only (a corner reads a tile past the chunk): the page's thread
  // blends no more of a 512x512 map than the chunk it meshes
  if (badScratch.length < W * H) badScratch = new Float32Array(W * H);
  const bad = badScratch;
  blendInto(bad, W, H, sw, x0 - BLEND_WINDOW, y0 - BLEND_WINDOW, x1 + BLEND_WINDOW - 1, y1 + BLEND_WINDOW - 1);
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
        b.quad4([x, s, -y, x + 1, s, -y, x + 1, s, -(y + 1), x, s, -(y + 1)], [k0[0], k1[0], k2[0], k3[0]], [c0, c1, c2, c3], 0, 1, 0, flags);
        // curtains toward lower neighbours: down to the ground (never below the floor), or to the
        // water just below, in front of the cliff where it stands below the floor; each with the
        // badwater share of the top's edge it hangs from; down to water well below, a fall
        const dd = [d, d, d, d];
        const drop = (xx: number, yy: number): number => {
          const lv = level(xx, yy);
          if (!(lv < s - STEP)) return NaN;
          const inside = xx >= 0 && yy >= 0 && xx < W && yy < H;
          const wetBelow = inside && sw.surface[yy * W + xx] === sw.surface[yy * W + xx];
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
    }
  }
  return b.finish();
}

