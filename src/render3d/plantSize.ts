// A plant's size as the game draws it (D135 as amended 2026-10-29: models at the game's shape, size and colour, made by
// us, D178). Our living models are built at the size of the game's grown model (PineMature 3.01 tall and 1.2 wide,
// BirchMature 1.92 and 1.0, OakMature 2.26 and 1.7, BlueberryBushMature 0.40 and 1.1, read from resources.assets),
// and each plant is scaled as the game's `NaturalResourceModelRandomizer` scales it: a height factor and a width factor
// drawn from the species' ranges (the same one for both where it keeps proportion). Pure TypeScript.

export interface Randomizer {
  height: readonly [number, number];
  width: readonly [number, number];
  /** One factor for both (`ConstrainProportion`). */
  constrain: boolean;
}

/** Blueprints' `NaturalResourceModelRandomizerSpec`. */
export const RANDOMIZER: Readonly<Record<string, Randomizer>> = {
  Pine: { height: [0.8, 1.0], width: [0.9, 1.1], constrain: false },
  Birch: { height: [0.7, 1.0], width: [0.9, 1.1], constrain: false },
  Oak: { height: [0.9, 1.1], width: [0.9, 1.1], constrain: true },
  BlueberryBush: { height: [0.8, 1.2], width: [0.8, 1.2], constrain: false },
};

/** A plant's width and height factors from two uniform draws in [0, 1) (`u` the height's, `v` the width's): the game's
 *  ranges for the species, or 1 for one without. */
export function plantScale(template: string, u: number, v: number): { width: number; height: number } {
  const r = RANDOMIZER[template];
  if (!r) return { width: 1, height: 1 };
  const height = r.height[0] + (r.height[1] - r.height[0]) * u;
  const width = r.constrain ? height : r.width[0] + (r.width[1] - r.width[0]) * v;
  return { width, height };
}
