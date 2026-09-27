// The multi-slot writer (D120; src/core/format/stacked.ts): on a heightfield it writes today's
// singletons byte for byte; on a map with caves every column's water lands in its own slot, with its
// pressure, and the soil in its run's slot, read back as the game loads them.

import { describe, expect, it } from "vitest";
import { isObject, num, type JsonObject } from "../../src/core/format/json";
import { stackedSimulationSingletons } from "../../src/core/format/stacked";
import { mapMetadata, readTimber, writeTimber } from "../../src/core/format/timber";
import { GAME_VERSION, settledSimulationSingletons } from "../../src/core/format/world";
import { stringify } from "../../src/core/format/json";
import { heightMasks, masksToVoxels, terrainColumns, voxelMasks, waterColumns } from "../../src/core/sim/columns";
import { soilContamination } from "../../src/core/sim/contamination";
import { moistureBarrier, waterModel } from "../../src/core/sim/model";
import { moisture } from "../../src/core/sim/moisture";
import { canonicalSettle } from "../../src/core/sim/prefill";
import { stackModel } from "../../src/core/sim/stackModel";
import { canonicalStackSettle } from "../../src/core/sim/stackPrefill";
import { soil3d } from "../../src/core/sim/soil3d";
import { caveValley, object, source, valley } from "./stackMaps";

const tokens = (s: JsonObject, singleton: string, key: string): string[] => String(((s[singleton] as JsonObject)[key] as JsonObject).Array).split(" ");

describe("the multi-slot writer", () => {
  it("writes today's singletons on a heightfield, byte for byte", () => {
    const W = 40;
    const H = 32;
    const h = valley(W, H);
    for (let y = H / 2 + 3; y < H / 2 + 6; y++) for (let x = 1; x < 4; x++) h[y * W + x] = 7;
    const objects = [source(2, H / 2, h[(H / 2) * W + 2], 3), source(1, H / 2 + 3, 7, 2, "BadwaterSource"), object("Blockage", 20, H / 2, h[(H / 2) * W + 20])];
    const water = canonicalSettle(waterModel(W, H, h, objects));
    const barrier = moistureBarrier(W, H, objects);
    const moist = moisture(h, water.depth, water.contamination, W, H, barrier);
    const soil = soilContamination(h, water.depth, water.contamination, W, H, barrier);
    const today = settledSimulationSingletons(W, H, { floor: h, depth: water.depth, contamination: water.contamination, moisture: moist, soilContamination: soil, sat: water.sat });
    const masks = heightMasks(W, H, h);
    const stacked = stackedSimulationSingletons(W, H, {
      cols: waterColumns(masks, objects),
      depth: water.depth,
      overflow: new Float64Array(W * H),
      contamination: water.contamination,
      sat: water.sat,
      runs: terrainColumns(masks),
      moisture: moist,
      soilContamination: soil,
    });
    expect(stringify(stacked)).toBe(stringify(today));
  });

  it("writes a cave map's water and soil slot by slot, as the game reads them back", () => {
    const m = caveValley();
    const model = stackModel(m, m.objects);
    const settled = canonicalStackSettle(model);
    const soil = soil3d(m, model.cols, settled, m.objects);
    const { W, H } = m;
    const N = W * H;
    const singletons = stackedSimulationSingletons(W, H, { cols: model.cols, depth: settled.depth, overflow: settled.overflow, contamination: settled.contamination, sat: settled.sat, runs: soil.runs, moisture: soil.moisture, soilContamination: soil.contamination });
    const bytes = writeTimber({
      metadata: mapMetadata(W, H, "cave valley"),
      thumbnail: new Uint8Array(0),
      versionTxt: GAME_VERSION + "\r\n",
      world: { gameVersion: GAME_VERSION, timestamp: "2026-09-27 00:00:00", sizeX: W, sizeY: H, layers: 23, voxels: masksToVoxels(m), singletons, entities: [] },
      extraFiles: [],
    });
    const back = readTimber(bytes).world;
    // the terrain round-trips
    expect(Array.from(voxelMasks(W, H, back.voxels, back.layers).mask)).toEqual(Array.from(m.mask));
    const s = back.singletons;
    const L = model.cols.L;
    expect(L).toBe(2);
    expect(num((s.WaterMapNew as JsonObject).Levels)).toBe(L);
    expect(num((s.WaterEvaporationMap as JsonObject).Levels)).toBe(L);
    expect(num((s.SoilMoistureSimulator as JsonObject).Size)).toBe(soil.runs.T);
    const water = tokens(s, "WaterMapNew", "WaterColumns");
    expect(water.length).toBe(L * N);
    expect(tokens(s, "WaterMapNew", "ColumnOutflows").every((t) => t === "0")).toBe(true);
    let pressured = 0;
    let underBridge = 0;
    for (let c = 0; c < L * N; c++) {
      const i = c % N;
      const slot = (c - i) / N;
      const t = water[c];
      if (slot >= model.cols.count[i]) {
        expect(t).toBe("0");
        continue;
      }
      if (!(settled.depth[c] > 1e-6)) {
        expect(t).toBe("0");
        continue;
      }
      const [d, , o, floor, old] = t.split(":").map(Number);
      expect(Math.abs(d - settled.depth[c])).toBeLessThan(1e-5 * Math.max(1, settled.depth[c]));
      expect(old).toBe(d);
      expect(Math.abs(o - settled.overflow[c])).toBeLessThan(1e-5);
      expect(floor).toBe(model.cols.count[i] === 1 && soil.runs.count[i] === 1 ? soil.runs.ceil[i] : model.cols.floor[c]);
      if (o > 0) pressured++;
      if (model.cols.count[i] === 2 && slot === 0 && model.cols.ceil[c] < 34 && model.cols.floor[c] < 8) underBridge++;
    }
    // the sealed cave is under pressure, and the stream runs under the bridge in slot 0
    expect(pressured).toBeGreaterThan(0);
    expect(underBridge).toBeGreaterThan(0);
    const moist = tokens(s, "SoilMoistureSimulator", "MoistureLevels");
    expect(moist.length).toBe(soil.runs.T * N);
    for (let n = 0; n < moist.length; n++) expect(Math.abs(Number(moist[n]) - soil.moisture[n])).toBeLessThan(1e-4 * Math.max(1, soil.moisture[n]));
    expect(isObject(s.SoilContaminationSimulator)).toBe(true);
  });
});
