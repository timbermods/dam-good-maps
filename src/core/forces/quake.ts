// Quake, a force of nature (PLAN §20 D203, D219): it splits the land along a fault drawn freehand
// (D327). Lift raises the chosen side along it (the other drops a little, with a natural tilt and small
// secondary faults); Slide carries the chosen side 3–20 tiles along the fault's own direction where
// each part of it lies (a straight fault's one heading; a curved one's, bending with it) while the
// other bank stays (where level ground slides along level ground and nothing would show, the ground
// splits along the fault instead, a level up and down, D356), and
// a river that crossed the fault is joined again along it. Power sets the throw and the shaking's
// reach; Sheer or Stepped scarp; Try another (another personality: the tilt, the crack's roughness).
// Objects ride with the land (a rigid one on flat ground of its own), trees on the fault fall, it
// never minds the start (the editor carries it to level ground when its own breaks, D257), and it
// never adds water: the water there moves with the land.
//
// Planned in Rust (rust/forces, PLAN §20 D381; rust/bridge.ts); its showing (`revealQuake`), its brush and a
// click's natural fault (`clickFault`) stay here. The TypeScript planner it replaced is tag `ts-forces-final`.

import type { SourcesRule } from "./clear";
import * as portable from "../math/portable";
import { snapshotMap, type FullForceMap } from "./force";
import { clamp, hash } from "./random";
import { PathBrush } from "./path";
import { planInRust } from "./rust/bridge";
import { forceSettingsProblem } from "./settings";

export interface Point {
  x: number;
  y: number;
}

export interface QuakeIntent {
  /** The painted fault, in tiles (sub-tile points). */
  path: Point[];
  /** Which side moves: 1 the left of the stroke, -1 the right (V flips it). */
  side: 1 | -1;
}

export interface QuakeSettings {
  mode: "lift" | "slide";
  /** Sources (D474): they ride the ground, or the force clears them (clear.ts); absent, it clears. */
  sources?: SourcesRule;
  /** 0–100. */
  power: number;
  scarp: "sheer" | "stepped";
  seed: number;
  /** The Floor (D321, item 40, floor.ts): nothing it does goes below this level; absent, 1. */
  floor?: number;
}

export const QUAKE_DEFAULTS: QuakeSettings = { mode: "lift", power: 60, scarp: "sheer", seed: 1 };

/** Whole-tile travel of the selected block; short strokes retain full Power. */
export const slideTiles = (power: number) => 2 + Math.round(power * 0.18);
/** How far the shaking reaches from the fault (tiles) at a Power (the editor's ring, D312). */
export const quakeReach = (power: number) => 14 + power * 0.5;

/** Throws why a quake can't start (its settings, settings.ts; its fault on the land). */
export function validateQuake(s: QuakeSettings, m: { W: number; H: number }, i: QuakeIntent): void {
  const why = forceSettingsProblem("quake", s as unknown as Record<string, unknown>);
  if (why) throw Error(why);
  if (!i || ![1, -1].includes(i.side) || !Array.isArray(i.path) || i.path.length < 2 || i.path.length > 512 || i.path.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.y < 0 || p.x > m.W - 1 || p.y > m.H - 1))
    throw Error("Draw a fault on the land");
}

export interface FaultSegment {
  a: Point;
  b: Point;
  dx: number;
  dy: number;
  length: number;
  along: number;
}

/** The fault as it cracked: the stroke resampled with seeded roughness (`points`, `segments`), its length,
 *  how far the shaking reaches from it (tiles), the lift and the slide, the block's one heading (the
 *  stroke's first point to its last), and the drawn line's own direction along it (D327), every tile
 *  of its length. */
export interface FaultShape {
  points: Point[];
  segments: FaultSegment[];
  length: number;
  reach: number;
  lift: number;
  slide: number;
  heading: Point;
  directions: Point[];
}

/** A quake planned on its own copy of the map, in Rust, in one call. Throws why it can't start. */
export class QuakePlan {
  readonly map: FullForceMap;
  readonly fault: FaultShape;
  /** When each tile moves, 0–0.94 of the rupture (the front races along the fault). */
  readonly arrival: Float32Array;
  readonly dx: Int16Array;
  readonly dy: Int16Array;
  /** Destination -> actual original ground tile, shared by transport and view. */
  readonly source: Uint32Array;
  readonly stats: { changed: number; raised: number; dropped: number; moved: number; toppled: number; channel: number; transported: number; fullOffset: number };

  constructor(
    readonly before: FullForceMap,
    readonly settings: QuakeSettings,
    readonly intent: QuakeIntent,
  ) {
    validateQuake(settings, before, intent);
    const p = planInRust({ verb: "quake", map: before, settings, intent, keep: null });
    this.map = p.raw;
    this.fault = p.fault;
    this.arrival = p.arrival;
    this.dx = p.dx;
    this.dy = p.dy;
    this.source = p.source;
    this.stats = p.stats;
  }
}

/** A whole quake at once (tests, Claude's step). */
export function quake(m: FullForceMap, s: QuakeSettings, i: QuakeIntent): QuakePlan {
  return new QuakePlan(m, s, i);
}

/** Eight deterministic fronts: the map at `step` of `steps` (timing and frame rate never enter it). */
export function revealQuake(plan: QuakePlan, previous: FullForceMap, step: number, steps = 8): FullForceMap {
  const out = snapshotMap(previous);
  const progress = step / steps;
  const { W, H } = out;
  for (let i = 0; i < out.heights.length; i++) if (plan.arrival[i] <= progress) out.heights[i] = plan.map.heights[i];
  // (by id: a tree the quake knocked down where it broke the ground is gone from the plan, D321 item 7)
  const final = new Map(plan.map.entities.map((e) => [e.id, e]));
  out.entities = plan.before.entities.flatMap((e) => {
    const t = e.y * W + e.x;
    if (plan.arrival[t] > progress) return [structuredClone(e)];
    const f = final.get(e.id);
    return f ? [structuredClone(f)] : [];
  });
  out.fallen = plan.map.fallen.filter((f) =>
    out.entities.some((e) => {
      if (e.id !== f.id) return false;
      const o = plan.before.entities.find((b) => b.id === e.id)!;
      return plan.arrival[o.y * W + o.x] <= progress;
    }),
  );
  if (plan.settings.mode === "slide") {
    // Forward transport water on newly moving cells; sum collisions, conserve volume and mixture.
    const next = new Float64Array(W * H);
    const bad = new Float64Array(W * H);
    for (let i = 0; i < next.length; i++) {
      const newly = plan.arrival[i] <= progress && plan.arrival[i] > (step - 1) / steps;
      const x = i % W;
      const y = Math.floor(i / W);
      const j = newly ? clamp(y + plan.dy[i], 0, H - 1) * W + clamp(x + plan.dx[i], 0, W - 1) : i;
      next[j] += previous.water.depth[i];
      bad[j] += previous.water.depth[i] * previous.water.contamination[i];
    }
    out.water = { depth: next, contamination: Float64Array.from(bad, (v, i) => (next[i] ? v / next[i] : 0)) };
  }
  return out;
}

// --------------------------------------------------------------------------------- the fault brush

/** The painted fault: the shared pen (path.ts `PathBrush`, every drawn path's, D321 item 41, D327),
 *  and the side of it that moves. */
export class FaultBrush extends PathBrush {
  constructor(
    p: Point,
    W: number,
    H: number,
    public side: 1 | -1 = 1,
  ) {
    super(p, W, H);
  }

  intent(): QuakeIntent {
    return { side: this.side, path: this.path() };
  }
}

/** A tap's length (tiles): a stroke shorter than this is a click. */
export const TAP = 1;

/** A click's fault (PLAN §20 D360 (1b)): a short, natural fault at the click point, as if drawn there.
 *  The land chooses its way: along the slope's contour where the ground slopes, a seeded way on flat
 *  ground, turned a little by the seed (Try another varies it); a slight bend; longer with Power (10 to
 *  22 tiles); on the map. */
export function clickFault(heights: ArrayLike<number>, W: number, H: number, at: Point, power: number, seed: number): Point[] {
  const cx = Math.max(0, Math.min(W - 1, Math.round(at.x)));
  const cy = Math.max(0, Math.min(H - 1, Math.round(at.y)));
  const h = (x: number, y: number) => heights[Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x))];
  // the ground's slope round the click (a 7 × 7 window)
  let gx = 0;
  let gy = 0;
  for (let d = 1; d <= 3; d++)
    for (let o = -3; o <= 3; o++) {
      gx += h(cx + d, cy + o) - h(cx - d, cy + o);
      gy += h(cx + o, cy + d) - h(cx + o, cy - d);
    }
  const turn = (hash(seed, 31) - 0.5) * 0.9;
  const angle = portable.hypot(gx, gy) > 2 ? portable.atan2(gy, gx) + Math.PI / 2 + turn : hash(seed, 37) * Math.PI;
  const half = (10 + Math.round(power * 0.12)) / 2;
  const bend = (hash(seed, 41) - 0.5) * half * 0.5;
  const dx = portable.cos(angle);
  const dy = portable.sin(angle);
  const out: Point[] = [];
  for (let k = -2; k <= 2; k++) {
    const t = (k / 2) * half;
    const off = bend * (1 - portable.pow(k / 2, 2));
    out.push({ x: Math.max(0, Math.min(W - 1, cx + dx * t - dy * off)), y: Math.max(0, Math.min(H - 1, cy + dy * t + dx * off)) });
  }
  return out;
}

/** A stroke's length along its points (tiles). */
export function strokeLength(path: readonly Point[]): number {
  let l = 0;
  for (let k = 1; k < path.length; k++) l += portable.hypot(path[k].x - path[k - 1].x, path[k].y - path[k - 1].y);
  return l;
}
