// Geometry shared by the rasterizers: distance from every tile to a river path, the arc position
// of the nearest point, and which side of the path a tile lies on; polygons; bed profiles.

import type { BedStep, Point, RiverParams } from "./schema";

export interface PathField {
  /** Distance from the tile centre to the path. */
  d: Float64Array;
  /** Arc length along the path of the nearest point. */
  s: Float64Array;
  /** +1 left of the flow direction, −1 right (by the nearest segment). */
  side: Int8Array;
  length: number;
}

/** Tile (x, y) has its centre at (x, y): the prototype's convention, where a river centreline
 *  at y = 40.3 puts rows 39–41 in a 5-wide channel. */
export function pathField(path: Point[], W: number, H: number): PathField {
  const n = path.length;
  const segLen: number[] = [];
  const cum: number[] = [0];
  for (let i = 0; i + 1 < n; i++) {
    const dx = path[i + 1][0] - path[i][0];
    const dy = path[i + 1][1] - path[i][1];
    const l = Math.sqrt(dx * dx + dy * dy);
    segLen.push(l);
    cum.push(cum[i] + l);
  }
  const d = new Float64Array(W * H);
  const s = new Float64Array(W * H);
  const side = new Int8Array(W * H);
  // (the segments in chunks, each with its bounding box: a chunk whose box lies no nearer than the
  // best distance so far cannot hold a nearer segment (the test is strict), so it is skipped and the
  // result is the same bit for bit; a 256² map's many rivers spent a second here)
  const CH = 16;
  const chunks: { i0: number; i1: number; x0: number; x1: number; y0: number; y1: number }[] = [];
  for (let i0 = 0; i0 + 1 < n; i0 += CH) {
    const i1 = Math.min(n - 1, i0 + CH);
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let k = i0; k <= i1; k++) {
      x0 = Math.min(x0, path[k][0]);
      x1 = Math.max(x1, path[k][0]);
      y0 = Math.min(y0, path[k][1]);
      y1 = Math.max(y1, path[k][1]);
    }
    chunks.push({ i0, i1, x0, x1, y0, y1 });
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let best = Infinity;
      let bestS = 0;
      let bestSide = 1;
      for (const c of chunks) {
        const bx = x < c.x0 ? c.x0 - x : x > c.x1 ? x - c.x1 : 0;
        const by = y < c.y0 ? c.y0 - y : y > c.y1 ? y - c.y1 : 0;
        // (a margin for rounding: the box test only skips what is clearly farther)
        if (bx * bx + by * by > best + 1e-6) continue;
      for (let i = c.i0; i < c.i1; i++) {
        const ax = path[i][0];
        const ay = path[i][1];
        const vx = path[i + 1][0] - ax;
        const vy = path[i + 1][1] - ay;
        const l2 = vx * vx + vy * vy;
        let t = l2 > 0 ? ((x - ax) * vx + (y - ay) * vy) / l2 : 0;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        const px = ax + t * vx - x;
        const py = ay + t * vy - y;
        const dd = px * px + py * py;
        if (dd < best) {
          best = dd;
          bestS = cum[i] + t * segLen[i];
          // cross product of the segment direction with (tile - segment start): positive = left
          bestSide = vx * (y - ay) - vy * (x - ax) >= 0 ? 1 : -1;
        }
      }
      }
      const idx = y * W + x;
      d[idx] = Math.sqrt(best);
      s[idx] = bestS;
      side[idx] = bestSide;
    }
  }
  return { d, s, side, length: cum[n - 1] };
}

/** Arc length at which the path first reaches x (for paths that run west to east). */
export function arcAtX(path: Point[], x: number): number {
  let acc = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const [ax, ay] = path[i];
    const [bx, by] = path[i + 1];
    const l = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
    if (x <= bx || i + 2 === path.length) {
      const t = bx !== ax ? Math.max(0, Math.min(1, (x - ax) / (bx - ax))) : 0;
      return acc + t * l;
    }
    acc += l;
  }
  return acc;
}

/** Point on the path at arc length s, and the unit normal pointing left of the flow. */
export function pointAtArc(path: Point[], s: number): { p: Point; normal: Point } {
  let acc = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const [ax, ay] = path[i];
    const [bx, by] = path[i + 1];
    const l = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay));
    if (s <= acc + l || i + 2 === path.length) {
      const t = l > 0 ? Math.max(0, Math.min(1, (s - acc) / l)) : 0;
      const nx = l > 0 ? -(by - ay) / l : 0;
      const ny = l > 0 ? (bx - ax) / l : 1;
      return { p: [ax + t * (bx - ax), ay + t * (by - ay)], normal: [nx, ny] };
    }
    acc += l;
  }
  return { p: path[path.length - 1], normal: [0, 1] };
}

/** Bed level at arc length s: the start level minus every step at or before s. */
export function bedAt(profile: { start: number; steps: BedStep[] }, s: number): number {
  let lv = profile.start;
  for (const st of profile.steps) if (s >= st.at) lv -= st.drop;
  return lv;
}

/** Tiles the floodplain runs on at the upper level below each bed step: the plunge gorge. Without
 *  it the upper channel's lip sits beside the lower floodplain, one level below its bed, and the
 *  river pours sideways over the whole valley floor downstream (PLAN §20, D26). */
export const PLUNGE = 4;

/** Floodplain (valley floor) level at arc length s: the bed plus `floorAboveBed`, stepping down
 *  PLUNGE tiles after each bed step. */
export function floorAt(river: RiverParams, s: number, floorAboveBed = river.bedDepth): number {
  return bedAt(river.bedProfile, s - PLUNGE) + floorAboveBed;
}

/** Tiles whose centre lies inside a polygon (even-odd rule), as a mask. */
export function polygonMask(poly: Point[], W: number, H: number): Uint8Array {
  const mask = new Uint8Array(W * H);
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, py] of poly) {
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }
  const y0 = Math.max(0, Math.ceil(minY));
  const y1 = Math.min(H - 1, Math.floor(maxY));
  const xs: number[] = [];
  for (let y = y0; y <= y1; y++) {
    xs.length = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > y !== yj > y) xs.push(xi + ((y - yi) / (yj - yi)) * (xj - xi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k]));
      const xb = Math.min(W - 1, Math.floor(xs[k + 1]));
      for (let x = xa; x <= xb; x++) mask[y * W + x] = 1;
    }
  }
  return mask;
}

/** The point of a path nearest (x, y), its distance, and its arc position along the path. */
export function nearestOnPath(path: readonly Point[], x: number, y: number): { p: Point; d: number; s: number } {
  let best = Infinity;
  let bp: Point = path[0];
  let bs = 0;
  let arc = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const [ax, ay] = path[i];
    const vx = path[i + 1][0] - ax;
    const vy = path[i + 1][1] - ay;
    const l2 = vx * vx + vy * vy;
    let u = l2 > 0 ? ((x - ax) * vx + (y - ay) * vy) / l2 : 0;
    if (u < 0) u = 0;
    else if (u > 1) u = 1;
    const px = ax + u * vx;
    const py = ay + u * vy;
    const d = (px - x) * (px - x) + (py - y) * (py - y);
    const len = Math.sqrt(l2);
    if (d < best) {
      best = d;
      bp = [px, py];
      bs = arc + u * len;
    }
    arc += len;
  }
  return { p: bp, d: Math.sqrt(best), s: bs };
}

/** Squared distance from (x, y) to the segment a–b. */
export function segmentDistance2(x: number, y: number, a: readonly number[], b: readonly number[]): number {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const l2 = vx * vx + vy * vy;
  let u = l2 > 0 ? ((x - a[0]) * vx + (y - a[1]) * vy) / l2 : 0;
  if (u < 0) u = 0;
  else if (u > 1) u = 1;
  const px = a[0] + u * vx - x;
  const py = a[1] + u * vy - y;
  return px * px + py * py;
}

/** Round to a fixed number of decimals for compact, stable JSON. */
export function round(v: number, decimals = 2): number {
  const k = decimals === 2 ? 100 : decimals === 3 ? 1000 : 10 ** decimals;
  return Math.round(v * k) / k;
}
