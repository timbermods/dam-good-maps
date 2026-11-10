// Thorns (D178, D496): our own model of the game's (`Thorns.Model`, 1 × 1, 141 triangles, the one model for every
// thorn bush; the map stores its Coordinates and its orientation and flip, which we draw turned and never flipped, and
// nothing else: it has no growth, no dying and no other state, unlike the plants). Read from the game's model for its
// measures and colours alone (numbers; no mesh or texture of the game's is used), in its local frame (x east, y up,
// z the map's y; its tile 0…1):
// - thirteen spikes standing out of the ground, eight tall ones (four-sided, 0.35 to 0.49 high) and five short ones
//   (three-sided, about 0.18), dark at their foot and paling to their points;
// - thin branches between them, each forked into twigs, reaching 0.54 high and up to 0.19 past the tile: the game's
//   are flat cards cut out by their texture, ours are their longest twigs (one or two of each branch, those longer than
//   0.15), each a thin three-sided cone from the branch's foot to its end, so the bush reads as the game's from every
//   side.
// The game's colours (palette.ts `THORNS`): its texture's albedo, a little metallic, folded for our light as the relics'
// is, in the game's light (materials.ts `gameObjectLight`). Its shadow is its model's in High (shadows.ts); Standard's
// bake casts none: the game's is a lattice of thin twigs and spikes, nowhere darker than 0.45 over half a tile (the
// bake's own sample), and the best upright discs, all the bake draws, share no more than 0.28 of their union with
// its model's shadow round the compass.

import { THORNS, type Rgb } from "./palette";
import { across, add, dot, Parts, sub, unit, type V } from "./relicParts";

/** The spikes: each one's point and the corners of its foot, round it. */
const SPIKES: [V, V[]][] = [
  [[0.066, 0.49, 0.265], [[0.002, -0.036, 0.377], [0.049, -0.03, 0.259], [0.121, -0.039, 0.423], [0.167, -0.033, 0.305]]],
  [[0.77, 0.493, 0.348], [[0.605, -0.019, 0.404], [0.668, -0.024, 0.503], [0.704, -0.019, 0.342], [0.767, -0.023, 0.44]]],
  [[0.391, 0.483, 0.465], [[0.236, -0.02, 0.395], [0.297, -0.02, 0.488], [0.33, -0.016, 0.334], [0.39, -0.016, 0.428]]],
  [[0.112, 0.468, 0.914], [[0.138, -0.041, 0.84], [0.209, -0.034, 0.762], [0.217, -0.05, 0.911], [0.288, -0.043, 0.833]]],
  [[0.436, 0.438, 0.648], [[0.402, -0.02, 0.777], [0.414, -0.02, 0.675], [0.503, -0.024, 0.789], [0.516, -0.024, 0.688]]],
  [[0.45, 0.422, -0.046], [[0.427, -0.044, 0.015], [0.442, -0.024, 0.113], [0.527, -0.044, -0.001], [0.542, -0.024, 0.097]]],
  [[0.839, 0.42, 0.941], [[0.707, -0.014, 0.848], [0.765, -0.033, 0.926], [0.787, -0.011, 0.79], [0.845, -0.03, 0.868]]],
  [[1.004, 0.35, 0.286], [[0.884, -0.016, 0.344], [0.918, -0.018, 0.435], [0.974, -0.02, 0.31], [1.009, -0.022, 0.4]]],
  [[1.027, 0.187, 0.659], [[0.878, -0.012, 0.64], [0.913, -0.009, 0.732], [0.975, -0.016, 0.656]]],
  [[0.006, 0.184, 0.678], [[0.071, -0.03, 0.68], [0.083, -0.02, 0.587], [0.135, 0.026, 0.647]]],
  [[0.761, 0.19, 0.101], [[0.749, 0.014, 0.198], [0.768, -0.029, 0.12], [0.835, -0.015, 0.183]]],
  [[0.426, 0.174, 1.026], [[0.424, -0.008, 0.9], [0.454, -0.015, 0.986], [0.514, -0.011, 0.917]]],
  [[0.251, 0.169, 0.144], [[0.237, -0.025, 0.197], [0.286, -0.001, 0.137], [0.314, -0.003, 0.214]]],
];
/** The branches: each one's foot, its half width there, and the ends of its longest twigs (one or two). */
const TWIGS: [V, number, V[]][] = [
  [[0.786, 0.014, 0.864], 0.050, [[0.989, 0.506, 1.005], [0.637, 0.42, 0.953]]],
  [[0.477, 0.02, 0.047], 0.050, [[0.657, 0.54, 0.015], [0.272, 0.365, -0.179]]],
  [[0.94, 0.004, 0.368], 0.050, [[1.071, 0.471, 0.054], [0.945, 0.416, 0.503]]],
  [[0.193, 0.043, 0.857], 0.050, [[-0.107, 0.49, 0.961], [0.396, 0.326, 0.841]]],
  [[0.714, 0.266, 0.521], 0.037, [[0.909, 0.509, 0.554], [0.735, 0.44, 0.742]]],
  [[0.194, 0.002, 0.839], 0.050, [[0.126, 0.338, 1.171], [0.114, 0.325, 0.823]]],
  [[0.943, 0.027, 0.371], 0.048, [[0.819, 0.431, 0.239], [1.154, 0.262, 0.376]]],
  [[0.363, 0.225, 0.415], 0.028, [[0.522, 0.465, 0.183], [0.204, 0.369, 0.235]]],
  [[0.252, 0.229, 0.463], 0.032, [[0.273, 0.454, 0.66], [0.087, 0.409, 0.526]]],
  [[0.694, 0.271, 0.362], 0.030, [[0.506, 0.508, 0.093], [0.581, 0.327, 0.524]]],
  [[0.014, 0.29, 0.368], 0.027, [[-0.195, 0.448, 0.271], [-0.028, 0.175, 0.153]]],
  [[0.089, 0.147, 0.387], 0.028, [[0.267, 0.422, 0.343], [0.254, 0.395, 0.497]]],
  [[0.405, 0.21, 0.689], 0.034, [[0.143, 0.397, 0.689], [0.462, 0.291, 0.887]]],
  [[0.485, 0.173, 0.68], 0.025, [[0.719, 0.382, 0.84], [0.588, 0.201, 0.873]]],
  [[0.767, 0.244, 0.375], 0.033, [[0.848, 0.474, 0.265], [0.977, 0.389, 0.367]]],
  [[0.358, 0.236, 0.454], 0.038, [[0.333, 0.368, 0.716], [0.393, 0.392, 0.543]]],
  [[0.541, 0.247, 0.6], 0.024, [[0.606, 0.366, 0.504], [0.436, 0.196, 0.694]]],
  [[0.085, 0.253, 0.255], 0.026, [[0.248, 0.363, 0.149]]],
  [[0.758, 0.082, 0.154], 0.023, [[0.66, 0.19, 0.2]]],
  [[0.444, 0.065, 0.998], 0.023, [[0.396, 0.101, 1.135]]],
  [[0.795, 0.096, 0.139], 0.020, [[0.887, 0.231, 0.119]]],
  [[0.467, 0.092, 0.977], 0.018, [[0.548, 0.231, 1.003]]],
];

/** A twig's sides: three, enough for a cone at most 0.05 thick at its foot. */
const TWIG_SIDES = 3;

/** The thorns' triangles (our frame: centred on its tile's middle, x east, y up, z south), each turned so its front
 *  faces out, with each corner's colour: the spikes graded from their foot's colour to their points' (`THORNS.foot`
 *  and `THORNS.point`, whose mean over a spike's sides is the game's), the twigs one colour. */
export function thornsParts(): { points: number[]; colours: number[] } {
  const m = new Parts([0.5, 0.5]);
  const points: number[] = [];
  const colours: number[] = [];
  const flush = (corner: (p: number[]) => Rgb) => {
    for (const [, tris] of m.byColour)
      for (let k = 0; k < tris.length; k += 3) {
        points.push(tris[k], tris[k + 1], tris[k + 2]);
        colours.push(...corner([tris[k], tris[k + 1], tris[k + 2]]));
      }
    m.byColour.clear();
  };
  // the spikes, their points pale
  for (const [point, foot] of SPIKES) {
    const mid = foot.reduce((s, p) => add(s, p, 1 / foot.length), [0, 0, 0] as V);
    const axis = unit(sub(point, mid));
    const [a, b] = across(axis);
    const round = [...foot].sort((p, q) => Math.atan2(dot(sub(p, mid), b), dot(sub(p, mid), a)) - Math.atan2(dot(sub(q, mid), b), dot(sub(q, mid), a)));
    for (let k = 0; k < round.length; k++) m.face([round[k], round[(k + 1) % round.length], point], THORNS.foot, mid);
    const top = m.ours(point);
    flush((p) => (Math.abs(p[0] - top[0]) + Math.abs(p[1] - top[1]) + Math.abs(p[2] - top[2]) < 1e-9 ? THORNS.point : THORNS.foot));
  }
  // the twigs
  for (const [foot, r, ends] of TWIGS)
    for (const end of ends) {
      const axis = unit(sub(end, foot));
      const [a, b] = across(axis);
      const ring = Array.from({ length: TWIG_SIDES }, (_, k) => {
        const t = (k * 2 * Math.PI) / TWIG_SIDES;
        return add(add(foot, a, r * Math.cos(t)), b, r * Math.sin(t));
      });
      for (let k = 0; k < TWIG_SIDES; k++) m.face([ring[k], ring[(k + 1) % TWIG_SIDES], end], THORNS.twig, foot);
    }
  flush(() => THORNS.twig);
  return { points, colours };
}
