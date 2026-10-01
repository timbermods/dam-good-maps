// A path drawn freehand on the land (PLAN §20 D321, items 41 and 13; D327): the travelling forces' one
// way to steer (Carve, Glaciate; Erode's sweep is the same gesture), and the line Quake's fault and
// Erupt's fissure follow. The pen itself (`PathBrush`, the painted fault's brush before it) smooths the
// pointer into sub-tile points as it moves; a force keeps the path resampled along its length.

import * as portable from "../math/portable";

export interface PathPoint {
  x: number;
  y: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** A path's length along its points, in tiles. */
export function pathLength(points: readonly PathPoint[]): number {
  let l = 0;
  for (let k = 1; k < points.length; k++) l += portable.hypot(points[k].x - points[k - 1].x, points[k].y - points[k - 1].y);
  return l;
}

/** The path as a force keeps it: a point every `spacing` tiles along its length (at most `max`, the
 *  spacing growing to fit), its ends kept exactly. */
export function resamplePath(points: readonly PathPoint[], spacing = 2, max = 128): PathPoint[] {
  if (points.length < 2) return points.map((p) => ({ ...p }));
  const length = pathLength(points);
  const step = Math.max(spacing, length / Math.max(1, max - 1));
  const out: PathPoint[] = [{ ...points[0] }];
  let k = 1;
  let walked = 0;
  let from = points[0];
  for (let next = step; next < length - step * 0.5; next += step) {
    while (k < points.length) {
      const seg = portable.hypot(points[k].x - from.x, points[k].y - from.y);
      if (walked + seg >= next) {
        const t = seg ? (next - walked) / seg : 0;
        from = { x: from.x + (points[k].x - from.x) * t, y: from.y + (points[k].y - from.y) * t };
        walked = next;
        out.push({ ...from });
        break;
      }
      walked += seg;
      from = points[k];
      k++;
    }
  }
  out.push({ ...points[points.length - 1] });
  return out;
}

/** The path's tiles (whole tiles, each once in a row), for a force that takes tiles. */
export function pathTiles(points: readonly PathPoint[], W: number, H: number): [number, number][] {
  const out: [number, number][] = [];
  for (const p of points) {
    const t: [number, number] = [clamp(Math.round(p.x), 0, W - 1), clamp(Math.round(p.y), 0, H - 1)];
    const last = out[out.length - 1];
    if (!last || last[0] !== t[0] || last[1] !== t[1]) out.push(t);
  }
  return out;
}

/** Water runs downhill (item 41): the path from its higher end to its lower one, whichever way it was
 *  drawn (the ground at its ends; drawn level, as drawn). */
export function downhillPath<T extends PathPoint>(points: readonly T[], heights: ArrayLike<number>, W: number, H: number): T[] {
  if (points.length < 2) return points.slice();
  const at = (p: PathPoint) => heights[clamp(Math.round(p.y), 0, H - 1) * W + clamp(Math.round(p.x), 0, W - 1)];
  return at(points[points.length - 1]) > at(points[0]) ? points.slice().reverse() : points.slice();
}

/** The pen (continuous, sub-tile pointer input): the page feeds it the pointer at display rate, and it
 *  keeps a lightly smoothed line, a point each half tile or so, never more than 480 (the beginning and
 *  the end always kept). The painted fault's brush, now every drawn path's. */
export class PathBrush {
  readonly points: PathPoint[] = [];
  protected smoothed: PathPoint;
  private target: PathPoint;

  constructor(
    p: PathPoint,
    readonly W: number,
    readonly H: number,
  ) {
    this.smoothed = { ...p };
    this.target = { ...p };
    this.points.push({ ...p });
  }

  aim(p: PathPoint): void {
    this.target = { x: clamp(p.x, 0, this.W - 1), y: clamp(p.y, 0, this.H - 1) };
  }

  advance(dt: number, finish = false): void {
    const a = finish ? 1 : 1 - portable.exp(-Math.max(0, dt) / 0.018);
    this.smoothed = { x: this.smoothed.x + (this.target.x - this.smoothed.x) * a, y: this.smoothed.y + (this.target.y - this.smoothed.y) * a };
    const last = this.points.at(-1)!;
    if (portable.hypot(this.smoothed.x - last.x, this.smoothed.y - last.y) > 0.45) this.points.push({ ...this.smoothed });
    // Bound both the worker and line buffers, retaining the beginning and end.
    if (this.points.length > 480) this.points.splice(1, this.points.length - 2, ...this.points.slice(1, -1).filter((_, i) => i % 2 === 0));
  }

  /** The line as drawn so far, to the pointer. */
  path(): PathPoint[] {
    return [...this.points.map((p) => ({ ...p })), { ...this.smoothed }];
  }
}
