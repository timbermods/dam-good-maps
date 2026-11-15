// The poisoned floodplain's water on the sheet's six (docs/design/poisoned-floodplain.md §9 row 3): seeds 1 and 2 at
// 128², 192² and 256², each built and settled on its first attempt, passing the start's checks and every settled
// invariant, the Red Fall one whole curtain of its height less the veil's half level as the settled water stands (the
// shared fall judge, `fallCurtain.ts`). The start's numbers are printed first, then the bands, as planning asks every
// map report to open.

import { describe, expect, it } from "vitest";
import { plainMap } from "../../src/core/premise/plainMap";
import { PLAIN_IDS } from "../../src/core/premise/premises/poisonedPlain";
import { makeSpec } from "../../src/core/spec/mapspec";
import { curtains } from "./fallCurtain";
import { VEIL_SHORT } from "./gateSettle";

describe("The poisoned floodplain's water on seeds 1 and 2 at each size", () => {
  for (const side of [128, 192, 256])
    for (const seed of [1, 2])
      it(`holds on its first attempt: seed ${seed} at ${side}²`, () => {
        const m = plainMap(makeSpec({ seed, size: { x: side, y: side }, theme: "any", premise: "any" }));
        if ("reason" in m) throw new Error(m.reason);
        const st = Object.entries(m.start).map(([k, v]) => `${k.slice(6)} ${v.value}/${v.limit}`).join(", ");
        const s = m.settled;
        console.log(`  seed ${seed} at ${side}²: start ${st}; dead ${s.bands.dead.toFixed(3)}, green ${s.bands.green.toFixed(3)}, dry ${s.bands.dry.toFixed(3)}; sources ${JSON.stringify(s.sources)}; leaks ${s.leaks.tiles}; fall ${s.fall.drop.toFixed(2)}; ${m.ms.total} ms`);
        expect(m.failed).toEqual([]);
        expect(m.held).toBe(true);
        expect(m.attempt).toBe(0);
        for (const [id, n] of Object.entries(m.start)) expect(n.ok, `${id} ${n.value}/${n.limit}`).toBe(true);
        expect(m.settledFails).toEqual([]);

        // the Red Fall, judged in a window round its lip (other crests walls), as the settled water stands
        const { plan, water } = m.land;
        const r = water.raster;
        const b = m.map.built;
        const N = plan.W * plan.H;
        const k = plan.links.findIndex((l) => l.id === PLAIN_IDS.redFall);
        const fall = plan.links[k];
        const near = new Uint8Array(N);
        for (const i of r.lips[fall.id] ?? []) {
          const x = i % plan.W;
          const y = (i - x) / plan.W;
          for (let dy = -8; dy <= 8; dy++)
            for (let dx = -8; dx <= 8; dx++) {
              const xx = x + dx;
              const yy = y + dy;
              if (xx >= 0 && yy >= 0 && xx < plan.W && yy < plan.H) near[yy * plan.W + xx] = 1;
            }
        }
        for (let i = 0; i < N; i++) if (r.crest[i] && r.crest[i] !== k + 1) near[i] = 0;
        const depth = Float64Array.from(b.water, (d, i) => (near[i] ? d : 0));
        const ground = Float64Array.from(b.heights, (h, i) => (near[i] ? h : 99));
        const c = curtains({ W: plan.W, H: plan.H, before: ground, beforeDepth: new Float64Array(N), after: ground, depth, need: fall.fall!.height - VEIL_SHORT });
        expect(c.ok, c.note).toBe(true);
      });
});
