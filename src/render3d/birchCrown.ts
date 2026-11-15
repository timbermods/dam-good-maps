// The birch's crown as the game builds it (D496, D178 as amended 2026-11-10), shared by Standard's model
// (entities3d.ts) and High's close one (high/models.ts). The game's `BirchMature` (129 triangles, VegetationURP, cut at
// alpha 0.5, its back faces culled; numbers read with tools/game-model-albedo.py, no mesh) is a forked trunk under six
// tiers of leaves, each a low six-sided cone, a "parasol", its texture's cluster of leaf rosettes laid over it from its
// tip: a rosette's tier at the bottom (1.0 to 1.45) and at the top (1.83 to 1.92), two of its large cluster (rims at 1.13
// and 1.31, about 1.0 m across, tips at 1.62 and 1.75) and two of its middle one (rims at 1.48 and 1.67, tips at 1.79 and
// 1.91). Each tier's tip stands 0.3 to 0.5 m over its rim, inside the tier above, so from the side the crown is a heap of
// leafy skirts and from above a rosette of rosettes. Its vertex colours tint the grey leaves: each tier darker at its tip
// than its rim, the higher tiers lighter (from 0.15/0.20/0.08 at the lowest tip to 0.36/0.48/0.23 at the top rim), and its
// normals point up its tiers' slopes (up and out at 45° low in the crown, at 18° on the top tier). Each triangle carries
// its place in the birch's pattern (objectPatterns.ts `BIRCH_*`) and its corners' colours.

import { BIRCH_CLUSTER, BIRCH_LEAF_MEAN, BIRCH_ROSETTES, type Region } from "./objectPatterns";

type V = [number, number, number];
/** A triangle of the crown: its corners (counter-clockwise seen from outside), their normals, their places in the
 *  pattern and their colours (the game's vertex colours times its leaves' mean, an albedo). */
export type CrownTriangle = { p: [V, V, V]; n: [V, V, V]; uv: [number, number][]; c: [V, V, V] };

/** A tier: its tip's height; its middle ring's radius and height (none on a rosette's tier); its rim's radius and
 *  height; its tip's, middle's and rim's vertex colours (the game's); its picture (a rosette or the cluster); its
 *  normals' lean out (radians from straight up, its rings'). */
type Tier = { tip: number; mid: [number, number] | null; rim: [number, number]; col: [V, V, V]; rosette: boolean; lean: number };
const LARGE: [V, V, V] = [[0.19, 0.26, 0.1], [0.255, 0.345, 0.14], [0.3, 0.39, 0.18]];
const MIDDLE: [V, V, V] = [[0.21, 0.29, 0.11], [0.29, 0.39, 0.16], [0.33, 0.43, 0.2]];
export const BIRCH_TIERS: readonly Tier[] = [
  { tip: 1.45, mid: null, rim: [0.36, 1.0], col: [[0.15, 0.2, 0.08], [0.15, 0.2, 0.08], [0.22, 0.31, 0.15]], rosette: true, lean: 0.8 },
  { tip: 1.62, mid: [0.36, 1.3], rim: [0.49, 1.13], col: LARGE, rosette: false, lean: 0.8 },
  { tip: 1.75, mid: [0.36, 1.49], rim: [0.49, 1.31], col: LARGE, rosette: false, lean: 0.8 },
  { tip: 1.79, mid: [0.34, 1.63], rim: [0.5, 1.48], col: MIDDLE, rosette: false, lean: 0.64 },
  { tip: 1.91, mid: [0.28, 1.77], rim: [0.4, 1.67], col: MIDDLE, rosette: false, lean: 0.57 },
  { tip: 1.92, mid: null, rim: [0.29, 1.83], col: [[0.33, 0.44, 0.18], [0.33, 0.44, 0.18], [0.36, 0.48, 0.23]], rosette: true, lean: 0.31 },
];
/** A tier's sides round. */
const SIDES = 6;
/** How far each tier's tip stands off the trunk's line (the game's 0.08 to 0.09), toward a side of its own. */
const TIP_OFF = 0.08;
/** Where the middle ring falls in the picture (of the way from its middle to its rim), as the game's 0.54 to 0.58. */
const MID_UV = 0.56;
/** Each rim corner's distance out, as the game's vary (0.9 to 1.1 of the tier's). */
const RIM_JITTER = [1.04, 0.93, 1.08, 0.95, 1.02, 0.91];

/** The crown's triangles, the variant `v` turning its tiers and their pictures. */
export function birchCrownTriangles(v = 0): CrownTriangle[] {
  const out: CrownTriangle[] = [];
  BIRCH_TIERS.forEach((t, i) => {
    const turn = i * 2.4 + v * 1.1;
    const spin = i * 1.7 + v * 0.9;
    const picture: Region = t.rosette ? BIRCH_ROSETTES[(i + v) % BIRCH_ROSETTES.length] : BIRCH_CLUSTER;
    const [cu, cv, hu, hv] = [picture[0] + picture[2] / 2, picture[1] + picture[3] / 2, picture[2] / 2, picture[3] / 2];
    const ta = turn + 2.1;
    const tip: V = [Math.cos(ta) * TIP_OFF, t.tip, Math.sin(ta) * TIP_OFF];
    const ring = (j: number, [r, y]: [number, number], jitter: boolean): V => {
      const a = turn + (j / SIDES) * 2 * Math.PI;
      const k = jitter ? RIM_JITTER[(j + i) % SIDES] : 1;
      return [Math.cos(a) * r * k, y, Math.sin(a) * r * k];
    };
    const uvAt = (j: number, f: number): [number, number] => {
      const a = turn + (j / SIDES) * 2 * Math.PI + spin;
      return [cu + Math.cos(a) * hu * f, cv + Math.sin(a) * hv * f];
    };
    // (normals up the slope: straight up at the tip, leaning out by the tier's lean at its rings)
    const nAt = (j: number): V => {
      const a = turn + (j / SIDES) * 2 * Math.PI;
      return [Math.cos(a) * Math.sin(t.lean), Math.cos(t.lean), Math.sin(a) * Math.sin(t.lean)];
    };
    const up: V = [0, 1, 0];
    const [cTip, cMid, cRim] = t.col;
    const tri = (p: [V, V, V], n: [V, V, V], uv: [number, number][], c: [V, V, V]) => out.push({ p, n, uv, c });
    for (let j = 0; j < SIDES; j++) {
      const k = j + 1;
      const r0 = ring(j, t.rim, true);
      const r1 = ring(k, t.rim, true);
      if (!t.mid) {
        tri([tip, r1, r0], [up, nAt(k), nAt(j)], [[cu, cv], uvAt(k, 1), uvAt(j, 1)], [cTip, cRim, cRim]);
        continue;
      }
      const m0 = ring(j, t.mid, false);
      const m1 = ring(k, t.mid, false);
      tri([tip, m1, m0], [up, nAt(k), nAt(j)], [[cu, cv], uvAt(k, MID_UV), uvAt(j, MID_UV)], [cTip, cMid, cMid]);
      tri([m0, m1, r1], [nAt(j), nAt(k), nAt(k)], [uvAt(j, MID_UV), uvAt(k, MID_UV), uvAt(k, 1)], [cMid, cMid, cRim]);
      tri([m0, r1, r0], [nAt(j), nAt(k), nAt(j)], [uvAt(j, MID_UV), uvAt(k, 1), uvAt(j, 1)], [cMid, cRim, cRim]);
    }
  });
  // (the game's vertex colours over its leaves' grey, whose mean our pattern takes out: an albedo)
  for (const t of out) t.c = t.c.map((c) => c.map((x) => x * BIRCH_LEAF_MEAN) as V) as [V, V, V];
  return out;
}
