// The land given back where a film's bed is not needed once a place's springs are searched (D537, D331: the real
// land changes only where the water needs it; tools/real-places.ts). The place and its build travel as one state, so
// the land comes back on the place as it stands after every step before (a start moved to water, its wood grown), never
// on an earlier one: the tool once passed the springs' search's place with the current build, and a kept raise would
// have put back the unmoved start.

import { decodeHeights, type PlaceData } from "../../src/core/places/place";
import { encodeHeights } from "./placeData";
import { films } from "./placeWater";
import { realMeasure } from "./placeFeeds";

/** A place's build as the beds' return reads it: its settled water and floor, and the checks of the generate profile it
 *  fails (the tool's `buildChecked`). */
export interface BedBuild {
  built: { settle: { depth: ArrayLike<number> }; model: { floor: ArrayLike<number> } };
  strictFails: string[];
}

/** A place and its build. */
export interface BedState<C extends BedBuild> {
  place: PlaceData;
  r: C;
}

/**
 * The beds' tiles one level up again, all at once, else bed by bed, the last cut first, each kept where no film above
 * floor 0 stands, the water over real water is held, the water over real dry land does not grow, no more sources stand
 * in another's flow (`inFlow`) and nothing the place passed then fails. `build` builds and checks a candidate; `real`
 * marks the observed water. Returns the state, raised where kept, and how many beds came back.
 */
export function unneededBeds<C extends BedBuild>(state: BedState<C>, beds: readonly (readonly number[])[], deps: { real: Uint8Array; build: (p: PlaceData) => C; inFlow: (p: PlaceData) => number }): BedState<C> & { back: number } {
  if (!beds.length) return { ...state, back: 0 };
  const flow = deps.inFlow(state.place);
  let cur = state.place;
  let r = state.r;
  let m = realMeasure(r.built.settle.depth, deps.real);
  const tryUp = (tiles: readonly (readonly number[])[]): boolean => {
    const h = decodeHeights(cur.heights).slice();
    for (const bed of tiles) for (const i of bed) h[i] += 1;
    const cand = { ...cur, heights: encodeHeights(h) };
    const c = deps.build(cand);
    const mm = realMeasure(c.built.settle.depth, deps.real);
    const filmed = films(c.built.settle.depth, c.built.model.floor, cand.W, cand.H).some((f) => f.floor0 * 2 <= f.tiles.length);
    if (filmed || mm.real < m.real || mm.dry > m.dry || deps.inFlow(cand) > flow || c.strictFails.some((id) => !r.strictFails.includes(id))) return false;
    cur = cand;
    r = c;
    m = mm;
    return true;
  };
  let back = 0;
  if (tryUp(beds)) back = beds.length;
  else for (let k = beds.length - 1; k >= 0; k--) if (tryUp([beds[k]])) back++;
  return { place: cur, r, back };
}
