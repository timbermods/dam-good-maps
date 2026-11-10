// Stage 1's water settled as the game plays it (docs/PREMISES.md §7 step 2): three plans (seed 1 at each size) and
// the hand-built Four Lakes, each settled on its rastered water alone. Each lake stands 0.05 to 0.6 over its sill
// (`stair.settled`), every wet body where the water table puts it, the dry ones dry, no water strays off the planned
// water, and each fall pours one curtain of its height over a lip as wide as the invariant asks (the fall judge,
// fallCurtain.ts), its sill's curtain: judged with the notches shut, since a stair fall's open notch, a level deep
// through the crest, takes most of the stair's flow and leaves the rest of the lip a film (PREMISES §9; the film is
// logged). This is the test the table's constants (levels.ts `WATER`) are fitted by.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { firstWater } from "../../src/core/premise/draw";
import { lakeStair } from "../../src/core/premise/premises/lakeStair";
import type { PremisePlan } from "../../src/core/premise/types";
import { stageModel, waterByNumber, type StageWater } from "../../src/core/premise/water";
import { canonicalSettle } from "../../src/core/sim/prefill";
import { makeSpec } from "../../src/core/spec/mapspec";
import { curtains } from "./fallCurtain";

/** How far a wet body's settled level may stand from the table's. */
const TABLE_SLACK = 0.25;
/** Settled water off the planned water, at most (`stair.settled`: under 0.3 %). */
const STRAY = 0.003;
const WET = 0.05;

function plans(): [string, PremisePlan, StageWater][] {
  const out: [string, PremisePlan, StageWater][] = [];
  for (const side of [128, 192, 256]) {
    const spec = makeSpec({ seed: 1, size: { x: side, y: side }, theme: "any" });
    spec.premise = "lakeStair";
    const r = firstWater(lakeStair, spec);
    if ("reason" in r) throw new Error(r.reason);
    out.push([`seed 1 at ${side}²`, r.plan, r.water]);
  }
  const fixture = JSON.parse(readFileSync("tests/fixtures/four-lakes.plan.json", "utf8")) as PremisePlan;
  out.push(["Four Lakes", fixture, waterByNumber(fixture)]);
  return out;
}

describe("Stage 1's water, settled", () => {
  for (const [name, plan, w] of plans())
    it(`stands where the table puts it and pours each fall: ${name}`, () => {
      const r = w.raster;
      const N = r.W * r.H;
      const m = stageModel(w);
      const t0 = performance.now();
      const s = canonicalSettle(m);
      const ms = performance.now() - t0;
      // (the stair falls' notches shut, a ruined weir's breach left open: it is its lake's sill)
      const shut = stageModel(w, { shutNotches: true }).floor;
      for (let i = 0; i < N; i++) if (r.crest[i] && !plan.links[r.crest[i] - 1].fall!.notch) shut[i] = m.floor[i];
      const sill = shut.some((h, i) => h !== m.floor[i]) ? canonicalSettle({ ...m, floor: shut }) : s;
      const lines: string[] = [];
      for (const [k, b] of plan.bodies.entries()) {
        const lv: number[] = [];
        for (let i = 0; i < N; i++) if (r.lake[i] === k + 1 && !r.crest[i] && !r.pool[i] && s.depth[i] > WET) lv.push(r.heights[i] + s.depth[i]);
        lv.sort((p, q) => p - q);
        const t = w.table.bodies[b.id];
        if (t.dry) {
          expect(lv.length, `${b.id} is dry on day 1`).toBe(0);
          continue;
        }
        const level = lv[lv.length >> 1];
        lines.push(`${b.id} ${level.toFixed(2)} (table ${t.level.toFixed(2)}, sill ${b.sill})`);
        expect(Math.abs(level - t.level), `${b.id}: settled ${level.toFixed(3)}, table ${t.level.toFixed(3)}`).toBeLessThanOrEqual(TABLE_SLACK);
        if (b.kind === "lake") {
          expect(level - b.sill, `${b.id} over its sill`).toBeGreaterThanOrEqual(0.05);
          expect(level - b.sill, `${b.id} over its sill`).toBeLessThanOrEqual(0.6);
        }
      }
      let stray = 0;
      for (let i = 0; i < N; i++) if (s.depth[i] > WET && !r.lake[i] && !r.channel[i]) stray++;
      expect(stray / N, `${stray} tiles of water off the planned water`).toBeLessThan(STRAY);
      // each fall, judged in a window round its lip
      for (const l of plan.links) {
        if (!l.fall || l.kind === "gorge") continue;
        const f = l.fall;
        const landmark = l.id === plan.frame.landmark;
        const lip = r.lips[l.id];
        // (round its lip, another fall's crest a wall)
        const near = new Uint8Array(N);
        for (const i of lip) {
          const x = i % r.W;
          const y = (i - x) / r.W;
          for (let dy = -8; dy <= 8; dy++)
            for (let dx = -8; dx <= 8; dx++) {
              const xx = x + dx;
              const yy = y + dy;
              if (xx >= 0 && yy >= 0 && xx < r.W && yy < r.H) near[yy * r.W + xx] = 1;
            }
        }
        for (let i = 0; i < N; i++) if (r.crest[i] && r.crest[i] !== plan.links.indexOf(l) + 1) near[i] = 0;
        // (outside the window a dry wall, so no water pours over the window's edge)
        const judge = (settled: typeof s, floor: Float64Array) => {
          const depth = Float64Array.from(settled.depth, (d, i) => (near[i] ? d : 0));
          const ground = Float64Array.from(floor, (g, i) => (near[i] ? g : 99));
          const c = curtains({ W: r.W, H: r.H, before: ground, beforeDepth: new Float64Array(N), after: ground, depth, need: landmark ? f.height - 0.3 : f.height - 0.4 });
          let pouring = 0;
          for (let i = 0; i < N; i++) if (c.id && c.id[i] >= 0) pouring++;
          return { c, pouring };
        };
        const { c, pouring } = judge(sill, shut);
        // (a ruined weir's piers split its curtain by design: each piece pours the drop)
        const ok = c.ok || (f.piers > 0 && c.note.startsWith("split"));
        expect(ok, `${l.id}: ${c.note}`).toBe(true);
        expect(pouring, `${l.id}'s wet lip`).toBeGreaterThanOrEqual(landmark ? 10 : 8);
        const open = f.notch + f.breach > 0 ? `; notch open, ${judge(s, m.floor).pouring} pouring` : "";
        lines.push(`${l.id}: ${c.note}, ${pouring} pouring${open}`);
      }
      console.log(`${name}: settled in ${ms.toFixed(0)} ms, ${stray} stray; ${lines.join("; ")}`);
    });
});
