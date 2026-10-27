// Import of every map the investigation collected (ROADMAP M3 acceptance, EDITOR_PLAN §9 "Import"):
// every voxel-format map (official, dev and workshop, 0.7 to 1.1) imports and re-exports its
// normalized world byte for byte; the two 0.6 heightmap maps import; saves are refused. The maps
// are not ours to redistribute, so this runs only where they were copied locally
// (investigation/raw); CI runs the same rules on hand-made maps (tests/unit/normalize.test.ts) and
// on generated maps (tests/contract/properties.test.ts).

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { entityProblem, planEntity, type PlannedOps } from "../../src/core/doc/placing";
import { isObject, num, type JsonObject } from "../../src/core/format/json";
import { ImportError, normalizeImport } from "../../src/core/format/normalize";
import { readTimber } from "../../src/core/format/timber";
import { decodeWorld, encodeWorld, GAME_VERSION } from "../../src/core/format/world";

const RAW = "investigation/raw";
const list = (dir: string) => (existsSync(join(RAW, dir)) ? readdirSync(join(RAW, dir)).filter((f) => f.endsWith(".timber")).map((f) => join(RAW, dir, f)) : []);
const maps = [...list("builtin"), ...list("workshop"), ...list("user")];
const saves = list("saves");
const worldText = (bytes: Uint8Array) => strFromU8(unzipSync(bytes)["world.json"]).replace(/^﻿/, "");
const isLegacy = (path: string) => /"TerrainMap":\{"Heights"/.test(worldText(new Uint8Array(readFileSync(path))));
const voxel = maps.filter((p) => !isLegacy(p));
const legacy = maps.filter(isLegacy);
const named = (part: string) => maps.find((p) => p.includes(part));

describe("import of the investigation maps (local only)", () => {
  it.skipIf(voxel.length === 0)(`every voxel-format map imports and re-exports its normalized world byte for byte (${voxel.length} maps)`, () => {
    for (const path of voxel) {
      const bytes = new Uint8Array(readFileSync(path));
      const file = readTimber(bytes);
      normalizeImport(file);
      const normalized = encodeWorld(file.world);
      const s = MapSession.importMap(bytes, path);
      expect(s.mode, path).toBe("import");
      const out = s.exportTimber().bytes;
      const zip = unzipSync(out);
      expect(strFromU8(zip["world.json"]), path).toBe(normalized);
      // unedited: the original thumbnail, and nothing left to normalize when it comes back
      expect(Buffer.from(zip["map_thumbnail.jpg"]).equals(Buffer.from(unzipSync(bytes)["map_thumbnail.jpg"])), path).toBe(true);
      const again = MapSession.importMap(out, path);
      expect(again.meta.source!.report.changes, path).toEqual([]);
      expect(Buffer.from(again.exportTimber().bytes).equals(Buffer.from(out)), path).toBe(true);
    }
    expect(voxel.length).toBeGreaterThanOrEqual(30);
  });

  it.skipIf(voxel.length === 0)("official 1.1 maps change only their version stamp", () => {
    const official = voxel.filter((p) => p.includes("builtin") && !/[\\/]_/.test(p));
    expect(official.length).toBe(19);
    for (const path of official) {
      const bytes = new Uint8Array(readFileSync(path));
      const original = worldText(bytes);
      const file = readTimber(bytes);
      const r = normalizeImport(file);
      expect(r.changes.map((c) => c.id), path).toEqual(["file.version"]);
      expect(encodeWorld(file.world), path).toBe(original.replace(/^\{"GameVersion":"[^"]*"/, `{"GameVersion":"${GAME_VERSION}"`));
    }
  });

  it.skipIf(legacy.length === 0)(`the two 0.6 heightmap maps import (${legacy.length} maps)`, () => {
    expect(legacy.length).toBe(2);
    for (const path of legacy) {
      const s = MapSession.importMap(new Uint8Array(readFileSync(path)), path);
      const ids = s.meta.source!.report.changes.map((c) => c.id);
      expect(ids, path).toContain("terrain.heights");
      expect(ids, path).toContain("water.migrator");
      const out = s.exportTimber().bytes;
      const w = decodeWorld(worldText(out));
      expect(w.legacy, path).toBe(false);
      expect(w.layers, path).toBe(23);
      // the load checks the game runs on its structure pass: layers, arrays, enums, components
      const v = s.validate("import").report.checks;
      for (const id of ["file.layers", "file.singletons", "file.arrays", "entities.enums", "entities.components", "entities.ids"]) expect(v.find((c) => c.id === id)?.ok, `${path} ${id}`).toBe(true);
      const again = MapSession.importMap(out, path);
      expect(again.meta.source!.report.changes, path).toEqual([]);
    }
  });

  it.skipIf(!named("Tower of Beaverlon"))("the 90-layer workshop map keeps layers 0–21 with a warning and exports 23", () => {
    const s = MapSession.importMap(new Uint8Array(readFileSync(named("Tower of Beaverlon")!)), "tower.timber");
    const c = s.meta.source!.report.changes.find((x) => x.id === "terrain.layers")!;
    expect(c.level).toBe("warning");
    expect(c.message).toMatch(/^The map has 90 terrain layers/);
    const w = decodeWorld(worldText(s.exportTimber().bytes));
    expect(w.layers).toBe(23);
    const plane = w.sizeX * w.sizeY;
    for (let v = 22 * plane; v < 23 * plane; v++) expect(w.voxels[v]).toBe(0);
  });

  it.skipIf(!named("Cozy Secret Valley"))("a pre-1.0 map without WaterSimulationMigrator has its strengths halved at import", () => {
    const path = named("Cozy Secret Valley")!;
    const before = readTimber(new Uint8Array(readFileSync(path))).world;
    expect(before.singletons.WaterSimulationMigrator).toBeUndefined();
    const s = MapSession.importMap(new Uint8Array(readFileSync(path)), path);
    const after = decodeWorld(worldText(s.exportTimber().bytes));
    expect(after.singletons.WaterSimulationMigrator).toEqual({ IsMigrated: true });
    const strengths = (w: typeof before) =>
      w.entities.filter((e) => isObject((e.Components as JsonObject).WaterSource)).map((e) => num(((e.Components as JsonObject).WaterSource as JsonObject).SpecifiedStrength));
    const a = strengths(before);
    const b = strengths(after);
    expect(a.length).toBeGreaterThan(0);
    expect(b).toEqual(a.map((v) => v * 0.5));
  });

  it.skipIf(!named("Meander Multiplayer"))("a multi-colony map keeps all its starts and their StartingLocationPlayer (PLAN §20, D5)", () => {
    const s = MapSession.importMap(new Uint8Array(readFileSync(named("Meander Multiplayer")!)), "meander.timber");
    const w = decodeWorld(worldText(s.exportTimber().bytes));
    const starts = w.entities.filter((e) => e.Template === "StartingLocation");
    expect(starts.length).toBe(3);
    expect(starts.map((e) => ((e.Components as JsonObject).StartingLocationPlayer as JsonObject).PlayerIndex).sort()).toEqual([0, 1, 2]);
  });

  it.skipIf(!named("Hollows"))("an imported map with caves edits its surface, keeps its caves, and survives the project file", () => {
    const s = MapSession.importMap(new Uint8Array(readFileSync(named("Hollows")!)), "Hollows.timber");
    const before = decodeWorld(worldText(s.exportTimber().bytes));
    const plane = before.sizeX * before.sizeY;
    const caves = new Set<number>();
    for (let i = 0; i < plane; i++) {
      let top = 0;
      for (let z = 0; z < 23; z++) if (before.voxels[z * plane + i]) top = z + 1;
      for (let z = 0; z < top; z++) if (!before.voxels[z * plane + i]) caves.add(i);
    }
    expect(caves.size).toBeGreaterThan(1000);
    expect([...s.columns.keys()].sort((x, y) => x - y)).toEqual([...caves].sort((x, y) => x - y));
    // sculpting a cave column is refused; a plain column is raised
    const cave = [...caves][0];
    const cy = Math.floor(cave / before.sizeX);
    const cx = cave % before.sizeX;
    expect(s.apply({ op: "sculpt", params: { mode: "raise", cells: [[cy, cx, cx]], amount: 1 } }).errors[0]).toMatch(/cave or overhang/);
    let plain = 0;
    while (caves.has(plain) || s.built.heights[plain] >= 15) plain++;
    const py = Math.floor(plain / before.sizeX);
    const px = plain % before.sizeX;
    const h = s.built.heights[plain];
    expect(s.apply({ op: "sculpt", params: { mode: "raise", cells: [[py, px, px]], amount: 1 } }).ok).toBe(true);
    const after = decodeWorld(worldText(s.exportTimber().bytes));
    for (const i of caves) for (let z = 0; z < 23; z++) expect(after.voxels[z * plane + i]).toBe(before.voxels[z * plane + i]);
    expect(after.voxels[h * plane + plain]).toBe(1);
    const reopened = MapSession.open(decodeProject(s.project()));
    expect(Buffer.from(reopened.exportTimber().bytes).equals(Buffer.from(s.exportTimber().bytes))).toBe(true);
  });

  it.skipIf(!named("Canyon.timber"))("an edited map with water under roofs has it simulated there too, every slot written from the settle (D120, D280; D100's exception is retired)", () => {
    const s = MapSession.importMap(new Uint8Array(readFileSync(named("Canyon.timber")!)), "Canyon.timber");
    s.setPreviewWater(true);
    const roofed = s.roofedTiles;
    expect(roofed.size).toBeGreaterThan(100);
    const tokens = (bytes: Uint8Array, key: "WaterColumns" | "ColumnOutflows") => {
      const w = decodeWorld(worldText(bytes));
      const wm = w.singletons.WaterMapNew as JsonObject;
      return { levels: num(wm.Levels), t: String((wm[key] as JsonObject).Array).split(" "), plane: w.sizeX * w.sizeY };
    };
    const before = tokens(s.exportTimber().bytes, "WaterColumns");
    // a water source on dry ground, away from the caves
    const W = s.size.x;
    let plan: PlannedOps | null = null;
    let at = -1;
    for (let y = 20; y < W - 20 && !plan?.ok; y += 7)
      for (let x = 20; x < W - 20 && !plan?.ok; x += 7) {
        let clear = true;
        for (let dy = -9; dy <= 9 && clear; dy++) for (let dx = -9; dx <= 9; dx++) if (roofed.has((y + dy) * W + x + dx)) clear = false;
        if (!clear || s.built.water[y * W + x] > 0) continue;
        const req = { template: "WaterSource", x, y, orientation: "Cw0" as const, components: { WaterSource: { SpecifiedStrength: 2, CurrentStrength: 2 } } };
        if (entityProblem(s, req, null, { level: true })) continue;
        const p = planEntity(s, req, "7a1b2c3d-4444-4222-8333-444455556666");
        if (p.ok) {
          plan = p;
          at = y * W + x;
        }
      }
    expect(plan?.ok).toBe(true);
    if (!plan?.ok) return;
    expect(s.applyAll(plan.ops, "user", plan.label).ok).toBe(true);
    const bytes = s.exportTimber().bytes;
    const after = tokens(bytes, "WaterColumns");
    expect(after.levels).toBe(before.levels);
    expect(s.built.waterModel.stacked).toBeTruthy();
    expect(s.built.settle.stack?.L).toBe(after.levels);
    // under the roofs the water is the settle's own now, and it is still there: about as many wet
    // columns as the file had (the game's water on this map at rest), every slot counted
    const wet = (t: { levels: number; t: string[]; plane: number }) => {
      let n = 0;
      for (const i of roofed) for (let k = 0; k < t.levels; k++) if (Number(t.t[k * t.plane + i].split(":")[0]) > 0.05) n++;
      return n;
    };
    expect(wet(before)).toBeGreaterThan(100);
    expect(Math.abs(wet(after) - wet(before))).toBeLessThan(0.05 * wet(before));
    // a lower slot is written from the settle (the writer's token: its depth twice)
    const lower = [...roofed].map((i) => after.t[i]).filter((t) => t !== "0");
    expect(lower.length).toBeGreaterThan(0);
    for (const t of lower) expect(t.split(":")[0]).toBe(t.split(":")[4]);
    // the new source's water is settled in the file
    expect(after.t[at]).not.toBe("0");
    // and the project file brings back the same map
    const reopened = MapSession.open(decodeProject(s.project()));
    expect(Buffer.from(reopened.exportTimber().bytes).equals(Buffer.from(bytes))).toBe(true);
  });

  it.skipIf(saves.length === 0)("saves are refused with a message", () => {
    for (const path of saves) expect(() => MapSession.importMap(new Uint8Array(readFileSync(path)), path)).toThrow(ImportError);
  });
});
