// The ground Naturalize leaves alone (PLAN §20 D368 (8)): what must not change for the map to stay
// correct. Water sources and badwater sources stand on their tiles and objects need their footprint's
// ground as it is (a mine site, a geothermal field, a relic, a blockage, a thorn). Trees, bushes,
// ruin columns and slopes are not kept: the build places them on whatever ground is there, and a slope
// the weathering leaves joining nothing is dropped. The start's pad is the build's own (`inBench`).

import { FOOTPRINTS, footprintTiles, type Orientation } from "../../format/footprints";
import type { Runs } from "../../math/grid";

/** What stands on the ground: a template and where (an `EntitySpec` fits). */
export interface StandingObject {
  template: string;
  x: number;
  y: number;
  orientation: Orientation;
  flipped?: boolean;
}

/** Things the build places on whatever ground is there: not kept. */
const PLACED_ON_ANY_GROUND = /^(Pine|Birch|Oak|Maple|ChestnutTree|Mangrove|Succulent|BlueberryBush|Slope|RuinColumnH\d+|StartingLocation)$/;

/** The ground under every water source and every object (not plants, ruin columns or slopes), as runs
 *  [y, x0, x1], in row order; Naturalize leaves these tiles as they are. The start's pad is its own
 *  rule. */
export function groundUnderObjects(entities: readonly StandingObject[]): Runs {
  const rows = new Map<number, Set<number>>();
  for (const e of entities) {
    if (PLACED_ON_ANY_GROUND.test(e.template) || !FOOTPRINTS[e.template]) continue;
    for (const [x, y] of footprintTiles(e.template, { template: e.template, x: e.x, y: e.y, z: 0, orientation: e.orientation, flipped: !!e.flipped })) {
      if (x < 0 || y < 0) continue;
      let row = rows.get(y);
      if (!row) rows.set(y, (row = new Set()));
      row.add(x);
    }
  }
  const out: Runs = [];
  for (const y of [...rows.keys()].sort((a, b) => a - b)) {
    const xs = [...rows.get(y)!].sort((a, b) => a - b);
    let a = xs[0];
    let b = a;
    for (let k = 1; k < xs.length; k++) {
      if (xs[k] === b + 1) b = xs[k];
      else {
        out.push([y, a, b]);
        a = b = xs[k];
      }
    }
    out.push([y, a, b]);
  }
  return out;
}
