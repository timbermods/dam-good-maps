// The poisoned floodplain's water on the sheet's six (docs/design/poisoned-floodplain.md §9 row 3): seeds 1 and 2 at
// 128², 192² and 256², each built and settled on its first attempt, passing the start's checks and every settled
// invariant, the Red Fall one whole curtain of its height less the veil's half level as the settled water stands (the
// shared fall judge, `src/core/premise/curtain.ts`, the settled invariant `fall.whole`). The start's numbers are
// printed first, then the bands, as planning asks every map report to open. Seed 1 at 128² holds on a later attempt
// since planning's ruling of 2026-11-17 moved the slough (`LATER`: its first land's day-1 dead band is 7.6 % of the
// floor, under 8 %, `plain.bands`); there the test holds the map and every check, and prints what refused the first.

import { describe, expect, it } from "vitest";
import { plainMap } from "../../src/core/premise/plainMap";
import { makeSpec } from "../../src/core/spec/mapspec";

/** The sheet's maps that hold on a later attempt today (the design's §10). */
const LATER = new Set(["1@128"]);

describe("The poisoned floodplain's water on seeds 1 and 2 at each size", () => {
  for (const side of [128, 192, 256])
    for (const seed of [1, 2])
      it(`holds on its first attempt: seed ${seed} at ${side}²`, () => {
        const m = plainMap(makeSpec({ seed, size: { x: side, y: side }, theme: "any", premise: "any" }));
        if ("reason" in m) throw new Error(m.reason);
        const st = Object.entries(m.start).map(([k, v]) => `${k.slice(6)} ${v.value}/${v.limit}`).join(", ");
        const s = m.settled;
        console.log(`  seed ${seed} at ${side}²: start ${st}; dead ${s.bands.dead.toFixed(3)}, green ${s.bands.green.toFixed(3)}, dry ${s.bands.dry.toFixed(3)}; sources ${JSON.stringify(s.sources)}; leaks ${s.leaks.tiles}; fall ${s.fall.drop.toFixed(2)}; ${m.ms.total} ms`);
        expect(m.held).toBe(true);
        if (LATER.has(`${seed}@${side}`)) console.log(`  first attempt refused by ${m.failed[0]}`);
        else {
          expect(m.failed).toEqual([]);
          expect(m.attempt).toBe(0);
        }
        for (const [id, n] of Object.entries(m.start)) expect(n.ok, `${id} ${n.value}/${n.limit}`).toBe(true);
        expect(m.settledFails).toEqual([]);

        // the Red Fall one whole curtain as the settled water stands (`fall.whole`, `redFallCurtain`: the shared fall judge)
        expect(m.settled.curtain.ok, m.settled.curtain.note).toBe(true);
      });
});
