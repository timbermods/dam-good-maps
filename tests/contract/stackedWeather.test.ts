// Drought and Badtide on the stacked-column engine (#391; sim/weather.ts `HazardRun`, sim/stackWater.ts
// `StackRun`): the same rules as on a heightfield (every source stops in a drought; the clean ones give
// badwater in a badtide; the water drains and evaporates), on every water column. On a map with no caves
// the stacked weather is the heightfield's day by day, bit for bit, both when the engine sees an open
// field (today's simulation inside it) and when one overhang far from the water puts the whole map on
// the stacked rules. On the official maps with caves (local only: they are not redistributable, so CI
// skips this) a drought runs, its last day stands where the analytic drought says, and the drought line
// comes out.

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mapDroughtLine } from "../../src/core/doc/droughtLine";
import { MapSession } from "../../src/core/doc/session";
import { toMapObject } from "../../src/core/features/build";
import { waterSource } from "../../src/core/format/entities";
import { heightMasks } from "../../src/core/sim/columns";
import { droughtStorage } from "../../src/core/sim/drought";
import { waterModel } from "../../src/core/sim/model";
import { canonicalSettle } from "../../src/core/sim/prefill";
import { canonicalStackSettle, stackedModel, stackObjectRows, type StackSettle } from "../../src/core/sim/stackWater";
import { TICKS_PER_DAY, type WaterModel } from "../../src/core/sim/water";
import { HazardRun } from "../../src/core/sim/weather";
import { ColumnTerrain } from "../../src/core/terrain/runs";

/** A basin 18 × 14 at level 3 with a deeper pool at 2, in ground at 6, an outlet to the east edge at 4 and a
 *  source at its head. */
function basin() {
  const W = 24, H = 20, N = W * H;
  const heights = new Uint8Array(N).fill(6);
  for (let y = 3; y < 17; y++) for (let x = 3; x < 21; x++) heights[y * W + x] = 3;
  for (let y = 6; y < 12; y++) for (let x = 8; x < 16; x++) heights[y * W + x] = 2;
  for (let x = 21; x < W; x++) heights[10 * W + x] = 4;
  const objects = [toMapObject(waterSource({ id: "00000000-0000-4000-8000-000000000001", owner: "test", x: 5, y: 5, z: 3, strength: 1 }))];
  return { W, H, N, heights, objects, model: waterModel(W, H, heights, objects) };
}

/** `from` with the heightfield's settled water in each tile's top column. */
function onTop(from: StackSettle, depth: Float64Array, contamination: Float64Array): StackSettle {
  const N = from.W * from.H;
  const out = { ...from, depth: from.depth.slice(), contamination: from.contamination.slice() };
  for (let i = 0; i < N; i++) {
    const k = (from.count[i] - 1) * N + i;
    out.depth[k] = depth[i];
    out.contamination[k] = contamination[i];
  }
  return out;
}

describe("the stacked weather on a map with no caves is the heightfield's", () => {
  const b = basin();
  const settled = canonicalSettle(b.model);
  const flatStack: WaterModel = { ...b.model, stacked: { mask: heightMasks(b.W, b.H, b.heights).mask, objects: stackObjectRows(b.objects) } };
  const t = ColumnTerrain.fromHeights(b.heights, b.W, b.H);
  t.mask[0] = 0b1000011; // a block floating over the map's corner: one tile with two columns, far from the water
  const overhang = stackedModel(b.model, t, b.objects);
  const cases: [string, WaterModel, StackSettle, boolean][] = [
    ["an open field (today's simulation inside the engine)", flatStack, canonicalStackSettle(heightMasks(b.W, b.H, b.heights), b.objects), false],
    ["one overhang far from the water (the stacked rules everywhere)", overhang, canonicalSettle(overhang).stack!, true],
  ];
  for (const [name, model, from, stacked] of cases)
    it.each(["drought", "badtide"] as const)(`${name}: a %s, day by day, bit for bit`, (hazard) => {
      const water = { depth: settled.depth, contamination: settled.contamination };
      const a = new HazardRun(b.model, water, hazard, 6);
      const s = new HazardRun(model, { ...water, stack: onTop(from, settled.depth, settled.contamination) }, hazard, 6);
      expect(s.stack!.stacked).toBe(stacked);
      for (let d = 1; d <= 6; d++) {
        a.step(TICKS_PER_DAY);
        s.step(TICKS_PER_DAY);
        const wa = a.water();
        const ws = s.water();
        expect(ws.depth, `day ${d}`).toEqual(wa.depth);
        expect(ws.contamination, `day ${d}`).toEqual(wa.contamination);
      }
      const last = a.water();
      if (hazard === "drought") expect(last.depth.reduce((x, y) => x + y, 0)).toBeLessThan(0.7 * settled.depth.reduce((x, y) => x + y, 0));
      else expect(Math.max(...last.contamination)).toBeGreaterThan(0.9);
      a.dispose();
      s.dispose();
    });
});

/** The official maps, copied locally (the dedicated machine's copy unless DGM_OFFICIAL says where). */
const OFFICIAL = process.env.DGM_OFFICIAL ?? "C:/Users/krams/code/DamGoodMaps/.scratch/official/";
/** A few official maps with caves, each settled in seconds: canyon water, a hollow, terraces, a seep oasis. */
const MAPS = ["builtin_03_MapMetadataCanyonName", "builtin_05_MapMetadataWaterfallsName", "builtin_15_MapMetadataOasisName", "builtin_18_MapMetadataHollowsName", "builtin_19_MapMetadataTerracesName", "builtin_20_MapMetadataMountainRangeName"];

describe.skipIf(!existsSync(OFFICIAL + MAPS[0] + ".timber"))("Drought on the official maps with caves (local only)", () => {
  it.each(MAPS)("%s: a drought runs from the map's own water, and its last day is the analytic drought's", (name) => {
    const s = MapSession.importMap(new Uint8Array(readFileSync(OFFICIAL + name + ".timber")), name + ".timber");
    const m = s.built.waterModel;
    expect(m.stacked).toBeDefined();
    const from = s.waterShown();
    const days = 9;
    const run = new HazardRun(m, { ...from, stack: from.stack }, "drought", days);
    const sum = (a: ArrayLike<number>) => {
      let v = 0;
      for (let i = 0; i < a.length; i++) v += a[i];
      return v;
    };
    let prev = sum(from.depth);
    for (let d = 1; d <= days; d++) {
      run.step(TICKS_PER_DAY);
      const v = sum(run.water().depth);
      expect(v, `day ${d}`).toBeLessThanOrEqual(prev + 1e-6);
      prev = v;
    }
    // the analytic drought (sim/drought.ts, the map from above): what stands below each basin's spill level, less its
    // evaporation. The stacked last day keeps no more than that, give or take what still drains on day 9 (up to
    // about 16% on these maps); water a cave drains away keeps less
    const analytic = sum(droughtStorage(m, from.depth, days));
    expect(prev).toBeLessThanOrEqual(1.2 * analytic + 5);
    expect(prev).toBeGreaterThan(0.5 * analytic - 5);
    // and the drought line comes out: the shore of what is left
    const line = mapDroughtLine(s, run.water().depth, days, from);
    expect(line.refused).toBeNull();
    expect(line.line.count).toBeGreaterThan(0);
    run.dispose();
  });
});
