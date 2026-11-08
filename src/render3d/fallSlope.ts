// Falls as the game draws them (D154 as amended 2026-11-08): the water below a step rises to meet the water above it,
// so a fall is the lower tile's own surface sloping up to the lip, not a face of its own.
//
// The game (Timberborn 1.1.2.8) gives every water tile a grid of four by four vertices, at 0, ⅓, ⅔ and 1 across
// (decompiled `Timberborn.WaterSystemRendering` `WaterMesh.UpdateWaterMesh`), its triangles split along the diagonal
// from (⅓·(i + 1), ⅓·j) to (⅓·i, ⅓·(j + 1)) (`GetWaterMesh`), and its vertex shader takes each vertex's height from the
// heights its compute shader `WaterColumnPostprocessor` works out (`resources.assets`, disassembled; numbers only):
//
// - `ProcessColumns` links a tile to a neighbour that has water, with no barrier between them, whose column overlaps
//   its own and whose surface stands under its ceiling. On our ground (no barriers; each layer of waterLayers.ts sees
//   the water at its own level) a neighbour is linked where it is wet and its surface is not over this tile's ceiling
//   (`SurfaceWater.ceiling`: a tunnel's water never rises to the open water outside it, into its roof).
// - `BreakCornerLinks` and `BreakCornerLinksReversed` keep a corner (diagonal) link only where both tiles between are
//   linked to both of the corner's tiles: here, where the tile links to the corner neighbour and both tiles between,
//   and they to it.
// - `CalculateHeights`, per vertex: the vertex sits a third of the way along each axis from its tile's middle toward
//   one side (an inner vertex, at ⅓ or ⅔) or on that side (an edge vertex, at 0 or 1). Its height is the highest of its
//   own surface and, across each axis, its linked neighbour's surface there (less 0.3 where it is inner on that axis),
//   and the linked corner neighbour's (less 0.3 where it is inner on either axis). An unlinked neighbour counts as its
//   own surface, so no vertex is ever under it.
// - `FindBestProperties` hands a tile the outflow (edges) and contamination (edges and corners) of its highest linked
//   neighbour that stands over it, by saturate(the rise).
//
// So where a fall is, the upper tile is flat right to the lip, and the tile below rises to meet it: its edge at the
// upper surface, its vertices a third of a tile in 0.3 lower, from two thirds in at its own surface. It is lit as any
// water's top, with the up normal (the vertex shader's normal is the object's up axis), and its flow textures, sampled
// at the world's xz, stretch down it, so it pours.
//
// This is drawing only (D342, D497): the map's water never changes. Pure TypeScript, no three.js: the water mesh
// workers and the bake worker run it too.

import { slopeCutShare, VIEW_TAN } from "./cutWater";
import type { SurfaceWater } from "./model";

/** `CalculateHeights`' drop at an inner vertex: it takes a linked neighbour's surface less this. */
export const SLOPE_DROP = 0.3;

/** A tile is drawn as the game's grid of sixteen vertices where a vertex stands at least this over its own surface;
 *  under it, as one flat quad (the step too small to see, as the water mesh drew none before). */
export const SLOPE_MIN = 0.02;

/** The vertices' places across a tile, as `CalculateHeights` reads them: the side they lean to (−1 or 1) × 1 at an
 *  edge, × 0.5 inner. */
const OFFSET = [-1, -0.5, 0.5, 1] as const;

type Water = Pick<SurfaceWater, "surface" | "depth" | "ceiling">;

/** Whether tile i links to tile (x, y) (`ProcessColumns`): it is on the map and wet, its surface not over i's ceiling. */
const linkedAt = (W: number, H: number, sw: Water, i: number, x: number, y: number): boolean => {
  if (x < 0 || y < 0 || x >= W || y >= H) return false;
  const j = y * W + x;
  return sw.surface[j] === sw.surface[j] && sw.depth[j] > 0 && !(sw.ceiling && sw.surface[j] > sw.ceiling[i]);
};

/** Whether the corner neighbour (x + sx, y + sy) is linked to tile (x, y) (`BreakCornerLinks`): the tile links to it
 *  and to both tiles between, and they to it; the tile itself is taken to be wet. */
export function cornerLinked(W: number, H: number, sw: Water, x: number, y: number, sx: number, sy: number): boolean {
  const i = y * W + x;
  if (!linkedAt(W, H, sw, i, x + sx, y + sy) || !linkedAt(W, H, sw, i, x + sx, y) || !linkedAt(W, H, sw, i, x, y + sy)) return false;
  return !sw.ceiling || (linkedAt(W, H, sw, i + sx, x + sx, y + sy) && linkedAt(W, H, sw, i + sy * W, x + sx, y + sy));
}

/** How far the highest linked neighbour's surface stands over a wet tile's own (0 where none stands over it): the
 *  highest of its sixteen vertices over its own surface, which `FindWaterfalls` reads (fallMask.ts). */
export function tileRise(W: number, H: number, sw: Water, x: number, y: number): number {
  const s = sw.surface[y * W + x];
  let top = s;
  for (let k = 0; k < 4; k++) {
    const dx = k === 0 ? 1 : k === 1 ? -1 : 0;
    const dy = k === 2 ? 1 : k === 3 ? -1 : 0;
    if (linkedAt(W, H, sw, y * W + x, x + dx, y + dy)) top = Math.max(top, sw.surface[(y + dy) * W + x + dx]);
  }
  for (let k = 0; k < 4; k++) {
    const sx = k & 1 ? 1 : -1;
    const sy = k & 2 ? 1 : -1;
    if (cornerLinked(W, H, sw, x, y, sx, sy)) top = Math.max(top, sw.surface[(y + sy) * W + x + sx]);
  }
  return top - s;
}

/** A grid tile's sixteen vertices (`slopeHeights`), index i + 4j at (x + i/3, y + j/3): its height, how far from it
 *  along the view the ground behind lies (`seen`, NaN where the vertex is at its own surface), the neighbour it rose to
 *  (`from`, its tile; −1 where none), and its cut share (`cut`, cutWater.ts `slopeCutShare`: what the seen depth is
 *  made of, for the water's shader under a layer cut). */
export interface SlopeGrid {
  height: Float32Array;
  seen: Float32Array;
  from: Int32Array;
  cut: Float32Array;
}

export function slopeGrid(): SlopeGrid {
  return { height: new Float32Array(16), seen: new Float32Array(16), from: new Int32Array(16), cut: new Float32Array(16) };
}

/** The sixteen heights of wet tile (x, y), as `CalculateHeights` makes them, into `g`; with each raised vertex's seen
 *  depth: the game reads a pixel's depth from the depth buffer (Q9 P3), the gap to what lies behind it along the view.
 *  From the game's pitch, looking toward the step (where a fall is seen), the view from a raised vertex `u` from the
 *  side it rose to (0 at an edge, ⅓ inner) drops u × tan(pitch) by that side: it meets the cliff there where the upper
 *  tile's floor stands over that, else it goes on into the upper water to its floor; never deeper than the vertex's
 *  height over its own floor. True when any vertex stands `SLOPE_MIN` or more over the tile's own surface. */
export function slopeHeights(W: number, H: number, sw: SurfaceWater, x: number, y: number, g: SlopeGrid): boolean {
  const i0 = y * W + x;
  const s = sw.surface[i0];
  const f = sw.floor[i0];
  // (each side's and corner's linked neighbour, its tile or −1: east, west, north (y + 1), south; then the corners)
  const ex = linkedAt(W, H, sw, i0, x + 1, y) ? i0 + 1 : -1;
  const wx = linkedAt(W, H, sw, i0, x - 1, y) ? i0 - 1 : -1;
  const ny = linkedAt(W, H, sw, i0, x, y + 1) ? i0 + W : -1;
  const sy = linkedAt(W, H, sw, i0, x, y - 1) ? i0 - W : -1;
  let raised = false;
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 4; i++) {
      const innerX = i === 1 || i === 2;
      const innerY = j === 1 || j === 2;
      const nx = i < 2 ? wx : ex;
      const nyy = j < 2 ? sy : ny;
      const dx = i < 2 ? -1 : 1;
      const dy = j < 2 ? -1 : 1;
      let h = s;
      let from = -1;
      let inner = false;
      if (nx >= 0) {
        const v = innerX ? sw.surface[nx] - SLOPE_DROP : sw.surface[nx];
        if (v > h) {
          h = v;
          from = nx;
          inner = innerX;
        }
      }
      if (nyy >= 0) {
        const v = innerY ? sw.surface[nyy] - SLOPE_DROP : sw.surface[nyy];
        if (v > h) {
          h = v;
          from = nyy;
          inner = innerY;
        }
      }
      if (nx >= 0 && nyy >= 0 && cornerLinked(W, H, sw, x, y, dx, dy)) {
        const d = i0 + dy * W + dx;
        const less = innerX || innerY;
        const v = less ? sw.surface[d] - SLOPE_DROP : sw.surface[d];
        if (v > h) {
          h = v;
          from = d;
          inner = less;
        }
      }
      const k = i + 4 * j;
      g.height[k] = h;
      g.from[k] = from;
      if (from < 0) {
        g.seen[k] = NaN;
        continue;
      }
      if (h - s >= SLOPE_MIN) raised = true;
      const u = inner ? 1 / 3 : 0;
      const back = h - sw.floor[from];
      g.seen[k] = Math.max(0.05, Math.min(h - f, Math.max(u * VIEW_TAN, back)));
      g.cut[k] = slopeCutShare(inner, back);
    }
  return raised;
}

/** `FindBestProperties`' hand-over, on per-tile values `v` (`n` a tile) into `out`, over tiles x0..x1 by y0..y1 (clipped
 *  to the map; `out`'s other tiles left as they were): each wet tile's toward its highest linked neighbour's that
 *  stands over it (edges, and with `corners` the linked corner neighbours too), by saturate(the rise). */
export function handOver(W: number, H: number, sw: Water, v: ArrayLike<number>, out: Float32Array, n: number, corners: boolean, x0 = 0, y0 = 0, x1 = W - 1, y1 = H - 1): void {
  const xa = Math.max(0, x0);
  const xb = Math.min(W - 1, x1);
  const ya = Math.max(0, y0);
  const yb = Math.min(H - 1, y1);
  for (let y = ya; y <= yb; y++)
    for (let x = xa; x <= xb; x++) {
      const i = y * W + x;
      for (let c = 0; c < n; c++) out[i * n + c] = v[i * n + c];
      if (!(sw.surface[i] === sw.surface[i] && sw.depth[i] > 0)) continue;
      const s = sw.surface[i];
      let best = s;
      let from = -1;
      for (let k = 0; k < 4; k++) {
        const dx = k === 0 ? 1 : k === 1 ? -1 : 0;
        const dy = k === 2 ? 1 : k === 3 ? -1 : 0;
        if (!linkedAt(W, H, sw, i, x + dx, y + dy)) continue;
        const j = (y + dy) * W + x + dx;
        if (sw.surface[j] > best) {
          best = sw.surface[j];
          from = j;
        }
      }
      if (corners)
        for (let k = 0; k < 4; k++) {
          const sx = k & 1 ? 1 : -1;
          const sy = k & 2 ? 1 : -1;
          if (!cornerLinked(W, H, sw, x, y, sx, sy)) continue;
          const j = (y + sy) * W + x + sx;
          if (sw.surface[j] > best) {
            best = sw.surface[j];
            from = j;
          }
        }
      if (from < 0) continue;
      const t = Math.min(1, best - s);
      for (let c = 0; c < n; c++) out[i * n + c] = v[i * n + c] + t * (v[from * n + c] - v[i * n + c]);
    }
}

/** The water with its contamination handed over as the game's `FindBestProperties` hands it (`handOver`, edges and
 *  corners), the whole map: what a fall's slope and the water below it are coloured by. */
export function handedWater<T extends Water & { contamination: Float32Array }>(W: number, H: number, sw: T): T {
  const contamination = new Float32Array(W * H);
  handOver(W, H, sw, sw.contamination, contamination, 1, true);
  return { ...sw, contamination };
}
