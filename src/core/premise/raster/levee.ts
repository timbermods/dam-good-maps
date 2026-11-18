// A levee as a raster form (docs/design/poisoned-floodplain.md §1, §8): the banks a river builds from its own floods,
// highest at the channel and falling away from it, uneven, with low places where old floods broke out. A bank along
// each side of a course whose crest's height over the land beside it and whose width are given along the course (noise,
// in the premise's own numbers), so it follows the meanders and is never straight where the course is not. Across the
// bank the ground falls from its crest at the channel to the land at its foot: a bank two over stands two for the
// inner half of its width or so, then one, then the land; a bank one over stands one for about two thirds of its width;
// the outer edge of each step wanders by a tile's noise, so no bank's foot runs as a ruled line beside the channel.

import { fbm } from "../../math/noise";
import { hypot } from "../../math/portable";
import { segDist } from "../geom";
import type { Point } from "../types";

export type BankSide = "a" | "b";

export interface LeveeForm {
  /** The course on the map, its points a few tiles apart, and its channel's half-width. */
  path: readonly Point[];
  half: number;
  /** Where along the course (arc length) the banks stand. */
  from: number;
  to: number;
  /** The bank's width, tiles, at `s` along the course on a side. */
  width(s: number, side: BankSide): number;
  /** The crest's height over the land at its foot at `s` on a side: 0 (a low place), 1 or 2. */
  over(s: number, side: BankSide): number;
  /** The noise seed for the steps' outer edges. */
  seed: number;
  /** The course's water as laid (1 on its tiles), and the bank's core: every tile within `core` of that water (centre
   *  to centre) stands at least one over where the crest does, whatever its edge's noise, and from `lead` tiles before
   *  `from` along the course (the water beside land before the banks begin). Without it the banks are the noise's. */
  water?: ArrayLike<number>;
  core?: number;
  lead?: number;
}

/** How far a bank's outer edge wanders off its width (tiles, noise `cell`), and its jag (tiles, noise `jagCell`: a
 *  smooth wander alone holds a foot to one row for a dozen tiles where it bends slowly): uneven, never a ruled line. */
const EDGE = { wander: 2.4, cell: 3, jag: 1.2, jagCell: 2 } as const;

/** How far across its width a bank of `over` stands at `k` or more over its foot (k = 1 … over): its inner share. */
const STEP = (over: number, k: number): number => (over >= 2 ? (k === 2 ? 0.5 : 0.85) : 0.68);

/** Each tile's bank over the land at its foot (0 where no bank stands), and the side of the course it lies on (1 for
 *  side "a", the left of the course's direction, 2 for "b"; 0 off the banks). Tiles inside the channel's half-width
 *  are left to the channel (0). */
export function leveeBanks(W: number, H: number, f: LeveeForm): { over: Uint8Array; side: Uint8Array } {
  const over = new Uint8Array(W * H);
  const side = new Uint8Array(W * H);
  // (past the widest bank and its edge's wander: no bank's foot is clipped to a line beside the channel)
  const reach = f.half + 7 + EDGE.wander + EDGE.jag;
  // (each segment once: its box widened by the banks' reach, its arc length at its start)
  let run = 0;
  const segs: { a: Point; b: Point; s0: number; len: number }[] = [];
  for (let k = 0; k + 1 < f.path.length; k++) {
    const a = f.path[k];
    const b = f.path[k + 1];
    const len = hypot(b[0] - a[0], b[1] - a[1]);
    if (len > 0) segs.push({ a, b, s0: run, len });
    run += len;
  }
  const best = new Float64Array(W * H).fill(Infinity);
  const at = new Float64Array(W * H);
  const cross = new Float64Array(W * H);
  const lead = f.water ? (f.lead ?? 0) : 0;
  // (the tiles within the core of the course's water)
  const near = new Uint8Array(W * H);
  if (f.water && f.core) {
    const c = Math.ceil(f.core);
    for (let i = 0; i < W * H; i++) {
      if (!(f.water[i] > 0)) continue;
      const x = i % W;
      const y = (i - x) / W;
      for (let dy = -c; dy <= c; dy++)
        for (let dx = -c; dx <= c; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H && dx * dx + dy * dy <= f.core * f.core) near[yy * W + xx] = 1;
        }
    }
  }
  for (const g of segs) {
    if (g.s0 + g.len < f.from - lead - reach || g.s0 > f.to + reach) continue;
    const x0 = Math.max(0, Math.floor(Math.min(g.a[0], g.b[0]) - reach));
    const x1 = Math.min(W - 1, Math.ceil(Math.max(g.a[0], g.b[0]) + reach));
    const y0 = Math.max(0, Math.floor(Math.min(g.a[1], g.b[1]) - reach));
    const y1 = Math.min(H - 1, Math.ceil(Math.max(g.a[1], g.b[1]) + reach));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        const { d, t } = segDist(x + 0.5, y + 0.5, g.a[0], g.a[1], g.b[0], g.b[1]);
        if (d >= best[i]) continue;
        best[i] = d;
        at[i] = g.s0 + t * g.len;
        cross[i] = (g.b[0] - g.a[0]) * (y + 0.5 - g.a[1]) - (g.b[1] - g.a[1]) * (x + 0.5 - g.a[0]);
      }
  }
  for (let i = 0; i < W * H; i++) {
    const d = best[i];
    // (the core reaches inside the channel's half-width where its water does not: at a map's edge, a narrow reach)
    const inCore = near[i] && !(f.water![i] > 0);
    if ((!(d > f.half) && !inCore) || d > reach) continue;
    const s = at[i];
    // (a tile past the course's end by a tile's rounding stands as its end does)
    if (s < f.from - lead || s > f.to + 1) continue;
    const sd: BankSide = cross[i] > 0 ? "a" : "b";
    const coreOnly = s < f.from;
    if (coreOnly && !(near[i] && !(f.water![i] > 0))) continue;
    const sAt = Math.min(f.to, Math.max(s, f.from));
    const w = f.width(sAt, sd);
    const o = f.over(sAt, sd);
    const x = i % W;
    const y = (i - x) / W;
    // (the share of the bank's width this tile stands at, its edge wandering by a tile)
    const q = (d - f.half) / w + (EDGE.wander * fbm(f.seed, x, y, EDGE.cell, 2) + EDGE.jag * fbm(f.seed ^ 0x5bd1e995, x, y, EDGE.jagCell, 1)) / w;
    // (the core: a badtide's poison climbing the bank a level, 2/7, is gone before it reaches the land past it)
    if (o <= 0 || (q >= 1 && !inCore)) continue;
    let h = inCore ? 1 : 0;
    if (!coreOnly) for (let k = 1; k <= o; k++) if (q < STEP(o, k)) h = Math.max(h, k);
    over[i] = h;
    side[i] = sd === "a" ? 1 : 2;
  }
  return { over, side };
}

/** The longest chord between two points of a line (in order, NaN breaking it) that every point between stays within
 *  `near` of: every start, and from each the longest end that holds (an end that strays does not stop the search: a
 *  later end may hold again). */
export function longestStraight(pts: readonly Point[], near: number): number {
  return straightestChord(pts, near).len;
}

/** `longestStraight`'s chord: its length and the indices of its two ends (-1 where there is none). */
export function straightestChord(pts: readonly Point[], near: number): { len: number; from: number; to: number } {
  let best = 0;
  let from = -1;
  let to = -1;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    if (!(a[0] === a[0])) continue;
    for (let j = i + 1; j < pts.length; j++) {
      const b = pts[j];
      if (!(b[0] === b[0])) break;
      const len = hypot(b[0] - a[0], b[1] - a[1]);
      if (!(len > best)) continue;
      let ok = true;
      for (let m = i + 1; m < j && ok; m++) {
        const q = pts[m];
        if (Math.abs((b[0] - a[0]) * (a[1] - q[1]) - (a[0] - q[0]) * (b[1] - a[1])) / len > near) ok = false;
      }
      if (ok) [best, from, to] = [len, i, j];
    }
  }
  return { len: best, from, to };
}

/** The longest straight run of a bank's outer foot on the ground (the `levee.wanders` measure on the land), as the
 *  shared look check reads a straight edge (`validate/ruledLand.ts`: one contour along one row or column, the same sign
 *  and the same upper level): of the steps down from a bank's tile (`bank` over 0) to the land beside it (`beside`: the
 *  floor, not the water), the longest run of consecutive sides along one row or column. (A chord measure, every start
 *  and the longest chord the foot stays near, finds an aligned stretch of 9 to 13 tiles on every meandering river at
 *  any tolerance from a quarter of a tile to a tile: it reads the noise, not a ruler.) */
export function bankRun(W: number, H: number, heights: ArrayLike<number>, bank: ArrayLike<number>, beside: ArrayLike<number>): number {
  let best = 0;
  // (a side between i and j: the bank's foot where i is on a bank, j is not, and i stands over j)
  const side = (i: number, j: number) => (bank[i] > 0 && !(bank[j] > 0) && beside[j] > 0 && heights[i] > heights[j] ? heights[i] : -1);
  for (const rows of [true, false])
    for (const sg of [1, -1]) {
      const nu = rows ? W : H;
      const nv = rows ? H : W;
      for (let v = 0; v < nv; v++) {
        let run = 0;
        let level = -1;
        for (let u = 0; u < nu; u++) {
          // (along a row: the sides between row v and row v + sg; along a column: between column v and v + sg)
          const x = rows ? u : v;
          const y = rows ? v : u;
          const x2 = x + (rows ? 0 : sg);
          const y2 = y + (rows ? sg : 0);
          const up = x2 < 0 || y2 < 0 || x2 >= W || y2 >= H ? -1 : side(y * W + x, y2 * W + x2);
          run = up < 0 ? 0 : run > 0 && up === level ? run + 1 : 1;
          level = up;
          if (run > best) best = run;
        }
      }
    }
  return best;
}

/** The maker's side of `bankRun` (planning's verdict on round 2: the maker never makes what its checks refuse): where a
 *  bank's outer foot runs along one row or column for `every` sides, the foot steps a tile out there (the land beside
 *  it raised to the bank's tile and made bank), so no straight run of the foot reaches `every` + 1. Tiles `keep` marks
 *  (the water's own) are never touched. The tiles changed. */
export function breakBankRuns(W: number, H: number, heights: Uint8Array, bank: Uint8Array, beside: ArrayLike<number>, keep: ArrayLike<number>, every: number): number {
  let n = 0;
  const side = (i: number, j: number) => (bank[i] > 0 && !(bank[j] > 0) && beside[j] > 0 && heights[i] > heights[j] ? heights[i] : -1);
  for (const rows of [true, false])
    for (const sg of [1, -1]) {
      const nu = rows ? W : H;
      const nv = rows ? H : W;
      for (let v = 0; v < nv; v++) {
        let run = 0;
        let level = -1;
        for (let u = 0; u < nu; u++) {
          const x = rows ? u : v;
          const y = rows ? v : u;
          const x2 = x + (rows ? 0 : sg);
          const y2 = y + (rows ? sg : 0);
          const i = y * W + x;
          const j = y2 * W + x2;
          const up = x2 < 0 || y2 < 0 || x2 >= W || y2 >= H ? -1 : side(i, j);
          run = up < 0 ? 0 : run > 0 && up === level ? run + 1 : 1;
          level = up;
          if (run >= every && !keep[j]) {
            heights[j] = heights[i];
            bank[j] = bank[i];
            n++;
            run = 0;
            level = -1;
          }
        }
      }
    }
  return n;
}
