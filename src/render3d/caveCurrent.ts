// The current of water under water (3D view, part 4's limit): on a map with terrain above terrain a tile can hold a
// cave's water under the lake on its roof. The flow texture every water material reads (motion.ts `flowTex`, High's
// `hlFlow` and `hlRough`) holds one texel a tile, the water seen from above, so a cave's river under a wet roof would
// move as the lake does. Here every column below its tile's surface water gets its own: the water is dealt into its
// layers (waterLayers.ts, each column seeing the water and ground at its own level), each layer's current is worked
// out from its own columns' outflows (current.ts `currentOf`: each face's net flow against the column it meets there)
// and its rough water from its own surface (high/flow.ts `roughWater`), and both are written into a volume by level:
// RGBA a cell, RG the current as the flow texture draws it, B the rough water, A 255 in the cells of a column below its
// tile's surface water. The water shader reads the volume where A says so (materials.ts `ownFlowAt`), filtered across
// tiles at its own level, as the flow texture is filtered across tiles; everywhere else the flow texture stands. The
// columns the flow texture already draws (each tile's surface water) fill their cells too (A 0), with the flow
// texture's own values, so a cave's water reads the same current across the line where its roof turns dry.
//
// Only on a map with water below a tile's surface water: elsewhere there is no volume (`caveCurrent` null) and the
// shader's branch is never entered. Pure TypeScript, no three.js: made in the bake worker (high/bake.ts).

import { currentOf, outflowGrid } from "./current";
import type { SurfaceWater, WaterView } from "./model";
import { waterLayers, type WaterLayer } from "./waterLayers";

const WET = 0.001;
/** Tiles round the columns below a surface over which their layer's current and rough water are worked out. */
const MARGIN = 8;

/** The volume: `levels` levels of W × H cells from level `z0`, RGBA a cell (cell (x, y, z) at ((z − z0)·H + y)·W + x). */
export interface CaveCurrent {
  data: Uint8Array;
  z0: number;
  levels: number;
}

/** Packs a current (tiles a second, already at the looks' display speed) and a rough water (0–1) as the flow
 *  texture does (high/bake.ts `bakeFlow`). */
export type FlowBake = (W: number, H: number, ground: Uint8Array, sw: SurfaceWater, current: Float32Array) => { flow: Uint8Array; rough: Uint8Array };

/** The volume of `view` (with each column's own outflows, or none: still water) over the terrain (`columns`: tile →
 *  its 23 voxels, for the tiles that are not one plain run from the bottom), `sw` the renderer's surface water (with
 *  its `top`), `flow` and `rough` the surface's baked textures (RGBA a tile); null where no column stands below its
 *  tile's surface water. */
export function caveCurrent(W: number, H: number, heights: Uint8Array, columns: ReadonlyMap<number, ArrayLike<number>>, view: WaterView, sw: SurfaceWater, flow: Uint8Array, rough: Uint8Array, bake: FlowBake): CaveCurrent | null {
  if (!columns.size) return null;
  let lower = false;
  for (let k = 0; k < view.count && !lower; k++) if (view.depth[k] > WET && sw.top[view.tile[k]] !== k) lower = true;
  if (!lower) return null;
  const layers = waterLayers(W, H, heights, columns, view, sw);
  const N = W * H;
  // the levels the columns below a surface stand in, and the tiles round them in each layer
  let z0 = Infinity;
  let z1 = -Infinity;
  const span = (lsw: SurfaceWater, i: number): [number, number] => [Math.floor(lsw.floor[i]), Math.ceil(lsw.surface[i]) - 1];
  const below = (l: WaterLayer, i: number) => {
    const k = l.sw.top[i];
    return k >= 0 && !!l.own?.[i] && sw.top[i] !== k && l.sw.depth[i] > WET;
  };
  const boxes: (number[] | null)[] = layers.map(() => null);
  for (let L = 1; L < layers.length; L++) {
    const l = layers[L];
    for (let i = 0; i < N; i++) {
      if (!below(l, i)) continue;
      const [a, b] = span(l.sw, i);
      if (a < z0) z0 = a;
      if (b > z1) z1 = b;
      const x = i % W;
      const y = (i - x) / W;
      const box = (boxes[L] ??= [x, y, x, y]);
      box[0] = Math.min(box[0], x);
      box[1] = Math.min(box[1], y);
      box[2] = Math.max(box[2], x);
      box[3] = Math.max(box[3], y);
    }
  }
  if (!(z1 >= z0)) return null;
  z0 = Math.max(0, z0);
  const levels = z1 - z0 + 1;
  const data = new Uint8Array(N * levels * 4);
  for (let c = 0; c < N * levels; c++) {
    data[c * 4] = 128;
    data[c * 4 + 1] = 128;
  }
  const write = (i: number, a: number, b: number, r: number, g: number, rough: number, own: number) => {
    for (let z = Math.max(a, z0); z <= Math.min(b, z1); z++) {
      const c = ((z - z0) * N + i) * 4;
      data[c] = r;
      data[c + 1] = g;
      data[c + 2] = rough;
      data[c + 3] = own;
    }
  };
  // each tile's surface water, as the flow texture has it
  for (let i = 0; i < N; i++) {
    if (sw.top[i] < 0 || !(sw.depth[i] > WET)) continue;
    const [a, b] = span(sw, i);
    write(i, a, b, flow[i * 4], flow[i * 4 + 1], rough[i * 4], 0);
  }
  // the columns below a surface, each layer's own, worked out over the tiles round them (`MARGIN`: a column's current
  // reads only the tiles beside it, its rough water a few tiles of its river)
  for (let L = 1; L < layers.length; L++) {
    const box = boxes[L];
    if (!box) continue;
    const l = layers[L];
    const x0 = Math.max(0, box[0] - MARGIN);
    const y0 = Math.max(0, box[1] - MARGIN);
    const w = Math.min(W - 1, box[2] + MARGIN) - x0 + 1;
    const h = Math.min(H - 1, box[3] + MARGIN) - y0 + 1;
    const n = w * h;
    const part: SurfaceWater = { surface: new Float32Array(n), floor: new Float32Array(n), depth: new Float32Array(n), contamination: new Float32Array(n), top: new Int32Array(n), outflow: l.sw.outflow, lower: [] };
    const ground = new Uint8Array(n);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y0 + y) * W + x0 + x;
        const j = y * w + x;
        part.surface[j] = l.sw.surface[i];
        part.floor[j] = l.sw.floor[i];
        part.depth[j] = l.sw.depth[i];
        part.contamination[j] = l.sw.contamination[i];
        part.top[j] = l.sw.top[i];
        ground[j] = l.ground[i];
      }
    const out = outflowGrid(w, h, part);
    const current = out ? currentOf(w, h, out, part.depth) : new Float32Array(n * 2);
    const baked = bake(w, h, ground, part, current);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const i = (y0 + y) * W + x0 + x;
        if (!below(l, i)) continue;
        const j = y * w + x;
        const [a, b] = span(l.sw, i);
        write(i, a, b, baked.flow[j * 4], baked.flow[j * 4 + 1], baked.rough[j * 4], 255);
      }
  }
  return { data, z0, levels };
}

/** The cell of the volume a point in the water reads (a top face's a hair under its surface, a side's just inside it),
 *  as the shader finds it: −1 outside the volume. */
export function caveCurrentCell(W: number, H: number, v: CaveCurrent, x: number, y: number, level: number): number {
  const z = Math.floor(level) - v.z0;
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= W || ty >= H || z < 0 || z >= v.levels) return -1;
  return (z * H + ty) * W + tx;
}
