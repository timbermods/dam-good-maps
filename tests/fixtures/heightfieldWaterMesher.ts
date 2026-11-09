// The water mesher as it was before water per column (3D view, part 4), kept to prove that a map without
// terrain above terrain draws its water exactly as before (tests/unit/waterLayers.test.ts), as
// heightfieldMesher.ts does for the terrain. Its lower water (columns below a tile's surface water) is left
// out: such a map has none. Since D201's amendment (2026-10-29) it draws a fall as the main mesher does, with no fall
// instances or foam flags; since D154's of 2026-11-08, as the lower tile's slope (fallSlope.ts), with no curtain
// between two waters, and every side with the tile's own badwater share (D148).

import { CHUNK } from "../../src/render3d/mesh";
import type { SurfaceWater } from "../../src/render3d/model";
import { BLEND_KERNEL, blendInto, dropFlags, FALL, SHORE_BITS, type WaterMeshData } from "../../src/render3d/waterMesh";
import { handOver, SLOPE_MIN, slopeGrid, slopeHeights, tileRise } from "../../src/render3d/fallSlope";

const STEP = 0.02;
const SAME_WATER = 0.35;
const BLEND_WINDOW = 4;
let badScratch = new Float32Array(0);
let handScratch = new Float32Array(0);
const grid = slopeGrid();
const nearGrid = slopeGrid();

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
export type HeightfieldWaterMesh = Omit<WaterMeshData, "cut" | "shore">;

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
  // (the badwater share handed over to the water below a fall first, as the game's FindBestProperties does: fallSlope.ts)
  if (handScratch.length < W * H) handScratch = new Float32Array(W * H);
  const reach = BLEND_WINDOW + BLEND_KERNEL.length - 1;
  handOver(W, H, sw, sw.contamination, handScratch, 1, true, x0 - reach, y0 - reach, x1 + reach - 1, y1 + reach - 1);
  blendInto(bad, W, H, { ...sw, contamination: handScratch }, x0 - BLEND_WINDOW, y0 - BLEND_WINDOW, x1 + BLEND_WINDOW - 1, y1 + BLEND_WINDOW - 1);
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
        // a fall's slope (since D154's amendment of 2026-11-08, as the main mesher: fallSlope.ts), else one flat quad
        const slope = tileRise(W, H, sw, x, y) >= SLOPE_MIN && slopeHeights(W, H, sw, x, y, grid);
        if (slope) {
          const at = (q: number, a: readonly number[]) => {
            const fx = (q & 3) / 3;
            const fy = (q >> 2) / 3;
            return (1 - fx) * (1 - fy) * a[0] + fx * (1 - fy) * a[1] + fx * fy * a[2] + (1 - fx) * fy * a[3];
          };
          const vd = Array.from({ length: 16 }, (_, q) => (grid.seen[q] === grid.seen[q] ? grid.seen[q] : at(q, [k0[0], k1[0], k2[0], k3[0]])));
          const vc = Array.from({ length: 16 }, (_, q) => at(q, [c0, c1, c2, c3]));
          for (let j = 0; j < 3; j++)
            for (let i = 0; i < 3; i++) {
              const q = [i + 1 + 4 * j, i + 1 + 4 * (j + 1), i + 4 * (j + 1), i + 4 * j];
              b.quad4(q.flatMap((v) => [x + (v & 3) / 3, grid.height[v], -(y + (v >> 2) / 3)]), q.map((v) => vd[v]), q.map((v) => vc[v]), 0, 1, 0, flags);
            }
        } else b.quad4([x, s, -y, x + 1, s, -y, x + 1, s, -(y + 1), x, s, -(y + 1)], [k0[0], k1[0], k2[0], k3[0]], [c0, c1, c2, c3], 0, 1, 0, flags);
        // curtains toward lower dry neighbours and the map's edge, down to the ground, never below the floor, each with
        // the badwater share of the top's edge it hangs from, its top along the top's edge; toward a wet neighbour a
        // skirt where this top's edge stands STEP or more over the neighbour's at a vertex, down to it (as the main
        // mesher: water meets water by the slope, the skirt closing where their edges part)
        const dd = [d, d, d, d];
        const SIDES = [
          { ax: 1, ay: 0, bx: 1, by: 1, a: c1, b: c2, grid: [3, 7, 11, 15], nx: 1, nz: 0 },
          { ax: 0, ay: 1, bx: 0, by: 0, a: c3, b: c0, grid: [12, 8, 4, 0], nx: -1, nz: 0 },
          { ax: 1, ay: 1, bx: 0, by: 1, a: c2, b: c3, grid: [15, 14, 13, 12], nx: 0, nz: -1 },
          { ax: 0, ay: 0, bx: 1, by: 0, a: c0, b: c1, grid: [0, 1, 2, 3], nx: 0, nz: 1 },
        ];
        for (let k = 0; k < 4; k++) {
          const xx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
          const yy = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
          const inside = xx >= 0 && yy >= 0 && xx < W && yy < H;
          const wet = inside && sw.surface[yy * W + xx] === sw.surface[yy * W + xx];
          const S = SIDES[k];
          const sn = wet ? sw.surface[yy * W + xx] : 0;
          if (wet && !(Math.max(s, ...(slope ? S.grid.map((v) => grid.height[v]) : [])) >= sn + STEP)) continue;
          const nearSlope = wet && tileRise(W, H, sw, xx, yy) >= SLOPE_MIN && slopeHeights(W, H, sw, xx, yy, nearGrid);
          // (the neighbour's vertices along the side: its opposite side's, backwards)
          const O = [...SIDES[k ^ 1].grid].reverse();
          const lv = wet ? sn : level(xx, yy);
          const e = Math.max(lv, f);
          const n = slope || nearSlope ? 3 : 1;
          for (let q = 0; q < n; q++) {
            const ta = q / n;
            const tb = (q + 1) / n;
            const ha = slope ? grid.height[S.grid[q]] : s;
            const hb = slope ? grid.height[S.grid[q + 1]] : s;
            const ea = wet ? Math.min(ha, Math.max(f, nearSlope ? nearGrid.height[O[q]] : sn)) : e;
            const eb = wet ? Math.min(hb, Math.max(f, nearSlope ? nearGrid.height[O[q + 1]] : sn)) : e;
            if (wet ? !(Math.max(ha - ea, hb - eb) >= STEP) : !(lv < Math.max(ha, hb) - STEP)) continue;
            // (every side: the tile's own share, a fall's handed over)
            const ca = c;
            const cb = c;
            const [ax, ay, bx, by] = [x + S.ax + (S.bx - S.ax) * ta, y + S.ay + (S.by - S.ay) * ta, x + S.ax + (S.bx - S.ax) * tb, y + S.ay + (S.by - S.ay) * tb];
            const fl = wet ? Math.min(Math.round(FALL * 30) - 1, dropFlags(Math.max(ha, hb), Math.min(ea, eb), false)) : dropFlags(Math.max(ha, hb), e, !inside);
            b.quad4([ax, ea, -ay, bx, eb, -by, bx, hb, -by, ax, ha, -ay], dd, [ca, cb, cb, ca], S.nx, 0, S.nz, fl);
          }
        }
      }
    }
  }
  return b.finish();
}

