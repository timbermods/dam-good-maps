// An imported map with caves or overhangs (3D Foundations, stage 6; D120, D280): once it is edited,
// its water is the stacked-column engine's on every column, its soil is per run top, and its file is
// written the way the game saves such a map. Unedited, it exports its own file byte for byte. What
// has no rule for water in caves yet is refused with one plain line. The map is T3 of the probe's
// test maps (tools/terrain3d-maps.ts), which the game has played.

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import type { EditOp } from "../../src/core/doc/ops";
import { MapSession } from "../../src/core/doc/session";
import { planFill, unfedWater } from "../../src/core/doc/waterEdits";
import { readTimber, writeTimber } from "../../src/core/format/timber";
import { storedWater } from "../../src/core/format/world";
import type { JsonObject } from "../../src/core/format/json";
import { CAVE_REFUSALS } from "../../src/core/sim/stackWater";
import { HazardRun, hazardRefusal } from "../../src/core/sim/weather";
import { build, t3CaveWater } from "../../tools/terrain3d-maps";

const T3 = build(t3CaveWater()).bytes;
const same = (a: Uint8Array, b: Uint8Array) => Buffer.from(a).equals(Buffer.from(b));
/** A pit two deep beside the channel basin B spills through (y 24–25 at level 6, east of x 53). */
const PIT: EditOp = { op: "sculpt", params: { mode: "lower", cells: [[26, 56, 58]], amount: 2 } };

describe("an imported map with caves or overhangs", () => {
  it("unedited, exports its own file byte for byte and keeps its own water", () => {
    const s = MapSession.importMap(T3, "T3.timber");
    expect(s.notices).toEqual(["This map has caves or overhangs. The tools leave them as they are."]);
    expect(s.built.waterModel.stacked).toBeTruthy();
    expect(s.built.waterFromFile).toBe(true);
    // (the file as the app normalizes it on import is what it gives back)
    const again = MapSession.importMap(s.exportTimber().bytes, "T3.timber");
    expect(same(again.exportTimber().bytes, s.exportTimber().bytes)).toBe(true);
    expect(readTimber(s.exportTimber().bytes).world.singletons.WaterMapNew).toEqual(readTimber(writeTimber(readTimber(T3))).world.singletons.WaterMapNew);
  });

  it("edited, its water is simulated on every column, the caves' too, and the project brings the same map back", () => {
    const s = MapSession.importMap(T3, "T3.timber");
    const { x: W, y: H } = s.size;
    const N = W * H;
    const before = storedWater(readTimber(s.exportTimber().bytes).world.singletons, W, H);
    expect(s.apply(PIT).ok).toBe(true);
    const st = s.built.settle.stack!;
    expect(s.built.waterFromFile).toBe(false);
    expect(st.stacked).toBe(true);
    expect(st.L).toBeGreaterThan(1);
    // the channel beside the pit runs into it
    expect(s.built.water[26 * W + 57]).toBeGreaterThan(0.1);
    // the build's water is the map from above: each tile's top column
    for (let i = 0; i < N; i++) expect(s.built.water[i]).toBe(st.depth[(st.count[i] - 1) * N + i]);
    // the file holds the settle slot by slot, and the caves kept their water (the file's own was the
    // same engine's settle of the map before the pit)
    const bytes = s.exportTimber().bytes;
    const w = readTimber(bytes).world;
    expect((w.singletons.WaterMapNew as JsonObject).Levels).toBe(st.L);
    const after = storedWater(w.singletons, W, H);
    const lower = (t: typeof after) => {
      let n = 0;
      for (let k = 0; k < t.tile.length; k++) if (s.columns.has(t.tile[k]) && t.depth[k] > 0.05) n++;
      return n;
    };
    expect(lower(before)).toBeGreaterThan(50);
    expect(Math.abs(lower(after) - lower(before))).toBeLessThanOrEqual(2);
    // soil per run: as many slots as the tallest stack of runs
    expect((w.singletons.SoilMoistureSimulator as JsonObject).Size).toBeGreaterThan(1);
    // every voxel of the caves is kept
    const was = readTimber(T3).world.voxels;
    for (const i of s.columns.keys()) for (let z = 0; z < 23; z++) expect(w.voxels[z * N + i]).toBe(was[z * N + i]);
    // the project file reopens to the same land, water and export
    const reopened = MapSession.open(decodeProject(s.project()));
    expect(reopened.built.settle.stack?.depth).toEqual(st.depth);
    expect(same(reopened.exportTimber().bytes, bytes)).toBe(true);
    // and undo gives the file's own water back, byte for byte
    const own = MapSession.importMap(T3, "T3.timber").exportTimber().bytes;
    expect(s.undo()).toBe(true);
    expect(same(s.exportTimber().bytes, own)).toBe(true);
  });

  it("after an edit the last water shows, every column of it, until the settle is in place (live editing)", () => {
    const s = MapSession.importMap(T3, "T3.timber");
    s.setWaterMode("defer");
    const W = s.size.x;
    expect(s.apply(PIT).ok).toBe(true);
    expect(s.waterStale).toBe(true);
    const stale = s.built.settle.stack!;
    // (the caves' water is still the file's; the pit is dry until the settle)
    let wet = 0;
    const N = W * s.size.y;
    for (let i = 0; i < N; i++) for (let q = 0; q < stale.count[i] - 1; q++) if (stale.depth[q * N + i] > 0.05) wet++;
    expect(wet).toBeGreaterThan(0);
    expect(s.built.water[26 * W + 57]).toBe(0);
    s.settleCanonical();
    expect(s.waterPending).toBe(false);
    expect(s.built.water[26 * W + 57]).toBeGreaterThan(0.1);
    const direct = MapSession.importMap(T3, "T3.timber");
    direct.apply(PIT);
    expect(same(s.exportTimber().bytes, direct.exportTimber().bytes)).toBe(true);
  });

  it("refuses Fill, Remove unfed water, Drought and Badtide with one plain line each", () => {
    const s = MapSession.importMap(T3, "T3.timber");
    const i = 30 * s.size.x + 5;
    expect(s.apply({ op: "fillHollow", params: { at: [5, 30], level: 9, lake: { tiles: [i], floor: [8], depth: [1], contamination: [0] } } }).errors).toEqual([CAVE_REFUSALS.fill]);
    expect(s.apply({ op: "removeUnfedWater", params: { tiles: [i], pools: 1 } }).errors).toEqual([CAVE_REFUSALS.removeUnfed]);
    expect(planFill(s, 5, 30, 9).reason).toBe(CAVE_REFUSALS.fill);
    expect(unfedWater(s)).toMatchObject({ pools: 0, op: null, reason: CAVE_REFUSALS.removeUnfed });
    expect(hazardRefusal(s.built.waterModel)).toBe(CAVE_REFUSALS.weather);
    const water = { depth: Float64Array.from(s.built.water), contamination: Float64Array.from(s.built.contamination) };
    expect(() => new HazardRun(s.built.waterModel, water, "drought", 3)).toThrow(CAVE_REFUSALS.weather);
    expect(CAVE_REFUSALS).toEqual({
      weather: "Drought and Badtide aren't worked out for maps with caves yet",
      fill: "Fill isn't worked out for maps with caves yet",
      removeUnfed: "Removing unfed water isn't worked out for maps with caves yet",
    });
  });
});
