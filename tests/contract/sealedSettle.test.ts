// The canonical settle counts a sealed, only-evaporating basin as settled (PLAN §20 D222, D413): a
// Fill is stored at exactly the level chosen and the settle stops with the rest of the water, well
// before its cap, so the game evaporates the Fill from its level and `fillDays` counts from there.
// The water that flows settles on the same check and to the same bytes as on the map without the
// Fill; a basin with a running source in it is real flow and settles exactly as the plain settle
// does. The oxbow lake's case is in carve.test.ts; the rule itself in tests/unit/sealedBasins.test.ts.
// Timings are information (this machine is shared): the budget is 0.6 s at 128², 3 s at 256² (D33).

import { beforeAll, describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import { planFill } from "../../src/core/doc/waterEdits";
import { generate } from "../../src/core/gen/generate";
import { withoutUnfed } from "../../src/core/sim/fed";
import { canonicalSettle, DRAIN_DAYS, prefill } from "../../src/core/sim/prefill";
import { settle, TICKS_PER_DAY, waterSteady, WaterSim, type WaterModel } from "../../src/core/sim/water";
import { makeSpec } from "../../src/core/spec/mapspec";

/** River Valley seed 2 at N², with a 12×12 pit (144 tiles) dug two levels into a dry plateau away
 *  from water and the start, and a Fill one level deep in it. */
function filled(N: number): { s: MapSession; level: number; tiles: readonly number[]; at: [number, number] } {
  const s = MapSession.fromGenerated(generate(makeSpec({ seed: 2, theme: "riverValley", size: { x: N, y: N } })));
  s.setWaterMode("defer");
  const b = s.built;
  for (let y0 = 8; y0 + 24 < N; y0 += 2)
    for (let x0 = 8; x0 + 24 < N; x0 += 2) {
      let ok = true;
      let hi = 0;
      let lo = 99;
      for (let y = y0 - 3; y < y0 + 19 && ok; y++)
        for (let x = x0 - 3; x < x0 + 19 && ok; x++) {
          const i = y * N + x;
          if (b.water[i] > 0) ok = false;
          hi = Math.max(hi, b.heights[i]);
          lo = Math.min(lo, b.heights[i]);
        }
      if (!ok || lo < 3 || hi - lo > 6) continue;
      if (b.entities.some((e) => e.template === "StartingLocation" && Math.abs(e.x - x0 - 8) < 14 && Math.abs(e.y - y0 - 8) < 14)) continue;
      const flat: [number, number, number][] = [];
      for (let y = y0; y < y0 + 16; y++) flat.push([y, x0, x0 + 15]);
      expect(s.apply({ op: "sculpt", params: { mode: "flatten", cells: flat, level: hi } }).errors).toEqual([]);
      const pit: [number, number, number][] = [];
      for (let y = y0 + 2; y < y0 + 14; y++) pit.push([y, x0 + 2, x0 + 13]);
      expect(s.apply({ op: "sculpt", params: { mode: "lower", cells: pit, amount: 2 } }).errors).toEqual([]);
      const at: [number, number] = [x0 + 7, y0 + 7];
      const plan = planFill(s, at[0], at[1], hi - 1);
      expect(plan.reason).toBeNull();
      expect(plan.tiles).toBe(144);
      expect(s.apply(plan.op!).errors).toEqual([]);
      s.settleCanonical();
      return { s, level: hi - 1, tiles: plan.op!.params.lake.tiles, at };
    }
  throw new Error("no plateau for the pit");
}

function timed(m: WaterModel): { r: ReturnType<typeof canonicalSettle>; ms: number } {
  const t = performance.now();
  const r = canonicalSettle(m);
  return { r, ms: performance.now() - t };
}

describe.each([128, 256])("a 144-tile Fill at %i² (D413)", (N) => {
  let s: MapSession;
  let level: number;
  let tiles: readonly number[];
  let at: [number, number];
  let m: WaterModel;
  beforeAll(() => {
    ({ s, level, tiles, at } = filled(N));
    m = s.built.waterModel;
  });

  it("is stored at exactly the level chosen, and the settle stops with the rest of the water, well before its cap", () => {
    const b = s.built;
    for (const i of tiles) expect(m.floor[i] + b.water[i]).toBe(level);
    expect(waterSteady(b.settle)).toBe(true);
    expect(b.settle.ticks).toBeLessThan(4 * TICKS_PER_DAY);
    const settles = s.validate().report.checks.find((c) => c.id === "water.settles")!;
    expect(settles.ok, settles.message).toBe(true);
    // the file the game loads holds it at the level: the game evaporates it from there, and the
    // question's days count from there too (sim/fill.ts `fillDays`)
    const plan = planFill(s, at[0], at[1], level);
    expect(plan.reason).toBe(`water already stands at level ${level} there`);
    const { r, ms } = timed(m);
    const bare = timed({ ...m, retained: undefined });
    console.log(`${N}²: the Fill's canonical settle ${(ms / 1000).toFixed(2)} s, ${r.ticks} ticks (${(r.ticks / TICKS_PER_DAY).toFixed(2)} days); without the Fill ${(bare.ms / 1000).toFixed(2)} s, ${bare.r.ticks} ticks`);
    expect(r.ticks).toBe(b.settle.ticks);
  });

  it("leaves the water that flows exactly as on the map without the Fill: the same check, the same bytes", () => {
    const b = s.built;
    const bare = canonicalSettle({ ...m, retained: undefined });
    expect(bare.ticks).toBe(b.settle.ticks);
    const lake = new Set(tiles);
    let differ = 0;
    for (let i = 0; i < m.W * m.H; i++) {
      if (lake.has(i)) continue;
      if (b.water[i] !== bare.depth[i] || b.contamination[i] !== bare.contamination[i]) differ++;
    }
    expect(differ).toBe(0);
  });

  // (at 128² only: the source's overflow runs the settle to its cap)
  it.runIf(N === 128)("with a running source in it the basin is real flow: it settles exactly as the plain settle does", () => {
    const fed: WaterModel = { ...m, emitters: [...m.emitters, { cells: [at[1] * m.W + at[0]], strength: 0.5, contamination: 0 }] };
    const c = canonicalSettle(fed);
    let sim = new WaterSim(fed, prefill(fed));
    let plain = settle(sim);
    // (then, as every canonical settle, without the water its pre-fill left where nothing reaches,
    // D385)
    const next = withoutUnfed(fed, sim);
    if (next) plain = settle((sim = next), { maxDays: DRAIN_DAYS });
    expect(c.steadyTicks).toBeUndefined();
    expect({ settled: c.settled, ticks: c.ticks }).toEqual(plain);
    expect(Array.from(c.depth)).toEqual(Array.from(sim.D));
    expect(Array.from(c.contamination)).toEqual(Array.from(sim.C));
  });
});
