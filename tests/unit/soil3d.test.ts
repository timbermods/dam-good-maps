// Soil moisture and contamination per terrain run (D120; src/core/sim/soil3d.ts): "port" mode gives
// sim/moisture.ts's and sim/contamination.ts's numbers on a heightfield, bit for bit; both modes
// follow the game's rules through a roof over a full cave (GAME_RULES.md §6).

import { describe, expect, it } from "vitest";
import { heightMasks, terrainColumns, waterColumns } from "../../src/core/sim/columns";
import { soilContamination } from "../../src/core/sim/contamination";
import { moistureBarrier, waterModel } from "../../src/core/sim/model";
import { moisture } from "../../src/core/sim/moisture";
import { canonicalSettle } from "../../src/core/sim/prefill";
import { StackSim } from "../../src/core/sim/stack";
import { stackModel } from "../../src/core/sim/stackModel";
import { columnSaturation, soil3d, type SoilMode } from "../../src/core/sim/soil3d";
import { object, source, valley } from "./stackMaps";

describe("soil per terrain run", () => {
  it("gives today's moisture and contamination on a heightfield, bit for bit (port mode)", () => {
    const W = 40;
    const H = 32;
    const h = valley(W, H);
    for (let y = H / 2 + 3; y < H / 2 + 6; y++) for (let x = 1; x < 4; x++) h[y * W + x] = 7;
    // a badwater source, a Blockage in the stream (it raises its water's floor) and Thorns
    const objects = [source(2, H / 2, h[(H / 2) * W + 2], 3), source(1, H / 2 + 3, 7, 2, "BadwaterSource"), object("Blockage", 20, H / 2, h[(H / 2) * W + 20]), object("Thorns", 10, H / 2 + 2, h[(H / 2 + 2) * W + 10])];
    const hm = waterModel(W, H, h, objects);
    const water = canonicalSettle(hm);
    const barrier = moistureBarrier(W, H, objects);
    expect(barrier).not.toBeNull();
    const a = moisture(h, water.depth, water.contamination, W, H, barrier);
    const b = soilContamination(h, water.depth, water.contamination, W, H, barrier);
    const masks = heightMasks(W, H, h);
    const cols = waterColumns(masks, objects);
    expect(cols.floor[(H / 2) * W + 20]).toBe(h[(H / 2) * W + 20] + 1);
    expect(Array.from(columnSaturation(cols, water.depth))).toEqual(Array.from(water.sat));
    const s = soil3d(masks, cols, water, objects);
    expect(s.runs.T).toBe(1);
    let moist = 0;
    let bad = 0;
    let differ = 0;
    for (let i = 0; i < W * H; i++) {
      if (a[i] !== s.moisture[i] || b[i] !== s.contamination[i]) differ++;
      if (a[i] > 0) moist++;
      if (b[i] > 0) bad++;
    }
    expect(differ).toBe(0);
    expect(moist).toBeGreaterThan(100);
    expect(bad).toBeGreaterThan(10);
  });

  it("moistens a roof over a full cave by its thickness, and not over a cave partly filled", () => {
    // a plateau of rock; a cave at z 2-3 under tiles 4-11 x 4-11, its roof t thick
    const W = 16;
    const H = 16;
    for (const mode of ["port", "game"] as SoilMode[])
      for (const [t, full, expected] of [[1, true, 16], [2, true, 10], [3, true, 4], [1, false, 0]] as const) {
        const top = 4 + t;
        const { mask } = heightMasks(W, H, new Uint8Array(W * H).fill(top));
        for (let y = 4; y <= 11; y++) for (let x = 4; x <= 11; x++) mask[y * W + x] = (mask[y * W + x] & ~(0b11 << 2)) >>> 0;
        const cols = waterColumns({ W, H, mask }, []);
        const centre = 8 * W + 8;
        expect(cols.count[centre]).toBe(2);
        const depth = new Float64Array(cols.L * cols.N);
        for (let y = 4; y <= 11; y++) for (let x = 4; x <= 11; x++) depth[y * W + x] = full ? 2 : 1;
        const s = soil3d({ W, H, mask }, cols, { depth, contamination: new Float64Array(depth.length) }, [], mode);
        // run 1 is the roof, [4, 4 + t); run 0 the rock under the cave, [0, 2): the cave's own floor
        expect(s.runs.count[centre]).toBe(2);
        expect(s.runs.ceil[W * H + centre]).toBe(top);
        expect(s.moisture[W * H + centre]).toBe(expected);
        // the cave floor under its own clean water: 2·sat
        expect(s.moisture[centre]).toBe(16);
      }
  });

  it("moistens a cave floor from the water of the cave beside it, not from a lake above the neighbour's roof", () => {
    // a cave at z 2-3 across tiles 2-13 x 6-9, water in its west half only; a lake on the roof
    // over the east half's neighbours cannot reach the cave floor through the rock
    const W = 16;
    const H = 16;
    const { mask } = heightMasks(W, H, new Uint8Array(W * H).fill(6));
    for (let y = 6; y <= 9; y++) for (let x = 2; x <= 13; x++) mask[y * W + x] = (mask[y * W + x] & ~(0b11 << 2)) >>> 0;
    const cols = waterColumns({ W, H, mask }, []);
    const N = W * H;
    const depth = new Float64Array(cols.L * N);
    for (let y = 6; y <= 9; y++) for (let x = 2; x <= 6; x++) depth[y * W + x] = 0.5;
    for (const mode of ["port", "game"] as SoilMode[]) {
      const none = new Float64Array(depth.length);
      const s = soil3d({ W, H, mask }, cols, { depth, contamination: none }, [], mode);
      // beside the water on the cave floor: its range (sat 8 at the water's edge row) less nothing
      expect(s.moisture[7 * W + 7]).toBeGreaterThan(10);
      // spread along the cave floor falls by 1 a tile
      expect(s.moisture[7 * W + 9]).toBeLessThan(s.moisture[7 * W + 8]);
      // the roof over the wet part of the cave is dry: the cave is not full
      expect(s.moisture[N + 7 * W + 4]).toBe(0);
    }
    // a slab over a dry cave the whole map wide, with a lake on the slab: the cave floor reads no
    // water through its neighbours' roofs, and the roofs' runs do not overlap it, so it stays dry
    // (next to plain rock it would not: moisture spreads down through rock whose run overlaps)
    const slab = new Uint32Array(N).fill((0b11 | (0b11 << 4)) >>> 0);
    const scols = waterColumns({ W, H, mask: slab }, []);
    const wet = new Float64Array(scols.L * N);
    for (let y = 5; y <= 10; y++) for (let x = 5; x <= 10; x++) wet[N + y * W + x] = 0.5;
    for (const mode of ["port", "game"] as SoilMode[]) {
      const t = soil3d({ W, H, mask: slab }, scols, { depth: wet, contamination: new Float64Array(wet.length) }, [], mode);
      expect(t.moisture[N + 7 * W + 7]).toBe(16);
      expect(t.moisture[N + 7 * W + 12]).toBeGreaterThan(0);
      for (let i = 0; i < N; i++) expect(t.moisture[i]).toBe(0);
    }
  });

  it("uses the engine's own saturation on stacked columns", () => {
    const W = 12;
    const H = 12;
    const { mask } = heightMasks(W, H, new Uint8Array(W * H).fill(8));
    for (let y = 3; y <= 8; y++) for (let x = 3; x <= 8; x++) mask[y * W + x] = (mask[y * W + x] & ~(0b111 << 2)) >>> 0;
    const model = stackModel({ W, H, mask }, [source(5, 5, 2, 2)]);
    const sim = new StackSim(model).run(600);
    const sat = sim.saturation();
    expect(Array.from(columnSaturation(model.cols, sim.D))).toEqual(Array.from(sat));
    expect(terrainColumns({ W, H, mask }).T).toBe(2);
  });
});
