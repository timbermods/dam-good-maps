// The beds' land given back after a place's springs are searched (tools/lib/placeBeds.ts, D537, D331): on a
// made-up place and build, so the rule is seen alone.

import { describe, expect, it } from "vitest";
import { unneededBeds, type BedBuild } from "../../tools/lib/placeBeds";
import { encodeHeights, encodeTiles } from "../../tools/lib/placeData";
import { decodeHeights, type PlaceData } from "../../src/core/places/place";

const W = 10;
const H = 10;
/** A level-2 place with a bed of three tiles cut to level 1, its start at `start` and pines on `pines`. */
function placeWith(start: [number, number], pines: number[]): { place: PlaceData; bed: number[] } {
  const h = new Uint8Array(W * H).fill(2);
  const bed = [4 * W + 1, 4 * W + 2, 4 * W + 3];
  for (const i of bed) h[i] = 1;
  const place = { format: 1, id: "test", name: "Test", W, H, heights: encodeHeights(h), sources: [[2, 4, 1]], start, pines: encodeTiles(pines) } as unknown as PlaceData;
  return { place, bed };
}
/** A build that keeps no water, so a raise is always allowed; it records each place it builds. */
function builder() {
  const built: PlaceData[] = [];
  const build = (p: PlaceData): BedBuild => {
    built.push(p);
    return { built: { settle: { depth: new Float64Array(W * H) }, model: { floor: new Float64Array(W * H) } }, strictFails: [] };
  };
  return { built, build };
}

describe("the beds' land comes back on the place as it stands (tools/lib/placeBeds.ts)", () => {
  it("a start moved to water after the springs' search keeps its spot and its grown wood", () => {
    // the search left the start at 1,1; the step after it moved the start to 6,6 and planted pines by it
    const { place: moved, bed } = placeWith([6, 6], [5 * W + 8, 6 * W + 8]);
    const { built, build } = builder();
    const had = build(moved);
    const out = unneededBeds({ place: moved, r: had }, [bed], { real: new Uint8Array(W * H), build, inFlow: () => 0 });
    expect(out.back).toBe(1);
    expect(decodeHeights(out.place.heights).filter((v, i) => bed.includes(i) && v === 2)).toHaveLength(3);
    expect(out.place.start).toEqual([6, 6]);
    expect(out.place.pines).toEqual(moved.pines);
    // every candidate was built from the moved place, never from an earlier one
    for (const p of built) expect(p.start).toEqual([6, 6]);
  });

  it("a raise that costs a check the place passed is not kept", () => {
    const { place, bed } = placeWith([6, 6], []);
    const real = new Uint8Array(W * H);
    const build = (p: PlaceData): BedBuild => ({
      built: { settle: { depth: new Float64Array(W * H) }, model: { floor: new Float64Array(W * H) } },
      strictFails: p === place ? [] : ["start.water"],
    });
    const out = unneededBeds({ place, r: build(place) }, [bed], { real, build, inFlow: () => 0 });
    expect(out.back).toBe(0);
    expect(out.place).toBe(place);
  });
});
