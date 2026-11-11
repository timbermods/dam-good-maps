// The relics' parts (D178, D496): the shapes our own models of the game's relics are built from (largeRelic.ts,
// smallRelics.ts), in the game's local frame (x east, y up, z the map's y; the footprint from 0), turned into ours.

import type { Rgb } from "./palette";

export type V = [number, number, number];

export const add = (a: V, b: V, k = 1): V => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
export const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const unit = (a: V): V => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};
/** Two directions across `axis`, square to it and to each other. */
export function across(axis: V): [V, V] {
  const u = unit(cross(axis, Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  return [u, cross(axis, u)];
}

/** A model's triangles by colour, built in the game's local frame and kept in ours: centred on the footprint's middle
 *  `mid` (x, z of the game's), x east, y up, z south. */
export class Parts {
  readonly byColour = new Map<Rgb, number[]>();
  constructor(private readonly mid: readonly [number, number]) {}
  /** A point of the game's local frame in ours: the footprint's middle the origin, the game's z (the map's y) our −z. */
  ours(p: V): V {
    return [p[0] - this.mid[0], p[1], this.mid[1] - p[2]];
  }
  /** A flat face (its corners in the game's local frame, in order round it), its front turned away from `from`. */
  face(corners: V[], colour: Rgb, from: V): this {
    // (corners that meet, at a cone's tip, are one)
    const pts = corners.filter((p, i) => i === 0 || dot(sub(p, corners[i - 1]), sub(p, corners[i - 1])) > 1e-12).map((p) => this.ours(p));
    if (pts.length > 2 && dot(sub(pts[pts.length - 1], pts[0]), sub(pts[pts.length - 1], pts[0])) <= 1e-12) pts.pop();
    if (pts.length < 3) return this;
    let n: V = [0, 0, 0];
    for (let i = 0; i < pts.length; i++) n = add(n, cross(pts[i], pts[(i + 1) % pts.length]));
    let mid: V = [0, 0, 0];
    for (const p of pts) mid = add(mid, p, 1 / pts.length);
    if (dot(n, sub(mid, this.ours(from))) < 0) pts.reverse();
    const out = this.byColour.get(colour) ?? [];
    for (let i = 1; i + 1 < pts.length; i++) out.push(...pts[0], ...pts[i], ...pts[i + 1]);
    this.byColour.set(colour, out);
    return this;
  }
  /** A body of revolution round an axis through `centre` along `axis`, (`u`, `v`) across it: `profile` its (along,
   *  radius) points, closed where a radius is 0; `sides` round. Its faces turn away from the axis at their middle's
   *  along (a flat end away from the body's middle); with `core` (a point of a closed profile's section) a hoop, its
   *  faces turned away from it. */
  revolve(centre: V, axis: V, u: V, v: V, profile: [number, number][], sides: number, colour: Rgb, core?: [number, number]): this {
    const at = (a: number, r: number, k: number) => {
      const t = (k * 2 * Math.PI) / sides;
      return add(add(centre, axis, a), add([u[0] * Math.cos(t), u[1] * Math.cos(t), u[2] * Math.cos(t)], v, Math.sin(t)), r);
    };
    for (let i = 0; i + 1 < profile.length; i++) {
      const [a0, r0] = profile[i];
      const [a1, r1] = profile[i + 1];
      const flat = Math.abs(a1 - a0) < 1e-9;
      const mid = (profile[0][0] + profile[profile.length - 1][0]) / 2;
      for (let k = 0; k < sides; k++) {
        const from = core ? at(core[0], core[1], k + 0.5) : flat ? add(centre, axis, a0 + (a0 > mid ? -1 : 1)) : add(centre, axis, (a0 + a1) / 2);
        this.face([at(a0, r0, k), at(a1, r1, k), at(a1, r1, k + 1), at(a0, r0, k + 1)], colour, from);
      }
    }
    return this;
  }
  /** A round bar from `a` to `b` of `profile` (along it as a share of its length, radius), `sides` round. */
  bar(a: V, b: V, profile: [number, number][], sides: number, colour: Rgb): this {
    const d = sub(b, a);
    const l = Math.hypot(d[0], d[1], d[2]);
    const axis = unit(d);
    const [u, v] = across(axis);
    return this.revolve(a, axis, u, v, profile.map(([s, r]) => [s * l, r]), sides, colour);
  }
  /** A beam of square section `w` across along `line` (open ends). */
  beam(line: V[], w: number, colour: Rgb): this {
    for (let k = 0; k + 1 < line.length; k++) {
      const [a, b] = [line[k], line[k + 1]];
      const [u, v] = across(unit(sub(b, a)));
      const h = w / 2;
      const corner = (p: V, s: number, t: number) => add(add(p, u, s * h), v, t * h);
      const round = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
      const mid = add(a, sub(b, a), 0.5);
      for (let q = 0; q < 4; q++) {
        const [s0, t0] = round[q];
        const [s1, t1] = round[(q + 1) % 4];
        this.face([corner(a, s0, t0), corner(b, s0, t0), corner(b, s1, t1), corner(a, s1, t1)], colour, mid);
      }
    }
    return this;
  }
  /** A stone: a double pyramid of its size across (x, y, z) round its middle. */
  stone([x, y, z, sx, sy, sz]: readonly number[], colour: Rgb): this {
    const c: V = [x, y, z];
    const tips: V[] = [[sx / 2, 0, 0], [0, 0, sz / 2], [-sx / 2, 0, 0], [0, 0, -sz / 2]].map((d) => add(c, d as V));
    for (const tip of [add(c, [0, sy / 2, 0]), add(c, [0, -sy / 2, 0])]) for (let k = 0; k < 4; k++) this.face([tip, tips[k], tips[(k + 1) % 4]], colour, c);
    return this;
  }
  /** The triangles by colour. */
  parts(): { points: number[]; colour: Rgb }[] {
    return [...this.byColour].map(([colour, points]) => ({ points, colour }));
  }
}
