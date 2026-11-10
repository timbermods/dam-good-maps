// The outflows a map with caves or overhangs is exported with (#532): the game stores them per water column and per
// column they flow to (`ColumnOutflows`, FORMAT.md §4.3; the decompile's `ColumnOutflowsPackedListSerializer` and
// `WaterParametersUpdateTask.ProcessWaterDepthChanges`), so the export writes the settle's own, column by column,
// as a heightfield's export writes its tiles' (generator 0.7.0), instead of all "0".

import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import { toMapObject } from "../../src/core/features/build";
import { waterSource } from "../../src/core/format/entities";
import { parse, type JsonObject } from "../../src/core/format/json";
import { stackedSimulationSingletons, storedColumnOutflows, storedWater } from "../../src/core/format/world";
import { terrainColumns, waterColumns, type VoxelMasks } from "../../src/core/sim/columns";
import { waterModel, type MapObject } from "../../src/core/sim/model";
import { canonicalSettle } from "../../src/core/sim/prefill";
import { stackGraph, stackedModel, stackObjectRows, type StackSettle } from "../../src/core/sim/stackWater";
import { ColumnTerrain } from "../../src/core/terrain/runs";
import { t3CaveWater } from "../../tools/terrain3d-maps";
import { dig, wetCave } from "./caveMap";

/** Each wet column's outflows as the file holds them, four a column, against the settle's own (`flows`): the same, to
 *  the 7 significant places the file keeps (flows under 1e-6 are not written). The ways that flow. */
function sameFlows(s: JsonObject, W: number, H: number, st: StackSettle): number {
  const read = storedColumnOutflows(s, W, H)!;
  const water = storedWater(s, W, H);
  const N = W * H;
  expect(read.length).toBe(4 * water.tile.length);
  let flowing = 0;
  for (let k = 0; k < water.tile.length; k++) {
    const i = water.tile[k];
    let c = -1;
    for (let q = 0; q < st.count[i] && c < 0; q++) if (st.floor[q * N + i] === water.floor[k]) c = q * N + i;
    expect(c, `entry ${k}`).toBeGreaterThanOrEqual(0);
    for (let d = 0; d < 4; d++) {
      const want = st.flows![4 * c + d];
      expect(Math.abs(read[4 * k + d] - want), `column ${c} way ${d}`).toBeLessThanOrEqual(4e-6 + 1e-6 * want);
      if (want > 1e-6) flowing++;
    }
  }
  return flowing;
}

/** The settle `st` of the map `masks` with `objects` written as the export writes it, each token checked against the
 *  engine's graph: every part a column the water reaches from that column (or the margin beside the map's edge), each
 *  of the four parts the way it names, the flow above 1e-6; and read back, the settle's own flows. Counts of the
 *  columns over another (slot 1 up) that flow, the parts toward such columns and the parts after the four. */
function written(masks: VoxelMasks, objects: readonly MapObject[], st: StackSettle): { upper: number; toUpper: number; extra: number; flowing: number } {
  const { W, H } = masks;
  const N = W * H;
  expect(st.outflows).toBeDefined();
  const cols = waterColumns(masks, objects);
  expect([...cols.count]).toEqual([...st.count]);
  const runs = terrainColumns(masks);
  const soil = new Float64Array(runs.T * N);
  const s = stackedSimulationSingletons(W, H, { cols, depth: st.depth, overflow: st.overflow, contamination: st.contamination, sat: st.sat, runs, moisture: soil, soilContamination: soil, outflows: st.outflows });
  const wm = s.WaterMapNew as JsonObject;
  const water = String((wm.WaterColumns as JsonObject).Array).split(" ");
  const tokens = String((wm.ColumnOutflows as JsonObject).Array).split(" ");
  expect(tokens.length).toBe(cols.L * N);
  // the game's grid, padded by one tile: a column's index is slot · (W + 2)(H + 2) + (y + 1)(W + 2) + x + 1
  const stride = W + 2;
  const vertical = stride * (H + 2);
  const step = [-stride, -1, stride, 1];
  const g = stackGraph({ W, H, stacked: { mask: masks.mask, objects: stackObjectRows(objects) } });
  let upper = 0;
  let toUpper = 0;
  let extra = 0;
  for (let c = 0; c < tokens.length; c++) {
    if (tokens[c] === "0") continue;
    expect(water[c], `column ${c}`).not.toBe("0");
    const parts = tokens[c].split(":");
    expect(parts.length, `column ${c}`).toBeGreaterThanOrEqual(4);
    if (c >= N) upper++;
    const x = (c % N) % W;
    const y = Math.floor((c % N) / W);
    const from = (y + 1) * stride + x + 1;
    const targets = new Set<number>();
    for (let e = g.start[c]; e < g.start[c + 1]; e++) {
      const t = g.target[e];
      if (t >= 0) targets.add(Math.floor(t / N) * vertical + (Math.floor((t % N) / W) + 1) * stride + ((t % N) % W) + 1);
      else for (let d = 0; d < 4; d++) if (x + [0, -1, 0, 1][d] < 0 || y + [-1, 0, 1, 0][d] < 0 || x + [0, -1, 0, 1][d] >= W || y + [-1, 0, 1, 0][d] >= H) targets.add(from + step[d]);
    }
    parts.forEach((p, k) => {
      if (p === "0") return;
      const [index, flow] = p.split("|").map(Number);
      expect(targets.has(index), `column ${c} part ${p}`).toBe(true);
      if (k < 4) expect((index % vertical) - from, `column ${c} part ${k}`).toBe(step[k]);
      else extra++;
      expect(flow).toBeGreaterThan(1e-6);
      if (index >= vertical) toUpper++;
    });
  }
  return { upper, toUpper, extra, flowing: sameFlows(s, W, H, st) };
}

describe("the export's outflows on terrain above terrain (#532)", () => {
  it("T3's spring cave: every water column's own outflows, toward each column they reach, as the game stores them", () => {
    const m = t3CaveWater();
    const { W, H } = m.scene;
    const objects = m.scene.entities.map(toMapObject);
    const terrain = new ColumnTerrain(W, H, m.scene.mask);
    const model = stackedModel(waterModel(W, H, terrain.heights(), objects), terrain, objects);
    const w = written(terrain, objects, canonicalSettle(model).stack!);
    expect(w.flowing).toBeGreaterThan(50);
  });

  it("a basin filling over a shelf: the columns under and over it each take their own, the second after the four", () => {
    // a basin filling over a one-voxel shelf at level 5 (tools/rust/stack-identity.ts `shelf`): sources along its west
    // side and its water kept to level 8 west of the shelf, so at the shelf's edge it runs on into the columns under the
    // shelf and over it at once
    const W = 48, H = 48;
    const mask = new Uint32Array(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const wall = x === 0 || y === 0 || x === W - 1 || y === H - 1;
        mask[y * W + x] = (1 << (wall ? 14 : x < 16 ? 4 : 3)) - 1;
        if (!wall && x >= 20 && x < 28) mask[y * W + x] |= 1 << 5;
      }
    const objects = [];
    for (let y = 4; y < H - 4; y += 4) objects.push(toMapObject(waterSource({ id: `00000000-0000-4000-8000-0000000000${10 + y}`, owner: "test", x: 2, y, z: 4, strength: 3 })));
    const tiles: number[] = [], floor: number[] = [], depth: number[] = [];
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < 20; x++) {
        tiles.push(y * W + x);
        floor.push(x < 16 ? 4 : 3);
        depth.push(8 - (x < 16 ? 4 : 3));
      }
    const terrain = new ColumnTerrain(W, H, mask);
    const model = stackedModel(waterModel(W, H, terrain.heights(), objects), terrain, objects);
    const st = canonicalSettle({ ...model, retained: [{ tiles, floor, depth, contamination: tiles.map(() => 0) }] }).stack!;
    const w = written(terrain, objects, st);
    expect(w.upper).toBeGreaterThan(0);
    expect(w.toUpper).toBeGreaterThan(0);
    expect(w.extra).toBeGreaterThan(0);
    expect(w.flowing).toBeGreaterThan(100);
  });

  it("an edited cave import exports the settle's outflows, the cave's water included", () => {
    const { bytes } = wetCave();
    const s = MapSession.importMap(bytes, "wet-cave.timber");
    // an edit away from the water: the settle runs on the map's own water
    expect(s.apply(dig(35, 35, 1, "+z")).errors).toEqual([]);
    s.settleCanonical();
    const st = s.built.settle.stack!;
    expect(st.outflows).toBeDefined();
    const world = parse(strFromU8(unzipSync(s.exportTimber().bytes)["world.json"]).replace(/^﻿/, "")) as JsonObject;
    const singletons = world.Singletons as JsonObject;
    const tokens = String(((singletons.WaterMapNew as JsonObject).ColumnOutflows as JsonObject).Array).split(" ");
    expect(tokens.some((t) => t !== "0")).toBe(true);
    expect(sameFlows(singletons, s.size.x, s.size.y, st)).toBeGreaterThan(0);
  });
});
