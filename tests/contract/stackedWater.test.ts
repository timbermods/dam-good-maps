// Water and soil per slot (D120; 3D Foundations, stage 4): the multi-slot writer
// (format/world.ts `stackedSimulationSingletons`), the core's binding to the stacked engine
// (sim/stackWater.ts) and the probe's test maps T1–T5 (tools/terrain3d-maps.ts), whose scenes must stay
// the ones the game played (tests/golden/stacked-water.json holds their masks and sources).

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { emptySimulationSingletons, settledSimulationSingletons, stackedSimulationSingletons, storedSoil, storedWater } from "../../src/core/format/world";
import { stringify } from "../../src/core/format/json";
import { toMapObject } from "../../src/core/features/build";
import { waterSource } from "../../src/core/format/entities";
import { heightMasks, terrainColumns, waterColumns } from "../../src/core/sim/columns";
import { canonicalRun, canonicalSettle } from "../../src/core/sim/prefill";
import { waterModel } from "../../src/core/sim/model";
import { gameSoil } from "../../src/core/sim/soil";
import { canonicalStackSettle, stackedModel, stackObjectRows } from "../../src/core/sim/stackWater";
import { ColumnTerrain } from "../../src/core/terrain/runs";
import { inputBytes, stackFixtures } from "../../tools/rust/stack-fixtures";
import { build, t1Support, t2Walking, t3CaveWater, t4Soil, t5Plants } from "../../tools/terrain3d-maps";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const bytesOf = (a: Float64Array) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);

/** A valley 12 × 10 at level 2 in ground at 5, with a source at its head. */
function valley() {
  const W = 12, H = 10, N = W * H;
  const heights = new Uint8Array(N).fill(5);
  for (let y = 2; y < 8; y++) for (let x = 2; x < 10; x++) heights[y * W + x] = 2;
  const objects = [toMapObject(waterSource({ id: "00000000-0000-4000-8000-000000000001", owner: "test", x: 3, y: 3, z: 2, strength: 1 }))];
  return { W, H, N, heights, objects };
}

describe("the multi-slot writer", () => {
  it("writes a one-slot map byte for byte as today's writer", () => {
    const { W, H, heights, objects } = valley();
    const w = canonicalSettle(waterModel(W, H, heights, objects));
    const soil = gameSoil(W, H, heights, w.depth, w.contamination, objects, w.sat);
    const today = settledSimulationSingletons(W, H, { floor: heights, depth: w.depth, contamination: w.contamination, moisture: soil.moisture, soilContamination: soil.contamination, sat: w.sat });
    const masks = heightMasks(W, H, heights);
    const stacked = stackedSimulationSingletons(W, H, { cols: waterColumns(masks, objects), depth: w.depth, overflow: new Float64Array(W * H), contamination: w.contamination, sat: w.sat, runs: terrainColumns(masks), moisture: soil.moisture, soilContamination: soil.contamination });
    expect(w.depth.some((d) => d > 0.1)).toBe(true);
    expect(stringify(stacked)).toBe(stringify(today));
  });

  it("a tile with two water columns and two runs reads back slot by slot", () => {
    // a cave in tile 5: rock to 2, air 2–4, a roof 4–6, open above
    const W = 4, H = 3, N = W * H;
    const t = ColumnTerrain.fromHeights(new Uint8Array(N).fill(6), W, H);
    t.mask[5] = 0b110011;
    const cols = waterColumns(t, []);
    const runs = terrainColumns(t);
    expect([cols.L, cols.count[5], runs.T, runs.count[5]]).toEqual([2, 2, 2, 2]);
    const depth = new Float64Array(2 * N);
    const overflow = new Float64Array(2 * N);
    const contamination = new Float64Array(2 * N);
    const sat = new Uint8Array(2 * N);
    depth[5] = 2; // the cave, full
    overflow[5] = 0.375;
    contamination[5] = 0.25;
    depth[N + 5] = 0.5; // a puddle on the roof
    sat[5] = sat[N + 5] = 1;
    const moisture = new Float64Array(2 * N);
    const soilContamination = new Float64Array(2 * N);
    moisture[5] = 16; // the cave's floor
    moisture[N + 5] = 4; // the roof's top
    soilContamination[5] = 0.5;
    const s = stackedSimulationSingletons(W, H, { cols, depth, overflow, contamination, sat, runs, moisture, soilContamination });
    const wm = s.WaterMapNew as { Levels: number; WaterColumns: { Array: string } };
    expect(wm.Levels).toBe(2);
    const tokens = wm.WaterColumns.Array.split(" ");
    expect(tokens.length).toBe(2 * N);
    expect(tokens[5]).toBe("2.0:0.25:0.375:2:2.0");
    expect(tokens[N + 5]).toBe("0.5:0:0:6:0.5");
    expect(tokens.filter((x) => x !== "0").length).toBe(2);
    const water = storedWater(s, W, H);
    expect([...water.tile]).toEqual([5, 5]);
    expect([...water.floor]).toEqual([2, 6]);
    expect([...water.depth]).toEqual([2, 0.5]);
    expect([...water.contamination]).toEqual([0.25, 0]);
    expect((s.SoilMoistureSimulator as { Size: number }).Size).toBe(2);
    const top = storedSoil(s, W, H, (i) => runs.count[i] - 1);
    expect(top.moisture[5]).toBe(4);
    const bottom = storedSoil(s, W, H);
    expect([bottom.moisture[5], bottom.contamination[5]]).toEqual([16, 0.5]);
    // the same shape as an empty map of two levels: nothing but the arrays and the soil's size differs
    expect(Object.keys(s)).toEqual(Object.keys(emptySimulationSingletons(W, H, 2)));
  });
});

describe("the stacked engine through the core's binding", () => {
  it("an open field settles to today's water, bit for bit", () => {
    const { W, H, heights, objects } = valley();
    const today = canonicalSettle(waterModel(W, H, heights, objects));
    const w = canonicalStackSettle(heightMasks(W, H, heights), objects);
    expect(w.stacked).toBe(false);
    expect(w.L).toBe(1);
    expect(w.depth).toEqual(today.depth);
    expect(w.contamination).toEqual(today.contamination);
    expect([w.settled, w.ticks]).toEqual([today.settled, today.ticks]);
  });

  it("the probe's test maps are the scenes the game played, and settle to the verified water", () => {
    for (const make of [t1Support, t2Walking, t3CaveWater, t4Soil, t5Plants]) {
      const m = make();
      const f = stackFixtures.find((x) => x.name === m.id)!;
      // the fixture's input: five counts, the masks, the objects' rows, then its operations
      const input = inputBytes(f);
      const d = new DataView(input.buffer, input.byteOffset, input.byteLength);
      const N = m.scene.N;
      const rows = stackObjectRows(m.scene.entities.map(toMapObject));
      expect([d.getUint32(0, true), d.getUint32(4, true), d.getUint32(8, true)], m.id).toEqual([m.scene.W, m.scene.H, rows.length / 8]);
      expect(sha(input.subarray(20, 20 + 4 * N)), `${m.id} terrain`).toBe(sha(new Uint8Array(m.scene.mask.buffer)));
      expect(sha(input.subarray(20 + 4 * N, 20 + 4 * N + 8 * rows.length)), `${m.id} objects`).toBe(sha(bytesOf(rows)));
      const b = build(m);
      if (m.water === "settled") {
        expect(b.settled, m.id).toEqual(f.settle);
        expect(sha(bytesOf(b.arrays.depth)).slice(0, 16), `${m.id} water`).toBe(f.hashes.depth);
        expect(sha(bytesOf(b.arrays.overflow)).slice(0, 16), `${m.id} pressure`).toBe(f.hashes.overflow);
      }
    }
    // T1: the game deleted exactly these 24 voxels (probe run terrain3d-20260927)
    expect(build(t1Support()).dropped.length).toBe(24);
  });
});

describe("the canonical settle's two paths (3D Foundations, stage 5)", () => {
  it("a heightfield's model is the model itself: today's simulation, the same code path", () => {
    const { W, H, heights, objects } = valley();
    const model = waterModel(W, H, heights, objects);
    expect(stackedModel(model, heightMasks(W, H, heights), objects)).toBe(model);
    expect(canonicalSettle(model).stack).toBeUndefined();
  });

  it("terrain above terrain settles in the stacked engine, in slices with progress, to the verified water", () => {
    const m = t3CaveWater();
    const f = stackFixtures.find((x) => x.name === m.id)!;
    const { W, H, N } = m.scene;
    const objects = m.scene.entities.map(toMapObject);
    const terrain = new ColumnTerrain(W, H, m.scene.mask);
    const model = stackedModel(waterModel(W, H, terrain.heights(), objects), terrain, objects);
    expect(model.stacked).toBeDefined();
    const whole = canonicalSettle(model);
    expect([whole.settled, whole.ticks]).toEqual([f.settle!.settled, f.settle!.ticks]);
    expect(sha(bytesOf(whole.stack!.depth)).slice(0, 16)).toBe(f.hashes.depth);
    // from above: each tile's top column
    for (const i of [0, 9 * W + 9, N - 1]) expect(whole.depth[i]).toBe(whole.stack!.depth[(whole.stack!.count[i] - 1) * N + i]);
    // in slices: the same water, with progress that only grows
    const run = canonicalRun(model);
    let last = 0;
    let slices = 0;
    let r = run.advance(300);
    while (!r) {
      const done = run.ticks / run.maxTicks;
      expect(done).toBeGreaterThanOrEqual(last);
      expect(done).toBeLessThanOrEqual(1);
      last = done;
      slices++;
      r = run.advance(300);
    }
    expect(slices).toBeGreaterThan(3);
    expect(r.stack!.depth).toEqual(whole.stack!.depth);
    expect(r.depth).toEqual(whole.depth);
  });

  it("refuses what it has no rule for, in one line", () => {
    const m = t3CaveWater();
    const { W, H } = m.scene;
    const objects = m.scene.entities.map(toMapObject);
    const terrain = new ColumnTerrain(W, H, m.scene.mask);
    const model = stackedModel(waterModel(W, H, terrain.heights(), objects), terrain, objects);
    expect(() => canonicalSettle({ ...model, drained: [5] })).toThrow(/not worked out for a map with caves/);
  });
});
