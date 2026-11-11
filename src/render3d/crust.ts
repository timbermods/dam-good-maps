// A crust of rock round a middle and loose rocks round it (D178, D496): the shape our own models of the game's geothermal
// field and aquifer are built from (geothermal.ts, aquifer.ts). The crust is a grid of headings by rings, each corner at
// the game's height there and in its colour there, falling to its foot at the middle and sunk into the ground past its
// reach; each rock a hull of a few of its farthest points. Read in the game's local frame (x east, y up, z the map's y;
// the 3 × 3 footprint 0…3), turned into ours.

import type { Rgb } from "./palette";
import type { V } from "./relicParts";

export interface Crust {
  /** Its reach from the middle along each heading (from east, toward the map's y), evenly round. */
  edge: readonly number[];
  /** Its rings, as shares of the reach. */
  rings: readonly number[];
  /** Its height at each ring along each heading, and the shade there (an index into the crust's colours). */
  height: readonly (readonly number[])[];
  shade: readonly (readonly number[])[];
  /** Its foot under the middle (a vent's, or the crust's own low point). */
  foot: number;
  /** The least height of its rings over the ground, where the game's lies on it (0: as the game's). */
  lift: number;
  /** The rocks: each one's corners, its faces (three corners each) and its shade (an index into the rocks' colours). */
  rocks: readonly [readonly V[], readonly (readonly number[])[], number][];
}

/** How far past its reach the crust's edge reaches into the ground, and how deep. */
export const SKIRT = 0.04;

/** The crust's and rocks' triangles (our frame: centred on the footprint's middle, x east, y up, z south), each turned
 *  so its front faces out, with each corner's colour: the crust's by its grid, its foot `foot`, each rock its shade. */
export function crustParts(c: Crust, crust: readonly Rgb[], foot: Rgb, rock: readonly Rgb[]): { points: number[]; colours: number[] } {
  const points: number[] = [];
  const colours: number[] = [];
  const ours = (p: V): V => [p[0] - 1.5, p[1], 1.5 - p[2]];
  // (a triangle of the game's frame, its front turned away from `from`)
  const tri = (a: V, b: V, d: V, ca: Rgb, cb: Rgb, cd: Rgb, from: V) => {
    const [p, q, r] = [ours(a), ours(b), ours(d)];
    const u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
    const v = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const f = ours(from);
    const m = [(p[0] + q[0] + r[0]) / 3 - f[0], (p[1] + q[1] + r[1]) / 3 - f[1], (p[2] + q[2] + r[2]) / 3 - f[2]];
    const flip = n[0] * m[0] + n[1] * m[1] + n[2] * m[2] < 0;
    for (const [s, col] of (flip ? [[p, ca], [r, cd], [q, cb]] : [[p, ca], [q, cb], [r, cd]]) as [V, Rgb][]) {
      points.push(...s);
      colours.push(...col);
    }
  };
  // the crust: a ring of points along each heading round its foot, its edge sunk into the ground
  const n = c.edge.length;
  const last = c.rings.length;
  const at = (k: number, i: number): [V, Rgb] => {
    const t = ((k % n) * 2 * Math.PI) / n;
    const r = i === last ? c.edge[k % n] + SKIRT : c.rings[i] * c.edge[k % n];
    const y = i === last ? -SKIRT : Math.max(c.lift, c.height[k % n][i]);
    return [[1.5 + r * Math.cos(t), y, 1.5 + r * Math.sin(t)], crust[c.shade[k % n][Math.min(i, last - 1)]]];
  };
  const below: V = [1.5, -10, 1.5];
  const middle: V = [1.5, c.foot, 1.5];
  for (let k = 0; k < n; k++) {
    const [a, ca] = at(k, 0);
    const [b, cb] = at(k + 1, 0);
    tri(middle, a, b, foot, ca, cb, below);
    for (let i = 0; i < last; i++) {
      const [p, cp] = at(k, i);
      const [q, cq] = at(k + 1, i);
      const [r, cr] = at(k + 1, i + 1);
      const [s, cs] = at(k, i + 1);
      tri(p, q, r, cp, cq, cr, below);
      tri(p, r, s, cp, cr, cs, below);
    }
  }
  // the rocks
  for (const [corners, faces, shade] of c.rocks) {
    const mid = corners.reduce<V>((s, p) => [s[0] + p[0] / corners.length, s[1] + p[1] / corners.length, s[2] + p[2] / corners.length], [0, 0, 0]);
    const col = rock[shade];
    for (const [a, b, d] of faces) tri(corners[a], corners[b], corners[d], col, col, col, mid);
  }
  return { points, colours };
}
