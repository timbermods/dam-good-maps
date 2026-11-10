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
// model's in High (shadows.ts draws the objects from the sun) and, in Standard's baked shadows, discs fitted to it
// (`LARGE_RELIC_SHADOW`, light.ts `objectCasters`).

import { LARGE_RELIC, type Rgb } from "./palette";
import { add, cross, Parts, unit, type V } from "./relicParts";

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

/** The dish's shadow in Standard's bake (light.ts `objectCasters`, `PLANT_SHAPES`), [x][y] over its footprint from its
 *  Coordinates: upright discs round a tile's middle (bottom, top, radius; levels and tiles, before light.ts's inset), as
 *  the plants' shapes. A thin tilted shell a third open casts a small broken shadow, not a column's: the discs are
 *  fitted, as the shader draws them, to the model's own shadow (its triangles projected along the 45° sun) round the
 *  compass, as High's depth map casts the model itself: three discs by the dish's hub and high back, none under its
 *  open mouth or its thin rim. Round, they cannot follow the shell's turn: at headings 45° apart they cover 0.67 to
 *  1.14 of the model's shadow, 0.93 of it in all (the columns this replaced cast 1.8 to 2.9 times it). */
export const LARGE_RELIC_SHADOW: readonly (readonly (readonly (readonly [number, number, number])[])[])[] = [
  [[], [[0.45, 1.85, 0.5]], []],
  [[[0.6, 1.7, 0.6]], [[0, 1.5, 0.5]], []],
  [[], [], []],
];

/** A point on the dish's sphere at θ, φ (degrees) and `r` from its centre. */
function onSphere(theta: number, phi: number, r: number): V {
  const s = Math.sin(theta * DEG);
  const c = Math.cos(theta * DEG);
  const across = add([E1[0] * Math.cos(phi * DEG), E1[1] * Math.cos(phi * DEG), E1[2] * Math.cos(phi * DEG)], E2, Math.sin(phi * DEG));
  return add(C, add([AX[0] * c, AX[1] * c, AX[2] * c], across, s), r);
}

/** The dish's parts: its own rings round its axis besides the shared shapes. */
class DishParts extends Parts {
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

/** The large relic's triangles, by colour (about 800; the game's model has 1,605). */
export function largeRelicParts(): { points: number[]; colour: Rgb }[] {
  const m = new DishParts([1.5, 1.5]);
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
  for (const line of STRUTS) m.beam(line, 0.06, R.feed);
  const bit = unit([0.099, 0.061, 0.059]);
  const bu = unit(cross(bit, [0, 1, 0]));
  m.revolve([2.047, 0.071, 2.104], bit, bu, cross(bit, bu), [[0, 0], [0, 0.1], [0.13, 0.1], [0.13, 0]], 6, R.feed);
  m.beam([[1.725, 0.089, 2.059], [1.946, 0.081, 2.116]], 0.08, R.feed).beam([[1.956, 0.082, 1.962], [2.037, 0.098, 2.056]], 0.064, R.feed);
  // the stones round it
  for (const stone of STONES) m.stone(stone, R.stone);
  return m.parts();
}
