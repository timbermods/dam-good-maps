// Plane geometry for plans (four-lakes-design's helpers, generalised): distances to capsule chains and paths, arc
// length, and the outline distance between two bodies. Portable maths only (D366): plans feed maps.

import { sqrt } from "../math/portable";
import type { Body, Heading, Point, Spine } from "./types";

export function dist(a: Point, b: Point): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return sqrt(dx * dx + dy * dy);
}

/** The squared distance: for finding the nearest, with no root. */
export function dist2(a: Point, b: Point): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

/** Distance from a point to the segment a–b, and how far along it (0 to 1) the nearest point lies. */
export function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): { d: number; t: number } {
  const vx = bx - ax;
  const vy = by - ay;
  const l2 = vx * vx + vy * vy;
  let t = l2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - (ax + vx * t);
  const dy = py - (ay + vy * t);
  return { d: sqrt(dx * dx + dy * dy), t };
}

/** Signed distance to a chain of capsules whose radius runs along it: below 0 inside. */
export function spineDist(px: number, py: number, spine: Spine): number {
  if (spine.length === 1) {
    const dx = px - spine[0][0];
    const dy = py - spine[0][1];
    return sqrt(dx * dx + dy * dy) - spine[0][2];
  }
  let best = Infinity;
  for (let k = 0; k + 1 < spine.length; k++) {
    const a = spine[k];
    const b = spine[k + 1];
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const l2 = vx * vx + vy * vy;
    let t = l2 > 0 ? ((px - a[0]) * vx + (py - a[1]) * vy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = px - (a[0] + vx * t);
    const dy = py - (a[1] + vy * t);
    const r = a[2] + (b[2] - a[2]) * t;
    // (a segment whose distance cannot come under the best so far needs no root)
    const lim = best + r;
    const d2 = dx * dx + dy * dy;
    if (lim > 0 && d2 >= lim * lim) continue;
    const v = sqrt(d2) - r;
    if (v < best) best = v;
  }
  return best;
}

/** Signed distance to a body's outline (its arms; islands are not cut out): below 0 inside it. */
export function bodyDist(px: number, py: number, body: Pick<Body, "arms">): number {
  let best = Infinity;
  for (const arm of body.arms) {
    const v = spineDist(px, py, arm);
    if (v < best) best = v;
  }
  return best;
}

/** Whether every tile of the square of half side `half` round (x, y) stands `gap` or more from every body's outline
 *  (`bodyDist`). The middle is read first, against every body, since it is the likeliest to fail; a body whose arms'
 *  centres and widest radius stand further off than the square's corners needs no tile-by-tile look (a capsule
 *  chain's outline is never nearer than its centres' box less its widest radius). The same answer as reading every
 *  tile against every body, faster (stage 0's budget, PREMISES §3.3). */
export function squareClear(x: number, y: number, half: number, gap: number, bodies: readonly Pick<Body, "arms">[]): boolean {
  for (const b of bodies) if (bodyDist(x, y, b) < gap) return false;
  for (const b of bodies) {
    const [x0, y0, x1, y1, r] = boxesOf(b.arms).all;
    const gx = Math.max(0, x0 - (x + half), x - half - x1);
    const gy = Math.max(0, y0 - (y + half), y - half - y1);
    const lim = gap + r;
    if (gx * gx + gy * gy >= lim * lim) continue;
    for (let dy = -half; dy <= half; dy++) for (let dx = -half; dx <= half; dx++) if ((dx || dy) && bodyDist(x + dx, y + dy, b) < gap) return false;
  }
  return true;
}

/** Distance from a point to a path, how far along it (tiles from its first point) the nearest point lies. */
export function pathDist(px: number, py: number, path: readonly Point[]): { d: number; s: number } {
  if (path.length === 1) return { d: dist([px, py], path[0]), s: 0 };
  let best = Infinity;
  let at = 0;
  let run = 0;
  for (let k = 0; k + 1 < path.length; k++) {
    const a = path[k];
    const b = path[k + 1];
    const len = dist(a, b);
    const { d, t } = segDist(px, py, a[0], a[1], b[0], b[1]);
    if (d < best) {
      best = d;
      at = run + t * len;
    }
    run += len;
  }
  return { d: best, s: at };
}

export function pathLength(path: readonly Point[]): number {
  let run = 0;
  for (let k = 0; k + 1 < path.length; k++) run += dist(path[k], path[k + 1]);
  return run;
}

/** The point `s` tiles along a path, and its unit direction there. */
export function pointAt(path: readonly Point[], s: number): { p: Point; dir: Point } {
  let run = 0;
  for (let k = 0; k + 1 < path.length; k++) {
    const a = path[k];
    const b = path[k + 1];
    const len = dist(a, b);
    if (len > 0 && (s <= run + len || k + 2 === path.length)) {
      const t = Math.max(0, Math.min(1, (s - run) / len));
      return { p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], dir: [(b[0] - a[0]) / len, (b[1] - a[1]) / len] };
    }
    run += len;
  }
  const last = path[path.length - 1];
  return { p: [last[0], last[1]], dir: [1, 0] };
}

/** The part of a path from `s0` to `s1` tiles along it, its ends included. */
export function subPath(path: readonly Point[], s0: number, s1: number): Point[] {
  const out: Point[] = [pointAt(path, s0).p];
  let run = 0;
  for (let k = 0; k + 1 < path.length; k++) {
    run += dist(path[k], path[k + 1]);
    if (run > s0 && run < s1) out.push([path[k + 1][0], path[k + 1][1]]);
  }
  out.push(pointAt(path, s1).p);
  return out;
}

// The segment-to-segment arithmetic below works on plain numbers and leaves where along each segment the nearest
// points lie in `segT` and `segU`: no arrays or closures in the plan's hottest loops (stage 0's budget, §3.3).
let segT = 0;
let segU = 0;

/** Distance between segments a–b and c–d (zero when they cross); where along each in `segT` and `segU`. */
function segSegDist(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): number {
  if (crosses(ax, ay, bx, by, cx, cy, dx, dy)) {
    crossAt(ax, ay, bx, by, cx, cy, dx, dy);
    return 0;
  }
  let d2 = segD2(ax, ay, cx, cy, dx, dy);
  let t = 0;
  let u = segT;
  let q = segD2(bx, by, cx, cy, dx, dy);
  if (q < d2) [d2, t, u] = [q, 1, segT];
  q = segD2(cx, cy, ax, ay, bx, by);
  if (q < d2) [d2, t, u] = [q, segT, 0];
  q = segD2(dx, dy, ax, ay, bx, by);
  if (q < d2) [d2, t, u] = [q, segT, 1];
  segT = t;
  segU = u;
  return sqrt(d2);
}

/** The squared distance from a point to a segment; where along it in `segT`. */
function segD2(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const l2 = vx * vx + vy * vy;
  let t = l2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - (ax + vx * t);
  const dy = py - (ay + vy * t);
  segT = t;
  return dx * dx + dy * dy;
}

/** The squared gap between two segments' bounding boxes: no nearer than this. */
function boxGap2(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): number {
  const gx = Math.max(0, Math.min(cx, dx) - Math.max(ax, bx), Math.min(ax, bx) - Math.max(cx, dx));
  const gy = Math.max(0, Math.min(cy, dy) - Math.max(ay, by), Math.min(ay, by) - Math.max(cy, dy));
  return gx * gx + gy * gy;
}

/** Where crossing segments meet, along each, in `segT` and `segU`. */
function crossAt(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): void {
  const rx = bx - ax;
  const ry = by - ay;
  const sx = dx - cx;
  const sy = dy - cy;
  const den = rx * sy - ry * sx;
  if (den === 0) {
    segT = 0;
    segU = 0;
    return;
  }
  segT = ((cx - ax) * sy - (cy - ay) * sx) / den;
  segU = ((cx - ax) * ry - (cy - ay) * rx) / den;
}

/** Whether segments a–b and c–d cross (touching counts). */
export function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  return crosses(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]);
}

function crosses(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  const d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  return (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0) || d1 === 0 || d2 === 0) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0) || d3 === 0 || d4 === 0) &&
    !(d1 === 0 && d2 === 0 && d3 === 0 && d4 === 0 && !collinearOverlap(ax, ay, bx, by, cx, cy, dx, dy))
  );
}

function collinearOverlap(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  return Math.max(Math.min(ax, bx), Math.min(cx, dx)) <= Math.min(Math.max(ax, bx), Math.max(cx, dx)) && Math.max(Math.min(ay, by), Math.min(cy, dy)) <= Math.min(Math.max(ay, by), Math.max(cy, dy));
}

/** The gap between two capsule chains' outlines (negative where they overlap). Given `bound`, a gap that cannot come
 *  under it may come back as `bound` itself. */
export function spineGap(p: Spine, q: Spine, bound = Infinity): number {
  let best = bound;
  const np = p.length === 1 ? 1 : p.length - 1;
  const nq = q.length === 1 ? 1 : q.length - 1;
  for (let i = 0; i < np; i++) {
    const a = p[i];
    const b = p.length === 1 ? a : p[i + 1];
    const ra = Math.max(a[2], b[2]);
    for (let j = 0; j < nq; j++) {
      const c = q[j];
      const d = q.length === 1 ? c : q[j + 1];
      const lim = best + ra + Math.max(c[2], d[2]);
      if (lim > 0 && lim < Infinity && boxGap2(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]) >= lim * lim) continue;
      const g = segSegDist(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]);
      const rt = a[2] + (b[2] - a[2]) * Math.max(0, Math.min(1, segT));
      const rc = c[2] + (d[2] - c[2]) * Math.max(0, Math.min(1, segU));
      const v = g - rt - rc;
      if (v < best) best = v;
    }
  }
  return best;
}

/** A body's boxes: each arm's centres' bounding box and widest radius (five numbers an arm), the same for all its
 *  arms, and the box of its outline (its entries' circles), with the arms they were read from. */
interface Boxes {
  arms: readonly Spine[];
  arm: Float64Array;
  all: Float64Array;
  outline: Float64Array;
}
const boxCache = new WeakMap<readonly Spine[], Boxes>();

/** Whether two arms lists hold the same spines. */
function sameArms(a: readonly Spine[], b: readonly Spine[]): boolean {
  if (a.length !== b.length) return false;
  for (let k = 0; k < a.length; k++) if (a[k] !== b[k]) return false;
  return true;
}

/** A body's boxes, read once for its arms and remembered while they stand (stage 0 measures the same bodies many
 *  times, §3.3; a lake's arms change while it is laid out, a spine never changes once made). */
function boxesOf(arms: readonly Spine[]): Boxes {
  const known = boxCache.get(arms);
  if (known && sameArms(known.arms, arms)) return known;
  const arm = new Float64Array(arms.length * 5);
  const all = new Float64Array([Infinity, Infinity, -Infinity, -Infinity, 0]);
  const outline = new Float64Array([Infinity, Infinity, -Infinity, -Infinity]);
  for (let i = 0; i < arms.length; i++) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    let r = 0;
    for (const [x, y, rr] of arms[i]) {
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
      if (rr > r) r = rr;
      outline[0] = Math.min(outline[0], x - rr);
      outline[1] = Math.min(outline[1], y - rr);
      outline[2] = Math.max(outline[2], x + rr);
      outline[3] = Math.max(outline[3], y + rr);
    }
    const k = i * 5;
    arm[k] = x0;
    arm[k + 1] = y0;
    arm[k + 2] = x1;
    arm[k + 3] = y1;
    arm[k + 4] = r;
    all[0] = Math.min(all[0], x0);
    all[1] = Math.min(all[1], y0);
    all[2] = Math.max(all[2], x1);
    all[3] = Math.max(all[3], y1);
    all[4] = Math.max(all[4], r);
  }
  const out = { arms: [...arms], arm, all, outline };
  boxCache.set(arms, out);
  return out;
}

/** The gap between two bodies' outlines (negative where they overlap). Given `bound`, a gap that cannot come under it
 *  may come back as `bound` itself: `bodyGap(a, b, x) < x` says the same as `bodyGap(a, b) < x`, faster. */
export function bodyGap(a: Pick<Body, "arms">, b: Pick<Body, "arms">, bound = Infinity): number {
  let best = bound;
  const A = boxesOf(a.arms);
  const B = boxesOf(b.arms);
  if (best < Infinity) {
    // (two bodies whose boxes stand further apart than the bound need no closer look)
    const gx = Math.max(0, B.all[0] - A.all[2], A.all[0] - B.all[2]);
    const gy = Math.max(0, B.all[1] - A.all[3], A.all[1] - B.all[3]);
    const lim = best + A.all[4] + B.all[4];
    if (lim > 0 && gx * gx + gy * gy >= lim * lim) return best;
  }
  const pa = A.arm;
  const pb = B.arm;
  for (let i = 0; i < a.arms.length; i++) {
    const p = i * 5;
    for (let j = 0; j < b.arms.length; j++) {
      const q = j * 5;
      // (an arm pair whose boxes stand further apart than the best so far needs no closer look)
      if (best < Infinity) {
        const gx = Math.max(0, pb[q] - pa[p + 2], pa[p] - pb[q + 2]);
        const gy = Math.max(0, pb[q + 1] - pa[p + 3], pa[p + 1] - pb[q + 3]);
        const lim = best + pa[p + 4] + pb[q + 4];
        if (lim > 0 && gx * gx + gy * gy >= lim * lim) continue;
      }
      best = Math.min(best, spineGap(a.arms[i], b.arms[j], best));
    }
  }
  return best;
}

/** The nearest an outline comes to a map edge (negative past it). */
export function edgeGap(body: Pick<Body, "arms">, W: number, H: number): number {
  let best = Infinity;
  for (const arm of body.arms)
    for (const [x, y, r] of arm) best = Math.min(best, x - r, y - r, W - x - r, H - y - r);
  return best;
}

/** The nearest a path comes to a body's outline (negative inside it), read a tile at a time along it from `from` to
 *  `to` tiles. Given `bound`, a gap that cannot come under it may come back as `bound` itself (as `bodyGap`). */
export function pathBodyGap(path: readonly Point[], body: Pick<Body, "arms">, from = 0, to = Infinity, bound = Infinity): number {
  let best = bound;
  let run = 0;
  const ob = boxesOf(body.arms).outline;
  const x0 = ob[0];
  const y0 = ob[1];
  const x1 = ob[2];
  const y1 = ob[3];
  for (let k = 0; k + 1 < path.length; k++) {
    const a = path[k];
    const b = path[k + 1];
    const len = dist(a, b);
    // (a segment whose box stands further from the body's than the best so far needs no tile-by-tile look)
    if (best > 0 && best < Infinity) {
      const gx = Math.max(0, x0 - Math.max(a[0], b[0]), Math.min(a[0], b[0]) - x1);
      const gy = Math.max(0, y0 - Math.max(a[1], b[1]), Math.min(a[1], b[1]) - y1);
      if (gx * gx + gy * gy >= best * best) {
        run += len;
        continue;
      }
    }
    const n = Math.max(1, Math.ceil(len));
    for (let i = 0; i <= n; i++) {
      const s = run + (len * i) / n;
      if (s < from || s > to) continue;
      const x = a[0] + ((b[0] - a[0]) * i) / n;
      const y = a[1] + ((b[1] - a[1]) * i) / n;
      const gx = Math.max(0, x0 - x, x - x1);
      const gy = Math.max(0, y0 - y, y - y1);
      if (best > 0 && best < Infinity && gx * gx + gy * gy >= best * best) continue;
      best = Math.min(best, bodyDist(x, y, body));
    }
    run += len;
  }
  return best;
}

/** The nearest two paths come to each other (zero where they cross). Given `bound`, a gap that cannot come under it
 *  may come back as `bound` itself (as `bodyGap`). */
export function pathGap(p: readonly Point[], q: readonly Point[], bound = Infinity): number {
  let best = bound;
  for (let i = 0; i + 1 < p.length; i++)
    for (let j = 0; j + 1 < q.length; j++) {
      const a = p[i];
      const b = p[i + 1];
      const c = q[j];
      const d = q[j + 1];
      if (best < Infinity && boxGap2(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]) >= best * best) continue;
      best = Math.min(best, segSegDist(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]));
    }
  return best;
}

/** Each arms list's outline points by step, with the arms they were read from (a lake's arms change while stage 0
 *  lays it out; a spine is never changed once made). */
const outlines = new WeakMap<readonly Spine[], Map<number, { arms: readonly Spine[]; pts: readonly Point[] }>>();

/** Points on a body's outline, every `step` tiles round each capsule end, kept where no other arm covers them. Read
 *  once for a body's arms and step, then remembered (stage 0 asks for the same outlines many times, §3.3). */
export function outlinePoints(body: Pick<Body, "arms">, step = 2): readonly Point[] {
  let bySteps = outlines.get(body.arms);
  if (!bySteps) outlines.set(body.arms, (bySteps = new Map()));
  const known = bySteps.get(step);
  if (known && sameArms(known.arms, body.arms)) return known.pts;
  const pts = outlineOf(body, step);
  bySteps.set(step, { arms: [...body.arms], pts });
  return pts;
}

function outlineOf(body: Pick<Body, "arms">, step: number): Point[] {
  const out: Point[] = [];
  for (const arm of body.arms)
    for (const [x, y, r] of arm) {
      // the circle's points from a fixed table of directions: no native maths
      const n = Math.min(UNIT.length, Math.max(8, Math.ceil((2 * PI * r) / step)));
      for (let k = 0; k < n; k++) {
        const c = UNIT[Math.floor((k * UNIT.length) / n)];
        const p: Point = [x + r * c[0], y + r * c[1]];
        if (bodyDist(p[0], p[1], body) > -0.25) out.push(p);
      }
    }
  return out;
}

const PI = 3.141592653589793;
/** 64 unit directions round the circle, by exact rotation steps (cos and sin of 2π/64 as constants). */
const UNIT: Point[] = (() => {
  const c = 0.9951847266721969;
  const s = 0.0980171403295606;
  const out: Point[] = [];
  let x = 1;
  let y = 0;
  for (let k = 0; k < 64; k++) {
    out.push([x, y]);
    const nx = x * c - y * s;
    y = x * s + y * c;
    x = nx;
  }
  return out;
})();

/** The unit vector of a heading, and the heading nearest a direction. */
export const HEADINGS: readonly Heading[] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const R2 = 0.7071067811865476;
export const HEADING_DIR: Record<Heading, Point> = { N: [0, 1], NE: [R2, R2], E: [1, 0], SE: [R2, -R2], S: [0, -1], SW: [-R2, -R2], W: [-1, 0], NW: [-R2, R2] };
export function headingOf(dx: number, dy: number): Heading {
  let best: Heading = "N";
  let bestDot = -Infinity;
  for (const h of HEADINGS) {
    const v = HEADING_DIR[h];
    const d = v[0] * dx + v[1] * dy;
    if (d > bestDot) {
      bestDot = d;
      best = h;
    }
  }
  return best;
}

/** A unit direction at a whole number of 64ths of a turn (0 east, counter-clockwise), without native maths. */
export function unitAt(k: number): Point {
  const u = UNIT[((k % 64) + 64) % 64];
  return [u[0], u[1]];
}

/** The unit direction of a vector (east if it has none). */
export function norm(v: Point): Point {
  const l = sqrt(v[0] * v[0] + v[1] * v[1]);
  return l > 0 ? [v[0] / l, v[1] / l] : [1, 0];
}

/** Rotate a direction by `k` 64ths of a turn counter-clockwise. */
export function rotate(v: Point, k: number): Point {
  const u = unitAt(k);
  return [v[0] * u[0] - v[1] * u[1], v[0] * u[1] + v[1] * u[0]];
}
