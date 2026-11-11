// The geothermal field (D178, D496): our own model of the game's (`GeothermalField.Model`, 3 × 3, 523 triangles with its
// footing of ground, the one model for every field; the map stores its Coordinates and orientation, never flipped, and
// nothing else). Read from the game's model for its measures and colours alone (numbers; no mesh or texture of the
// game's is used), in its local frame (x east, y up, z the map's y; its footprint 0…3):
// - a round crust of sulphur over its middle, about 1.1 from it to its edge, rising from the ground to a rim 0.2 high
//   about 0.8 out and falling inward to a vent 0.4 deep under the middle; the rim's sulphur yellow, the bowl inside it
//   and its outer slope dark grey-brown, the vent black;
// - thirteen rocks round its edge, 0.12 to 0.24 high, in the water source's grey-brown rock.
// Ours: the crust a grid of 16 headings by 7 rings out to its reach, each corner at the game's height there and in the
// game's colour there (the nearest of six shades), its edge sunk into the ground; each rock the hull of its farthest
// points six ways round, three ways up and its top: 416 triangles. It has no state: the game's field has none but its
// steam, which runs while it is not flooded.
// Its footing (the game's ground heaped round the crust to its footprint's edge, in the terrain's own material) is left
// to the terrain, as the other objects' are. The terrain leaves out its middle tile's top, as the game's cutout does,
// for the crust and vent sink below the ground there (entities3d.ts `mineCutout`).
// The game's colours (palette.ts `GEOTHERMAL`): its albedo, not metallic, straight in the game's light (materials.ts
// `gameObjectLight`). Its steam is geothermalSteam.ts.

import { GEOTHERMAL, type Rgb } from "./palette";
import type { V } from "./relicParts";

/** The crust's reach from the field's middle along each of its 16 headings (from east, toward the map's y). */
const EDGE = [1.09, 1.05, 1.19, 1.14, 1.14, 1.07, 1.23, 1.09, 1.1, 1.21, 1.18, 1.12, 1.11, 1.14, 1.13, 1.09];
/** Its rings, as shares of the reach. */
const RINGS = [0.18, 0.32, 0.46, 0.6, 0.74, 0.87, 1];
/** Its height at each ring along each heading, and the shade there (`GEOTHERMAL.crust`). */
const HEIGHT: number[][] = [[-0.056, 0.002, 0.047, 0.092, 0.142, 0.133, 0.065], [-0.116, 0.008, 0.082, 0.108, 0.18, 0.164, 0.061], [-0.061, 0.052, 0.12, 0.178, 0.21, 0.134, 0.028], [-0.051, 0.014, 0.046, 0.109, 0.137, 0.138, 0.052], [-0.074, 0.023, 0.084, 0.133, 0.176, 0.13, 0.054], [-0.121, 0.017, 0.089, 0.118, 0.177, 0.174, 0.155], [-0.064, 0.026, 0.079, 0.175, 0.178, 0.141, 0.025], [-0.059, 0.008, 0.041, 0.111, 0.138, 0.114, 0.063], [-0.08, 0.04, 0.115, 0.157, 0.204, 0.132, 0.04], [-0.055, 0.05, 0.102, 0.183, 0.177, 0.138, 0.101], [-0.045, 0.024, 0.068, 0.164, 0.176, 0.095, 0.031], [-0.081, 0.055, 0.134, 0.189, 0.217, 0.151, 0.078], [-0.069, 0.031, 0.093, 0.168, 0.151, 0.101, 0.031], [-0.047, 0.011, 0.058, 0.165, 0.166, 0.1, 0.033], [-0.079, 0.03, 0.107, 0.153, 0.174, 0.133, 0.029], [-0.072, 0.034, 0.095, 0.141, 0.205, 0.144, 0.046]];
const SHADE: number[][] = [[0, 0, 0, 2, 2, 5, 4], [0, 0, 0, 5, 2, 1, 4], [0, 0, 1, 3, 2, 1, 4], [0, 0, 1, 5, 5, 5, 4], [0, 0, 0, 2, 2, 1, 0], [0, 0, 0, 1, 2, 1, 0], [4, 0, 1, 3, 2, 5, 4], [0, 0, 1, 3, 2, 1, 4], [0, 0, 0, 2, 2, 1, 4], [0, 0, 1, 3, 5, 1, 4], [0, 0, 5, 2, 5, 0, 4], [0, 0, 0, 2, 5, 1, 4], [0, 0, 0, 2, 2, 5, 4], [0, 0, 1, 3, 5, 1, 4], [0, 0, 1, 2, 2, 5, 4], [0, 0, 0, 2, 5, 1, 4]];
/** The vent's foot, under the field's middle. */
const VENT = -0.39;
/** The rocks round it: each one's corners, its faces (three corners each) and its shade (`GEOTHERMAL.rock`). */
const ROCKS: [V[], number[][], number][] = [
  [[[0.381, 0.006, 2.139], [0.444, 0.041, 1.967], [0.473, 0.154, 2.137], [0.491, -0.029, 2.385], [0.587, 0.092, 1.925], [0.629, 0.185, 2.124], [0.665, 0.181, 2.331], [0.76, 0.036, 2.412]], [[4, 5, 7], [6, 5, 7], [1, 4, 7], [3, 6, 7], [3, 1, 0], [3, 1, 7], [2, 6, 5], [2, 1, 0], [2, 3, 0], [2, 3, 6], [2, 4, 5], [2, 1, 4]], 1],
  [[[1.412, 0.036, 0.494], [1.535, 0.173, 0.444], [1.554, -0.04, 0.268], [1.793, 0.132, 0.362], [1.826, -0.02, 0.282], [1.926, 0.066, 0.561], [1.952, 0.011, 0.416]], [[2, 6, 0], [2, 1, 0], [5, 6, 0], [5, 1, 0], [3, 2, 1], [3, 5, 6], [3, 5, 1], [4, 2, 6], [4, 3, 6], [4, 3, 2]], 0],
  [[[2.054, 0.06, 0.614], [2.098, 0.052, 0.769], [2.133, -0.023, 0.486], [2.22, 0.16, 0.692], [2.28, 0.105, 0.514], [2.327, 0.016, 0.864], [2.337, 0.135, 0.723], [2.351, -0.11, 0.514], [2.421, -0.11, 0.621]], [[4, 3, 0], [1, 5, 8], [1, 3, 0], [1, 5, 3], [2, 4, 0], [2, 1, 0], [6, 5, 3], [6, 4, 3], [6, 5, 8], [6, 4, 8], [7, 4, 8], [7, 2, 4], [7, 1, 8], [7, 2, 1]], 1],
  [[[0.859, 0.02, 0.607], [0.928, 0.059, 0.664], [0.957, 0.188, 0.533], [1, -0.056, 0.32], [1.099, 0.196, 0.481], [1.1, -0.045, 0.292], [1.114, 0.136, 0.369], [1.234, 0.077, 0.544], [1.246, 0.029, 0.402]], [[7, 4, 8], [2, 3, 0], [5, 7, 8], [5, 3, 0], [5, 7, 0], [6, 2, 4], [6, 2, 3], [6, 5, 3], [6, 4, 8], [6, 5, 8], [1, 7, 4], [1, 2, 4], [1, 7, 0], [1, 2, 0]], 1],
  [[[2.352, 0.072, 1.09], [2.354, 0.081, 1.019], [2.414, 0.064, 0.944], [2.468, 0.02, 1.322], [2.478, 0.202, 1.086], [2.522, 0.12, 0.996], [2.546, 0.023, 0.947], [2.612, -0.023, 1.325], [2.642, 0.117, 1.228], [2.728, -0.049, 1.168]], [[6, 9, 0], [3, 9, 0], [3, 7, 9], [3, 4, 0], [8, 7, 9], [8, 3, 4], [8, 3, 7], [2, 6, 0], [5, 8, 4], [5, 2, 4], [5, 2, 6], [5, 6, 9], [5, 8, 9], [1, 4, 0], [1, 2, 0], [1, 2, 4]], 1],
  [[[1.338, 0.071, 2.58], [1.404, 0.009, 2.754], [1.422, 0.098, 2.457], [1.521, 0.22, 2.566], [1.562, 0.136, 2.74], [1.669, 0.199, 2.591], [1.683, 0.064, 2.469], [1.695, -0.008, 2.705], [1.773, 0.018, 2.593]], [[1, 3, 0], [2, 3, 0], [2, 1, 0], [4, 1, 3], [6, 2, 3], [6, 2, 1], [5, 4, 3], [5, 6, 8], [5, 6, 3], [7, 4, 1], [7, 6, 8], [7, 6, 1], [7, 5, 8], [7, 5, 4]], 2],
  [[[0.282, -0.013, 1.072], [0.337, 0.004, 0.985], [0.369, 0.051, 1.383], [0.388, 0.225, 1.27], [0.457, 0.241, 1.136], [0.458, 0.092, 1.381], [0.516, 0.083, 0.972], [0.603, 0.128, 1.087]], [[2, 7, 0], [6, 4, 7], [3, 4, 0], [3, 2, 0], [1, 7, 0], [1, 6, 7], [1, 4, 0], [1, 6, 4], [5, 2, 7], [5, 3, 2], [5, 4, 7], [5, 3, 4]], 1],
  [[[2.406, 0.061, 1.678], [2.458, 0.021, 1.563], [2.508, 0.066, 1.854], [2.56, 0.154, 1.747], [2.619, 0.099, 1.8], [2.622, 0.025, 1.841], [2.634, 0.111, 1.595], [2.666, -0.036, 1.571], [2.718, -0.033, 1.667]], [[2, 3, 0], [6, 3, 0], [5, 2, 0], [1, 6, 0], [1, 5, 0], [4, 2, 3], [4, 5, 2], [4, 5, 8], [4, 6, 8], [4, 6, 3], [7, 6, 8], [7, 1, 6], [7, 5, 8], [7, 1, 5]], 0],
  [[[0.811, -0.009, 2.538], [0.837, -0.043, 2.609], [0.845, 0.119, 2.57], [0.893, 0.041, 2.429], [0.954, 0.174, 2.537], [1.003, 0.16, 2.627], [1.011, 0.072, 2.41], [1.057, -0.011, 2.691], [1.151, 0.07, 2.552]], [[6, 4, 8], [6, 7, 8], [1, 6, 7], [1, 2, 0], [5, 2, 4], [5, 4, 8], [5, 7, 8], [5, 1, 7], [5, 1, 2], [3, 1, 0], [3, 1, 6], [3, 2, 0], [3, 6, 4], [3, 2, 4]], 0],
  [[[0.276, 0.008, 1.718], [0.32, 0.005, 1.81], [0.351, 0.143, 1.769], [0.355, 0.035, 1.546], [0.422, 0.171, 1.652], [0.432, 0.125, 1.82], [0.506, 0.019, 1.847], [0.577, 0.061, 1.617], [0.595, 0.046, 1.747]], [[5, 4, 8], [7, 4, 8], [7, 3, 8], [7, 3, 4], [6, 5, 8], [6, 3, 0], [6, 3, 8], [2, 5, 4], [2, 3, 0], [2, 3, 4], [1, 6, 0], [1, 6, 5], [1, 2, 0], [1, 2, 5]], 1],
  [[[2.363, 0.008, 2.303], [2.365, 0.063, 2.107], [2.398, -0.015, 2.326], [2.471, 0.056, 2.029], [2.509, 0.139, 2.144], [2.584, -0.056, 2.31], [2.596, 0.08, 2.264], [2.598, 0.01, 2.055], [2.65, -0.018, 2.124]], [[6, 4, 0], [6, 4, 8], [7, 4, 8], [7, 3, 4], [1, 4, 0], [1, 3, 4], [1, 7, 3], [5, 6, 8], [5, 7, 8], [2, 5, 7], [2, 1, 0], [2, 1, 7], [2, 6, 0], [2, 5, 6]], 1],
  [[[0.5, -0.043, 0.724], [0.553, 0.101, 0.709], [0.568, 0.025, 0.841], [0.632, -0.054, 0.585], [0.635, 0.12, 0.701], [0.665, 0.098, 0.637], [0.692, -0.021, 0.589], [0.719, 0.04, 0.781], [0.744, 0.021, 0.686]], [[7, 2, 0], [7, 3, 0], [7, 3, 8], [7, 2, 4], [1, 3, 0], [1, 2, 0], [1, 2, 4], [5, 7, 8], [5, 7, 4], [5, 1, 4], [5, 1, 3], [6, 3, 8], [6, 5, 8], [6, 5, 3]], 0],
  [[[1.968, 0.074, 2.471], [2, 0.084, 2.377], [2.013, 0.044, 2.576], [2.041, 0.158, 2.517], [2.073, 0.014, 2.587], [2.075, 0.174, 2.454], [2.102, 0.14, 2.553], [2.154, 0.067, 2.331], [2.215, 0.014, 2.459]], [[7, 5, 8], [1, 7, 8], [1, 4, 0], [1, 4, 8], [1, 7, 5], [2, 4, 0], [6, 5, 8], [6, 4, 8], [6, 2, 4], [3, 6, 5], [3, 1, 0], [3, 1, 5], [3, 2, 0], [3, 6, 2]], 2],
];
/** How far past its reach the crust's edge reaches into the ground, and how deep. */
const SKIRT = 0.04;

/** The field's triangles (our frame: centred on its footprint's middle, x east, y up, z south), each turned so its front
 *  faces out, with each corner's colour: the crust's by its grid, falling to the ground past its last ring, the vent's
 *  foot black, each rock its shade. */
export function geothermalParts(): { points: number[]; colours: number[] } {
  const points: number[] = [];
  const colours: number[] = [];
  const ours = (p: V): V => [p[0] - 1.5, p[1], 1.5 - p[2]];
  // (a triangle of the game's frame, its front turned away from `from`)
  const tri = (a: V, b: V, c: V, ca: Rgb, cb: Rgb, cc: Rgb, from: V) => {
    const [p, q, r] = [ours(a), ours(b), ours(c)];
    const u = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
    const v = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const f = ours(from);
    const m = [(p[0] + q[0] + r[0]) / 3 - f[0], (p[1] + q[1] + r[1]) / 3 - f[1], (p[2] + q[2] + r[2]) / 3 - f[2]];
    const flip = n[0] * m[0] + n[1] * m[1] + n[2] * m[2] < 0;
    for (const [s, c] of (flip ? [[p, ca], [r, cc], [q, cb]] : [[p, ca], [q, cb], [r, cc]]) as [V, Rgb][]) {
      points.push(...s);
      colours.push(...c);
    }
  };
  // the crust: a ring of points along each heading, the vent's foot at its middle, its edge sunk into the ground
  const n = EDGE.length;
  const at = (k: number, i: number): [V, Rgb] => {
    const t = ((k % n) * 2 * Math.PI) / n;
    const last = i === RINGS.length;
    const r = last ? EDGE[k % n] + SKIRT : RINGS[i] * EDGE[k % n];
    return [[1.5 + r * Math.cos(t), last ? -SKIRT : HEIGHT[k % n][i], 1.5 + r * Math.sin(t)], GEOTHERMAL.crust[SHADE[k % n][Math.min(i, RINGS.length - 1)]]];
  };
  const below: V = [1.5, -10, 1.5];
  const foot: V = [1.5, VENT, 1.5];
  for (let k = 0; k < n; k++) {
    const [a, ca] = at(k, 0);
    const [b, cb] = at(k + 1, 0);
    tri(foot, a, b, GEOTHERMAL.vent, ca, cb, below);
    for (let i = 0; i < RINGS.length; i++) {
      const [p, cp] = at(k, i);
      const [q, cq] = at(k + 1, i);
      const [r, cr] = at(k + 1, i + 1);
      const [s, cs] = at(k, i + 1);
      tri(p, q, r, cp, cq, cr, below);
      tri(p, r, s, cp, cr, cs, below);
    }
  }
  // the rocks
  for (const [corners, faces, shade] of ROCKS) {
    const mid = corners.reduce<V>((s, p) => [s[0] + p[0] / corners.length, s[1] + p[1] / corners.length, s[2] + p[2] / corners.length], [0, 0, 0]);
    const c = GEOTHERMAL.rock[shade];
    for (const [a, b, d] of faces) tri(corners[a], corners[b], corners[d], c, c, c, mid);
  }
  return { points, colours };
}
