// The unstable core (D178, D496): our own model of the game's (`UnstableCore.Model`, 2 × 2, the one model for every
// core; the map stores its Coordinates, its orientation and flip, which we draw turned and never flipped, and its
// countdown). It was read from the game's model for its measures and colours only (numbers; no mesh or texture of the
// game's is used), in its local frame (x east, y up, z the map's y; its footprint 0…2):
// - a ball of metal panels about 1.35 across, sunk into the ground to 0.96 high, its pole a port tipped up toward the
//   north-west: drawn as rings round the port's axis at the ball's measured reach along 12 headings, each panel pale,
//   mid or dark as the game's there;
// - six pale ribs from the port down its sides, and a pale strap round its middle, square to the port's axis;
// - the port: a pale ring 0.6 across round a grey lens, a shallow cone set into it;
// - eight dark studs over it, each a bezel round a paler gem, one half sunk at its foot.
// The game's footing of ground round it (`SlopeCliffEdge`, the terrain's own material) is left to the terrain, as the
// relics' are. Its states: the game lights its lens only while its countdown runs, in play, blinking faster as it nears
// its blast (`UnstableCoreLighting`, its `_LightingMap`), and never in its map editor; we draw it as the map editor and
// the game before its countdown show it, unlit (the blink, its light and the blast are left out). The game's colours
// (palette.ts `UNSTABLE_CORE`), its metallic atlas folded into albedo for our light as the relics', in the game's light
// (materials.ts `gameObjectLight`). Its shadow is its model's in High (shadows.ts) and, in Standard's bake, discs fitted
// to it (`UNSTABLE_CORE_SHADOW`, light.ts `objectCasters`).

import { UNSTABLE_CORE, type Rgb } from "./palette";
import { across, add, cross, dot, Parts, sub, unit, type V } from "./relicParts";

/** The ball's centre, its axis out through the port, and the direction square to the axis its headings start from
 *  (turning toward the map's +y). */
const CENTRE: V = [1.021, 0.262, 0.975];
const AXIS: V = [-0.433, 0.75, 0.5];
const SEAM: V = [-0.744, 0.012, -0.668];
/** Its headings round the axis (degrees): its six ribs on every other one, the panels' edges between. */
const HEADINGS = [-168, -140, -112, -84.5, -57, -27, 3, 34, 65, 97.5, 130, 161];
/** Its rings' angles from the axis, after the port's rim, and their distance from the centre at each heading (0.67
 *  where the game's footing hides it). */
const RINGS = [45, 65, 82, 100, 120, 145, 170];
const RADII = [
  [0.702, 0.691, 0.725, 0.703, 0.721, 0.683, 0.691, 0.648, 0.662, 0.635, 0.668, 0.659],
  [0.68, 0.685, 0.723, 0.698, 0.718, 0.675, 0.683, 0.633, 0.648, 0.618, 0.656, 0.645],
  [0.678, 0.67, 0.67, 0.67, 0.67, 0.686, 0.686, 0.641, 0.65, 0.626, 0.652, 0.657],
  [0.676, 0.67, 0.67, 0.67, 0.67, 0.67, 0.663, 0.664, 0.627, 0.647, 0.636, 0.671],
  [0.67, 0.67, 0.67, 0.67, 0.67, 0.67, 0.67, 0.663, 0.624, 0.65, 0.63, 0.67],
  [0.67, 0.67, 0.67, 0.67, 0.67, 0.67, 0.67, 0.67, 0.653, 0.654, 0.67, 0.67],
  [0.67, 0.67, 0.67, 0.67, 0.67, 0.67, 0.67, 0.67, 0.67, 0.67, 0.67, 0.67],
];
/** Each panel's shade, band by band from the port's rim (P pale, M mid, D dark), as the game's panels there; dark where
 *  the game's footing hides it (`-`). */
const SHADES = ["DDMMDDDDDDDD", "MPMPPMPMMMMM", "MMPMPPPPPPPM", "----PDDDDDDD", "-----PMPPPPP", "------DMMPP-", "--------D---"];
/** The port: its rim's middle, the pale ring's radii round it, and how deep its lens's middle is set in. */
const PORT: V = [0.733, 0.692, 1.309];
const RING: [number, number] = [0.22, 0.3];
const LENS_DEPTH = 0.09;
/** The strap round the ball's middle, square to its axis: its half width, and its distance from the centre by heading. */
const STRAP_HALF = 0.047;
const STRAP: [number, number][] = [
  [-170, 0.737],
  [-150, 0.748],
  [-95, 0.74],
  [-30, 0.744],
  [-10, 0.731],
  [10, 0.719],
  [30, 0.707],
  [50, 0.689],
  [70, 0.683],
  [90, 0.681],
  [110, 0.686],
  [130, 0.693],
  [150, 0.702],
  [170, 0.725],
];
/** The ribs: half their width and how far they stand off the panels. */
const RIB_HALF = 0.03;
const RIB_OFF = 0.012;
/** The studs' middles (on the ball), their bezels' radii at the foot and the top, how high they rise and how far they
 *  are sunk. */
const STUDS: V[] = [
  [1.653, 0.255, 0.834],
  [0.712, 0.738, 0.681],
  [1.202, 0.867, 0.928],
  [1.269, 0.323, 0.393],
  [0.994, 0.24, 1.684],
  [0.342, 0.358, 0.928],
  [1.348, 0.61, 1.419],
  [0.491, 0.125, 1.419],
];
const BEZEL: [number, number] = [0.13, 0.085];
const BEZEL_RISE = 0.07;
const BEZEL_SINK = 0.02;
/** How far under the ground its lowest points go, as the game's. */
const FOOT = -0.03;

/** The unstable core's shadow in Standard's bake (light.ts `objectCasters`, `PLANT_SHAPES`): upright discs over each
 *  of the four tiles of its footprint (bottom, top, radius; levels and tiles, before light.ts's inset), moved `shift`
 *  along each way from the tile's middle toward the footprint's, shading the samples within `lit` of the footprint's
 *  middle, under its ball, no higher than `cap`, below its faces there (light.ts `CORNER`): fitted as the shader draws them to the model's own shadow
 *  along the 45° sun at 8 headings, both where it falls and how large. */
export const UNSTABLE_CORE_SHADOW: readonly (readonly [number, number, number])[] = [[0, 0.9, 0.5]];
export const UNSTABLE_CORE_CAST = { shift: 0.3, lit: 0.6, cap: 0.4 };

const rad = (deg: number) => (deg * Math.PI) / 180;
const scale = (a: V, k: number): V => [a[0] * k, a[1] * k, a[2] * k];

/** The strap's distance from the centre at a heading, between its measures. */
function strapAt(deg: number): number {
  const d = ((((deg + 180) % 360) + 360) % 360) - 180;
  for (let k = 0; k < STRAP.length; k++) {
    const [a, ra] = STRAP[k];
    const [b, rb] = STRAP[(k + 1) % STRAP.length];
    const span = (b - a + 360) % 360;
    const x = (d - a + 360) % 360;
    if (x <= span) return ra + ((rb - ra) * x) / span;
  }
  return STRAP[0][1];
}

/** The unstable core's triangles by colour (our frame: centred on its footprint's middle, x east, y up, z south),
 *  each turned so its front faces out. */
export function unstableCoreParts(): { points: number[]; colour: Rgb }[] {
  const m = new Parts([1, 1]);
  const R = UNSTABLE_CORE;
  const shade = (c: string): Rgb => (c === "P" ? R.pale : c === "M" ? R.mid : R.dark);
  const w = unit(AXIS);
  const u = unit(add(SEAM, w, -dot(SEAM, w)));
  const e = cross(u, w);
  const toward = (deg: number): V => add(scale(u, Math.cos(rad(deg))), e, Math.sin(rad(deg)));
  const ground = (p: V): V => [p[0], Math.max(p[1], FOOT), p[2]];
  const n = HEADINGS.length;
  // the ball's points: the port's rim at its headings (and the ring, the wall and the lens inside it), then each ring
  const rim = (k: number, r = RING[1], depth = 0): V => add(add(PORT, toward(HEADINGS[k % n]), r), w, -depth);
  const point = (i: number, k: number, out = 0): V => {
    if (i < 0) return add(rim(k), unit(sub(rim(k), CENTRE)), out);
    const t = rad(RINGS[i]);
    return add(CENTRE, add(scale(w, Math.cos(t)), toward(HEADINGS[k % n]), Math.sin(t)), RADII[i][k % n] + out);
  };
  // its panels, band by band from the port's rim; those wholly under the ground left out
  for (let i = -1; i + 1 < RINGS.length; i++)
    for (let k = 0; k < n; k++) {
      const q = [point(i, k), point(i, k + 1), point(i + 1, k + 1), point(i + 1, k)];
      if (q.every((p) => p[1] < FOOT)) continue;
      const c = SHADES[i + 1][k];
      m.face(q.map(ground), shade(c === "-" ? "D" : c), CENTRE);
    }
  // its six ribs from the port's rim down to the ground, on every other heading
  for (let k = 0; k < n; k += 2) {
    const side = toward(HEADINGS[k] + 90);
    for (let i = -1; i + 1 < RINGS.length; i++) {
      const [a, b] = [point(i, k, RIB_OFF), point(i + 1, k, RIB_OFF)];
      if (a[1] < FOOT && b[1] < FOOT) break;
      m.face([add(a, side, -RIB_HALF), add(b, side, -RIB_HALF), add(b, side, RIB_HALF), add(a, side, RIB_HALF)].map(ground), R.rib, CENTRE);
    }
  }
  // the strap round its middle
  const band = (deg: number, side: number): V => add(add(CENTRE, toward(deg), strapAt(deg)), w, side * STRAP_HALF);
  for (let k = 0; k < n; k++) {
    const [d0, d1] = [HEADINGS[k], HEADINGS[(k + 1) % n] + (k + 1 === n ? 360 : 0)];
    const q = [band(d0, -1), band(d1, -1), band(d1, 1), band(d0, 1)];
    if (q.every((p) => p[1] < FOOT)) continue;
    m.face(q.map(ground), R.strap, CENTRE);
  }
  // the port: its pale ring round the lens, a shallow cone set into it
  const inside = add(PORT, w, -1);
  const tip = add(PORT, w, -LENS_DEPTH);
  for (let k = 0; k < n; k++) {
    m.face([rim(k, RING[0]), rim(k + 1, RING[0]), rim(k + 1), rim(k)], R.ring, inside);
    m.face([rim(k, RING[0]), rim(k + 1, RING[0]), tip], R.lens, inside);
  }
  // the studs: a five-sided bezel each, its gem its top
  for (const c of STUDS) {
    const up = unit(sub(c, CENTRE));
    const [a, b] = across(up);
    const at = (k: number, r: number, h: number): V =>
      add(add(add(c, a, r * Math.cos((k * 2 * Math.PI) / 5)), b, r * Math.sin((k * 2 * Math.PI) / 5)), up, h);
    for (let k = 0; k < 5; k++) {
      const foot = [at(k, BEZEL[0], -BEZEL_SINK), at(k + 1, BEZEL[0], -BEZEL_SINK)];
      m.face([foot[0], foot[1], at(k + 1, BEZEL[1], BEZEL_RISE), at(k, BEZEL[1], BEZEL_RISE)].map(ground), R.stud, c);
    }
    m.face([0, 1, 2, 3, 4].map((k) => at(k, BEZEL[1], BEZEL_RISE)), R.gem, c);
  }
  return [...m.byColour].map(([colour, points]) => ({ colour, points }));
}
