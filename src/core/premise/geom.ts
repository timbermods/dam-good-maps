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

/** Distance between two segments (zero when they cross). */
function segSegDist(a: Point, b: Point, c: Point, d: Point): { d: number; t: number; u: number } {
  if (segmentsCross(a, b, c, d)) {
    return { d: 0, ...crossAt(a, b, c, d) };
  }
  let d2 = Infinity;
  let t = 0;
  let u = 0;
  const p = segDist2(a[0], a[1], c[0], c[1], d[0], d[1]);
  if (p.d2 < d2) [d2, t, u] = [p.d2, 0, p.t];
  const q = segDist2(b[0], b[1], c[0], c[1], d[0], d[1]);
  if (q.d2 < d2) [d2, t, u] = [q.d2, 1, q.t];
  const r = segDist2(c[0], c[1], a[0], a[1], b[0], b[1]);
  if (r.d2 < d2) [d2, t, u] = [r.d2, r.t, 0];
  const s = segDist2(d[0], d[1], a[0], a[1], b[0], b[1]);
  if (s.d2 < d2) [d2, t, u] = [s.d2, s.t, 1];
  return { d: sqrt(d2), t, u };
}

/** The squared distance from a point to a segment, and where along it. */
function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number): { d2: number; t: number } {
  const vx = bx - ax;
  const vy = by - ay;
  const l2 = vx * vx + vy * vy;
  let t = l2 > 0 ? ((px - ax) * vx + (py - ay) * vy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - (ax + vx * t);
  const dy = py - (ay + vy * t);
  return { d2: dx * dx + dy * dy, t };
}

/** The squared gap between two segments' bounding boxes: no nearer than this. */
function boxGap2(a: Point, b: Point, c: Point, d: Point): number {
  const gx = Math.max(0, Math.min(c[0], d[0]) - Math.max(a[0], b[0]), Math.min(a[0], b[0]) - Math.max(c[0], d[0]));
  const gy = Math.max(0, Math.min(c[1], d[1]) - Math.max(a[1], b[1]), Math.min(a[1], b[1]) - Math.max(c[1], d[1]));
  return gx * gx + gy * gy;
}

function crossAt(a: Point, b: Point, c: Point, d: Point): { t: number; u: number } {
  const rx = b[0] - a[0];
  const ry = b[1] - a[1];
  const sx = d[0] - c[0];
  const sy = d[1] - c[1];
  const den = rx * sy - ry * sx;
  if (den === 0) return { t: 0, u: 0 };
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den;
  const u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den;
  return { t, u };
}

/** Whether segments a–b and c–d cross (touching counts). */
export function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const o = (p: Point, q: Point, r: Point) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a);
  const d2 = o(c, d, b);
  const d3 = o(a, b, c);
  const d4 = o(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0) || d1 === 0 || d2 === 0) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0) || d3 === 0 || d4 === 0) && !(d1 === 0 && d2 === 0 && d3 === 0 && d4 === 0 && !collinearOverlap(a, b, c, d));
}

function collinearOverlap(a: Point, b: Point, c: Point, d: Point): boolean {
  const lo = (u: number, v: number) => Math.min(u, v);
  const hi = (u: number, v: number) => Math.max(u, v);
  return hi(lo(a[0], b[0]), lo(c[0], d[0])) <= lo(hi(a[0], b[0]), hi(c[0], d[0])) && hi(lo(a[1], b[1]), lo(c[1], d[1])) <= lo(hi(a[1], b[1]), hi(c[1], d[1]));
}

/** The gap between two capsule chains' outlines (negative where they overlap). */
export function spineGap(p: Spine, q: Spine): number {
  let best = Infinity;
  const segs = (s: Spine): [Spine[number], Spine[number]][] => (s.length === 1 ? [[s[0], s[0]]] : s.slice(0, -1).map((a, k) => [a, s[k + 1]]));
  for (const [a, b] of segs(p))
    for (const [c, d] of segs(q)) {
      const lim = best + Math.max(a[2], b[2]) + Math.max(c[2], d[2]);
      if (lim > 0 && lim < Infinity && boxGap2([a[0], a[1]], [b[0], b[1]], [c[0], c[1]], [d[0], d[1]]) >= lim * lim) continue;
      const r = segSegDist([a[0], a[1]], [b[0], b[1]], [c[0], c[1]], [d[0], d[1]]);
      const ra = a[2] + (b[2] - a[2]) * Math.max(0, Math.min(1, r.t));
      const rc = c[2] + (d[2] - c[2]) * Math.max(0, Math.min(1, r.u));
      const v = r.d - ra - rc;
      if (v < best) best = v;
    }
  return best;
}

/** The gap between two bodies' outlines (negative where they overlap). */
export function bodyGap(a: Pick<Body, "arms">, b: Pick<Body, "arms">): number {
  let best = Infinity;
  for (const p of a.arms) for (const q of b.arms) best = Math.min(best, spineGap(p, q));
  return best;
}

/** The nearest an outline comes to a map edge (negative past it). */
export function edgeGap(body: Pick<Body, "arms">, W: number, H: number): number {
  let best = Infinity;
  for (const arm of body.arms)
    for (const [x, y, r] of arm) best = Math.min(best, x - r, y - r, W - x - r, H - y - r);
  return best;
}

/** The nearest a path comes to a body's outline (negative inside it), and how far along the path. */
export function pathBodyGap(path: readonly Point[], body: Pick<Body, "arms">, from = 0, to = Infinity): number {
  let best = Infinity;
  let run = 0;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const arm of body.arms)
    for (const [x, y, r] of arm) {
      x0 = Math.min(x0, x - r);
      y0 = Math.min(y0, y - r);
      x1 = Math.max(x1, x + r);
      y1 = Math.max(y1, y + r);
    }
  for (let k = 0; k + 1 < path.length; k++) {
    const a = path[k];
    const b = path[k + 1];
    const len = dist(a, b);
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

/** The nearest two paths come to each other (zero where they cross). */
export function pathGap(p: readonly Point[], q: readonly Point[]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < p.length; i++)
    for (let j = 0; j + 1 < q.length; j++) {
      if (best < Infinity && boxGap2(p[i], p[i + 1], q[j], q[j + 1]) >= best * best) continue;
      best = Math.min(best, segSegDist(p[i], p[i + 1], q[j], q[j + 1]).d);
    }
  return best;
}

/** Points on a body's outline, every `step` tiles round each capsule end, kept where no other arm covers them. */
export function outlinePoints(body: Pick<Body, "arms">, step = 2): Point[] {
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
