// Which plants a held drought or badtide day has surely killed (the Weather view's visible seasons, D250 (1), D286 (4)),
// by the game's rules, not the map editor's instant one (investigation/notes/water_and_soil.md Q4; docs/FINDINGS.md
// "Soil and plants"):
//
// - Dryness starts a timer of `DaysToDieDry × U(0.9, 1.1)` days when the tile's moisture is 0; it resets in full when
//   moisture returns. A plant is shown dead once the tile's run of dry days has reached 1.1 × `DaysToDieDry`, the longest
//   the timer can be: nothing shows dead that might live (Kyler's forces-play call, D484). Succulents are exempt (they
//   die if moist instead; not worked out here).
// - Soil contamination above 0 kills any plant, succulents included, after 0.2 to 0.3 days of it without a break
//   (NaturalResourcesContamination: it resets if the contamination leaves first): dead once the tile has been
//   contaminated on two days running (a lower bound of a day, past the 0.3 longest), counted from day 1.
// - Death is permanent: a plant dead on one day is dead on every later day, whatever the ground does after.
//
// Pure: it reads the soil each kept day gives (day 0 the map's own) and says which plants are dead on the last of them. The
// map, the water and the plants themselves are never touched; the view draws them withered.
//
// Which living plants are dying now (`dyingCause`), as the game shows them: each plant has three models, alive, dying and
// dead (`NaturalResourceLifecycleModel`: `#Dying` while `DyingNaturalResource.IsDying` and not dead), and it is dying
// while any of its timers runs, each from the moment its cause starts until the cause ends (the timer reset) or the plant
// dies. So it needs only the ground as it is now, on Day 0 as on any held day:
// - dry: a watered species (every land plant) on a tile whose moisture is 0 (`WateredNaturalResource`, `DryObject`);
// - wet: an arid species (the Succulent) on a moist tile (`AridNaturalResource`);
// - contaminated: soil contamination above 0, any species (`ContaminatedNaturalResource`);
// - out of its water band: water above the plant's base outside the species' `MinWaterHeight`..`MaxWaterHeight`
//   (`LivingWaterObject`: `WaterAboveBase = ceil(floor + depth) − z`, so any water at all on a land plant's tile floods
//   it; the Mangrove wants exactly 1).

/** The game's `DaysToDieDry` per species (blueprints `NaturalResources/*`, water_and_soil.md Q4). The Succulent has none. */
export const DAYS_TO_DIE_DRY: Readonly<Record<string, number>> = {
  Pine: 13,
  Birch: 11,
  Oak: 15,
  Maple: 12,
  ChestnutTree: 8,
  Mangrove: 6,
  BlueberryBush: 9,
  Dandelion: 8,
  CoffeeBush: 8,
};

/** The longest a dry timer can run, as a share of `DaysToDieDry` (U(0.9, 1.1)). */
export const SURELY_DEAD = 1.1;

/** Every species that withers (the Succulent only from contamination). */
export const WITHERING_SPECIES: ReadonlySet<string> = new Set([...Object.keys(DAYS_TO_DIE_DRY), "Succulent"]);

export interface Plant {
  /** The tile it stands on (y × width + x) and its template. */
  tile: number;
  template: string;
}

/** The soil of a day, as the view holds it: moisture and contamination per tile, above 0 where moist and poisoned. */
export interface DaySoil {
  moisture: ArrayLike<number>;
  contamination: ArrayLike<number>;
}

/** Each species' water band (blueprints `FloodableNaturalResourceSpec` `MinWaterHeight`, `MaxWaterHeight`). */
export const WATER_BAND: Readonly<Record<string, readonly [number, number]>> = {
  Pine: [0, 0],
  Birch: [0, 0],
  Oak: [0, 0],
  Maple: [0, 0],
  ChestnutTree: [0, 0],
  Mangrove: [1, 1],
  BlueberryBush: [0, 0],
  Dandelion: [0, 0],
  CoffeeBush: [0, 0],
  Succulent: [0, 0],
};

/** The ground under a plant now: its tile's soil at the plant's level, and the water above its base in whole levels
 *  (`ceil(floor + depth) − z` of the water standing on that ground, 0 with none). */
export interface PlantGround {
  moisture: number;
  contamination: number;
  waterAboveBase: number;
}

export type DyingCause = "contaminated" | "flooded" | "stranded" | "dry" | "wet";

/** Why a living plant of `template` on `ground` is dying now, or null when it is not (or the game has no such rule for
 *  it). The first cause that holds, in this order, when several do. */
export function dyingCause(template: string, ground: PlantGround): DyingCause | null {
  const band = WATER_BAND[template];
  if (!band) return null;
  if (ground.contamination > 0) return "contaminated";
  if (ground.waterAboveBase > band[1]) return "flooded";
  if (ground.waterAboveBase < band[0]) return "stranded";
  if (template === "Succulent") return ground.moisture > 0 ? "wet" : null;
  return ground.moisture > 0 ? null : "dry";
}

/** The water above a plant's base at level `z` on its tile, from the water standing on that ground (`floor` its bottom,
 *  `depth` its depth; NaN or a floor at another level: none). */
export function waterAboveBase(z: number, floor: number, depth: number): number {
  if (!(depth > 0) || Math.round(floor) !== z) return 0;
  return Math.ceil(floor + depth) - z;
}

/** The plants that are dead by the last of `days` (`days[0]` the map's own soil, day 0; `days[k]` the soil of day k):
 *  1 for each plant of `plants`, in its order, that is, else 0. Nothing is dead on day 0. */
export function witheredByDay(days: readonly DaySoil[], plants: readonly Plant[]): Uint8Array {
  const dead = new Uint8Array(plants.length);
  const last = days.length - 1;
  if (last < 1) return dead;
  plants.forEach((p, n) => {
    const limit = DAYS_TO_DIE_DRY[p.template] === undefined ? Infinity : SURELY_DEAD * DAYS_TO_DIE_DRY[p.template];
    // the first sample of the dry run now running, and of the contaminated run (a lower bound of a run's length is the
    // samples since its first)
    let dryFrom = -1;
    let badFrom = -1;
    for (let k = 0; k <= last; k++) {
      const soil = days[k];
      if (k >= 1 && soil.contamination[p.tile] > 0) {
        if (badFrom < 0) badFrom = k;
        else if (k - badFrom >= 1) return void (dead[n] = 1);
      } else badFrom = -1;
      if (soil.moisture[p.tile] > 0) dryFrom = -1;
      else if (dryFrom < 0) dryFrom = k;
      if (dryFrom >= 0 && k - dryFrom >= limit) return void (dead[n] = 1);
    }
  });
  return dead;
}
