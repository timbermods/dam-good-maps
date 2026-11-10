// The natural dam (D178, D496): our own model of the game's (`NaturalDam.Model`, 1 × 1, 179 triangles, the one model for
// every natural dam; the map stores its Coordinates alone). It was read from the game's model for its measures and
// colours only (numbers; no mesh or texture of the game's is used), in its local frame (x east, y up, z the map's y; its
// tile 0…1):
// - a low heap of faceted brown rock, 0.62 high with a flat top, overhanging its tile by up to 0.18 (x −0.17…1.2,
//   z −0.14…1.13). It is drawn as rings at four heights, each at the heap's outline along 12 headings, closed by a flat
//   top, so the two cover the same outline from 17 cameras round it (8 headings at 30° and 60° down, and from above);
// - three logs through it, five-sided, their ends sticking out of its sides;
// - flat pale stones lying over its top, the highest to 0.72, and three loose shards.
// The game's colours (palette.ts `NATURAL_DAM`), its material not metallic, in the game's light (materials.ts
// `gameObjectLight`). Its shadow is its model's in High (shadows.ts) and, in Standard's bake, a disc fitted to it
// (`NATURAL_DAM_SHADOW`, light.ts `objectCasters`).

import { NATURAL_DAM, type Rgb } from "./palette";
import { add, cross, Parts, unit, type V } from "./relicParts";

/** The heap's middle (x, z) and the heights of its rings: its foot, two up its sides, and its top's edge. */
const HEAP_MID = [0.515, 0.5] as const;
const HEAP_LEVELS = [0, 0.3, 0.5, 0.62];
/** Its outline at each ring, along headings 30° apart from east toward the map's +y (tiles from its middle). */
const HEAP_RADII = [
  [0.65, 0.69, 0.73, 0.55, 0.74, 0.64, 0.66, 0.78, 0.71, 0.62, 0.71, 0.76],
  [0.67, 0.73, 0.71, 0.56, 0.73, 0.67, 0.57, 0.8, 0.73, 0.56, 0.64, 0.76],
  [0.65, 0.74, 0.7, 0.45, 0.72, 0.63, 0.51, 0.75, 0.72, 0.52, 0.62, 0.68],
  [0.5, 0.67, 0.6, 0.38, 0.57, 0.67, 0.5, 0.66, 0.31, 0.5, 0.34, 0.45],
];
/** The logs: their two ends' middles and radii. */
const LOGS: readonly [V, number, V, number][] = [
  [[-0.168, 0.532, 0.119], 0.107, [1.18, 0.272, 0.705], 0.12],
  [[-0.103, 0.186, 0.664], 0.146, [1.08, 0.588, 0.344], 0.105],
  [[0.39, 0.475, 0.005], 0.11, [0.558, 0.051, 1.081], 0.1],
];
/** The flat stones over the top: middle, their long way, half their length and width, their up, how far their middle
 *  rises above their rim, and their corners round. */
const STONES: readonly [V, V, number, number, V, number, number][] = [
  [[0.214, 0.599, 0.673], [0.975, 0.095, -0.199], 0.43, 0.31, [-0.126, 0.98, -0.154], 0.1, 6],
  [[0.498, 0.586, 0.251], [0.364, -0.21, -0.907], 0.4, 0.3, [0.144, 0.975, -0.168], 0.15, 6],
  [[0.262, 0.525, 0.786], [0.524, -0.081, -0.848], 0.37, 0.32, [0.435, 0.881, 0.185], 0.21, 4],
  [[0.91, 0.589, 0.208], [0.371, -0.079, -0.925], 0.41, 0.25, [0.213, 0.977, 0.002], 0.08, 6],
  [[0.892, 0.626, 0.778], [0.893, -0.059, 0.446], 0.27, 0.19, [0.131, 0.983, -0.132], 0.06, 4],
];
/** The loose shards: their corners, the way their front faces. */
const SHARDS: readonly [V[], V][] = [
  [[[-0.098, 0.616, 0.326], [0.135, 0.643, -0.028], [0.387, 0.61, 0.636]], [0, 1, 0]],
  [[[-0.06, 0.526, 0.449], [-0.052, 0.561, 0.669], [0.328, 0.618, 0.51]], [0, 1, 0]],
  [[[0.946, 0.588, 0.236], [1.111, 0.562, 0.343], [1.21, 0.27, 0.492], [1.114, 0.26, 0.099]], [1, 0.4, -0.4]],
];

/** The natural dam's shadow in Standard's bake (light.ts `objectCasters`, `PLANT_SHAPES`): upright discs round its
 *  tile's middle (bottom, top, radius; levels and tiles, before light.ts's inset), fitted as the shader draws them to the
 *  model's own shadow along the 45° sun at 8 headings: its foot as wide as a disc may be, its top a little narrower,
 *  shading nothing on its own tile, as the blockage's (light.ts `OWN_TILE_LIT`). On the ground it does not stand over,
 *  0.84–1.00 of the model's shadow a heading, 0.92 in all (one disc, 0.92–1.19). */
export const NATURAL_DAM_SHADOW: readonly (readonly [number, number, number])[] = [
  [0, 0.4, 0.94],
  [0.4, 0.75, 0.8],
];

/** The natural dam's triangles by colour (our frame: centred on its tile, x east, y up, z south), each turned so its
 *  front faces out. */
export function naturalDamParts(): { points: number[]; colour: Rgb }[] {
  const m = new Parts([0.5, 0.5]);
  const R = NATURAL_DAM;
  // the heap: its rings joined round, faceted in three shades of its rock, and its flat top
  const n = HEAP_RADII[0].length;
  const ring = (i: number, k: number): V => {
    const t = ((k % n) * 2 * Math.PI) / n;
    return [HEAP_MID[0] + HEAP_RADII[i][k % n] * Math.cos(t), HEAP_LEVELS[i], HEAP_MID[1] + HEAP_RADII[i][k % n] * Math.sin(t)];
  };
  const axis = (y: number): V => [HEAP_MID[0], y, HEAP_MID[1]];
  for (let i = 0; i + 1 < HEAP_LEVELS.length; i++)
    for (let k = 0; k < n; k++) {
      const from = axis((HEAP_LEVELS[i] + HEAP_LEVELS[i + 1]) / 2);
      m.face([ring(i, k), ring(i, k + 1), ring(i + 1, k + 1)], R.rock[(k + i) % 3], from);
      m.face([ring(i, k), ring(i + 1, k + 1), ring(i + 1, k)], R.rock[(k + i + 1) % 3], from);
    }
  const top = HEAP_LEVELS.length - 1;
  for (let k = 0; k < n; k++) m.face([ring(top, k), ring(top, k + 1), axis(HEAP_LEVELS[top])], R.rock[(k + 2) % 3], axis(0));
  // the logs, closed at their ends
  for (const [a, ra, b, rb] of LOGS)
    m.bar(a, b, [[0, 0], [0, ra], [1, rb], [1, 0]], 5, R.log);
  // the flat stones: a low pyramid each over its rim
  STONES.forEach(([c, long, a, b, up, rise, corners], s) => {
    const u = unit(long);
    const w = unit(cross(up, u));
    const rim = Array.from({ length: corners }, (_, k) => {
      const t = (k * 2 * Math.PI) / corners;
      return add(add(c, u, a * Math.cos(t)), w, b * Math.sin(t));
    });
    const peak = add(c, unit(up), rise);
    const below = add(c, unit(up), -1);
    for (let k = 0; k < corners; k++) m.face([rim[k], rim[(k + 1) % corners], peak], R.stone[s], below);
  });
  SHARDS.forEach(([corners, facing], s) => {
    const mid = corners.reduce((p, q) => add(p, q, 1 / corners.length), [0, 0, 0] as V);
    m.face(corners, R.shard[s], add(mid, facing, -1));
  });
  // (cut at the ground, as the game's: a log's low end goes into it)
  return [...m.byColour].map(([colour, points]) => ({ colour, points: points.map((v, i) => (i % 3 === 1 ? Math.max(0, v) : v)) }));
}
