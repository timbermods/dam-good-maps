// The badtide drain (D178, D496): our own model of the game's (`BadtideDrain.Model`, 391 triangles, the one model for
// every badtide drain; the map stores its Coordinates and its orientation, the way it flows). It was read from the
// game's model for its measures and colours only (numbers; no mesh or texture of the game's is used), in its local
// frame (x east, y up, z the map's y; its footprint 1 × 3, the drain on tiles 0 and 1, tile 2 the air its water falls
// through):
// - a box of rusted plate 1 × 1 × 2 filling its two tiles, every edge a rust-orange frame 0.1 wide with grey corners,
//   its panels dark; two rust rails along its top and down its back, and on each side two pipes rising from its foot
//   and bending toward its mouth;
// - its mouth at its front (z 2): a recess 0.1 deep round a sloping dark plate with a round hole 0.8 across, a black
//   funnel narrowing into the box behind it to 0.7, and a rusted hood over its upper half reaching 0.37 out over
//   tile 2.
// The game's colours (palette.ts `BADTIDE_DRAIN`), its metallic atlas folded into albedo for our light as the relics',
// in the game's light (materials.ts `gameObjectLight`). Its shadow is its model's in High (shadows.ts) and, in
// Standard's bake, discs fitted to it over each of its two tiles (`BADTIDE_DRAIN_SHADOW`, light.ts `objectCasters`).

import { BADTIDE_DRAIN, type Rgb } from "./palette";
import { add, Parts, type V } from "./relicParts";

/** The box's middle: the side faces turn away from it. */
const MID: V = [0.5, 0.5, 1];
/** The frame's width. */
const F = 0.1;
/** The mouth: its axis (x, y), the hole's radius, the depth the funnel narrows to (the game's narrows to 0.28 at 1.02
 *  first, unseen in its black), the sloping plate (its depth at the bottom and the top of the recess), and the hood's
 *  reach at its top (outside and in). */
const AXIS = [0.5, 0.5] as const;
const HOLE = 0.4;
const FUNNEL_END = 0.7;
const PLATE: [number, number] = [1.62, 1.9];
const HOOD_IN = 0.278;
const HOOD_REACH: [number, number] = [0.37, 0.256];
/** Round the mouth. */
const ROUND = 16;
/** The pipes on each side: the middle of their bends (y, z), each pipe's radius about it, and their width. */
const BEND: [number, number] = [0.1, 1.0];
const PIPES = [0.55, 0.25];
const PIPE = 0.1;
/** How far the pipes stand off the side. */
const RELIEF = 0.006;

/** The badtide drain's shadow in Standard's bake (light.ts `objectCasters`, `PLANT_SHAPES`): upright discs round the
 *  middle of each of the two tiles its box fills (bottom, top, radius; levels and tiles, before light.ts's inset),
 *  fitted as the shader draws them to the model's own shadow along the 45° sun at 8 headings, shading nothing on
 *  their own tile (light.ts `OWN_TILE_LIT`). On the ground it does not stand over, 0.97–1.19 of the model's shadow a
 *  heading, 1.00 in all (a column over each tile, 0.69–0.99, cast its diagonals too short). */
export const BADTIDE_DRAIN_SHADOW: readonly (readonly [number, number, number])[] = [[0, 1.2, 0.8]];

/** A face of the box, given on its plane: `axis` across it (0 x, 1 y, 2 z), at `at`, its corners (u, v) on the other
 *  two axes in order. */
function plane(m: Parts, axis: number, at: number, corners: [number, number][], colour: Rgb, from: V = MID): void {
  m.face(
    corners.map(([u, v]) => {
      const p: V = [0, 0, 0];
      const [i, j] = [0, 1, 2].filter((k) => k !== axis);
      p[axis] = at;
      p[i] = u;
      p[j] = v;
      return p;
    }),
    colour,
    from,
  );
}

/** A rectangle on a face from (u0, v0) to (u1, v1). */
function rect(m: Parts, axis: number, at: number, u0: number, v0: number, u1: number, v1: number, colour: Rgb, from: V = MID): void {
  plane(m, axis, at, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], colour, from);
}

/** A face's frame (rust strips and grey corners round its edge, `U` × `W` across), and, with `panel`, its dark panel
 *  inside, crossed along v by the rust rails `rails` (their u from–to). */
function framed(m: Parts, axis: number, at: number, U: number, W: number, rails: [number, number][], panel = true): void {
  const R = BADTIDE_DRAIN;
  for (const [u, v] of [[0, 0], [U - F, 0], [0, W - F], [U - F, W - F]]) rect(m, axis, at, u, v, u + F, v + F, R.corner);
  rect(m, axis, at, F, 0, U - F, F, R.rust);
  rect(m, axis, at, F, W - F, U - F, W, R.rust);
  rect(m, axis, at, 0, F, F, W - F, R.rust);
  rect(m, axis, at, U - F, F, U, W - F, R.rust);
  if (!panel) return;
  let u = F;
  for (const [a, b] of [...rails, [U - F, U - F] as [number, number]]) {
    if (a > u) rect(m, axis, at, u, F, a, W - F, R.panel);
    if (b > a) rect(m, axis, at, a, F, b, W - F, R.rust);
    u = b;
  }
}

/** The badtide drain's triangles by colour (our frame: centred on its footprint's middle tile, x east, y up, z south,
 *  the map's +y our −z), each turned so its front faces out. */
export function badtideDrainParts(): { points: number[]; colour: Rgb }[] {
  const m = new Parts([0.5, 1.5]);
  const R = BADTIDE_DRAIN;
  const rails: [number, number][] = [[0.3, 0.4], [0.6, 0.7]];
  // the box: its sides (on y, z), its top (on x, z) and its back (on x, y), framed; its front frame round the mouth
  for (const x of [0, 1]) framed(m, 0, x, 1, 2, []);
  framed(m, 1, 1, 1, 2, rails);
  framed(m, 2, 0, 1, 1, rails);
  framed(m, 2, 2, 1, 1, [], false);
  // the pipes on each side: a quarter bend up from its foot, then straight along to the front frame
  for (const x of [0, 1]) {
    const out = x === 0 ? -RELIEF : 1 + RELIEF;
    const from: V = [x === 0 ? 1 : 0, 0.5, 1];
    for (const r of PIPES) {
      const [a, b] = [r - PIPE / 2, r + PIPE / 2];
      const arc = (k: number, rr: number): [number, number] => {
        const t = (k * Math.PI) / 2 / 4;
        return [BEND[0] + rr * Math.sin(t), BEND[1] - rr * Math.cos(t)];
      };
      for (let k = 0; k < 4; k++) plane(m, 0, out, [arc(k, a), arc(k, b), arc(k + 1, b), arc(k + 1, a)], R.rust, from);
      rect(m, 0, out, BEND[0] + a, BEND[1], BEND[0] + b, 2 - F, R.rust, from);
    }
  }
  // the mouth: the recess's walls, looking in
  const plateZ = (y: number) => PLATE[0] + ((PLATE[1] - PLATE[0]) * (y - F)) / (1 - 2 * F);
  const inward = (p: V): V => [2 * p[0] - AXIS[0], 2 * p[1] - AXIS[1], p[2]];
  for (const x of [F, 1 - F]) m.face([[x, F, 2], [x, 1 - F, 2], [x, 1 - F, plateZ(1 - F)], [x, F, plateZ(F)]], R.corner, inward([x, 0.5, 1.9]));
  for (const y of [F, 1 - F]) m.face([[F, y, 2], [1 - F, y, 2], [1 - F, y, plateZ(y)], [F, y, plateZ(y)]], R.corner, inward([0.5, y, 1.9]));
  // the sloping plate round the hole, and the funnel behind it
  const at = (k: number, r: number, z?: number): V => {
    const t = (k * 2 * Math.PI) / ROUND;
    const p: V = [AXIS[0] + r * Math.cos(t), AXIS[1] + r * Math.sin(t), 0];
    p[2] = z ?? plateZ(p[1]);
    return p;
  };
  const square = (k: number): V => {
    const t = (k * 2 * Math.PI) / ROUND;
    const d = (0.5 - F) / Math.max(Math.abs(Math.cos(t)), Math.abs(Math.sin(t)));
    return at(k, d);
  };
  const behind: V = [0.5, 0.5, 0];
  const axisAt = (z: number): V => [AXIS[0], AXIS[1], z];
  // (a point beyond a face round the axis, away from it: the face looks in)
  const away = (p: V): V => add(p, [p[0] - AXIS[0], p[1] - AXIS[1], 0]);
  for (let k = 0; k < ROUND; k++) {
    m.face([square(k), square(k + 1), at(k + 1, HOLE), at(k, HOLE)], R.panel, behind);
    // (the funnel's faces look in, toward its axis)
    const rim = [at(k, HOLE), at(k + 1, HOLE)];
    m.face([rim[0], rim[1], axisAt(FUNNEL_END)], R.mouth, away(rim[0]));
  }
  // the hood over the mouth's upper half, its end sloping back to the box at its sides
  for (let k = 0; k < ROUND / 2; k++) {
    const end = (j: number, r: number, reach: number): V => {
      const p = at(j, r, 0);
      return [p[0], p[1], 2 + reach * Math.sin((j * 2 * Math.PI) / ROUND)];
    };
    const [o0, o1] = [at(k, HOLE, 2), at(k + 1, HOLE, 2)];
    const [i0, i1] = [at(k, HOOD_IN, 2), at(k + 1, HOOD_IN, 2)];
    const [oe0, oe1] = [end(k, HOLE, HOOD_REACH[0]), end(k + 1, HOLE, HOOD_REACH[0])];
    const [ie0, ie1] = [end(k, HOOD_IN, HOOD_REACH[1]), end(k + 1, HOOD_IN, HOOD_REACH[1])];
    m.face([o0, o1, oe1, oe0], R.hood, axisAt(2.1));
    m.face([i0, i1, ie1, ie0], R.hood, away(add(i0, i1, 1).map((v) => v / 2) as V));
    m.face([oe0, oe1, ie1, ie0], R.hood, axisAt(1.5));
  }
  return [...m.byColour].map(([colour, points]) => ({ colour, points }));
}
