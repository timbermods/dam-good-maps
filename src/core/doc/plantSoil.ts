// Whether a plant lives on the soil it is put on (PLAN §20 D235, D342): a plain core question the page asks for
// its warning ("dry ground: these will die") before a stroke is painted. It is the game's own rule, as the
// resource rasterizer keeps it (`features/raster/resources.ts`, `rasterizeForest`): a tree or bush lives only on
// moist, clean soil, a succulent only on dry, clean soil. Painting is never refused for it.

/** The soil of a map, tile by tile (the build's `moisture` and `soilContamination`, or the page's copy of them). */
export interface PlantSoil {
  moisture: ArrayLike<number>;
  contamination: ArrayLike<number>;
}

/** Whether a plant of `template` put on tile `i` would die for its soil: trees and bushes on dry or contaminated
 *  soil, a succulent on moist or contaminated soil. */
export function diesOnSoil(template: string, soil: PlantSoil, i: number): boolean {
  if (soil.contamination[i] > 0) return true;
  const moist = soil.moisture[i] > 0;
  return template === "Succulent" ? moist : !moist;
}

/** The tiles among `tiles` where a plant of `template` would die for its soil. Tiles under water (`depth` above
 *  0.05, the planting rule's) are left out: nothing is planted there. */
export function dyingTiles(template: string, tiles: readonly number[], soil: PlantSoil, depth?: ArrayLike<number> | null): number[] {
  const out: number[] = [];
  for (const i of tiles) {
    if (i < 0 || i >= soil.moisture.length) continue;
    if (depth && depth[i] > 0.05) continue;
    if (diesOnSoil(template, soil, i)) out.push(i);
  }
  return out;
}
