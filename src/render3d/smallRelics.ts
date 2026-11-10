// The small and medium relics as the game draws them (D178, D496): our own models at the measures of the game's
// SmallRelic.Model and MediumRelic.Model (Timbermesh in the game's `resources.assets`, read locally for their numbers
// only: no mesh or texture of the game's is used), in their local frame (x east, y up, z the map's y; the footprint
// from 0). Each stands on a footing of ground (`SlopeCliffEdge`, the terrain's own shader), which is the ground's look
// and is left to the terrain.
// - The small relic (2 × 1, 480 triangles, 0.29 high): a fallen telescope lying along its footprint, its wide tube
//   (0.87 to 1.69, 0.23 to 0.26 across) and its narrow one (0.2 to 0.84, 0.14 to 0.2) pale, bent 11° at the joint, four
//   dark steel collars round them (0.33 across at the wide end over its lens, 0.18 at the eyepiece), its tripod's three
//   legs fallen on the ground beside it (one bent) by its head, and three stones.
// - The medium relic (3 × 2, 1,072 triangles, 0.6 high): a crashed satellite, its body a pale box 0.6 × 0.66 × 0.67
//   half in the ground, its top corner 0.57 up, dark straps across it; on its top face a grey plate with a bar and five
//   dark knobs, on its west face a round port, on its south a grey half-dish 0.9 across (a cap of a sphere of radius
//   0.46, its bottom gone into the ground) with a copper feed fallen into it, and a wire arm bent out east; three solar
//   panels of dark cells in pale frames flat on the ground, 2 × 3 cells to the east and 3 × 1 and 3 × 2 to the west;
//   thirteen stones.
// The game's colours (palette.ts `SMALL_RELIC`, `MEDIUM_RELIC`) in the game's light (materials.ts `gameObjectLight`);
// their shadows are their models' in High (shadows.ts) and, in Standard's baked shadow, none (light.ts
// `objectCasters`): 0.29 and 0.6 high, what they cast past themselves is under the bake's half-tile samples.

import { MEDIUM_RELIC, SMALL_RELIC, type Rgb } from "./palette";
import { add, cross, Parts, sub, unit, type V } from "./relicParts";

/** The small relic's tubes and collars: their ends' middles and their radii there. */
const TUBES: readonly [V, V, number, number][] = [
  [[0.875, 0.135, 0.548], [1.69, 0.146, 0.59], 0.112, 0.13],
  [[0.2, 0.11, 0.425], [0.83, 0.12, 0.543], 0.07, 0.1],
];
/** The collars: middle, axis, half their length and their radius. */
const COLLARS: readonly [V, V, number, number][] = [
  [[1.728, 0.129, 0.593], [0.997, 0.024, 0.068], 0.078, 0.167],
  [[0.857, 0.119, 0.546], [0.993, 0.02, 0.115], 0.067, 0.141],
  [[0.472, 0.113, 0.483], [0.979, 0.019, 0.204], 0.059, 0.119],
  [[0.21, 0.11, 0.426], [0.998, 0.013, 0.069], 0.0375, 0.09],
];
/** The tripod's legs on the ground (the bent one last) and its head. */
const LEGS: readonly V[][] = [
  [[0.6, 0.115, 0.16], [0.955, -0.04, 0.64]],
  [[0.856, -0.007, 0.566], [1.29, 0.07, 0.243]],
  [[0.63, 0.03, 0.785], [0.87, 0.06, 0.745], [1.065, 0.03, 0.55]],
];
const HEAD = [0.958, 0.046, 0.348, 0.179, 0.089, 0.117];
/** The stones: middle (x, y, z) and size across (x, y, z). */
const SMALL_STONES = [
  [0.52, 0.005, 0.713, 0.195, 0.097, 0.174],
  [0.487, 0.037, 0.28, 0.232, 0.112, 0.192],
  [1.423, 0.026, 0.343, 0.167, 0.065, 0.136],
];

/** The small relic's triangles, by colour (our frame: centred on its footprint, x east, y up, z south). */
export function smallRelicParts(): { points: number[]; colour: Rgb }[] {
  const m = new Parts([1, 0.5]);
  const R = SMALL_RELIC;
  for (const [a, b, r0, r1] of TUBES) m.bar(a, b, [[0, 0], [0, r0], [1, r1], [1, 0]], 10, R.tube);
  COLLARS.forEach(([c, axis, h, r], k) => {
    const d = unit(axis);
    const [u, v] = acrossOf(d);
    if (k === 0) {
      // (at the wide end the lens, set in the collar's face)
      m.revolve(c, d, u, v, [[-h, 0], [-h, r], [h, r], [h, 0.125]], 8, R.collar);
      m.revolve(c, d, u, v, [[h, 0.125], [h - 0.03, 0]], 8, R.lens);
    } else if (k === COLLARS.length - 1) {
      // (at the narrow end the eyepiece)
      m.revolve(c, d, u, v, [[h, 0], [h, r], [-h, r], [-h, 0.055]], 8, R.collar);
      m.revolve(c, d, u, v, [[-h, 0.055], [-h - 0.012, 0.05], [-h - 0.012, 0]], 8, R.eye);
    } else m.revolve(c, d, u, v, [[-h, 0], [-h, r], [h, r], [h, 0]], 8, R.collar);
  });
  LEGS.forEach((line, k) => m.beam(line, 0.085, k === LEGS.length - 1 ? R.bent : R.leg));
  m.stone(HEAD, R.head);
  SMALL_STONES.forEach((s, k) => m.stone(s, R.stone[k % R.stone.length]));
  return m.parts();
}

/** The medium relic's body: its top corner and its three edges from it (a box, its far corner in the ground). */
const BODY_TOP: V = [1.375, 0.572, 1.17];
const BODY_EDGES: readonly V[] = [[-0.227, -0.472, 0.289], [-0.212, -0.252, -0.577], [0.577, -0.322, -0.072]];
/** The straps across it: their middle lines and their width across (one way for each). */
const STRAPS: readonly [V[], V][] = [
  [[[0.989, -0.027, 0.8], [1.205, 0.229, 1.388], [1.792, -0.098, 1.315]], [0.032, 0.067, -0.041]],
  [[[1.098, 0.2, 0.663], [1.314, 0.456, 1.249], [1.9, 0.129, 1.176]], [0.032, 0.067, -0.041]],
  [[[0.984, -0.09, 1.031], [1.215, 0.39, 0.737], [1.799, 0.064, 0.664]], [0.027, 0.033, 0.074]],
  [[[1.089, 0.034, 1.317], [1.32, 0.514, 1.022], [1.904, 0.189, 0.949]], [0.027, 0.032, 0.075]],
];
/** The knobs on its top plate: middle and radius. */
const KNOBS: readonly [V, number][] = [
  [[1.536, 0.543, 0.925], 0.069],
  [[1.791, 0.387, 0.897], 0.057],
  [[1.61, 0.41, 0.71], 0.05],
  [[1.41, 0.39, 0.67], 0.05],
  [[1.69, 0.23, 0.63], 0.05],
];
/** The solar panels: middle, their two directions along them with half their length and cells that way, and their
 *  up. */
const PANELS: readonly [V, V, number, number, V, number, number, V][] = [
  [[2.314, 0.042, 0.823], [-0.97, 0.091, 0.225], 0.41, 2, [0.227, 0.011, 0.974], 0.545, 3, [0.086, 0.996, -0.031]],
  [[0.668, 0.077, 1.268], [-0.982, -0.18, 0.052], 0.425, 3, [0.032, 0.113, 0.993], 0.375, 2, [-0.185, 0.977, -0.105]],
  [[0.665, 0.075, 0.721], [-0.985, -0.12, 0.12], 0.39, 3, [0.138, -0.154, 0.978], 0.18, 1, [-0.099, 0.981, 0.168]],
];
/** The half-dish: its sphere's centre and radius, its axis toward the dish's back, and its two directions across
 *  (its up and side, φ measured from up toward side); its rim (φ, θ from the axis, degrees), torn: 33° round its top,
 *  out to 74° low on its sides, from φ −132 to 121 (the rest in the ground). */
const DISH_C: V = [1.68, 0.306, 1.666];
const DISH_R = 0.46;
const DISH_AX: V = unit([-0.433, 0.09, -0.897]);
const DISH_UP: V = [0.039, 0.996, 0.081];
const DISH_SIDE: V = [0.901, 0, -0.435];
const DISH_RIM: readonly [number, number][] = [[-132, 66], [-94, 48], [-54, 38], [-27, 34], [1, 33], [27, 36], [45, 41], [64, 48], [84, 56], [102, 64], [121, 74]];
const MEDIUM_STONES = [
  [0.699, 0.093, 1.345, 0.278, 0.134, 0.265],
  [2.153, 0.051, 0.877, 0.255, 0.127, 0.263],
  [1.063, 0.098, 1.374, 0.213, 0.16, 0.242],
  [1.575, 0.037, 0.437, 0.272, 0.135, 0.216],
  [0.702, 0.081, 0.874, 0.201, 0.1, 0.222],
  [0.438, 0.009, 1.289, 0.174, 0.093, 0.201],
  [1.938, 0.095, 1.159, 0.213, 0.109, 0.273],
  [2.128, 0.052, 0.47, 0.155, 0.086, 0.184],
  [0.367, 0.043, 1.057, 0.206, 0.083, 0.258],
  [2.708, 0.021, 0.736, 0.127, 0.085, 0.143],
  [1.438, 0.106, 1.483, 0.179, 0.099, 0.206],
  [1.835, 0.124, 1.376, 0.187, 0.075, 0.164],
  [1.071, 0.057, 0.574, 0.144, 0.092, 0.145],
];

/** Two directions across a unit axis. */
function acrossOf(d: V): [V, V] {
  const u = unit(cross(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
  return [u, cross(d, u)];
}
const scale = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];

/** The medium relic's triangles, by colour (our frame: centred on its footprint, x east, y up, z south). */
export function mediumRelicParts(): { points: number[]; colour: Rgb }[] {
  const m = new Parts([1.5, 1]);
  const R = MEDIUM_RELIC;
  // the body: the three faces round its top corner (the rest is in the ground)
  const [e1, e2, e3] = BODY_EDGES;
  const T = BODY_TOP;
  const middle = add(T, add(add(e1, e2), e3), 0.5);
  m.face([T, add(T, e1), add(add(T, e1), e2), add(T, e2)], R.body, middle);
  m.face([T, add(T, e1), add(add(T, e1), e3), add(T, e3)], R.body, middle);
  m.face([T, add(T, e2), add(add(T, e2), e3), add(T, e3)], R.body, middle);
  // the straps across it
  for (const [line, w] of STRAPS)
    for (let k = 0; k + 1 < line.length; k++) {
      const [a, b] = [line[k], line[k + 1]];
      m.face([add(a, w, -0.5), add(b, w, -0.5), add(b, w, 0.5), add(a, w, 0.5)], R.strap, middle);
    }
  // on its top face (its edges e2 and e3 from the top corner): a raised square plate, a bar on it and the knobs
  const n = unit(scale(e1, -1));
  const s2 = unit(e2);
  const s3 = unit(e3);
  const top = add(T, add(e2, e3), 0.5);
  const corner = (i: number, j: number, up: number) => add(add(add(top, s2, i * 0.23), s3, j * 0.23), n, up);
  const sq: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  m.face(sq.map(([i, j]) => corner(i, j, 0.07)), R.plate, add(top, n, -1));
  for (let k = 0; k < 4; k++) {
    const [[i0, j0], [i1, j1]] = [sq[k], sq[(k + 1) % 4]];
    m.face([corner(i0, j0, 0), corner(i1, j1, 0), corner(i1, j1, 0.07), corner(i0, j0, 0.07)], R.plate, add(top, n, 0.035));
  }
  const bar = unit([0.275, 0.288, 0.917]);
  m.beam([add([1.609, 0.379, 0.848], bar, -0.195), add([1.609, 0.379, 0.848], bar, 0.195)], 0.13, R.bar);
  const [nu, nv] = acrossOf(n);
  for (const [c, r] of KNOBS) m.revolve(c, n, nu, nv, [[-0.03, 0], [-0.03, r], [0.03, r * 0.85], [0.06, 0]], 5, R.knob);
  // on its west face a round port
  const w = unit(scale(e3, -1));
  const [wu, wv] = acrossOf(w);
  m.revolve([1.152, 0.212, 1.026], w, wu, wv, [[-0.007, 0.1], [0.068, 0.04], [0.068, 0]], 6, R.port);
  // on its south the half-dish, both sides, its feed fallen into it and the feed's flange
  const onDish = (theta: number, phi: number, r: number) => {
    const t = (theta * Math.PI) / 180;
    const p = (phi * Math.PI) / 180;
    return add(DISH_C, add(scale(DISH_AX, Math.cos(t)), add(scale(DISH_UP, Math.cos(p)), DISH_SIDE, Math.sin(p)), Math.sin(t)), r);
  };
  for (let k = 0; k + 1 < DISH_RIM.length; k++) {
    const [[p0, t0], [p1, t1]] = [DISH_RIM[k], DISH_RIM[k + 1]];
    for (const [s0, s1] of [[0, 0.5], [0.5, 1]]) {
      const q = [onDish(t0 * s0, p0, DISH_R), onDish(t0 * s1, p0, DISH_R), onDish(t1 * s1, p1, DISH_R), onDish(t1 * s0, p1, DISH_R)];
      const mid = onDish(((t0 + t1) / 2) * ((s0 + s1) / 2), (p0 + p1) / 2, DISH_R);
      m.face(q, R.dish, add(DISH_C, sub(mid, DISH_C), 3));
      m.face(q, R.dish, DISH_C);
    }
  }
  m.bar([1.65, 0.22, 1.452], [1.557, 0.201, 1.254], [[0, 0], [0, 0.1], [1, 0]], 8, R.feed);
  const f = unit([-0.298, -0.515, -0.803]);
  const [fu, fv] = acrossOf(f);
  m.revolve([1.56, 0.21, 1.3], f, fu, fv, [[0, 0], [0, 0.11]], 8, R.feed).revolve([1.56, 0.21, 1.3], scale(f, -1), fv, fu, [[0, 0], [0, 0.11]], 8, R.feed);
  // the wire arm bent out east, and a plate fallen on the ground
  m.beam([[1.8, 0.41, 0.88], [1.87, 0.49, 0.8], [1.94, 0.51, 0.765], [1.98, 0.47, 0.715], [2.02, 0.26, 0.635]], 0.03, R.arm);
  const pc: V = [1.419, 0.092, 0.489];
  const [pa, pb]: V[] = [[0.447, -0.044, -0.893], [0.885, 0.169, 0.435]];
  m.face([add(add(pc, pa, -0.114), pb, -0.043), add(add(pc, pa, 0.125), pb, -0.043), add(add(pc, pa, 0.125), pb, 0.052), add(add(pc, pa, -0.114), pb, 0.052)], R.strap, sub(pc, [0, 1, 0]));
  // the solar panels: dark cells, each dipped to a shallow point, in pale frames
  for (const [c, a1, h1, n1, a2, h2, n2, up] of PANELS) {
    const at = (i: number, j: number, lift = 0) => add(add(add(c, a1, -h1 + (2 * h1 * i) / n1), a2, -h2 + (2 * h2 * j) / n2), up, lift);
    const below = add(c, up, -1);
    for (let i = 0; i < n1; i++)
      for (let j = 0; j < n2; j++) {
        const dip = add(at(i + 0.5, j + 0.5), up, -0.035);
        const ring = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
        for (let k = 0; k < 4; k++) m.face([ring[k], ring[(k + 1) % 4], dip], R.cell, add(dip, up, -1));
      }
    const fw = 0.035 / 2;
    for (let i = 0; i <= n1; i++) {
      const [a, b] = [at(i, 0, 0.015), at(i, n2, 0.015)];
      m.face([add(a, a1, -fw), add(b, a1, -fw), add(b, a1, fw), add(a, a1, fw)], R.frame, below);
    }
    for (let j = 0; j <= n2; j++) {
      const [a, b] = [at(0, j, 0.015), at(n1, j, 0.015)];
      m.face([add(a, a2, -fw), add(b, a2, -fw), add(b, a2, fw), add(a, a2, fw)], R.frame, below);
    }
    // (its underside, where it lifts off the ground)
    m.face([at(0, 0, -0.01), at(n1, 0, -0.01), at(n1, n2, -0.01), at(0, n2, -0.01)], R.frame, add(c, up, 1));
  }
  MEDIUM_STONES.forEach((s, k) => m.stone(s, R.stone[k % R.stone.length]));
  return m.parts();
}
