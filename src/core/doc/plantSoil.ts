// Whether a plant lives on the ground it is put on (PLAN §20 D235, D342): a plain core question the page asks for
// its warning ("dry ground: these will die") before a stroke is painted. It is the check's own rule, the one
// `plants.survive` applies (rust/checks/src/playability.rs, "plants survive"): a living tree or bush needs moist,
// clean ground with no water on it at all (any depth), a living succulent dies on moist ground. Painting is never
// refused for it. tests/contract/plantSoil.test.ts compares this with the check's flagged plants on a built map.

/** The map's ground, tile by tile: the build's `moisture`, `soilContamination` and the settled water's depth. */
export interface PlantGround {
  moisture: ArrayLike<number>;
  contamination: ArrayLike<number>;
  /** The water on the tile, blocks deep (0: none). */
  depth: ArrayLike<number>;
}

/** Whether a living plant of `template` on tile `i` is on ground that kills it, as `plants.survive` counts it:
 *  trees and bushes on dry, contaminated or watered ground, a succulent on moist ground. */
export function diesOnSoil(template: string, g: PlantGround, i: number): boolean {
  if (template === "Succulent") return g.moisture[i] > 0;
  return !(g.moisture[i] > 0) || g.depth[i] > 0 || g.contamination[i] > 0;
}

/** The tiles among `tiles` where a plant of `template` would die. Tiles with water deep enough that nothing is
 *  planted there (over 0.05, the planting rule's) are left out: a stroke leaves them empty. */
export function dyingTiles(template: string, tiles: readonly number[], g: PlantGround): number[] {
  const out: number[] = [];
  for (const i of tiles) {
    if (i < 0 || i >= g.moisture.length) continue;
    if (g.depth[i] > 0.05) continue;
    if (diesOnSoil(template, g, i)) out.push(i);
  }
  return out;
}
