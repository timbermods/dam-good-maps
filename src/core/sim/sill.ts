// Lakes by number: a lake's sill cut down or raised so the lake holds at a chosen level (the `setLakeLevel`
// operation; doc/lakeLevel.ts asks it and confirms the result with the canonical settle). A lake holds at level L
// when the lowest way out of its basin, its sill, stands at L: the water then stands from L up to L plus the head
// of the flow over the sill (under one level for a sill wide enough for its river).
//
// - The sill stands higher than L (the lake's spill level, `spillLevels`, is L + 1 or more): a notch is cut down to L
//   through the rim, along the way out that moves the least ground (a Dijkstra walk from the lake at L to the
//   nearest ground whose water drains at L or lower, or to the map's edge), `width` tiles wide.
// - The sill stands lower than L: the outlet is raised to L across its whole width, on the fewest tiles and the least
//   ground raised that close the lake at L off from every way off the map (a minimum cut between the lake, with the
//   water flowing into it, and the map's edge). Two separate pieces mean the basin leaks elsewhere below L: refused,
//   since one sill can't hold it.
//
// Every tile it changes is set to exactly L. It never changes ground under an object that shapes the water (a source,
// an obstacle, a natural dam) or ground a caller holds (`fixed`: a cave's columns and the ground holding up a roof).
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
  /** The tiles set to `level`, ascending (y·W + x). */
  tiles: number[];
  /** A cut notch's width in tiles (the one asked for, or the one the lake's inflow needs); a raised sill spans the
   *  outlet, so it has none. */
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
  const inflow = flowThrough(m).q[at];
  if (before >= level && before < level + 1) return { reason: `the lake at X ${x} · Y ${y} already spills at level ${fmt(before)}` };
  const where = (i: number) => `X ${i % W} · Y ${Math.floor(i / W)}`;

  if (before >= level + 1) {
    // ---- cut: the lake at the level (every tile below it joined to (x, y)), then the way out moving least ground
    const lake = flood(W, H, at, (i) => top(i) < level);
    const dist = new Float64Array(N).fill(Infinity);
    const prev = new Int32Array(N).fill(-1);
    const heap = new MinHeap();
    for (let i = 0; i < N; i++)
      if (lake[i]) {
        dist[i] = 0;
        heap.push(0, i);
      }
    const w = width ?? sillWidthFor(inflow);
    const lo = Math.floor((w - 1) / 2);
    const hi = w - 1 - lo;
    // (the ground the whole notch cuts round each tile of its line, w × w: a summed table of each tile's cut, so the line
    // keeps off the valley's sides where a flat rim gives it the choice)
    const sum = new Float64Array((W + 1) * (H + 1));
    for (let yy = 0; yy < H; yy++)
      for (let xx = 0; xx < W; xx++) {
        const i = yy * W + xx;
        const c = top(i) > level && editable(i) ? top(i) - level : 0;
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
    // (a level of ground cut on the line costs far more than the notch's sides, which cost more than a tile walked: the
    // notch moves the least ground, then keeps off the sides, then is the shortest)
    const step = (i: number) => (top(i) <= level ? 1 : editable(i) ? (top(i) - level) * 100000 + around(i) * 10 + 1 : Infinity);
    const outlet = (i: number) => !lake[i] && (spill[i] <= level || (edge(i) && !emitting[i] && (top(i) <= level || editable(i))));
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
    if (end < 0) return { reason: `at level ${level} the lake at X ${x} · Y ${y} has no way out that can be cut: caves or objects stand in the way` };
    const path: number[] = [];
    for (let c = end; c >= 0 && !lake[c]; c = prev[c]) if (top(c) > level) path.push(c);
    const cut = new Set<number>();
    for (const c of path) {
      const cx = c % W;
      const cy = (c - cx) / W;
      for (let dy = -lo; dy <= hi; dy++)
        for (let dx = -lo; dx <= hi; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const n = ny * W + nx;
          if (top(n) > level && editable(n)) cut.add(n);
        }
    }
    return { sill: "cut", level, tiles: [...cut].sort((a, b) => a - b), width: w, before, inflow };
  }

  // ---- raise: the land below the level joined to (x, y), the lake with the water flowing into it, and its ways off
  // the map; the fewest tiles raising the least ground between them
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
    const path = flowThrough(m).path;
    const main = Math.max(0, parts.findIndex((p) => p.some((i) => path[i])));
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
  return { sill: "raise", level, tiles: cut.tiles.slice().sort((a, b) => a - b), before, inflow };
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
