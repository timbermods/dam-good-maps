// Which plants a held drought or badtide day has surely killed (the Weather view's visible seasons, D250 (1), D286 (4)),
// by the game's rules, not the map editor's instant one (investigation/notes/water_and_soil.md Q4; docs/FINDINGS.md
// "Soil and plants"):
//
// - Dryness starts a timer of `DaysToDieDry × U(0.9, 1.1)` days when the tile's moisture is 0; it resets in full when
//   moisture returns. A plant is shown dead once the tile's run of dry days has reached 1.1 × `DaysToDieDry`, the longest
//   the timer can be: nothing shows dead that might live (Kyler's forces-play call, D484). Succulents are exempt (they
//   die if moist instead; not worked out here).
// - Soil contamination above 0 kills any plant, succulents included, in 0.2 to 0.3 days: dead if the tile was
//   contaminated on any day of the hazard.
// - Death is permanent: a plant dead on one day is dead on every later day, whatever the ground does after.
//
// Pure: it reads the soil each kept day gives (day 0 the map's own) and says which plants are dead on the last of them. The
// map, the water and the plants themselves are never touched; the view draws them withered.

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

/** The plants that are dead by the last of `days` (`days[0]` the map's own soil, day 0; `days[k]` the soil of day k):
 *  1 for each plant of `plants`, in its order, that is, else 0. Nothing is dead on day 0. */
export function witheredByDay(days: readonly DaySoil[], plants: readonly Plant[]): Uint8Array {
  const dead = new Uint8Array(plants.length);
  const last = days.length - 1;
  if (last < 1) return dead;
  plants.forEach((p, n) => {
    const limit = DAYS_TO_DIE_DRY[p.template] === undefined ? Infinity : SURELY_DEAD * DAYS_TO_DIE_DRY[p.template];
    // the first sample of the dry run now running (a lower bound of its length is the samples since)
    let dryFrom = -1;
    for (let k = 0; k <= last; k++) {
      const soil = days[k];
      if (k >= 1 && soil.contamination[p.tile] > 0) return void (dead[n] = 1);
      if (soil.moisture[p.tile] > 0) dryFrom = -1;
      else if (dryFrom < 0) dryFrom = k;
      if (dryFrom >= 0 && k - dryFrom >= limit) return void (dead[n] = 1);
    }
  });
  return dead;
}
