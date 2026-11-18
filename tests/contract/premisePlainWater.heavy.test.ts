// The poisoned floodplain's water on seeds 1 to 12 at 128², 192² and 256² (docs/design/poisoned-floodplain.md §9 row 3):
// every map holds, passing the start's checks and every settled invariant, the Red Fall one whole curtain of its height
// less the veil's half level as the settled water stands (the shared fall judge, `src/core/premise/curtain.ts`, the
// settled invariant `fall.whole`); and the maps that hold on their first attempt number `FIRST` or more at each size
// (planning's ruling on round 2, 2026-11-17: a floor on the count, never a list of excused seeds). The start's numbers
// are printed first, then the bands, as planning asks every map report to open; a map on a later attempt prints what
// refused its first. Each map is made once (`made`) and read by its own test and by the floor's, so the floor counts
// all twelve whichever tests run, in whatever order (step 5: it counted with a variable the seed tests shared, which a
// retry or a `-t` filter miscounted).

import { describe, expect, it } from "vitest";
import { plainMap, type PlainMap } from "../../src/core/premise/plainMap";
import { makeSpec } from "../../src/core/spec/mapspec";

const SEEDS = Array.from({ length: 12 }, (_, k) => k + 1);
/** First attempts of seeds 1 to 12 at least: 9 of 12 at 192² and 256² (planning's floor); at 128² the count as
 *  measured (the design's §10: the narrowest plain the side allows refuses the rest, each by its reason; 8 since
 *  step 5 mended the fixable refusals at their causes, 6 before). */
const FIRST: Record<number, number> = { 128: 8, 192: 9, 256: 9 };

/** Each seed's map at each side, made once. */
const maps = new Map<string, PlainMap | { reason: string; failed: string[] }>();
function made(seed: number, side: number): PlainMap | { reason: string; failed: string[] } {
  const key = `${seed}@${side}`;
  let m = maps.get(key);
  if (!m) maps.set(key, (m = plainMap(makeSpec({ seed, size: { x: side, y: side }, theme: "any", premise: "any" }))));
  return m;
}

describe("The poisoned floodplain's water on seeds 1 to 12 at each size", () => {
  for (const side of [128, 192, 256]) {
    for (const seed of SEEDS)
      it(`holds: seed ${seed} at ${side}²`, () => {
        const m = made(seed, side);
        if ("reason" in m) throw new Error(m.reason);
        const st = Object.entries(m.start).map(([k, v]) => `${k.slice(6)} ${v.value}/${v.limit}`).join(", ");
        const s = m.settled;
        console.log(`  seed ${seed} at ${side}²: start ${st}; attempt ${m.attempt + 1}; dead ${s.bands.dead.toFixed(3)}, green ${s.bands.green.toFixed(3)}, dry ${s.bands.dry.toFixed(3)}; sources ${JSON.stringify(s.sources)}; leaks ${s.leaks.tiles}; fall ${s.fall.drop.toFixed(2)}; ${m.ms.total} ms${m.attempt ? `; the first refused by ${m.failed[0]}` : ""}`);
        expect(m.held).toBe(true);
        for (const [id, n] of Object.entries(m.start)) expect(n.ok, `${id} ${n.value}/${n.limit}`).toBe(true);
        expect(m.map.report.passed).toBe(true);
        expect(m.settledFails).toEqual([]);
        // the Red Fall one whole curtain as the settled water stands (`fall.whole`, `redFallCurtain`: the shared fall judge)
        expect(m.settled.curtain.ok, m.settled.curtain.note).toBe(true);
      });
    it(`holds on its first attempt on ${FIRST[side]} or more of the 12 at ${side}²`, () => {
      const first = SEEDS.filter((seed) => {
        const m = made(seed, side);
        return !("reason" in m) && m.held && m.attempt === 0;
      }).length;
      console.log(`  ${side}²: ${first} of 12 on their first attempt`);
      expect(first).toBeGreaterThanOrEqual(FIRST[side]);
    });
  }
});
