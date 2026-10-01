// Where a carve's head goes (D194, D199). Aim steers toward its end point, or along its drawn path
// (D321, item 41): along a smooth curve (Catmull-Rom) through the origin, the path's points and the end, toward a
// point a few tiles ahead on it, its cost the length of curve still to go; Unleash follows the way
// the land drains (the priority flood, so flats and hollows still have a way down). Wander swings
// the heading round that guide, never more than 110° off it, and never by adding turn to turn. A
// reach that stops making progress straightens, and every 16 moves must get closer to the end (or
// further down the drainage), else the force is spent: it never circles.
//
// Ported from investigation/carve/course.ts (PR #47), kept to its structure.

import * as portable from "../../math/portable";
import { drainage } from "../drainage";
import type { ForceMap } from "../force";
import type { RiverCharacter } from "./character";
import type { CarveIntent, CarveSettings } from "./run";

export const HEADING_LIMIT = (110 * Math.PI) / 180;
export const PROGRESS_WINDOW = 16;
/** A drawn path: how far ahead on its curve the head steers (tiles), and the curve's sample spacing. */
const LOOK_AHEAD = 5;
const CURVE_STEP = 0.5;
/** How far along the curve the head's nearest point is searched from where it was (samples). */
const CURVE_WINDOW = 60;

/** A smooth curve through the points (uniform Catmull-Rom, the ends doubled), sampled about every
 *  `CURVE_STEP` tiles, with each sample's length along it. */
export function pathCurve(points: readonly { x: number; y: number }[]): { x: number[]; y: number[]; s: number[] } {
  const xs: number[] = [points[0].x];
  const ys: number[] = [points[0].y];
  const ss: number[] = [0];
  const p = (k: number) => points[Math.max(0, Math.min(points.length - 1, k))];
  for (let k = 0; k + 1 < points.length; k++) {
    const p0 = p(k - 1);
    const p1 = p(k);
    const p2 = p(k + 1);
    const p3 = p(k + 2);
    const n = Math.max(2, Math.ceil(portable.hypot(p2.x - p1.x, p2.y - p1.y) / CURVE_STEP));
    for (let j = 1; j <= n; j++) {
      const t = j / n;
      const t2 = t * t;
      const t3 = t2 * t;
      const c = (a: number, b: number, c1: number, d: number) => 0.5 * (2 * b + (-a + c1) * t + (2 * a - 5 * b + 4 * c1 - d) * t2 + (-a + 3 * b - 3 * c1 + d) * t3);
      const x = c(p0.x, p1.x, p2.x, p3.x);
      const y = c(p0.y, p1.y, p2.y, p3.y);
      ss.push(ss[ss.length - 1] + portable.hypot(x - xs[xs.length - 1], y - ys[ys.length - 1]));
      xs.push(x);
      ys.push(y);
    }
  }
  return { x: xs, y: ys, s: ss };
}
export const angleDelta = (a: number, b: number) => portable.atan2(portable.sin(a - b), portable.cos(a - b));

export interface CoursePoint {
  x: number;
  y: number;
  cost: number;
  bearing: number;
  heading: number;
  straightening: boolean;
}

/** The guiding direction is independent of the previous turn. Flats use the drainage distance; a
 *  bend cannot rotate the guide itself. */
export class Course {
  readonly trace: CoursePoint[] = [];
  readonly potential: Float64Array | null;
  private receivers: Int32Array | null = null;
  private forward = 0;
  /** Aimed along a drawn path: its curve, and the sample the head was last nearest. */
  private readonly curve: { x: number[]; y: number[]; s: number[] } | null = null;
  private along = 0;

  constructor(
    private m: ForceMap,
    private settings: CarveSettings,
    private intent: CarveIntent,
    private character: RiverCharacter,
  ) {
    this.potential = null;
    if (settings.mode === "aim" && intent.via?.length) {
      const pt = (i: number) => ({ x: i % m.W, y: Math.floor(i / m.W) });
      this.curve = pathCurve([pt(intent.origin), ...intent.via.map(pt), pt(intent.end!)]);
    }
    if (settings.mode === "unleash") {
      const d = drainage(m.heights, m.W, m.H, 0.0001);
      const distance = new Float64Array(m.W * m.H);
      for (const i of d.order) {
        const r = d.rcv[i];
        if (r >= 0) distance[i] = distance[r] + portable.hypot((i % m.W) - (r % m.W), Math.floor(i / m.W) - Math.floor(r / m.W));
      }
      this.potential = Float64Array.from(d.filled, (v, i) => v * 16 + distance[i]);
      this.receivers = d.rcv;
    }
    const x = intent.origin % m.W;
    const y = Math.floor(intent.origin / m.W);
    const bearing = this.guide(x, y);
    this.trace.push({ x, y, cost: this.cost(x, y), bearing, heading: bearing, straightening: false });
  }

  /** The curve's sample nearest (x, y), searched ahead of where the head was. */
  private nearest(x: number, y: number): number {
    const c = this.curve!;
    let best = this.along;
    let d = Infinity;
    for (let k = this.along; k < Math.min(c.x.length, this.along + CURVE_WINDOW); k++) {
      const e = portable.pow(c.x[k] - x, 2) + portable.pow(c.y[k] - y, 2);
      if (e < d) {
        d = e;
        best = k;
      }
    }
    return best;
  }

  /** Whether the head has come to the last stretch of its course (always, without a drawn path). */
  nearEnd(): boolean {
    const c = this.curve;
    return !c || c.s[c.s.length - 1] - c.s[this.along] < 3;
  }

  cost(x: number, y: number): number {
    const c = this.curve;
    if (c) {
      const k = this.nearest(x, y);
      return c.s[c.s.length - 1] - c.s[k] + portable.hypot(c.x[k] - x, c.y[k] - y);
    }
    if (this.settings.mode === "aim") return portable.hypot((this.intent.end! % this.m.W) - x, Math.floor(this.intent.end! / this.m.W) - y);
    const { W, H } = this.m;
    const xx = Math.max(0, Math.min(W - 1, x));
    const yy = Math.max(0, Math.min(H - 1, y));
    const x0 = Math.floor(xx);
    const y0 = Math.floor(yy);
    const x1 = Math.min(W - 1, x0 + 1);
    const y1 = Math.min(H - 1, y0 + 1);
    const u = xx - x0;
    const v = yy - y0;
    const p = this.potential!;
    return (p[y0 * W + x0] * (1 - u) + p[y0 * W + x1] * u) * (1 - v) + (p[y1 * W + x0] * (1 - u) + p[y1 * W + x1] * u) * v;
  }

  guide(x: number, y: number): number {
    const c = this.curve;
    if (c) {
      const k = this.nearest(x, y);
      let j = k;
      while (j + 1 < c.x.length && c.s[j] - c.s[k] < LOOK_AHEAD) j++;
      return portable.atan2(c.y[j] - y, c.x[j] - x);
    }
    if (this.settings.mode === "aim") return portable.atan2(Math.floor(this.intent.end! / this.m.W) - y, (this.intent.end! % this.m.W) - x);
    const { W, H } = this.m;
    let i = Math.max(0, Math.min(H - 1, Math.round(y))) * W + Math.max(0, Math.min(W - 1, Math.round(x)));
    for (let k = 0; k < 10 && this.receivers![i] >= 0; k++) i = this.receivers![i];
    return portable.atan2(Math.floor(i / W) - y, (i % W) - x);
  }

  plan(x: number, y: number) {
    const bearing = this.guide(x, y);
    const cost = this.cost(x, y);
    const n = this.trace.length;
    const straightening = n >= 8 && cost >= this.trace[n - 8].cost - 0.25;
    const deadline = n >= PROGRESS_WINDOW ? this.trace[n - PROGRESS_WINDOW].cost - 0.05 : Infinity;
    const available = this.settings.mode === "aim" ? cost : Infinity;
    return { bearing, cost, straightening, deadline, preferred: bearing + (straightening ? 0 : this.character.swing(this.forward, available)) };
  }

  accept(x: number, y: number, heading: number, bearing: number, straightening: boolean) {
    if (this.curve) this.along = this.nearest(x, y);
    this.forward += 1.35 * Math.max(0.05, portable.cos(angleDelta(heading, bearing)));
    this.trace.push({ x, y, cost: this.cost(x, y), bearing, heading, straightening });
  }
}

export interface Point {
  x: number;
  y: number;
}

export function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const cross = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const v = cross(a, b, c);
  const w = cross(a, b, d);
  const x = cross(c, d, a);
  const y = cross(c, d, b);
  return (
    v * w <= 0 &&
    x * y <= 0 &&
    Math.max(a.x, b.x) >= Math.min(c.x, d.x) &&
    Math.min(a.x, b.x) <= Math.max(c.x, d.x) &&
    Math.max(a.y, b.y) >= Math.min(c.y, d.y) &&
    Math.min(a.y, b.y) <= Math.max(c.y, d.y)
  );
}
