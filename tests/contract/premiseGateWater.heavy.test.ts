// The wall with one gate's stage 1 water settled as the game plays it (docs/PREMISES.md §5.1): seeds 1 to 3 at 128² and
// seed 1 at 192² and 256², each on its rastered water with the ground stage 1 did not draw standing over every water
// (`gateSettleModel`). The lake stands 0.05 to 0.6 over its sill (the lake stair's `stair.settled`), the cleft and the
// springs' tarns where the table puts them, the Still Pool at its lake's level, the Veil pours one curtain of its height
// less `VEIL_SHORT`, the Gate and the leat are dry past their bars, no water strays off the planned water, and the
// valley's water leaves the map by the Low River alone: what leaves is what the springs give.

import { describe, expect, it } from "vitest";
import { gateFirstWater } from "../../src/core/premise/gateWater";
import { wallGate } from "../../src/core/premise/premises/wallGate";
import { makeSpec } from "../../src/core/spec/mapspec";
import { settleGate } from "./gateSettle";

const TABLE_SLACK = 0.25;
const STRAY = 0.003;

describe("The wall with one gate's stage 1 water, settled", () => {
  for (const [side, seed] of [[128, 1], [128, 2], [128, 3], [192, 1], [256, 1]])
    it(`stands where the plan puts it, pours the Veil and leaves by the Low River alone: seed ${seed} at ${side}²`, () => {
      const spec = makeSpec({ seed, size: { x: side, y: side }, theme: "any", premise: "any" });
      const r = gateFirstWater(wallGate, spec);
      if ("reason" in r) throw new Error(r.reason);
      const s = settleGate(r.plan, r.water);
      const at = (id: string) => s.levels.find((l) => l.id === id)!;
      const lake = at("lake");
      expect(lake.level - lake.sill, "the lake over its sill").toBeGreaterThanOrEqual(0.05);
      expect(lake.level - lake.sill, "the lake over its sill").toBeLessThanOrEqual(0.6);
      for (const l of s.levels) {
        if (l.id === "lake") continue;
        // (the cleft pours over the Veil's lip as a lake over its sill: the table reads the Veil's mouth as a channel
        // its own width, which stage 1 widens to the lip, and puts the pool half a level higher than it settles)
        if (l.id === "pool") {
          expect(l.level - l.sill, "the cleft over its lip").toBeGreaterThanOrEqual(0.05);
          expect(l.level - l.sill, "the cleft over its lip").toBeLessThanOrEqual(0.6);
          continue;
        }
        // (the Still Pool stands at its lake's level: the table's reading of a body with no way out is its sill)
        const want = l.id === "kettle" ? lake.level : l.table;
        expect(Math.abs(l.level - want), `${l.id}: settled ${l.level.toFixed(2)}, want ${want.toFixed(2)}`).toBeLessThanOrEqual(TABLE_SLACK);
      }
      expect(s.veil.ok, `the Veil: ${s.veil.note}`).toBe(true);
      expect(s.veil.pouring, "the Veil's wet lip").toBeGreaterThanOrEqual(9);
      expect(s.gateWet, "the Gate past its bar").toBe(0);
      expect(s.leatWet, "the leat past its bar").toBe(0);
      expect(s.stray / (side * side), `${s.stray} tiles off the planned water`).toBeLessThan(STRAY);
      expect(s.edge, "water on the map's edge but the Low River's").toBe(0);
      expect(Math.abs(s.out / s.sources - 1), `out ${s.out.toFixed(2)} of ${s.sources.toFixed(2)}`).toBeLessThan(0.05);
      console.log(`seed ${seed} at ${side}²: ${s.ms.toFixed(0)} ms; ${s.levels.map((l) => `${l.id} ${l.level.toFixed(2)}`).join(", ")}; the Veil ${s.veil.note}; out ${s.out.toFixed(2)} of ${s.sources.toFixed(2)}`);
    });
});
