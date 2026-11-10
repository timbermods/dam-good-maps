// Lakes by number: a lake's sill cut down or raised so the lake holds at a chosen level (the `setLakeLevel`
// operation; doc/lakeLevel.ts asks it and confirms the result with the canonical settle). A lake holds at level L
// when the lowest way out of its basin, its sill, stands at L: the water then stands from L up to L plus the head
// of the flow over the sill (under one level for a sill wide enough for its river).
//
// - The sill stands higher than L (the lake's spill level, `spillLevels`, is L + 1 or more): a notch is cut down the
//   river's own course (only ground the water runs over now: never a new way out), moving the least ground, to the
//   nearest ground whose water drains at L - 1 or lower, or to where the river leaves the map. Its crest, the notch's
//   tiles beside the lake, is cut to L; the rest a level lower, so the river falls off the crest and runs away (a notch
//   flat at L all through a thick rim held the river back: a lake on a generated map, 30 tiles of notch, was still
//   rising past L + 1 after six days of settle). Its floor is `width` tiles wide, a tile wider here and there, and its
//   sides step up to the ground in benches of varied width: a river's bed, not a ruled canal with sheer walls.
// - The sill stands lower than L: the outlet is closed at L on the fewest tiles and the least ground raised (a minimum
//   cut between the lake, with the water flowing into it, and the map's edge), joined edge to edge into one bank. Its
//   spillway, where the river crosses now, as wide as the river needs, stands at L; the rest of the bank, the same
//   cut a level up, is a ridge at L + 1 running to land above the water at both ends, two tiles thick, with a step
//   down behind it (refused when no such ridge fits the map). Two separate pieces at L mean the basin leaks elsewhere
//   below L: refused, since one sill can't hold it.
//
// It never changes ground under an object that shapes the water (a source, an obstacle, a natural dam) or ground a
// caller holds (`fixed`: a cave's columns and the ground holding up a roof).
// Refusals are one plain line naming a tile. Pure: reads the water model and the terrain, changes nothing.

import { CEILING } from "../format/world";
import { MinHeap } from "../math/grid";
import { flowThrough, spillLevels } from "./prefill";
import type { WaterModel } from "./water";

/** What the sill does to hold the lake at its level. */
export type SillWay = "cut" | "raise";

export interface SillPlan {
  sill: SillWay;
  level: number;
  /** The tiles it changes, ascending (y·W + x). */
  tiles: number[];
  /** The level each of `tiles` is set to, in their order. */
  levels: number[];
  /** A cut notch's width in tiles (the one asked for, or the one the lake's inflow needs), or a raised bank's
   *  spillway's (the operation stores a cut's only: a bank spans the outlet). */
  width?: number;
  /** The lake's spill level before: where its sill stood. */
  before: number;
  /** The flow into the lake, blocks a second (the strength of every running source whose water reaches it). */
  inflow: number;
}

export interface SillInput {
  model: WaterModel;
  /** The terrain's surface per tile (the ground a cut or a raise changes). */
  heights: ArrayLike<number>;
  /** Tiles the edit must leave as they are (a cave's columns, the ground holding up a roof). */
  fixed?: (i: number) => boolean;
}

/** The widest notch a cut makes on its own (a wider one is asked for by `width`). */
export const MAX_SILL_WIDTH = 16;

/** The flow over each tile of a sill's width, blocks a second, that keeps its head near half a level: the settle's
 *  water stands about 0.33 × (flow ÷ width) over a sill (measured on the canonical settle). */
const FLOW_PER_TILE = 1.5;

/** The width a cut notch needs for its lake's inflow, so the water stands well under a level over it. */
export function sillWidthFor(inflow: number): number {
  return Math.max(1, Math.min(MAX_SILL_WIDTH, Math.ceil(inflow / FLOW_PER_TILE - 1e-9)));
}

/** The sill that holds the lake at tile (x, y) at `level`: cut down or raised, its tiles all set to the level; or a
 *  plain one-line reason the land can't hold the lake there at that level. `width`: a cut notch's width (by default
 *  the one the lake's inflow needs, `sillWidthFor`). */
export function sillFor(inp: SillInput, x: number, y: number, level: number, width?: number): SillPlan | { reason: string } {
  const { model: m, heights } = inp;
  const { W, H } = m;
  const N = W * H;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= W || y >= H) return { reason: `X ${x} · Y ${y} is off the map` };
  if (!Number.isInteger(level) || level < 1 || level > CEILING) return { reason: `the level must be a whole number from 1 to ${CEILING}` };
  if (width !== undefined && (!Number.isInteger(width) || width < 1 || width > MAX_SILL_WIDTH * 2)) return { reason: `the sill's width must be a whole number from 1 to ${MAX_SILL_WIDTH * 2}` };
  const at = y * W + x;
  const dam = m.dam;
  const top = (i: number) => m.floor[i] + (dam && dam[i] >= 0 ? dam[i] : 0);
  if (top(at) >= level) return { reason: `level ${level} is at or below the ground at X ${x} · Y ${y}, which stands at ${fmt(top(at))}` };
  const emitting = new Uint8Array(N);
  for (const e of m.emitters) for (const i of e.cells) emitting[i] = 1;
  // (ground the edit may set: plain ground, no object shaping the water on it, nothing a caller holds)
  const editable = (i: number) => m.floor[i] === heights[i] && !(dam && dam[i] >= 0) && !emitting[i] && !inp.fixed?.(i);
  const edge = (i: number) => {
    const ix = i % W;
    const iy = (i - ix) / W;
    return ix === 0 || iy === 0 || ix === W - 1 || iy === H - 1;
  };
  const spill = spillLevels(m);
  const before = spill[at];
  const flow = flowThrough(m);
  const inflow = flow.q[at];
  // (the ground the water runs over now: a cut follows it, and a raised sill's spillway is where it crosses)
  const course = flow.path;
  if (before >= level && before < level + 1) return { reason: `the lake at X ${x} · Y ${y} already spills at level ${fmt(before)}` };
  // (a sill is cut down its river's course, and a raised one's spillway is where the river crosses: a lake needs one)
  if (!course[at]) return { reason: `no water reaches the lake at X ${x} · Y ${y}: a source must feed it` };
  const where = (i: number) => `X ${i % W} · Y ${Math.floor(i / W)}`;

  if (before >= level + 1) {
    // ---- cut: the lake at the level (every tile below it joined to (x, y)), then a notch down its river's own course
    const lake = flood(W, H, at, (i) => top(i) < level);
    // (the channel's level: a level under the crest, where the ground goes that low)
    const low = level > 1 ? level - 1 : level;
    const w = width ?? sillWidthFor(inflow);
    const lo = Math.floor((w - 1) / 2);
    const hi = w - 1 - lo;
    // (the ground the whole notch cuts round each tile of its line, w × w: a summed table of each tile's cut, so the line
    // keeps off the valley's sides where a flat rim gives it the choice)
    const sum = new Float64Array((W + 1) * (H + 1));
    for (let yy = 0; yy < H; yy++)
      for (let xx = 0; xx < W; xx++) {
        const i = yy * W + xx;
        const c = top(i) > low && editable(i) ? top(i) - low : 0;
        sum[(yy + 1) * (W + 1) + xx + 1] = c + sum[yy * (W + 1) + xx + 1] + sum[(yy + 1) * (W + 1) + xx] - sum[yy * (W + 1) + xx];
      }
    const around = (i: number) => {
      const ix = i % W;
      const iy = (i - ix) / W;
      const x0 = Math.max(0, ix - lo);
      const y0 = Math.max(0, iy - lo);
      const x1 = Math.min(W, ix + hi + 1);
      const y1 = Math.min(H, iy + hi + 1);
      return sum[y1 * (W + 1) + x1] - sum[y0 * (W + 1) + x1] - sum[y1 * (W + 1) + x0] + sum[y0 * (W + 1) + x0];
    };
    // the line: only ground the river runs over now is cut (its own course, never a new way out), the least ground
    // first, then off the sides, then the shortest; it ends where the water drains a level under the crest, or where
    // the river leaves the map
    const step = (i: number) => (top(i) <= low ? 1 : editable(i) && course[i] ? (top(i) - low) * 100000 + around(i) * 10 + 1 : Infinity);
    const outlet = (i: number) => !lake[i] && (spill[i] <= low || (edge(i) && course[i] && !emitting[i] && (top(i) <= low || editable(i))));
    const dist = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const heap = new MinHeap();
    for (let i = 0; i < N; i++)
      if (lake[i]) {
        dist[i] = 0;
        heap.push(0, i);
      }
    let end = -1;
    while (heap.size) {
      const c = heap.pop();
      const d = heap.lastKey;
      if (d > dist[c]) continue;
      if (outlet(c)) {
        end = c;
        break;
      }
      for (const n of neighbours(c, W, H)) {
        if (lake[n]) continue;
        const nd = d + step(n);
        if (nd < dist[n]) {
          dist[n] = nd;
          prev[n] = c;
          heap.push(nd, n);
        }
      }
    }
    if (end < 0) return { reason: `at level ${level} the lake at X ${x} · Y ${y} has no way out along its river that can be cut: caves or objects stand in the way` };
    const line: number[] = [];
    for (let c = end; c >= 0 && !lake[c]; c = prev[c]) if (top(c) > low) line.push(c);
    line.reverse();
    // the notch round the line: its floor `w` tiles wide and a tile wider here and there (a river's bed is never ruled),
    // its sides stepping up to the ground in benches one or two tiles wide, varied along the river, so no wall stands
    // sheer and no terrace runs on as a ruled ring; distances are 8-neighbour (Chebyshev) ones, so a bank along a
    // diagonal course stays joined edge to edge. The crest, its tiles beside the lake, at the level, the rest of the floor
    // a level lower (water crosses a tile's four sides only). Off the river's course nothing is cut lower than a level
    // above the lake, so the sides never open a way into a dry valley. Integer arithmetic only, so every peer measures
    // the same notch (D366)
    const dist8 = new Int32Array(N).fill(-1);
    const near = new Int32Array(N);
    const queue: number[] = [];
    line.forEach((c, k) => {
      dist8[c] = 0;
      near[c] = k;
      queue.push(c);
    });
    const rise = Math.max(0, CEILING - low);
    const reachMax = (w >> 1) + 2 + 2 * rise;
    for (let h = 0; h < queue.length; h++) {
      const c = queue[h];
      if (dist8[c] >= reachMax) continue;
      const cx = c % W;
      const cy = (c - cx) / W;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const n = ny * W + nx;
          if (dist8[n] >= 0) continue;
          dist8[n] = dist8[c] + 1;
          near[n] = near[c];
          queue.push(n);
        }
    }
    // (a deterministic integer hash: the same on every peer)
    const hash = (a: number) => Math.imul(a ^ (a >>> 15), 0x2c1b3c6d) >>> 0;
    // (how far a tile stands out past the floor: the floor's half width a tile wider for three tiles of every seven
    // along the line; the floor itself is 0)
    const outOf = (i: number) => {
      const k = near[i];
      return Math.max(0, dist8[i] - (w >> 1) - ((Math.floor(k / 3) + (line[k] % 7)) % 7 < 3 ? 1 : 0));
    };
    // (the notch's sides, off the river's course, never lower than a level above the lake; its floor is the notch)
    const flank = (i: number, v: number) => (!course[i] && outOf(i) > 0 ? Math.max(v, level + 1) : v);
    const levelAt = (i: number): number => {
      const k = near[i];
      let out = outOf(i);
      if (out <= 0) return low;
      // (benches one or two tiles wide, their widths changing every six tiles along the river)
      const part = Math.floor(k / 6) * 97 + 13;
      let v = low;
      for (let j = 0; out > 0; j++) {
        out -= 1 + (hash(part + j) & 1);
        v++;
      }
      return v;
    };
    const set = new Map<number, number>();
    for (const i of queue) {
      if (lake[i] || !editable(i)) continue;
      let v = levelAt(i);
      if (neighbours(i, W, H).some((n) => lake[n])) v = Math.max(v, level);
      v = flank(i, v);
      if (v < top(i)) set.set(i, v);
    }
    // a clean-up: a lone column above all four of its neighbours (or a lone pit below them) takes the nearest of their
    // heights, so no tile stands alone or meets its kind at a corner only
    const now = (i: number) => set.get(i) ?? top(i);
    for (const [i, v] of [...set]) {
      const hs = neighbours(i, W, H).map(now);
      const hiN = Math.max(...hs);
      const loN = Math.min(...hs);
      let u = v > hiN ? hiN : v < loN && !course[i] ? loN : v;
      if (neighbours(i, W, H).some((n) => lake[n])) u = Math.max(u, level);
      u = flank(i, u);
      if (u >= top(i)) set.delete(i);
      else set.set(i, u);
    }
    const tiles = [...set.keys()].sort((a, b) => a - b);
    return { sill: "cut", level, tiles, levels: tiles.map((i) => set.get(i)!), width: w, before, inflow };
  }

  // ---- raise: the land below the level joined to (x, y), the lake with the water flowing into it, and its ways off
  // the map; the fewest tiles raising the least ground between them
  if (width !== undefined) return { reason: `the lake at X ${x} · Y ${y} spills below level ${level}: its sill is raised across the outlet, which has no width` };
  const low = flood(W, H, at, (i) => top(i) < level);
  const side = new Uint8Array(N);
  // (the lake as it stands now, and the land upstream that drains into it: water higher than its sill that reaches it)
  const now = top(at) < before ? flood(W, H, at, (i) => top(i) < before) : null;
  const queue: number[] = [];
  const mark = (i: number) => {
    if (side[i]) return;
    side[i] = 1;
    queue.push(i);
  };
  mark(at);
  if (now) for (let i = 0; i < N; i++) if (now[i]) mark(i);
  for (let h = 0; h < queue.length; h++) {
    const c = queue[h];
    for (const n of neighbours(c, W, H)) if (low[n] && spill[n] > before && spill[n] >= spill[c]) mark(n);
  }
  const off = (i: number) => edge(i) && !emitting[i];
  for (const i of queue) if (off(i)) return { reason: `at level ${level} the water would spill off the map at ${where(i)}` };
  const INF = 1 << 29;
  const cap = new Int32Array(N);
  for (let i = 0; i < N; i++) if (low[i] && !side[i]) cap[i] = editable(i) ? (level - heights[i]) * 16 + 1 : INF;
  const cut = minCut(W, H, low, side, cap, off);
  if ("open" in cut) return { reason: `at level ${level} the water would spill off the map at ${where(cut.open)}, through ground that can't be raised` };
  // one sill: the cut in one piece (8-connected, as water crosses only between a tile's four sides)
  const parts = pieces(W, H, cut.tiles);
  if (parts.length > 1) {
    // (the piece the water leaves by now is the sill; another is a leak elsewhere, named by its lowest ground)
    const main = Math.max(0, parts.findIndex((p) => p.some((i) => course[i])));
    const other = parts[main === 0 ? 1 : 0];
    let lowest = other[0];
    for (const i of other) if (heights[i] < heights[lowest]) lowest = i;
    return { reason: `at level ${level} the lake would also spill at ${where(lowest)}, where the ground stands at ${heights[lowest]}: one sill can't hold it` };
  }
  // (a sill runs between shoulders at the level or higher; one that touches none would ring the lake on its own)
  const shoulder = cut.tiles.some((i) => {
    const ix = i % W;
    const iy = (i - ix) / W;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = ix + dx;
        const ny = iy + dy;
        if ((dx || dy) && nx >= 0 && ny >= 0 && nx < W && ny < H && top(ny * W + nx) >= level) return true;
      }
    return false;
  });
  if (!shoulder) return { reason: `level ${level} is above every rim round the lake at X ${x} · Y ${y}: its sill would have to ring it` };
  // the bank: one ridge a level above the water, closing the lake at L + 1 (the same minimum cut, a level up), so it
  // runs to land above the water at both ends, raising a shore that stands at the water's level along its line; its
  // tiles joined edge to edge (two meeting at a corner only take a tile between them, outside the lake where it can)
  const bank = Math.min(CEILING, level + 1);
  let ridge = cut.tiles;
  if (bank > level) {
    const lowB = flood(W, H, at, (i) => top(i) < bank);
    const sideB = new Uint8Array(N);
    const up: number[] = [];
    const markB = (i: number) => {
      if (sideB[i]) return;
      sideB[i] = 1;
      up.push(i);
    };
    markB(at);
    if (now) for (let i = 0; i < N; i++) if (now[i]) markB(i);
    // (upstream a level up: the rivers that run into the lake, never the dry shore its water reaches at L + 1)
    for (let h = 0; h < up.length; h++) for (const n of neighbours(up[h], W, H)) if (lowB[n] && (side[n] || (course[n] && spill[n] > before && spill[n] >= spill[up[h]]))) markB(n);
    const capB = new Int32Array(N);
    for (let i = 0; i < N; i++) if (lowB[i] && !sideB[i]) capB[i] = editable(i) ? (bank - heights[i]) * 16 + 1 : INF;
    const cutB = up.some(off) ? null : minCut(W, H, lowB, sideB, capB, off);
    if (!cutB || "open" in cutB) return { reason: `the bank holding the lake at X ${x} · Y ${y} at level ${level} can't reach land above the water` };
    // (the piece of it at the outlet, within two tiles of the sill at the level: the cut a level up also closes the
    // dry rims at the level elsewhere round the lake, which a bank here leaves as they are)
    const close = new Uint8Array(N);
    for (const c of cut.tiles) {
      const cx = c % W;
      const cy = (c - cx) / W;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (cx + dx >= 0 && cy + dy >= 0 && cx + dx < W && cy + dy < H) close[(cy + dy) * W + cx + dx] = 1;
    }
    const mine = pieces(W, H, cutB.tiles).filter((p) => p.some((i) => close[i]));
    if (!mine.length) return { reason: `the bank holding the lake at X ${x} · Y ${y} at level ${level} can't reach land above the water` };
    ridge = mine.flat();
  }
  const sill = new Set(ridge);
  for (const c of ridge) {
    const cx = c % W;
    const cy = (c - cx) / W;
    for (const [dx, dy] of [[1, 1], [1, -1]]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || !sill.has(ny * W + nx)) continue;
      const a = cy * W + nx;
      const b = ny * W + cx;
      if (sill.has(a) || sill.has(b) || top(a) >= bank || top(b) >= bank) continue;
      const pick = [a, b].filter((i) => editable(i)).sort((p, q) => side[p] - side[q] || p - q)[0];
      if (pick !== undefined) sill.add(pick);
    }
  }
  // its spillway: one stretch of the bank as wide as the river needs, at the level, from where the river crosses it
  // beside land above the water (else at its lowest ground, the middle of it), along the bank
  const w = sillWidthFor(inflow);
  const crossed = [...sill].filter((i) => course[i]).sort((a, b) => a - b);
  const lowest = Math.min(...crossed.map((i) => heights[i]));
  const deep = crossed.filter((i) => heights[i] === lowest);
  const byLand = crossed.filter((i) => neighbours(i, W, H).some((n) => !sill.has(n) && top(n) >= bank));
  /** The stretch from `seed` along the bank (its tiles 8-joined), up to the river's width. */
  const stretch = (seed: number | undefined): Set<number> => {
    const out = new Set<number>();
    if (seed === undefined) return out;
    const reach = [seed];
    out.add(seed);
    for (let h = 0; h < reach.length && out.size < w; h++) {
      const cx = reach[h] % W;
      const cy = (reach[h] - cx) / W;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const n = (cy + dy) * W + cx + dx;
          if (cx + dx < 0 || cy + dy < 0 || cx + dx >= W || cy + dy >= H || !sill.has(n) || out.has(n) || out.size >= w) continue;
          out.add(n);
          reach.push(n);
        }
    }
    return out;
  };
  let spillway = stretch(byLand[byLand.length >> 1]);
  if (spillway.size < w) spillway = stretch(deep[deep.length >> 1]);
  const set = new Map<number, number>();
  for (const i of sill) set.set(i, spillway.has(i) ? level : bank);
  // (the lake behind it once it stands: what the bank's back and its step down never touch)
  const lakeSide = flood(W, H, at, (i) => !set.has(i) && top(i) < bank);
  if (bank > level) {
    // two tiles thick: each tile of the ridge takes the tile behind it, off the river's course and clear of the
    // spillway's way out (a bank closing in on it holds the river back)
    const byWay = (n: number) => neighbours(n, W, H).some((m) => spillway.has(m));
    for (const [i, v] of [...set])
      if (v === bank) for (const n of neighbours(i, W, H)) if (!set.has(n) && !lakeSide[n] && editable(n) && !course[n] && !byWay(n) && top(n) < bank) set.set(n, bank);
  }
  // a step down behind it into the land below
  for (const [i, v] of [...set])
    for (const n of neighbours(i, W, H)) if (!set.has(n) && !lakeSide[n] && editable(n) && top(n) < v - 1) set.set(n, v - 1);
  const tiles = [...set.keys()].filter((i) => set.get(i)! > heights[i]).sort((a, b) => a - b);
  return { sill: "raise", level, tiles, levels: tiles.map((i) => set.get(i)!), width: spillway.size, before, inflow };
}

/** The tiles 4-joined to `from` where `inside` holds. */
function flood(W: number, H: number, from: number, inside: (i: number) => boolean): Uint8Array {
  const seen = new Uint8Array(W * H);
  const queue = [from];
  seen[from] = 1;
  for (let h = 0; h < queue.length; h++)
    for (const n of neighbours(queue[h], W, H))
      if (!seen[n] && inside(n)) {
        seen[n] = 1;
        queue.push(n);
      }
  return seen;
}

function neighbours(c: number, W: number, H: number): number[] {
  const x = c % W;
  const y = (c - x) / W;
  const out: number[] = [];
  if (y > 0) out.push(c - W);
  if (x > 0) out.push(c - 1);
  if (y < H - 1) out.push(c + W);
  if (x < W - 1) out.push(c + 1);
  return out;
}

/** The minimum vertex cut, by tile capacity, inside `region` between the `source` tiles and the tiles `sink` names
 *  (water leaves the map there): augmenting paths on the tiles split in two (in → out, the tile's capacity), the
 *  edges between neighbours unbounded. The cut's tiles, or a sink tile reached through tiles of unbounded capacity
 *  only (no finite cut). */
function minCut(W: number, H: number, region: Uint8Array, source: Uint8Array, cap: Int32Array, sink: (i: number) => boolean): { tiles: number[] } | { open: number } {
  const N = W * H;
  const INF = 1 << 29;
  // flow through each tile, and from each tile's out to its neighbour k's in (k: up, left, down, right)
  const through = new Int32Array(N);
  const across = new Int32Array(N * 4);
  const DX = [0, -1, 0, 1];
  const DY = [-1, 0, 1, 0];
  const nb = (i: number, k: number) => {
    const x = (i % W) + DX[k];
    const y = Math.floor(i / W) + DY[k];
    return x < 0 || y < 0 || x >= W || y >= H ? -1 : y * W + x;
  };
  // the node of tile i, side 0 its in, 1 its out: 2i + side
  const prev = new Int32Array(2 * N);
  const stamp = new Int32Array(2 * N);
  let round = 0;
  const starts: number[] = [];
  for (let i = 0; i < N; i++) if (source[i]) starts.push(i);
  /** A breadth-first search of the residual graph; the sink tile reached (its out), or −1. */
  const search = (): number => {
    round++;
    const queue: number[] = [];
    for (const i of starts) {
      stamp[2 * i + 1] = round;
      prev[2 * i + 1] = -1;
      queue.push(2 * i + 1);
    }
    for (let h = 0; h < queue.length; h++) {
      const v = queue[h];
      const i = v >> 1;
      const visit = (u: number) => {
        if (stamp[u] === round) return;
        stamp[u] = round;
        prev[u] = v;
        queue.push(u);
      };
      if (v & 1) {
        if (!source[i] && sink(i)) return i;
        if (!source[i] && through[i] > 0) visit(2 * i);
        for (let k = 0; k < 4; k++) {
          const j = nb(i, k);
          if (j >= 0 && region[j] && !source[j]) visit(2 * j);
        }
      } else {
        if (through[i] < cap[i]) visit(2 * i + 1);
        for (let k = 0; k < 4; k++) {
          const j = nb(i, k);
          if (j >= 0 && region[j] && !source[j] && across[j * 4 + ((k + 2) & 3)] > 0) visit(2 * j + 1);
        }
      }
    }
    return -1;
  };
  /** The edge between two nodes on the path: what can pass, and passing it. */
  const room = (u: number, v: number): number => {
    const a = u >> 1;
    const b = v >> 1;
    if (a === b) return u & 1 ? through[a] : cap[a] - through[a];
    if (u & 1) return INF;
    return across[b * 4 + dirOf(b, a, W)];
  };
  const pass = (u: number, v: number, f: number) => {
    const a = u >> 1;
    const b = v >> 1;
    if (a === b) through[a] += u & 1 ? -f : f;
    else if (u & 1) across[a * 4 + dirOf(a, b, W)] += f;
    else across[b * 4 + dirOf(b, a, W)] -= f;
  };
  for (let guard = 0; guard < 1e6; guard++) {
    const end = search();
    if (end < 0) break;
    let f = INF;
    for (let v = 2 * end + 1; prev[v] >= 0; v = prev[v]) f = Math.min(f, room(prev[v], v));
    // (an unbounded tile keeps over half its room whatever finite flow has passed it: the finite caps sum far below)
    if (f >= INF >> 1) return { open: end };
    for (let v = 2 * end + 1; prev[v] >= 0; v = prev[v]) pass(prev[v], v, f);
  }
  // the cut: tiles whose in the source still reaches and whose out it doesn't
  const tiles: number[] = [];
  for (let i = 0; i < N; i++) if (region[i] && !source[i] && stamp[2 * i] === round && stamp[2 * i + 1] !== round) tiles.push(i);
  return { tiles };
}

/** The direction k (up, left, down, right) from tile a to its neighbour b. */
function dirOf(a: number, b: number, W: number): number {
  const d = b - a;
  return d === -W ? 0 : d === -1 ? 1 : d === W ? 2 : 3;
}

/** `tiles` in 8-connected pieces. */
function pieces(W: number, H: number, tiles: readonly number[]): number[][] {
  const left = new Set(tiles);
  const out: number[][] = [];
  for (const s of tiles) {
    if (!left.has(s)) continue;
    left.delete(s);
    const part = [s];
    for (let h = 0; h < part.length; h++) {
      const c = part[h];
      const x = c % W;
      const y = (c - x) / W;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const n = ny * W + nx;
          if (!left.has(n)) continue;
          left.delete(n);
          part.push(n);
        }
    }
    out.push(part);
  }
  return out;
}

function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}
