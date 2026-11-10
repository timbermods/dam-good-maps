// The blockage (D178, D496): our own model of the game's (`Blockage.Model`, 1 × 1, 174 triangles, the one model for
// every blockage; a blockage has no other state on the map, a player's demolishing takes it away whole). Read from the
// game's model for its measures and colours alone (numbers; no mesh or texture of the game's is used), in its local
// frame (x east, y up, z the map's y; its tile 0…1):
// - a heap of faceted grey rock 1.08 high, overhanging its tile by about 0.15 on each side (x −0.15…1.18, z −0.16…1.17),
//   drawn as eight rocks (each an icosahedron stretched along three axes), fitted to the game's heap so the two
//   cover the same outline from 17 cameras round it (8 headings at 30° and 60° down, and from above);
// - two broken posts standing up out of it (one 1.05 high at its west edge, one leaning out of its east side), a beam
//   through its north side, sawn pale at its west end and broken at its east, and a splinter standing 1.04 high on its
//   south edge;
// - six pale shards of plank sticking out of it, the farthest 0.56 past its tile; four seen from both sides, two (as
//   the game's) from one.
// The game's colours (palette.ts `BLOCKAGE`), its material not metallic, in the game's light (materials.ts
// `gameObjectLight`). Its shadow is its model's in High (shadows.ts) and, in Standard's bake, discs fitted to it
// (`BLOCKAGE_SHADOW`, light.ts `objectCasters`).

import { BLOCKAGE, type Rgb } from "./palette";

type V = [number, number, number];

/** The rocks: middle (x, y, z), half-sizes along their three axes, then their first two axes (the third their cross). */
const ROCKS: readonly (readonly number[])[] = [
  [0.215, 0.774, 0.811, 0.404, 0.451, 0.306, 0.303, -0.44, 0.845, -0.909, -0.399, 0.118],
  [0.837, 0.802, 0.261, 0.478, 0.425, 0.274, 0.143, -0.6, -0.787, -0.562, 0.605, -0.564],
  [0.348, 0.839, 0.155, 0.554, 0.344, 0.213, 0.999, -0.045, 0, 0.009, 0.198, 0.98],
  [0.257, 0.101, 0.787, 0.408, 0.501, 0.457, 0.434, -0.09, 0.896, 0.333, -0.909, -0.253],
  [0.835, 0.395, 0.88, 0.697, 0.404, 0.311, -0.135, 0.985, -0.105, 0.91, 0.081, -0.407],
  [0.635, 0.931, 0.744, 0.543, 0.298, 0.111, 0.821, -0.045, 0.569, 0.562, -0.104, -0.82],
  [0.801, 0.132, 0.244, 0.468, 0.417, 0.361, -0.381, -0.396, -0.835, -0.307, -0.798, 0.518],
  [0.193, 0.184, 0.187, 0.895, 0.365, 0.34, -0.044, -0.998, -0.043, -0.77, 0.006, 0.638],
];
/** The posts and the beam: their ends, their width, and their colours (side, first end, second end). */
const POSTS: readonly [V, V, number, Rgb, Rgb, Rgb][] = [
  [[0.889, 1.054, 0.82], [0.999, -0.045, 0.367], 0.21, BLOCKAGE.post, BLOCKAGE.post, BLOCKAGE.post],
  [[-0.032, -0.019, 0.438], [0.106, 1.016, 0.417], 0.21, BLOCKAGE.post, BLOCKAGE.post, BLOCKAGE.post],
  // (the beam through the heap's north side, its sawn end pale on the west, broken dark on the east)
  [[-0.05, 0.92, 0.8], [1.15, 0.36, 1.0], 0.22, BLOCKAGE.beam, BLOCKAGE.sawn, BLOCKAGE.broken],
];
/** The splinter: its foot's corners on the ground and its tip. */
const SPLINTER: readonly V[] = [[0.498, -0.018, 0.019], [0.61, -0.018, -0.165], [0.766, -0.018, -0.015], [0.715, 1.022, 0.223]];
/** The shards: three corners, the way their front faces (the game's normal), and whether their back is drawn too. */
const SHARDS: readonly [V, V, V, V, boolean][] = [
  [[0.3, 0.42, -0.43], [-0.56, 0.28, 0.01], [0.38, 0.64, 0.57], [-0.26, 0.95, -0.19], true],
  [[0.02, 0.36, 1.15], [-0.31, 0, 0.71], [0.03, 0.55, 0.43], [0.81, -0.57, -0.15], true],
  [[-0.01, -0.02, 1.14], [0.76, 0.06, 1.18], [0.32, 0.45, 0.86], [-0.1, 0.57, 0.82], false],
  [[0.8, 0.52, 0.66], [0.5, 0.23, 1.28], [1.06, 0.22, 1.22], [0.06, 0.9, 0.44], true],
  [[0.83, 0.51, 0.13], [1.3, 0.37, -0.02], [1.05, 0.54, -0.28], [0.34, 0.91, 0.25], true],
  [[1.04, 0.55, 0.37], [0.99, 0.81, 0.73], [1.09, 0.43, 0.68], [0.96, 0.27, -0.07], false],
];

/** The blockage's shadow in Standard's bake (light.ts `objectCasters`, `PLANT_SHAPES`): upright discs round its tile's
 *  middle (bottom, top, radius; levels and tiles, before light.ts's inset), fitted as the shader draws them to the
 *  model's own shadow along the 45° sun round the compass, as High's depth map casts the model itself: one disc as
 *  wide as a disc may be (light.ts `PLANT_WIDEST`), the heap's height, shading nothing on its own tile (light.ts
 *  `OWN_TILE_LIT`: the heap reads the bake where it stands, and its discs round it would darken its sunlit faces by a
 *  third). Its shards reach past it, so of the model's shadow on the ground it does not stand over it covers 0.84 to
 *  0.99 by heading, 0.93 in all (the blockage cast none before). */
export const BLOCKAGE_SHADOW: readonly (readonly [number, number, number])[] = [[0, 1.1, 0.9]];

const add = (a: V, b: V, k = 1): V => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: V): V => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / l, a[1] / l, a[2] / l];
};
/** A point of the game's local frame in ours: the tile's middle the origin, the game's z (the map's y) our −z. */
const ours = (p: V): V => [p[0] - 0.5, p[1], 0.5 - p[2]];

/** The heap's top (the game's 1.078). */
const HEAP_TOP = 1.078;

const T = (1 + Math.sqrt(5)) / 2;
const ICO: V[] = [[-1, T, 0], [1, T, 0], [-1, -T, 0], [1, -T, 0], [0, -1, T], [0, 1, T], [0, -1, -T], [0, 1, -T], [T, 0, -1], [T, 0, 1], [-T, 0, -1], [-T, 0, 1]].map((p) => unit(p as V));
const ICO_FACES = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];

/** The blockage's triangles by colour (our frame: centred on its tile, x east, y up, z south), each turned so its front
 *  faces out. */
export function blockageParts(): { points: number[]; colour: Rgb }[] {
  const byColour = new Map<Rgb, number[]>();
  // (a triangle of the game's frame, its front toward `facing`)
  const tri = (a: V, b: V, c: V, colour: Rgb, facing: V) => {
    const [p, q, r] = [ours(a), ours(b), ours(c)];
    const n = cross(sub(q, p), sub(r, p));
    const f: V = [facing[0], facing[1], -facing[2]];
    const out = byColour.get(colour) ?? [];
    if (dot(n, f) >= 0) out.push(...p, ...q, ...r);
    else out.push(...p, ...r, ...q);
    byColour.set(colour, out);
  };
  ROCKS.forEach((r, k) => {
    const c: V = [r[0], r[1], r[2]];
    const a: V = unit([r[6], r[7], r[8]]);
    const b0: V = [r[9], r[10], r[11]];
    const b = unit(sub(b0, a.map((v) => v * dot(a, b0)) as V));
    const axes = [a, b, cross(a, b)];
    // (cut off at the ground and at the heap's top, 1.08: the game's heap stands on its tile, flat below)
    const pts = ICO.map((p) => add(add(add(c, axes[0], p[0] * r[3]), axes[1], p[1] * r[4]), axes[2], p[2] * r[5])).map(([x, y, z]): V => [x, Math.min(HEAP_TOP, Math.max(0, y)), z]);
    const colour = BLOCKAGE.rock[k % BLOCKAGE.rock.length];
    for (const [i, j, l] of ICO_FACES) {
      const mid = add(add(pts[i], pts[j]), pts[l]).map((v) => v / 3) as V;
      tri(pts[i], pts[j], pts[l], colour, sub(mid, c));
    }
  });
  // the posts and the beam: three-sided, closed at their ends
  for (const [a, b, w, side, endA, endB] of POSTS) {
    const d = unit(sub(b, a));
    const u = unit(cross(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
    const v = cross(d, u);
    const r = w / Math.sqrt(3);
    const round = [0, 1, 2].map((k) => add(u.map((x) => x * Math.cos((k * 2 * Math.PI) / 3) * r) as V, v, Math.sin((k * 2 * Math.PI) / 3) * r));
    const mid = add(a, sub(b, a), 0.5);
    for (let k = 0; k < 3; k++) {
      const [p0, p1] = [round[k], round[(k + 1) % 3]];
      const out = add(add(p0, p1), [0, 0, 0]);
      tri(add(a, p0), add(b, p0), add(b, p1), side, out);
      tri(add(a, p0), add(b, p1), add(a, p1), side, out);
    }
    tri(add(a, round[0]), add(a, round[1]), add(a, round[2]), endA, sub(a, mid));
    tri(add(b, round[0]), add(b, round[1]), add(b, round[2]), endB, sub(b, mid));
  }
  // the splinter: three sides up to its tip
  const [f0, f1, f2, tip] = SPLINTER;
  const foot = add(add(f0, f1), f2).map((v) => v / 3) as V;
  for (const [p, q] of [[f0, f1], [f1, f2], [f2, f0]]) tri(p, q, tip, BLOCKAGE.splinter, sub(add(p, q).map((v) => v / 2) as V, foot));
  // the shards
  SHARDS.forEach(([a, b, c, facing, both], k) => {
    tri(a, b, c, BLOCKAGE.shard[k], facing);
    if (both) tri(a, b, c, BLOCKAGE.shardBack[k], [-facing[0], -facing[1], -facing[2]]);
  });
  return [...byColour].map(([colour, points]) => ({ colour, points }));
}
