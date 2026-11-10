// The large relic as the game draws it (D178, D496): a fallen dish antenna, our own model at the measures of the game's
// LargeRelic.Model (Timbermesh in the game's `resources.assets`, read locally for its numbers only: no mesh or texture of
// the game's is used). The game's model, 1,605 triangles over its 3 × 3 (0.1 to 2.9 across, −0.24 to 1.84 high):
// - the dish, a spherical cap of radius 2.0 whose centre stands at (2.187, 1.451, 2.178) of the footprint (the game's
//   local frame: x east, y up, z the map's y), its back turned down toward the footprint's (0, 0) corner along
//   (−0.528, −0.601, −0.600) (found where its six back ribs' great circles meet), so its face looks up 37° toward the
//   (3, 3) corner and its rim stands 1.84 high over the (0, 0) corner. The face runs from 9.3° round its hub to its rim at
//   46.8°, in three rings of panels 15° apart round it (θ 9.3–20, 20–34, 34–46.8), a third of them gone (18 of 54) and
//   the bottom quarter (φ 150–210, φ measured from the dish's top) buried or broken away; the piece from φ 75 to 150
//   cracked off along φ 60–75; the panels 0.04 thick; a rim lip 46.8–48.1°, from 1.99 to 2.06 out, round φ ±135;
// - a dark steel ring across the face at 23.7–25.9° (φ ±120), and on the back a ring at 23–25.1° (2.27–2.33 out, φ ±105)
//   and eight ribs 0.05 wide and 0.06 deep: six at φ ±15, ±45, ±75 from inside the hub (6.6°, 2.38–2.45 out) through
//   the back ring to the rim (46.3°, 2.03–2.09), two at φ ±105 from the back ring; a hub on the axis, a shallow cone 0.37 across its face, 1.80 to 1.87 from the centre,
//   narrowing to 0.28 at 2.44 and closed at 2.57, with a boss 0.15 across standing out of its face to 1.61;
// - the feed, a hoop 0.78 across (0.54 inside) and 0.1 thick, fallen off its four struts to lie low in the dish's mouth, the struts
//   bent down after it from their feet on the face ring (φ 15, 105, −75, −164), two broken bits on the ground below;
// - 13 dark stones strewn round it, 0.09 to 0.32 across; and a footing of ground (`SlopeCliffEdge`, the terrain's own
//   shader) 0.1 high over the footprint, which is the ground's look and is left to the terrain.
// The game's colours (palette.ts `LARGE_RELIC`) in the game's light (materials.ts `gameObjectLight`); its shadow is its
// model's in High (shadows.ts draws the objects from the sun) and, in Standard's baked shadows, a column over each tile
// at the dish's height there (`LARGE_RELIC_CASTS`, light.ts `objectCasters`).

import { LARGE_RELIC, type Rgb } from "./palette";

type V = [number, number, number];

/** The dish's sphere in the game's local frame: its centre, its axis toward the back, and the two directions across it
 *  (`E1` the dish's own up, `E2` its side), φ measured from `E1` toward `E2`. */
const C: V = [2.187, 1.451, 2.178];
const AX: V = [-0.528, -0.601, -0.6];
const E1: V = [-0.397, 0.8, -0.451];
const E2: V = [0.751, 0, -0.66];
const DEG = Math.PI / 180;

/** The face's front (toward the dish's mouth) and back, distances from its centre. */
const FRONT = 2.0;
const BACK = 2.04;
/** The rings of panels (θ, degrees from the axis) and, in each, where each 15° panel starts (φ, degrees): the ones the
 *  game's model has. From φ 75 on, the cracked piece. */
const BANDS = [9.3, 20, 34, 46.8];
const PANELS = [
  [-120, -105, -90, -75, -60, -30, -15, 0, 15, 30, 75, 105, 120, 135],
  [-105, -90, -60, -45, -30, 0, 15, 30, 45, 75, 90, 105],
  [-120, -105, -60, -30, -15, 0, 30, 45, 75, 105],
];
/** The struts' bent lines (game's local frame), from their feet on the face ring to the fallen feed. */
const STRUTS: V[][] = [
  [[1.089, 0.962, 0.614], [1.374, 1.071, 1.05], [1.772, 1.129, 1.625], [2.037, 0.956, 2.015]],
  [[1.877, 0.202, 0.685], [1.937, 0.529, 1.1], [2.124, 0.79, 1.968], [2.204, 0.793, 2.183]],
  [[0.59, 0.525, 1.489], [1.151, 0.8, 1.77], [1.497, 0.852, 1.948], [1.689, 0.848, 2.084]],
  [[1.38, -0.196, 1.58], [1.582, 0.217, 1.724], [1.671, 0.36, 1.792], [2.044, 0.665, 2.149]],
];
/** The stones: middle (x, y, z) and size across (x, y, z), the game's. */
const STONES = [
  [0.811, 0.083, 0.558, 0.317, 0.202, 0.225],
  [1.482, 0.025, 1.571, 0.236, 0.132, 0.243],
  [1.869, 0.057, 1.262, 0.27, 0.093, 0.216],
  [2.288, 0.037, 0.672, 0.244, 0.12, 0.193],
  [0.667, 0.084, 0.746, 0.146, 0.105, 0.169],
  [2.33, 0.03, 1.158, 0.197, 0.086, 0.149],
  [1.745, 0.029, 1.533, 0.169, 0.07, 0.185],
  [1.073, 0.035, 2.216, 0.146, 0.08, 0.139],
  [2.008, 0.035, 2.356, 0.168, 0.08, 0.153],
  [0.579, 0.026, 2.277, 0.14, 0.06, 0.146],
  [2.211, 0.034, 2.239, 0.119, 0.064, 0.12],
  [2.127, 0.026, 2.035, 0.115, 0.06, 0.115],
  [1.135, 0.029, 1.891, 0.089, 0.047, 0.095],
];

/** The dish's height over each tile of its footprint, [x][y] from its Coordinates (the game's model's highest point of
 *  the dish over the tile): Standard's baked shadow casts a column there (light.ts `objectCasters`). */
export const LARGE_RELIC_CASTS: readonly (readonly number[])[] = [
  [1.84, 1.78, 1.1],
  [1.82, 1.17, 1.01],
  [1.37, 1.01, 1.0],
];

const add = (a: V, b: V, k = 1): V => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: V): V => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** A point on the dish's sphere at θ, φ (degrees) and `r` from its centre. */
function onSphere(theta: number, phi: number, r: number): V {
  const s = Math.sin(theta * DEG);
  const c = Math.cos(theta * DEG);
  const across = add([E1[0] * Math.cos(phi * DEG), E1[1] * Math.cos(phi * DEG), E1[2] * Math.cos(phi * DEG)], E2, Math.sin(phi * DEG));
  return add(C, add([AX[0] * c, AX[1] * c, AX[2] * c], across, s), r);
}

/** The model's triangles by colour (our frame: centred on the footprint, x east, y up, z south). */
class Parts {
  readonly byColour = new Map<Rgb, number[]>();
  /** A flat face (its corners in the game's local frame, in order round it), its front turned away from `from`. */
  face(corners: V[], colour: Rgb, from: V): this {
    // (corners that meet, at a cone's tip, are one)
    const pts = corners.filter((p, i) => i === 0 || dot(sub(p, corners[i - 1]), sub(p, corners[i - 1])) > 1e-12).map(ours);
    if (pts.length > 2 && dot(sub(pts[pts.length - 1], pts[0]), sub(pts[pts.length - 1], pts[0])) <= 1e-12) pts.pop();
    if (pts.length < 3) return this;
    let n: V = [0, 0, 0];
    for (let i = 0; i < pts.length; i++) n = add(n, cross(pts[i], pts[(i + 1) % pts.length]));
    let mid: V = [0, 0, 0];
    for (const p of pts) mid = add(mid, p, 1 / pts.length);
    if (dot(n, sub(mid, ours(from))) < 0) pts.reverse();
    const out = this.byColour.get(colour) ?? [];
    for (let i = 1; i + 1 < pts.length; i++) out.push(...pts[0], ...pts[i], ...pts[i + 1]);
    this.byColour.set(colour, out);
    return this;
  }
  /** A body turned round an axis through `centre` along `axis`, (`u`, `v`) across it: `profile` its (along, radius)
   *  points, closed where a radius is 0; `sides` round. Its faces turn away from the axis at their middle's along. */
  /** A body of revolution; with `core` (a point of a closed profile's section) a hoop, its faces turned away from it. */
  revolve(centre: V, axis: V, u: V, v: V, profile: [number, number][], sides: number, colour: Rgb, core?: [number, number]): this {
    const at = (a: number, r: number, k: number) => {
      const t = (k * 2 * Math.PI) / sides;
      return add(add(centre, axis, a), add([u[0] * Math.cos(t), u[1] * Math.cos(t), u[2] * Math.cos(t)], v, Math.sin(t)), r);
    };
    for (let i = 0; i + 1 < profile.length; i++) {
      const [a0, r0] = profile[i];
      const [a1, r1] = profile[i + 1];
      // (a flat end faces along the axis, away from the body's middle; a side away from the axis)
      const flat = Math.abs(a1 - a0) < 1e-9;
      const mid = (profile[0][0] + profile[profile.length - 1][0]) / 2;
      for (let k = 0; k < sides; k++) {
        const from = core ? at(core[0], core[1], k + 0.5) : flat ? add(centre, axis, a0 + (a0 > mid ? -1 : 1)) : add(centre, axis, (a0 + a1) / 2);
        this.face([at(a0, r0, k), at(a1, r1, k), at(a1, r1, k + 1), at(a0, r0, k + 1)], colour, from);
      }
    }
    return this;
  }
  /** A beam of square section `w` across from `a` to `b` (open ends). */
  beam(a: V, b: V, w: number, colour: Rgb): this {
    const d = unit(sub(b, a));
    const u = unit(cross(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
    const v = cross(d, u);
    const h = w / 2;
    const corner = (p: V, s: number, t: number) => add(add(p, u, s * h), v, t * h);
    const round = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    const mid = add(a, sub(b, a), 0.5);
    for (let k = 0; k < 4; k++) {
      const [s0, t0] = round[k];
      const [s1, t1] = round[(k + 1) % 4];
      this.face([corner(a, s0, t0), corner(b, s0, t0), corner(b, s1, t1), corner(a, s1, t1)], colour, mid);
    }
    return this;
  }
  /** A ring round the axis of section `section` ((θ, r) corners in order), from φ0 to φ1 in `segments`; `faces` the
   *  section's edges drawn (each from its corner to the next). */
  ring(section: [number, number][], phi0: number, phi1: number, segments: number, colour: Rgb, faces = [0, 1, 2, 3]): this {
    const tm = section.reduce((s, [t]) => s + t, 0) / section.length;
    const rm = section.reduce((s, [, r]) => s + r, 0) / section.length;
    for (let k = 0; k < segments; k++) {
      const pa = phi0 + ((phi1 - phi0) * k) / segments;
      const pb = phi0 + ((phi1 - phi0) * (k + 1)) / segments;
      for (const e of faces) {
        const [t0, r0] = section[e];
        const [t1, r1] = section[(e + 1) % section.length];
        this.face([onSphere(t0, pa, r0), onSphere(t1, pa, r1), onSphere(t1, pb, r1), onSphere(t0, pb, r0)], colour, onSphere(tm, (pa + pb) / 2, rm));
      }
    }
    return this;
  }
}

/** A point of the game's local frame in ours: the footprint's middle the origin, the game's z (the map's y) our −z. */
function ours(p: V): V {
  return [p[0] - 1.5, p[1], 1.5 - p[2]];
}

/** The large relic's triangles, by colour (about 800; the game's model has 1,605). */
export function largeRelicParts(): { points: number[]; colour: Rgb }[] {
  const m = new Parts();
  const R = LARGE_RELIC;
  // the face's panels, both sides
  for (let b = 0; b < 3; b++)
    for (const p of PANELS[b]) {
      const corners = (r: number): V[] => [onSphere(BANDS[b], p, r), onSphere(BANDS[b + 1], p, r), onSphere(BANDS[b + 1], p + 15, r), onSphere(BANDS[b], p + 15, r)];
      const cracked = p >= 75;
      m.face(corners(FRONT), cracked ? R.cracked[b] : R.face[b], onSphere((BANDS[b] + BANDS[b + 1]) / 2, p + 7.5, 3));
      m.face(corners(BACK), cracked ? R.cracked[b] : R.back[b], C);
    }
  // its rim lip, the steel ring across its face and the ring behind it
  m.ring([[46.8, 1.99], [48.1, 1.99], [48.1, 2.06], [46.8, 2.06]], -135, 135, 18, R.rim);
  m.ring([[23.7, 1.99], [25.9, 1.99], [25.9, 2.06], [23.7, 2.06]], -120, 120, 16, R.steel, [0, 2]);
  m.ring([[23, 2.27], [25.1, 2.27], [25.1, 2.33], [23, 2.33]], -105, 105, 7, R.steel);
  // the ribs behind it, thin bars from inside the hub through the back ring to the rim
  const rib = (phi: number, sections: [number, number, number][]) => {
    const t: V = add([E1[0] * -Math.sin(phi * DEG), E1[1] * -Math.sin(phi * DEG), E1[2] * -Math.sin(phi * DEG)], E2, Math.cos(phi * DEG));
    const end = ([theta, r0, r1]: [number, number, number]) => [add(onSphere(theta, phi, r0), t, -0.025), add(onSphere(theta, phi, r0), t, 0.025), add(onSphere(theta, phi, r1), t, 0.025), add(onSphere(theta, phi, r1), t, -0.025)];
    const ends = sections.map(end);
    const middle = (q: V[]): V => q.reduce((s, v) => add(s, v, 1 / q.length), [0, 0, 0] as V);
    for (let s = 0; s + 1 < ends.length; s++) {
      const [a, b] = [ends[s], ends[s + 1]];
      const mid = middle([...a, ...b]);
      for (let k = 0; k < 4; k++) m.face([a[k], b[k], b[(k + 1) % 4], a[(k + 1) % 4]], R.steel, mid);
    }
    m.face(ends[0], R.steel, middle([...ends[0], ...ends[1]])).face(ends[ends.length - 1], R.steel, middle([...ends[ends.length - 2], ...ends[ends.length - 1]]));
  };
  for (const phi of [-75, -45, -15, 15, 45, 75]) rib(phi, [[6.6, 2.381, 2.449], [24.95, 2.273, 2.33], [46.25, 2.033, 2.086]]);
  for (const phi of [-105, 105]) rib(phi, [[24.9, 2.269, 2.326], [46.2, 2.026, 2.078]]);
  // the hub and its boss
  m.revolve(C, AX, E1, E2, [[1.8, 0], [1.865, 0.37], [2.44, 0.28], [2.57, 0]], 8, R.hub);
  m.revolve(C, AX, E1, E2, [[1.61, 0], [1.61, 0.15], [1.84, 0.105]], 8, R.boss);
  // the fallen feed, its bent struts and the bits broken off them
  const n = unit([0.61, 0.13, 0.781]);
  const fu = unit(cross(n, [0, 1, 0]));
  const hoop: [number, number][] = [[-0.055, 0.315], [-0.054, 0.39], [0.002, 0.381], [0.045, 0.345], [0.045, 0.27], [-0.055, 0.315]];
  m.revolve([1.798, 0.782, 1.797], n, fu, cross(n, fu), hoop, 8, R.feed, [-0.005, 0.33]);
  for (const line of STRUTS) for (let k = 0; k + 1 < line.length; k++) m.beam(line[k], line[k + 1], 0.06, R.feed);
  const bit = unit([0.099, 0.061, 0.059]);
  const bu = unit(cross(bit, [0, 1, 0]));
  m.revolve([2.047, 0.071, 2.104], bit, bu, cross(bit, bu), [[0, 0], [0, 0.1], [0.13, 0.1], [0.13, 0]], 6, R.feed);
  m.beam([1.725, 0.089, 2.059], [1.946, 0.081, 2.116], 0.08, R.feed).beam([1.956, 0.082, 1.962], [2.037, 0.098, 2.056], 0.064, R.feed);
  // the stones round it
  for (const [x, y, z, sx, sy, sz] of STONES) {
    const c: V = [x, y, z];
    const tips: V[] = [[sx / 2, 0, 0], [0, 0, sz / 2], [-sx / 2, 0, 0], [0, 0, -sz / 2]].map((d) => add(c, d as V));
    for (const tip of [add(c, [0, sy / 2, 0]), add(c, [0, -sy / 2, 0])]) for (let k = 0; k < 4; k++) m.face([tip, tips[k], tips[(k + 1) % 4]], R.stone, c);
  }
  return [...m.byColour].map(([colour, points]) => ({ points, colour }));
}
