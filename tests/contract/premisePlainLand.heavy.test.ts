// The poisoned floodplain's land on the sheet's six (docs/design/poisoned-floodplain.md §9 row 2): seeds 1 and 2 at
// 128², 192² and 256², each holding every land invariant and the start, its gulch found in the relief and mended by
// taking ground away only, within 4 % of the map. The start's numbers and the bands are printed, as planning asks every
// map report to open.

import { describe, expect, it } from "vitest";
import { MEND, plainBands, plainLand, plainStart } from "../../src/core/premise/plainLand";
import { plainOf } from "../../src/core/premise/premises/poisonedPlain";
import { makeSpec } from "../../src/core/spec/mapspec";

describe("The poisoned floodplain's land on seeds 1 and 2 at each size", () => {
  for (const side of [128, 192, 256])
    for (const seed of [1, 2])
      it(`holds: seed ${seed} at ${side}²`, () => {
        const land = plainLand(makeSpec({ seed, size: { x: side, y: side }, theme: "any", premise: "any" }));
        if ("reason" in land) throw new Error(land.reason);
        expect(land.landFails).toEqual([]);
        expect(land.frame.reason).toBeNull();
        expect(land.held).toBe(true);
        const p = plainOf(land.plan)!;
        expect(p.found).toBeDefined();
        expect(land.found.changed).toBeLessThanOrEqual(MEND.share * side * side);
        expect(p.gulch.mouth).toBe(Math.round(land.found.valley.mouth * 100) / 100);
        const st = plainStart(land.plan, land.water, land.heights, land.relief.floor, land.frame);
        const b = plainBands(land.plan, land.water, land.heights, land.relief.floor);
        console.log(`  seed ${seed} at ${side}²: start ${JSON.stringify(st)}; floor ${b.floor.toFixed(2)}, dead ${b.dead.toFixed(2)}, green ${b.green.toFixed(2)}, dry ${b.dry.toFixed(2)}, M ${b.M.toFixed(1)}; mend ${land.found.changed}`);
      });
});
