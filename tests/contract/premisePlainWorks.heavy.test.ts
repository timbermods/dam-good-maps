// The poisoned floodplain's two proofs (docs/design/poisoned-floodplain.md §7 "proof", §9 row 4) on seeds 1 and 2 at
// 128², 192² and 256²: each map made, its works passing every blocking check by number, then the turn's dam and the
// river in's weir built as operations on the settled map's session and the core's water and soil read.
// `turn.proved` (no red water on the valley's floor or over the Red Fall's lip, red water at the Dry Fork's edge, no
// new water on the floor, the start's ground or the map's edge away from the Dry Fork's end) on every one.
// `riverIn.proved` (planning's ruling of 2026-11-17: the floor 60 % green or more and three times day 1's, 90 % of the
// dry floor left ditchable from the new course, the start's ground dry) holds on the maps in `RIVER_IN_PROVED` today;
// every map is 60 % green or more (the generator draws again under it, `riverIn.green`), and the rest fall short on
// the ditchable share or on three times day 1 (the design's §10), so there the test holds the green, the start dry, and
// prints the shares. The start's numbers are printed first, as planning asks every map report to open.

import { describe, expect, it } from "vitest";
import { plainMap } from "../../src/core/premise/plainMap";
import { plainProof, RIVER_IN } from "../../src/core/premise/plainProof";
import { makeSpec } from "../../src/core/spec/mapspec";

/** The maps, seed at side, whose river in is proved today (step 4's table, the design's §10). */
const RIVER_IN_PROVED = new Set<string>(["1@192"]);

describe("The poisoned floodplain's two proofs on seeds 1 and 2 at each size", () => {
  for (const side of [128, 192, 256])
    for (const seed of [1, 2])
      it(`turns the red water and brings the river in: seed ${seed} at ${side}²`, () => {
        const spec = makeSpec({ seed, size: { x: side, y: side }, theme: "any", premise: "any" });
        const m = plainMap(spec);
        if ("reason" in m) throw new Error(m.reason);
        const st = Object.entries(m.start).map(([k, v]) => `${k.slice(6)} ${v.value}/${v.limit}`).join(", ");
        const pf = plainProof(spec, m);
        if (!pf) throw new Error("no works to build");
        const pc = (v: number) => `${(100 * v).toFixed(1)} %`;
        console.log(
          `  seed ${seed} at ${side}²: start ${st}; attempt ${m.attempt + 1}; dead ${pc(pf.before.bands.dead)} → ${pc(pf.turn.bands.dead)}; green ${pc(pf.before.bands.green)} → ${pc(pf.turn.bands.green)} → ${pc(pf.riverIn.bands.green)}; turn red ${pf.turn.red}, lip ${pf.turn.lip}, fork ${pf.turn.fork}, leaks ${pf.turn.leaks}; river in start ${pf.riverIn.start}, plain sheet ${pf.riverIn.plain}, ditchable ${pc(pf.riverIn.ditchable)} (from any clean water ${pc(pf.riverIn.ditchableClean)}); ${pf.ms} ms`,
        );
        expect(m.held).toBe(true);
        expect(m.works.filter((f) => f.id !== "works.paid")).toEqual([]);
        const key = `${seed}@${side}`;
        expect(pf.turn.lip).toBe(0);
        expect(pf.turn.fork).toBeGreaterThan(0);
        expect(pf.turn.leaks).toBe(0);
        expect(pf.turn.ok).toBe(true);
        // (the dead band clears: under 1 % of the floor stays poisoned)
        expect(pf.turn.bands.dead).toBeLessThan(0.01);
        expect(pf.riverIn.start).toBe(0);
        expect(pf.riverIn.bands.green).toBeGreaterThan(pf.turn.bands.green);
        expect(pf.riverIn.bands.green).toBeGreaterThanOrEqual(RIVER_IN.green);
        expect(pf.riverIn.ok).toBe(RIVER_IN_PROVED.has(key));
      });
});
