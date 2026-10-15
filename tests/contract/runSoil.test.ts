// Soil per run top (3D view, part 3): every run top below its tile's top (a cave's floor, a ledge under an
// overhang) shows its own run's moisture and contamination, and the water standing on it, not its roof's. The
// worker sends the soil per run top with the view's soil (`SoilView.runs`: the file's own per run while its water
// shows, the stacked settle's after an edit, as the export writes them), the renderer writes it into its run texture (`RunSoil`), and what the terrain shader reads for a
// floor (`runSoilAt`, its rule in TypeScript) is soil3d's value for that run. Maps without terrain above
// terrain get no per-run soil, so the renderer builds no texture and its shader's branch is not compiled.
// The official cave maps (Hollows, Pressure) run only where they were copied locally, like
// strokesOnRunsOfficial.test.ts.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import { toMapObject } from "../../src/core/features/build";
import { generate } from "../../src/core/gen/generate";
import { readTimber, writeTimber } from "../../src/core/format/timber";
import { normalizeImport } from "../../src/core/format/normalize";
import { stackedSimulationSingletons, storedWater } from "../../src/core/format/world";
import { waterColumns, type VoxelMasks } from "../../src/core/sim/columns";
import { columnSaturation, soil3d, type Soil3d } from "../../src/core/sim/soil3d";
import { stackedSoil } from "../../src/core/sim/soil";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
import { soilNibbles } from "../../src/render3d/light";
import { WET, type MapView } from "../../src/render3d/model";
import { contaminationByte, moistureByte } from "../../src/render3d/palette";
import { RunSoil, runSoilAt, runSoilOn } from "../../src/render3d/runSoil";
import { apply, collabOpen, collabSession, openTimber, settleWater } from "../../src/worker/session";
import { CAVE, CAVE_H as H, CAVE_W as W, caveFile, caveVoxels } from "./caveMap";

const byte = (m: number, c: number) => soilNibbles(moistureByte(m), contaminationByte(c));

/** Every run top of `soil` against the view: a tile's top run in the tile data's soil, every run below it in the
 *  run texture at its own level, with the water on it. Returns the floors (run tops below a top) checked and
 *  how many are moist, contaminated, under water, and differ from their tile's top. */
function checkRunTops(view: MapView, soil: Soil3d, wetAt: (i: number, z: number) => boolean) {
  const { runs } = soil;
  const N = runs.N;
  const rs = RunSoil.build(view.W, view.H, view.soil!.runs ?? null, view.water);
  expect(rs, "the renderer builds the run texture").not.toBeNull();
  const out = { floors: 0, moist: 0, bad: 0, wet: 0, unlikeTop: 0 };
  for (let i = 0; i < N; i++) {
    const n = runs.count[i];
    const x = i % view.W;
    const y = (i - x) / view.W;
    const topId = (n - 1) * N + i;
    const top = byte(soil.moisture[topId], soil.contamination[topId]);
    expect(soilNibbles(view.soil!.moisture[i], view.soil!.contamination[i]), `tile ${x},${y}'s top`).toBe(top);
    for (let k = 0; k < n - 1; k++) {
      const id = k * N + i;
      const z = runs.ceil[id];
      const want = byte(soil.moisture[id], soil.contamination[id]);
      const got = runSoilAt(rs, x, y, z);
      expect(got, `tile ${x},${y} level ${z}`).toEqual({ soil: want, wet: wetAt(i, z) });
      out.floors++;
      if (want >> 4) out.moist++;
      if (want & 15) out.bad++;
      if (got!.wet) out.wet++;
      if (want !== top) out.unlikeTop++;
    }
  }
  // no cell where no run top is
  let cells = 0;
  for (let c = 0; c < rs!.data.length; c += 2) if (rs!.data[c + 1]) cells++;
  expect(cells).toBe(out.floors);
  return out;
}

/** Whether the view has water standing on level z of tile i. */
const wetIn = (view: MapView) => (i: number, z: number) => {
  for (let k = 0; k < view.water.count; k++) if (view.water.tile[k] === i && Math.abs(view.water.floor[k] - z) < 0.01 && view.water.depth[k] > WET) return true;
  return false;
};

/** A tunnel at the bottom of the plateau (inclusive tiles). */
const TUNNEL = { x0: 5, y0: 30, x1: 7, y1: 32 };
const tile = (x: number, y: number) => [4 * x + 2, 4 * y + 2];

/** The cave map with water in the cave (clean on its east, badwater on its west) and the game's soil for it,
 *  stored as the game saves a map with caves (per water column and per run top). */
function wetCave(): { bytes: Uint8Array; soil: Soil3d } {
  const voxels = caveVoxels();
  const N = W * H;
  // and a tunnel at the very bottom (air at z 0–1 under the ground), with water in it: its columns start with the
  // game's empty run, so a tile's top is its second slot
  for (let y = TUNNEL.y0; y <= TUNNEL.y1; y++) for (let x = TUNNEL.x0; x <= TUNNEL.x1; x++) for (let z = 0; z < 2; z++) voxels[z * N + y * W + x] = 0;
  const mask = new Uint32Array(N);
  for (let z = 0; z < 23; z++) for (let i = 0; i < N; i++) if (voxels[z * N + i]) mask[i] |= 1 << z;
  const masks: VoxelMasks = { W, H, mask };
  const cols = waterColumns(masks, []);
  const depth = new Float64Array(cols.L * N);
  const contamination = new Float64Array(cols.L * N);
  for (let y = CAVE.y0; y <= CAVE.y1; y++)
    for (let x = CAVE.x0; x <= CAVE.x0 + 2; x++) {
      const i = y * W + x;
      for (let k = 0; k < cols.count[i]; k++)
        if (cols.floor[k * N + i] === CAVE.air[0]) {
          depth[k * N + i] = 1.2;
          contamination[k * N + i] = x === CAVE.x0 ? 1 : 0;
        }
    }
  for (let y = TUNNEL.y0; y <= TUNNEL.y1; y++) for (let x = TUNNEL.x0; x <= TUNNEL.x1; x++) depth[y * W + x] = 1.2;
  const sat = columnSaturation(cols, depth);
  const soil = soil3d(masks, cols, { depth, contamination, sat });
  const file = caveFile(voxels);
  file.world.singletons = stackedSimulationSingletons(W, H, { cols, depth, overflow: new Float64Array(depth.length), contamination, sat, runs: soil.runs, moisture: soil.moisture, soilContamination: soil.contamination });
  return { bytes: writeTimber(file), soil };
}

describe("soil per run top (3D view, part 3)", () => {
  it("a cave's floors show their own run's soil and water, unedited and after an edit", () => {
    const { bytes, soil } = wetCave();
    const { view } = openTimber(bytes, "cave.timber");
    expect(view.soil?.runs?.tile.length).toBeGreaterThan(0);
    const seen = checkRunTops(view, soil, wetIn(view));
    // the cave's 36 floors, the ledge's lowland under it (15), the tunnel's 9, and the floors are not their roofs' soil
    expect(seen.floors).toBe(36 + 15 + 9);
    expect(seen.moist).toBeGreaterThan(0);
    expect(seen.bad).toBeGreaterThan(0);
    expect(seen.wet).toBe(18 + 9);
    expect(seen.unlikeTop).toBeGreaterThan(20);
    // the tunnel's tops: their own (dry) run, never the wet empty run under them (checkRunTops checked their value)
    const N = W * H;
    const mid = 31 * W + 6;
    expect(soil.runs.count[mid]).toBe(2);
    expect(soilNibbles(view.soil!.moisture[mid], view.soil!.contamination[mid])).not.toBe(byte(soil.moisture[mid], soil.contamination[mid]));
    expect(byte(soil.moisture[mid], 0) >> 4, "the tunnel's floor is moist").toBeGreaterThan(0);
    expect(byte(soil.moisture[N + mid], 0), "its top is dry").toBe(0);
    // an edit off the cave, then one on its roof: the water is the stacked settle's on every column (D120), and so
    // is the soil on every run top, the soil the export writes (sim/soil.ts `stackedSoil`), the view's runs with it
    const edits = [
      { tool: "raise", size: 2, strength: 5, shape: "area", target: 10, dabs: [6, 6, 10, 10] },
      { tool: "raise", size: 1, strength: 5, shape: "area", target: 10, dabs: [...tile(16, 16), ...tile(19, 19)] },
    ];
    let water = view.water;
    for (const params of edits) {
      const u = apply({ op: "brush", params } as Parameters<typeof apply>[0]);
      expect(u.errors).toEqual([]);
      const after = { ...view, ...u, ...settleWater() } as unknown as MapView;
      water = after.water ?? water;
      expect(after.soil?.runs, "the soil sent after the edit carries the run tops").toBeDefined();
      const s = collabSession()!;
      const objects = s.built.entities.map(toMapObject);
      const settled = stackedSoil(s.terrain, waterColumns(s.terrain, objects), s.built.settle.stack!, objects);
      checkRunTops({ ...view, soil: after.soil, water }, settled, wetIn({ ...view, water }));
    }
  });

  it("a refresh rewrites only what changed and gives its box", () => {
    const { bytes } = wetCave();
    const { view } = openTimber(bytes, "cave.timber");
    const runs = view.soil!.runs!;
    const rs = RunSoil.build(W, H, runs, view.water)!;
    const same = rs.data.slice();
    expect(rs.refresh(runs, view.water), "nothing changed").toBeNull();
    // the water gone from one floor: that tile's cell alone
    const k = [...view.water.tile].findIndex((i) => i === 17 * W + 15);
    const dry = { ...view.water, depth: view.water.depth.slice() };
    dry.depth[k] = 0;
    expect(rs.refresh(runs, dry)).toEqual({ x0: 15, y0: 17, x1: 15, y1: 17 });
    // and back
    expect(rs.refresh(runs, view.water)).toEqual({ x0: 15, y0: 17, x1: 15, y1: 17 });
    expect(rs.data).toEqual(same);
    // a run top gone (a cave filled): its cell cleared
    const fewer = { tile: runs.tile.slice(1), level: runs.level.slice(1), moisture: runs.moisture.slice(1), contamination: runs.contamination.slice(1) };
    const x = runs.tile[0] % W;
    const y = (runs.tile[0] - x) / W;
    expect(rs.refresh(fewer, view.water)).toEqual({ x0: x, y0: y, x1: x, y1: y });
    expect(runSoilAt(rs, x, y, runs.level[0])).toBeNull();
  });

  const maps: [ThemeId, number, number][] = [
    ["any", 96, 1],
    ["riverValley", 128, 2],
    ["canyon", 128, 1],
    ["highlands", 96, 4],
    ["lakeBasin", 128, 5],
    ["islands", 96, 2],
    ["delta", 96, 7],
  ];
  it.each(maps)("%s %i² seed %i, generated: no soil per run top, so no texture and no shader branch", (theme, size, seed) => {
    const r = generate(makeSpec({ seed, theme, size: { x: size, y: size } }));
    const { view } = collabOpen(MapSession.fromGenerated(r));
    expect(view.columns.tiles.length).toBe(0);
    expect(view.soil?.runs).toBeUndefined();
    expect(runSoilOn(view.columns.tiles.length, view.soil?.runs)).toBe(false);
    expect(RunSoil.build(view.W, view.H, view.soil?.runs ?? null, view.water)).toBeNull();
  });
});

const DIRS = [process.env.DGM_OFFICIAL_MAPS ?? "", ".scratch/official", resolve("../../../.scratch/official"), "investigation/raw/builtin"];
const DIR = DIRS.find((d) => d && existsSync(d)) ?? null;
const mapPath = (name: string) => (DIR ? readdirSync(DIR).filter((f) => f.endsWith(".timber") && f.includes(name)).map((f) => join(DIR, f))[0] : undefined);

describe("soil per run top on the official cave maps (local only)", () => {
  for (const name of ["Hollows", "Pressure"]) {
    const path = mapPath(name);
    it.skipIf(!path)(`${name}: every run top's soil as the shader reads it is soil3d's on the map's water`, () => {
      const bytes = new Uint8Array(readFileSync(path!));
      const { view } = openTimber(bytes, `${name}.timber`);
      // the game's soil on the file's own water, per run top (sim/soil3d.ts)
      const s = MapSession.importMap(bytes, `${name}.timber`);
      const file = readTimber(bytes);
      normalizeImport(file);
      const N = view.W * view.H;
      const masks: VoxelMasks = { W: view.W, H: view.H, mask: s.terrain.mask };
      const objects = s.built.entities.map(toMapObject);
      const cols = waterColumns(masks, objects);
      const sw = storedWater(file.world.singletons, view.W, view.H);
      const depth = new Float64Array(cols.L * N);
      const contamination = new Float64Array(cols.L * N);
      for (let k = 0; k < sw.tile.length; k++) {
        const i = sw.tile[k];
        for (let q = 0; q < cols.count[i]; q++)
          if (cols.floor[q * N + i] === Math.round(sw.floor[k])) {
            depth[q * N + i] = sw.depth[k];
            contamination[q * N + i] = sw.contamination[k];
          }
      }
      const soil = soil3d(masks, cols, { depth, contamination }, objects);
      const seen = checkRunTops(view, soil, wetIn(view));
      console.log(`${name}: ${seen.floors} floors below a top, ${seen.moist} moist, ${seen.bad} contaminated, ${seen.wet} under water, ${seen.unlikeTop} unlike their tile's top`);
      expect(seen.unlikeTop).toBeGreaterThan(100);
    });
  }
});
