// What a change to the land touches in the view (Naturalize's re-meshing, the milestone session's request,
// 2026-10-03): a brush's update names a rectangle, but a Naturalize dab at Size 64 changes about 500 tiles scattered
// over a 95×95 box, so redoing the whole box (and the sky and tile data a reach round it) redid about 18 times the
// tiles that changed. Here, from the heights the view last drew and the heights now, the tiles that really changed
// and what depends on them: the terrain chunks holding a changed tile or a neighbour of one (a tile's walls face its
// neighbours), the water chunks two tiles round (a fall reads the ground round its lip), and for each row the span of
// tiles whose sky (and so tile data) a change can reach. Redoing exactly these gives the same bytes as redoing the
// whole box. Pure; tests/unit/terrainChanges.test.ts.

import { CHUNK } from "./mesh";

export type Rect = { x0: number; y0: number; x1: number; y1: number };

export interface TerrainChanges {
  /** How many tiles changed. */
  count: number;
  /** The changed tiles' bounding rectangle (the shadows, the objects riding the ground, the ambient light). */
  rect: Rect;
  /** Terrain chunks to mesh again ([cx, cy]). */
  chunks: [number, number][];
  /** Water chunks to mesh again. */
  waterChunks: [number, number][];
  /** For each row a change reaches, the span of tiles whose sky and tile data to redo (in row order). */
  rows: { y: number; x0: number; x1: number }[];
}

/** The changes inside `rect` between `drawn` (the heights the view shows) and `now`; null when none. `reach` is how
 *  far a height reaches into its neighbours' sky (light.ts SKY_REACH). */
export function terrainChanges(W: number, H: number, drawn: Uint8Array, now: Uint8Array, rect: Rect, reach: number): TerrainChanges | null {
  const x0 = Math.max(0, rect.x0);
  const y0 = Math.max(0, rect.y0);
  const x1 = Math.min(W - 1, rect.x1);
  const y1 = Math.min(H - 1, rect.y1);
  if (x0 > x1 || y0 > y1) return null;
  const nx = Math.ceil(W / CHUNK);
  const ny = Math.ceil(H / CHUNK);
  const chunk = new Uint8Array(nx * ny);
  const water = new Uint8Array(nx * ny);
  const mark = (into: Uint8Array, x: number, y: number, halo: number) => {
    const ca = Math.max(0, Math.floor((x - halo) / CHUNK));
    const cb = Math.min(nx - 1, Math.floor((x + halo) / CHUNK));
    const ra = Math.max(0, Math.floor((y - halo) / CHUNK));
    const rb = Math.min(ny - 1, Math.floor((y + halo) / CHUNK));
    for (let cy = ra; cy <= rb; cy++) for (let cx = ca; cx <= cb; cx++) into[cy * nx + cx] = 1;
  };
  // each changed row's span
  const lo = new Int32Array(y1 - y0 + 1).fill(-1);
  const hi = new Int32Array(y1 - y0 + 1).fill(-1);
  let count = 0;
  let bx0 = W;
  let bx1 = -1;
  let by0 = H;
  let by1 = -1;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      if (drawn[i] === now[i]) continue;
      count++;
      if (lo[y - y0] < 0) lo[y - y0] = x;
      hi[y - y0] = x;
      if (x < bx0) bx0 = x;
      if (x > bx1) bx1 = x;
      if (y < by0) by0 = y;
      if (y > by1) by1 = y;
      mark(chunk, x, y, 1);
      mark(water, x, y, 2);
    }
  if (!count) return null;
  const list = (m: Uint8Array) => {
    const out: [number, number][] = [];
    for (let k = 0; k < m.length; k++) if (m[k]) out.push([k % nx, Math.floor(k / nx)]);
    return out;
  };
  // the rows the sky can reach: each covers the changed spans within `reach` rows of it, widened by `reach`
  const rows: TerrainChanges["rows"] = [];
  for (let Y = Math.max(0, by0 - reach); Y <= Math.min(H - 1, by1 + reach); Y++) {
    let a = W;
    let b = -1;
    for (let y = Math.max(y0, Y - reach); y <= Math.min(y1, Y + reach); y++) {
      if (lo[y - y0] < 0) continue;
      a = Math.min(a, lo[y - y0] - reach);
      b = Math.max(b, hi[y - y0] + reach);
    }
    if (b >= 0) rows.push({ y: Y, x0: Math.max(0, a), x1: Math.min(W - 1, b) });
  }
  return { count, rect: { x0: bx0, y0: by0, x1: bx1, y1: by1 }, chunks: list(chunk), waterChunks: list(water), rows };
}
