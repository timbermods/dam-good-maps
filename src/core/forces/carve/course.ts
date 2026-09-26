// Where a carve's head goes (D194, D199). Aim steers toward its end point; Unleash follows the way
// the land drains (the priority flood, so flats and hollows still have a way down). Wander swings
// the heading round that guide, never more than 110° off it, and never by adding turn to turn. A
// reach that stops making progress straightens, and every 16 moves must get closer to the end (or
// further down the drainage), else the force is spent: it never circles.
//
// Ported from investigation/carve/course.ts (PR #47), kept to its structure.

import { drainage } from "../drainage";
import type { ForceMap } from "../force";
import type { RiverCharacter } from "./character";
import type { CarveIntent, CarveSettings } from "./run";

export const HEADING_LIMIT = (110 * Math.PI) / 180;
export const PROGRESS_WINDOW = 16;
export const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

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

  constructor(
    private m: ForceMap,
    private settings: CarveSettings,
    private intent: CarveIntent,
    private character: RiverCharacter,
  ) {
    this.potential = null;
    if (settings.mode === "unleash") {
      const d = drainage(m.heights, m.W, m.H, 0.0001);
      const distance = new Float64Array(m.W * m.H);
      for (const i of d.order) {
        const r = d.rcv[i];
        if (r >= 0) distance[i] = distance[r] + Math.hypot((i % m.W) - (r % m.W), Math.floor(i / m.W) - Math.floor(r / m.W));
      }
      this.potential = Float64Array.from(d.filled, (v, i) => v * 16 + distance[i]);
      this.receivers = d.rcv;
    }
    const x = intent.origin % m.W;
    const y = Math.floor(intent.origin / m.W);
    const bearing = this.guide(x, y);
    this.trace.push({ x, y, cost: this.cost(x, y), bearing, heading: bearing, straightening: false });
  }

  cost(x: number, y: number): number {
    if (this.settings.mode === "aim") return Math.hypot((this.intent.end! % this.m.W) - x, Math.floor(this.intent.end! / this.m.W) - y);
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
    if (this.settings.mode === "aim") return Math.atan2(Math.floor(this.intent.end! / this.m.W) - y, (this.intent.end! % this.m.W) - x);
    const { W, H } = this.m;
    let i = Math.max(0, Math.min(H - 1, Math.round(y))) * W + Math.max(0, Math.min(W - 1, Math.round(x)));
    for (let k = 0; k < 10 && this.receivers![i] >= 0; k++) i = this.receivers![i];
    return Math.atan2(Math.floor(i / W) - y, (i % W) - x);
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
    this.forward += 1.35 * Math.max(0.05, Math.cos(angleDelta(heading, bearing)));
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
