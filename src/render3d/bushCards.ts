// The blueberry bush as the game builds it (D496, D178 as amended 2026-11-10), shared by Standard's model
// (entities3d.ts) and High's close one (high/models.ts): the game's `BlueberryBushMature` (61 triangles, VegetationURP,
// cut at alpha 0.312; numbers read with tools/game-model-albedo.py, no mesh) is a low dome its texture's mound of leaf
// rosettes covers, 0.97 by 1.1 and 0.29 high, with rosette cards about 0.33 m on its shoulders and 0.2 m on its top,
// tilted out, to 0.42; its berries are its detail map's clusters over the leaves (12 % of what the camera sees), here
// cards of their own laid on the dome, facing out along it. Its cut-away corners clear, it covers 0.93 across from above. Each triangle carries its place in
// the bush's pattern (objectPatterns.ts `BUSH_*`) and which colour it takes.

import { BUSH_BERRIES, BUSH_MOUND, BUSH_ROSETTES, type Region } from "./objectPatterns";

type V = [number, number, number];
/** A triangle of the bush: its corners (counter-clockwise seen from outside), their places in the pattern, and its part
 *  (the leaves take the bush's colour, the berries theirs). */
export type BushTriangle = { p: [V, V, V]; uv: [number, number][]; berries: boolean };

/** The dome's rings: (radius, height). */
const DOME: readonly [number, number][] = [
  [0, 0.3],
  [0.27, 0.25],
  [0.5, 0.04],
];
/** The dome's sides round. */
const SIDES = 8;
/** Across the dome its mound's part of the pattern spans this many metres. */
const MOUND_SPAN = 1.1;

/** The rosettes on its shoulders, laid on the dome where they stand and facing out along it: angle round, distance
 *  out, size, which of the pattern's four. */
const SHOULDERS: readonly [number, number, number, number][] = [
  [0.4, 0.33, 0.33, 0],
  [2.0, 0.34, 0.33, 1],
  [3.5, 0.32, 0.32, 2],
  [5.0, 0.34, 0.33, 3],
];
/** How far a shoulder rosette's middle stands off the dome (its leaves just over the mound's). */
const SHOULDER_OFF = 0.03;
/** The rosettes on its top, over the dome to the game's height: angle round, distance out, height, size, tilt out
 *  (radians), which of the pattern's four. */
const ROSETTES: readonly [number, number, number, number, number, number][] = [
  [1.2, 0.12, 0.36, 0.21, 0.25, 1],
  [3.0, 0.14, 0.35, 0.2, 0.3, 3],
  [4.6, 0.1, 0.37, 0.2, 0.2, 0],
];
/** The berries' clusters, each laid on the dome where it stands, facing out along its surface (the game's berries sit
 *  on its leaves): angle round, distance out, size, which of the pattern's four. */
const BERRIES: readonly [number, number, number, number][] = [
  [0.95, 0.33, 0.17, 0],
  [2.75, 0.36, 0.14, 1],
  [4.25, 0.32, 0.17, 2],
  [5.75, 0.37, 0.14, 3],
];
/** How far a berry card's middle stands off the dome (it touches it; this keeps it in front of the mound's texels). */
export const BERRY_OFF = 0.012;

/** The dome's surface over (x, z): its height there and its normal (up and out), from the dome's own triangles. */
export function domeAt(dome: readonly BushTriangle[], x: number, z: number): { y: number; n: V } | null {
  for (const { p } of dome) {
    const [a, b, c] = p;
    const d = (b[0] - a[0]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[0] - a[0]);
    if (Math.abs(d) < 1e-12) continue;
    const w1 = ((x - a[0]) * (c[2] - a[2]) - (z - a[2]) * (c[0] - a[0])) / d;
    const w2 = ((b[0] - a[0]) * (z - a[2]) - (b[2] - a[2]) * (x - a[0])) / d;
    if (w1 < -1e-9 || w2 < -1e-9 || w1 + w2 > 1 + 1e-9) continue;
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n: V = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (n[1] < 0) n = [-n[0], -n[1], -n[2]];
    const l = Math.hypot(...n);
    return { y: a[1] + w1 * e1[1] + w2 * e2[1], n: [n[0] / l, n[1] / l, n[2] / l] };
  }
  return null;
}

/** A card `size` across, centred at angle `a` and `out` from the middle at height `y`, tilted out by `tilt`, turned
 *  by `spin` about its own normal, at the region `r`. */
function card(out: BushTriangle[], a: number, dist: number, y: number, size: number, tilt: number, spin: number, r: Region, berries: boolean): void {
  facingCard(out, [Math.cos(a) * dist, y, Math.sin(a) * dist], [Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt)], size, spin, r, berries);
}

/** A card `size` across, centred at `c`, facing along `n` (up and out), turned by `spin` about it, at the region `r`. */
function facingCard(out: BushTriangle[], c: V, n: V, size: number, spin: number, r: Region, berries: boolean): void {
  // (two axes across it: one level, one up it)
  const h = Math.hypot(n[0], n[2]);
  const t0: V = h > 1e-6 ? [-n[2] / h, 0, n[0] / h] : [1, 0, 0];
  const t1: V = [n[1] * t0[2] - n[2] * t0[1], n[2] * t0[0] - n[0] * t0[2], n[0] * t0[1] - n[1] * t0[0]];
  const [cs, sn] = [Math.cos(spin), Math.sin(spin)];
  const e0 = t0.map((v, i) => (v * cs + t1[i] * sn) * (size / 2));
  const e1 = t0.map((v, i) => (-v * sn + t1[i] * cs) * (size / 2));
  const at = (i: number, j: number): V => [c[0] + e0[0] * i + e1[0] * j, c[1] + e0[1] * i + e1[1] * j, c[2] + e0[2] * i + e1[2] * j];
  const uv = (i: number, j: number): [number, number] => [r[0] + (r[2] * (i + 1)) / 2, r[1] + (r[3] * (j + 1)) / 2];
  // (two triangles, counter-clockwise seen from its normal's side)
  out.push({ p: [at(-1, -1), at(1, -1), at(1, 1)], uv: [uv(-1, -1), uv(1, -1), uv(1, 1)], berries });
  out.push({ p: [at(-1, -1), at(1, 1), at(-1, 1)], uv: [uv(-1, -1), uv(1, 1), uv(-1, 1)], berries });
}

/** The bush's triangles, its berries with it or not (a dead bush keeps its leaves and loses its berries), the
 *  variant `v` turning its cards. */
export function bushTriangles(berries = true, v = 0): BushTriangle[] {
  const out: BushTriangle[] = [];
  // the dome, its mound laid over it from above
  const ring = (i: number, j: number): V => {
    const a = (j / SIDES) * 2 * Math.PI + v * 0.7;
    const r = DOME[i][0] * (i === DOME.length - 1 ? (j % 2 ? 0.94 : 1.04) : 1);
    return [Math.cos(a) * r, DOME[i][1], Math.sin(a) * r];
  };
  const uvOf = (p: V): [number, number] => [BUSH_MOUND[0] + BUSH_MOUND[2] * (0.5 + p[0] / MOUND_SPAN), BUSH_MOUND[1] + BUSH_MOUND[3] * (0.5 - p[2] / MOUND_SPAN)];
  for (let i = 0; i + 1 < DOME.length; i++)
    for (let j = 0; j < SIDES; j++) {
      const q = [ring(i, j), ring(i, j + 1), ring(i + 1, j + 1), ring(i + 1, j)];
      // (its top a fan, then quads; each triangle turned to face out and up)
      const tris: [V, V, V][] = i === 0 ? [[q[0], q[2], q[3]]] : [[q[0], q[1], q[2]], [q[0], q[2], q[3]]];
      for (const t of tris) {
        const e1 = t[1].map((x, k) => x - t[0][k]);
        const e2 = t[2].map((x, k) => x - t[0][k]);
        const up = e1[2] * e2[0] - e1[0] * e2[2];
        const tri: [V, V, V] = up >= 0 ? t : [t[0], t[2], t[1]];
        out.push({ p: tri, uv: tri.map(uvOf), berries: false });
      }
    }
  const domeTriangles = out.length;
  const dome = out.slice(0, domeTriangles);
  // a card laid on the dome at angle `a`, `d` out, `off` off it along its normal, in the surface's plane
  const laid = (a: number, d: number, off: number, s: number, spin: number, r: Region, berry: boolean) => {
    const [x, z] = [Math.cos(a + v * 0.7) * d, Math.sin(a + v * 0.7) * d];
    const on = domeAt(dome, x, z)!;
    facingCard(out, [x + off * on.n[0], on.y + off * on.n[1], z + off * on.n[2]], on.n, s, spin, r, berry);
  };
  SHOULDERS.forEach(([a, d, s, k], i) => laid(a, d, SHOULDER_OFF, s, i * 1.3 + v, BUSH_ROSETTES[k], false));
  ROSETTES.forEach(([a, d, y, s, tilt, k], i) => card(out, a + v * 0.7, d, y, s, tilt, (i + 4) * 1.3 + v, BUSH_ROSETTES[k], false));
  if (berries) BERRIES.forEach(([a, d, s, k], i) => laid(a, d, BERRY_OFF, s, i * 0.9 + v, BUSH_BERRIES[k], true));
  return out;
}
