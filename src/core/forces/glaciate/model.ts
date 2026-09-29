// Glaciate's settings and its way through the land (PLAN §20 D246, D291, D292; ported from
// investigation/glaciate `model.ts`, round 4, #69). A glacier follows the valleys already there (Flow:
// a click on high ground) or grinds through ridges the way it was dragged (Aim). The map's own
// drainage, never the variation seed, chooses a mountain route; on flat ground a seeded choice of
// lower ground or an edge gives Try another somewhere else to go. The iteration order is the
// investigation's, so the same map and settings give the same land.

import { MinHeap, N8 } from "../../math/grid";
import type { ForceMap } from "../force";

/** What the row sets (D289: Power, Size, Meltwater; Try another's seed), and the gesture's mode: a
 *  click Flows, a drag Aims (D258; there is no Mode control). */
export interface GlaciateSettings {
  mode: "flow" | "aim";
  power: number;
  /** The trough's width in tiles, or null: it follows Power (Auto). */
  size: number | null;
  meltwater: boolean;
  seed: number;
  /** Its details behind More (D309), each drawn from the land and the seed unless pinned
   *  (nature.ts); each absent, round 4's (what the investigation built). */
  benches?: GlaciateDetails["benches"];
  steps?: GlaciateDetails["steps"];
  tarn?: boolean;
  scree?: boolean;
  /** The Floor (D321, item 40, floor.ts): nothing it does goes below this level; absent, 1. */
  floor?: number;
}

/** Glaciate's details (D309): the benches on its walls' soft rock (none, some stretches as round 4
 *  had them, or most of it); the steps its floor drops by (few, round 4's, many); a tarn in its
 *  cirque; scree cones at its walls' feet. */
export interface GlaciateDetails {
  benches: "none" | "some" | "many";
  steps: "few" | "some" | "many";
  tarn: boolean;
  scree: boolean;
}

/** Round 4's details, the investigation's as it was built (what a glacier without details makes). */
export const ROUND4_DETAILS: GlaciateDetails = { benches: "some", steps: "some", tarn: true, scree: true };

/** Where it was asked to act: the head (a tile), and an Aim's end. */
export interface GlaciateIntent {
  origin: number;
  end?: number;
  /** Waypoints between the origin and an Aim's end (D312: Shift+click), in order: the glacier
   *  follows a smooth curve through them, finding its own way near the line. */
  via?: number[];
}

/** Waypoints a glacier takes at most. */
export const GLACIATE_WAYPOINTS_MAX = 32;

export interface Point {
  x: number;
  y: number;
}

/** A station along the trough: its place, its share of the way (0–1), its half-width, its floor level
 *  and the rim beside it. */
export interface Station extends Point {
  s: number;
  r: number;
  floor: number;
  outlet: number;
}

export interface Basin {
  tiles: number[];
  floor: number;
  outlet: number;
  depth: number;
  fed: boolean;
}

/** A hanging side valley: its mouth on the rim, where its water lands, its spring (Meltwater). */
export interface Hanging {
  mouth: number;
  lip: number;
  landing: number;
  source: number | null;
  catchment: number;
  drop: number;
  s: number;
  wet: boolean;
  channel: number[];
  joinLength: number;
}

/** The demo's defaults (Power 60, Auto size, Meltwater on) and its first personality. */
export const GLACIATE_DEFAULTS: GlaciateSettings = { mode: "flow", power: 60, size: null, meltwater: true, seed: 891 };

/** Size's range in tiles (the row's slider). */
export const GLACIATE_SIZE_MIN = 4;
export const GLACIATE_SIZE_MAX = 64;

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** The investigation's integer mixer: a number in [0, 1) from a seed and a key. */
export const noise = (seed: number, i: number) => {
  let v = Math.imul(seed ^ i, 0x45d9f3b);
  v = Math.imul(v ^ (v >>> 16), 0x45d9f3b);
  return ((v ^ (v >>> 16)) >>> 0) / 4294967296;
};

/** Try another's next personality (the investigation's series). */
export const glaciateNextSeed = (s: number) => (Math.imul(s, 1664525) + 1013904223) >>> 0;

/** The trough's width: set, or Auto (30 at Power 60). */
export const sizeOf = (s: Pick<GlaciateSettings, "size" | "power">) => s.size ?? Math.round(8 + (36 * s.power) / 100);

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function sinuosity(p: Point[]): number {
  let l = 0;
  for (let i = 1; i < p.length; i++) l += distance(p[i - 1], p[i]);
  return l / (distance(p[0], p.at(-1)!) || 1);
}

/** Why these settings and gesture are not ones the row and the land could give (null when they are). */
export function glaciateProblem(W: number, H: number, s: GlaciateSettings, intent: GlaciateIntent): string | null {
  const n = W * H;
  if (!["flow", "aim"].includes(s.mode)) return "a glacier's mode is flow or aim";
  if (!(Number.isFinite(s.power) && s.power >= 0 && s.power <= 100)) return "a glacier's power is 0 to 100";
  if (s.size !== null && !(Number.isFinite(s.size) && s.size >= GLACIATE_SIZE_MIN && s.size <= GLACIATE_SIZE_MAX)) return `a glacier's size is ${GLACIATE_SIZE_MIN} to ${GLACIATE_SIZE_MAX} tiles, or null (it follows Power)`;
  if (typeof s.meltwater !== "boolean") return "a glacier's meltwater is true or false";
  if (!(Number.isInteger(s.seed) && s.seed >= 0 && s.seed <= 0xffffffff)) return "a glacier's seed is a whole number from 0 to 4294967295";
  if (!(Number.isInteger(intent.origin) && intent.origin >= 0 && intent.origin < n)) return "the glacier's head is off the map";
  if (s.mode === "aim" && !(Number.isInteger(intent.end) && intent.end! >= 0 && intent.end! < n && intent.end !== intent.origin)) return "an aimed glacier needs its end on the map";
  if (intent.via !== undefined) {
    if (s.mode !== "aim") return "only an aimed glacier goes through waypoints";
    if (!(Array.isArray(intent.via) && intent.via.length <= GLACIATE_WAYPOINTS_MAX && intent.via.every((i) => Number.isInteger(i) && i >= 0 && i < n))) return `a glacier's waypoints are up to ${GLACIATE_WAYPOINTS_MAX} tiles on the map`;
    const all = [intent.origin, ...intent.via, intent.end];
    if (all.some((i, k) => k > 0 && i === all[k - 1])) return "a glacier's waypoints each move on from the last";
  }
  return glaciateDetailsProblem(s as unknown as Record<string, unknown>);
}

/** Why a glacier's details are not ones its More row could set (null when they are; each may be
 *  absent: round 4's). */
export function glaciateDetailsProblem(x: Record<string, unknown>): string | null {
  if (x.benches != null && !["none", "some", "many"].includes(x.benches as string)) return "a glacier's benches are none, some or many";
  if (x.steps != null && !["few", "some", "many"].includes(x.steps as string)) return "a glacier's steps are few, some or many";
  if (x.tarn != null && typeof x.tarn !== "boolean") return "a glacier's tarn is true or false";
  if (x.scree != null && typeof x.scree !== "boolean") return "a glacier's scree is true or false";
  return null;
}

/** A map-owned drainage field; the seed never changes the valley being followed. */
export class Valley {
  readonly parent: Int32Array;
  readonly area: Uint32Array;
  constructor(readonly m: Pick<ForceMap, "W" | "H" | "heights">) {
    const { W, H, heights: h } = m;
    const n = W * H;
    const cost = new Float64Array(n).fill(Infinity);
    const heap = new MinHeap();
    this.parent = new Int32Array(n).fill(-1);
    this.area = new Uint32Array(n).fill(1);
    const order: number[] = [];
    for (let i = 0; i < n; i++) {
      const x = i % W;
      const y = Math.floor(i / W);
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) {
        cost[i] = h[i];
        heap.push(cost[i], i);
      }
    }
    while (heap.size) {
      const i = heap.pop();
      const c = heap.lastKey;
      if (c !== cost[i]) continue;
      order.push(i);
      const x = i % W;
      const y = Math.floor(i / W);
      for (const [dx, dy] of N8) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const j = yy * W + xx;
        // crossing high ground costs much more: this finds the low corridors already there
        const nc = Math.max(c, h[j]) + Math.hypot(dx, dy) * 0.001;
        if (nc < cost[j]) {
          cost[j] = nc;
          this.parent[j] = i;
          heap.push(nc, j);
        }
      }
    }
    for (const i of order.reverse()) if (this.parent[i] >= 0) this.area[this.parent[i]] += this.area[i];
  }

  path(origin: number, reach: number): Point[] {
    const { W, H } = this.m;
    const out: Point[] = [];
    let i = origin;
    let l = 0;
    while (i >= 0 && out.length < W * H) {
      const p = { x: (i % W) + 0.5, y: Math.floor(i / W) + 0.5 };
      if (out.length) l += distance(p, out.at(-1)!);
      out.push(p);
      if (l >= reach || p.x < 3 || p.y < 3 || p.x > W - 3 || p.y > H - 3) break;
      i = this.parent[i];
    }
    // a running average removes grid stairs, not the valley's broad bends
    let smooth = out;
    for (let pass = 0; pass < 3; pass++)
      smooth = smooth.map((p, k) => {
        if (k < 2 || k > smooth.length - 3) return p;
        const a = smooth.slice(Math.max(0, k - 5), Math.min(smooth.length, k + 6));
        return { x: a.reduce((s, q) => s + q.x, 0) / a.length, y: a.reduce((s, q) => s + q.y, 0) / a.length };
      });
    return smooth;
  }
}

/** Flat neighbourhoods have no useful downhill direction: a seeded choice among nearby lower ground
 *  and the edges lets Try another find a different way there. */
export function flatHead(m: Pick<ForceMap, "W" | "H" | "heights">, origin: number): boolean {
  const x = origin % m.W;
  const y = Math.floor(origin / m.W);
  let lo = Infinity;
  let hi = -Infinity;
  for (let yy = Math.max(0, y - 24); yy <= Math.min(m.H - 1, y + 24); yy++)
    for (let xx = Math.max(0, x - 24); xx <= Math.min(m.W - 1, x + 24); xx++) {
      const v = m.heights[yy * m.W + xx];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  return hi - lo <= 1;
}

/** The glacier's centreline: Flow down the valleys (or, on the flat, toward seeded lower ground or an
 *  edge); Aim along a direction-biased least-cost pass to the dragged end, ridges and all. */
export function route(m: Pick<ForceMap, "W" | "H" | "heights">, s: GlaciateSettings, intent: GlaciateIntent, v = new Valley(m)): Point[] {
  const start = { x: (intent.origin % m.W) + 0.5, y: Math.floor(intent.origin / m.W) + 0.5 };
  const reach = m.W * (0.22 + (0.85 * s.power) / 100);
  if (s.mode === "flow") {
    const ordinary = v.path(intent.origin, reach);
    if (!flatHead(m, intent.origin) && ordinary.length >= 8) return ordinary;
    const targets: Point[] = [];
    const h = m.heights[intent.origin];
    for (let y = 1; y < m.H - 1; y += 3) for (let x = 1; x < m.W - 1; x += 3) if (m.heights[y * m.W + x] < h) targets.push({ x: x + 0.5, y: y + 0.5 });
    targets.push({ x: 1.5, y: start.y }, { x: m.W - 1.5, y: start.y }, { x: start.x, y: 1.5 }, { x: start.x, y: m.H - 1.5 });
    const usable = targets.filter((q) => distance(q, start) >= 8).sort((a, b) => distance(a, start) - distance(b, start));
    const nearest = usable[0] ?? { x: m.W - start.x, y: m.H - start.y };
    const near = usable.filter((q) => distance(q, start) <= distance(nearest, start) * 1.5 + 8);
    const end = near[Math.floor(noise(s.seed, 927) * near.length)] ?? nearest;
    const len = Math.min(reach, Math.max(8, distance(start, end)));
    const dx = (end.x - start.x) / (distance(start, end) || 1);
    const dy = (end.y - start.y) / (distance(start, end) || 1);
    const out: Point[] = [];
    for (let k = 0; k <= Math.ceil(len); k++) {
      const t = k / Math.ceil(len);
      const bend = Math.sin(t * Math.PI) * Math.min(4, len * 0.08) * (noise(s.seed, 319) * 2 - 1);
      out.push({ x: clamp(start.x + dx * len * t - dy * bend, 0.5, m.W - 0.5), y: clamp(start.y + dy * len * t + dx * bend, 0.5, m.H - 0.5) });
    }
    return out;
  }
  // Aim: a directional least-cost pass to the dragged end; through waypoints (D312), one pass a leg,
  // joined and smoothed into one curve
  if (intent.via?.length) {
    const stops = [intent.origin, ...intent.via, intent.end!];
    let out: Point[] = [];
    for (let k = 1; k < stops.length; k++) {
      const leg = aimLeg(m, stops[k - 1], stops[k]);
      out = out.concat(k > 1 ? leg.slice(1) : leg);
    }
    // (a smooth curve through the waypoints: two passes of the leg's own seven-tile average)
    for (let pass = 0; pass < 2; pass++) out = smooth7(out);
    return out;
  }
  return smooth7(aimLeg(m, intent.origin, intent.end!));
}

/** A seven-tile running average (its ends as they are). */
function smooth7(out: Point[]): Point[] {
  return out.map((p, k) =>
    k < 3 || k > out.length - 4 ? p : { x: out.slice(k - 3, k + 4).reduce((a, b) => a + b.x, 0) / 7, y: out.slice(k - 3, k + 4).reduce((a, b) => a + b.y, 0) / 7 },
  );
}

/** One aimed leg, `from` to `goal` (tiles): a directional least-cost pass; the terrain, never the seed,
 *  chooses its bends; crossing a ridge is allowed, and a modest corridor cost keeps the way it was
 *  aimed. The tile centres from `from` to `goal`. */
function aimLeg(m: Pick<ForceMap, "W" | "H" | "heights">, from: number, goal: number): Point[] {
  const start = { x: (from % m.W) + 0.5, y: Math.floor(from / m.W) + 0.5 };
  const end = { x: (goal % m.W) + 0.5, y: Math.floor(goal / m.W) + 0.5 };
  const len = distance(start, end);
  const dx = (end.x - start.x) / len;
  const dy = (end.y - start.y) / len;
  const costs = new Float64Array(m.W * m.H).fill(Infinity);
  const parent = new Int32Array(m.W * m.H).fill(-1);
  const heap = new MinHeap();
  costs[from] = 0;
  heap.push(0, from);
  while (heap.size) {
    const i = heap.pop();
    const c = heap.lastKey;
    if (c !== costs[i]) continue;
    if (i === goal) break;
    const x = i % m.W;
    const y = Math.floor(i / m.W);
    for (const [xx, yy] of N8) {
      const nx = x + xx;
      const ny = y + yy;
      if (nx < 1 || ny < 1 || nx >= m.W - 1 || ny >= m.H - 1) continue;
      const j = ny * m.W + nx;
      const across = Math.abs((nx - start.x) * dy - (ny - start.y) * dx);
      const nc = c + Math.hypot(xx, yy) * (1 + m.heights[j] * 0.12 + (across / Math.max(6, len * 0.22)) ** 2 * 0.7);
      if (nc < costs[j]) {
        costs[j] = nc;
        parent[j] = i;
        heap.push(nc, j);
      }
    }
  }
  const out: Point[] = [];
  let at = goal;
  while (at >= 0) {
    out.push({ x: (at % m.W) + 0.5, y: Math.floor(at / m.W) + 0.5 });
    if (at === from) break;
    at = parent[at];
  }
  out.reverse();
  return out;
}
