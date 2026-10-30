// Whether a plant lives on the ground it is put on (PLAN §20 D235, D342, D491): a plain core question the page asks
// for its warning ("dry ground: these will die") before a stroke is painted. It is the check's own rule, the one
// `plants.survive` applies (rust/checks/src/playability.rs, "plants survive"): a living tree or bush needs moist,
// clean ground with no water on it at all (any depth), a living succulent dies on moist ground. Under a roof (a
// cave's floor, the ground under a ledge) the ground is the run top the plant stands on, its own moisture,
// contamination and water (sim/soil.ts `runGround`): the game keeps one value per run top. Painting trees and bushes is never refused
// for it; a succulent stroke leaves such tiles empty (core/doc/paint.ts). tests/contract/plantSoil.test.ts compares this with the check's flagged plants on a built map.

import type { RunGround } from "../sim/soil";

/** Why a succulent is refused on moist ground: one wording for a stroke, a click and a move (D342). */
export const SUCCULENT_MOIST = "succulents die on moist ground: put them on dry ground";

/** The map's ground, tile by tile: the build's `moisture`, `soilContamination` and the settled water's depth; under a
 *  roof, the ground on each run top (`MapSession.runGrounds`). */
export interface PlantGround {
  moisture: ArrayLike<number>;
  contamination: ArrayLike<number>;
  /** The water on the tile, blocks deep (0: none). */
  depth: ArrayLike<number>;
  /** The ground on tile i's run top at level z (D491), null where no run's top is z. */
  runs?: ((i: number, z: number) => RunGround | null) | null;
}

/** Whether a living plant of `template` on ground with this moisture, contamination and water dies, as
 *  `plants.survive` counts it: trees and bushes on dry, contaminated or watered ground, a succulent on moist ground. */
function dies(template: string, moisture: number, contamination: number, depth: number): boolean {
  if (template === "Succulent") return moisture > 0;
  return !(moisture > 0) || depth > 0 || contamination > 0;
}

/** Whether a living plant of `template` on tile `i` is on ground that kills it, as `plants.survive` counts it. `z`: the
 *  level it stands on under a roof (D491), where its run top's ground decides (none there: dry, clean ground, as the
 *  checks read it). */
export function diesOnSoil(template: string, g: PlantGround, i: number, z?: number): boolean {
  if (z !== undefined && g.runs) {
    const r = g.runs(i, z);
    return r ? dies(template, r.moisture, r.contamination, r.depth) : dies(template, 0, 0, 0);
  }
  return dies(template, g.moisture[i], g.contamination[i], g.depth[i]);
}

/** The tiles among `tiles` where a plant of `template` would die. Tiles with water deep enough that nothing is
 *  planted there (over 0.05, the planting rule's) are left out: a stroke leaves them empty. `levels`: the level a
 *  tile paints at under a roof (D491, `PaintParams.levels`), where its run top's ground decides; such a tile with no
 *  ground at that level, or on ground whose runs aren't known (`g.runs`), is left out: nothing is planted there. */
export function dyingTiles(template: string, tiles: readonly number[], g: PlantGround, levels?: ReadonlyMap<number, number>): number[] {
  const out: number[] = [];
  for (const i of tiles) {
    if (i < 0 || i >= g.moisture.length) continue;
    const z = levels?.get(i);
    if (z !== undefined) {
      const r = g.runs?.(i, z);
      if (r && !(r.depth > 0.05) && dies(template, r.moisture, r.contamination, r.depth)) out.push(i);
      continue;
    }
    if (g.depth[i] > 0.05) continue;
    if (diesOnSoil(template, g, i)) out.push(i);
  }
  return out;
}
