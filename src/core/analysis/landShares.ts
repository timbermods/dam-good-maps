// The land's shares (MAPCRAFT section 4, the budgets): how much of the map is water, moist ground and dry ground, and
// the wood standing on it. Dry land is not a fault (irrigating it is the game), so the three are reported plainly.
// Headless: the page reads it from its copy of the map once the water has settled.

import { DEAD_TREES_KEEP_LOGS, LOGS_PER_TREE_SPECIES } from "../data/logFloor";

export interface LandShares {
  /** The map's tiles. */
  tiles: number;
  /** Tiles under water (clean or bad), with moist and dry ground: the three add up to `tiles`. */
  water: number;
  /** Tiles of moist ground not under water. */
  moist: number;
  /** Every other tile: dry ground, contaminated ground among it. */
  dry: number;
  /** Living trees that give logs, grown or young. */
  trees: number;
  /** The logs standing on the map: each grown tree's, living or dead where a dead tree keeps them (the checks' count). */
  logs: number;
}

/** A plant as the shares read it. */
export interface LandPlant {
  template: string;
  dead: boolean;
  young: boolean;
}

/** The land's shares of a map of `tiles` tiles: `wet(i)` says whether water stands on tile i, `moist(i)` whether its
 *  ground is moist; `plants` are the map's objects (those that give no logs are passed over). */
export function landShares(tiles: number, wet: (i: number) => boolean, moist: (i: number) => boolean, plants: Iterable<LandPlant>): LandShares {
  let water = 0;
  let green = 0;
  for (let i = 0; i < tiles; i++) {
    if (wet(i)) water++;
    else if (moist(i)) green++;
  }
  let trees = 0;
  let logs = 0;
  for (const p of plants) {
    const per = LOGS_PER_TREE_SPECIES[p.template];
    if (!per) continue;
    if (!p.dead) trees++;
    if (!p.young && (!p.dead || DEAD_TREES_KEEP_LOGS[p.template])) logs += per;
  }
  return { tiles, water, moist: green, dry: tiles - water - green, trees, logs };
}

/** The three shares as words, in the order water, moist, dry: whole per cents that add up to 100 ("26%", "40%",
 *  "34%"), with "under 1%" for a share that is there but rounds to none, and "0%" for none. */
export function shareWords(s: Pick<LandShares, "tiles" | "water" | "moist" | "dry">): [string, string, string] {
  const parts = [s.water, s.moist, s.dry];
  if (!s.tiles) return ["0%", "0%", "0%"];
  const exact = parts.map((n) => (n / s.tiles) * 100);
  const whole = exact.map(Math.floor);
  // (the largest remainders take the per cents the flooring left over)
  const order = exact.map((v, k) => [v - whole[k], k] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let left = 100 - whole.reduce((a, b) => a + b, 0), k = 0; left > 0; left--, k++) whole[order[k % 3][1]]++;
  return whole.map((w, k) => (w === 0 && parts[k] > 0 ? "under 1%" : `${w}%`)) as [string, string, string];
}
