// Import normalization (PLAN §19.6) on small hand-made maps in the old shapes, so every rule runs in
// CI (the real 0.6, 0.7 and 1.0 maps are local only: tests/contract/import.test.ts).

import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { importDocument } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { isObject, parse, type JsonObject } from "../../src/core/format/json";
import { ImportError, normalizeImport } from "../../src/core/format/normalize";
import { readTimber } from "../../src/core/format/timber";
import { encodeWorld, GAME_VERSION } from "../../src/core/format/world";

const X = 6;
const Y = 5;

function tokens(n: number, fn: (i: number) => string): string {
  return Array.from({ length: n }, (_, i) => fn(i)).join(" ");
}

/** A 6×5 map in the 0.7 shape: 25 layers with solid voxels in layers 20–24, MapHeight, 4-field
 *  water, saved outflows, no WaterSimulationMigrator, missing Size and Levels, and old entity keys. */
function oldWorld(legacy = false): string {
  const plane = X * Y;
  const L = 25;
  const terrain = legacy
    ? `{"Heights":{"Array":"${tokens(plane, (i) => String(2 + (i % 3)))}"}}`
    : `{"Voxels":{"Array":"${tokens(plane * L, (v) => {
        const z = Math.floor(v / plane);
        const i = v % plane;
        return z < 2 + (i % 3) || (i === 7 && z >= 20) ? "1" : "0";
      })}"}}`;
  const water = tokens(plane, (i) => (i === 3 ? "0.5:0:0:2" : i === 4 ? "0.25:0.5:0" : "0"));
  const flows = tokens(plane, (i) => (i === 3 ? "11|0.6:0:12|0.2:0" : "0"));
  return (
    `{"GameVersion":"0.7.10.2-5762fd5-sw","Timestamp":"2024-05-01 10:00:00","Singletons":{` +
    `"MapSize":{"Size":{"X":${X},"Y":${Y}},"MapHeight":{"X":25,"Y":35}},` +
    `"MapThumbnailCameraMover":{"CurrentConfiguration":{"Position":{"X":1.5,"Y":2.25,"Z":3.0}}},` +
    `"TerrainMap":${terrain},` +
    `"WaterMapNew":{"Levels":1,"WaterColumns":{"Array":"${water}"},"ColumnOutflows":{"Array":"${flows}"}},` +
    `"WaterEvaporationMap":{"EvaporationModifiers":{"Array":"${tokens(plane, () => "1")}"}},` +
    `"SoilMoistureSimulator":{"MoistureLevels":{"Array":"${tokens(plane, () => "0")}"}},` +
    `"SoilContaminationSimulator":{"Size":1,"ContaminationCandidates":{"Array":"${tokens(plane, () => "0")}"},"ContaminationLevels":{"Array":"${tokens(plane, () => "0")}"}},` +
    `"ModdedService":{"Keep":[1,2.50,"x"]}},"Entities":[` +
    `{"Id":"00000000-0000-4000-8000-000000000001","Template":"WaterSource","Components":{"WaterSource":{"SpecifiedStrength":1.2,"CurrentStrength":1.2},"BlockObject":{"Coordinates":{"X":1,"Y":1,"Z":3},"Orientation":{"Value":"Cw90"}},"BlockObjectState":{"Finished":true}}},` +
    `{"Id":"00000000-0000-4000-8000-000000000002","Template":"Pine","Components":{"BlockObject":{"Coordinates":{"X":2,"Y":1,"Z":4}},"CoordinatesOffseter":{"CoordinatesOffset":{"X":0.1,"Y":0.0}},"Yielder:Cuttable":{"Yield":{"Good":{"Id":"Log"},"Amount":2}},"WateredNaturalResource":{"DryingProgress":0.5},"DryObject":{"IsDry":true},"NaturalResourceModelRandomizer":{"Rotation":12.5},"ModComponent":{"Value":7}}},` +
    `{"Id":"00000000-0000-4000-8000-000000000003","Template":"Bomb","Components":{"BlockObject":{"Coordinates":{"X":4,"Y":3,"Z":3}},"TimeBomb":{"ExplosionRadius":2}}},` +
    `{"Id":"00000000-0000-4000-8000-000000000004","Template":"Maple","Components":{"BlockObject":{"Coordinates":{"X":0,"Y":4,"Z":2}}}},` +
    `{"Id":"00000000-0000-4000-8000-000000000005","Template":"StartingLocation","Components":{"BlockObject":{"Coordinates":{"X":3,"Y":0,"Z":2}},"StartingLocationPlayer":{"PlayerIndex":1},"ContaminatedObject":{"IsContaminated":false}}}` +
    `]}`
  );
}

function timber(world: string, meta = `{"Width":${X},"Height":${Y},"MapNameLocKey":"","MapDescriptionLocKey":"","MapDescription":"Old map","IsRecommended":false,"IsDev":false,"MaxPlayers":2}`): Uint8Array {
  return zipSync({
    "map_metadata.json": strToU8(meta),
    "version.txt": strToU8("0.7.10.2-5762fd5-sw\r\n"),
    "world.json": strToU8(world),
  });
}

const comps = (w: { entities: JsonObject[] }, k: number) => w.entities[k].Components as JsonObject;

describe("import normalization (PLAN §19.6)", () => {
  const file = readTimber(timber(oldWorld()));
  const report = normalizeImport(file);
  const w = file.world;
  const ids = report.changes.map((c) => c.id);

  it("keeps layers 0–21 of a 25-layer map and drops the rest, with a warning", () => {
    expect(w.layers).toBe(23);
    const plane = X * Y;
    let top = 0;
    for (let v = 21 * plane; v < 23 * plane; v++) top += w.voxels[v];
    expect(top).toBe(1); // tile 7 keeps its voxel in layer 21; layer 22 is empty, as the game leaves it
    const change = report.changes.find((c) => c.id === "terrain.layers")!;
    expect(change.level).toBe("warning");
    expect(change.message).toContain("dropped 3 blocks of ground");
    expect("MapHeight" in (w.singletons.MapSize as JsonObject)).toBe(false);
  });

  it("halves every water source and saved outflow without WaterSimulationMigrator, and marks the water migrated", () => {
    const ws = comps(w, 0).WaterSource as JsonObject;
    expect(String((ws.SpecifiedStrength as { value: number }).value)).toBe("0.6");
    expect(String((ws.CurrentStrength as { value: number }).value)).toBe("0.6");
    const flows = String(((w.singletons.WaterMapNew as JsonObject).ColumnOutflows as JsonObject).Array).split(" ");
    expect(flows[3]).toBe("11|0.3:0:12|0.1:0");
    expect(w.singletons.WaterSimulationMigrator).toEqual({ IsMigrated: true });
    // written before WaterMapNew, as the game orders its singletons
    const keys = Object.keys(w.singletons);
    expect(keys.indexOf("WaterSimulationMigrator")).toBe(keys.indexOf("WaterMapNew") - 1);
    expect(report.changes.find((c) => c.id === "water.migrator")?.level).toBe("warning");
  });

  it("gives 4- and 3-field water columns the OldWaterDepth field", () => {
    const cols = String(((w.singletons.WaterMapNew as JsonObject).WaterColumns as JsonObject).Array).split(" ");
    expect(cols[3]).toBe("0.5:0:0:2:0.5");
    expect(cols[4]).toBe("0.25:0.5:0:0:0.25");
  });

  it("migrates old keys the way the game does and keeps what it does not know", () => {
    expect((comps(w, 0).BlockObject as JsonObject).Orientation).toBe("Cw90");
    const pine = comps(w, 1);
    expect(pine.CoordinatesOffsetter).toEqual({ Random: true });
    expect("CoordinatesOffseter" in pine).toBe(false);
    expect((pine["Yielder:Cuttable"] as JsonObject).Yield).toEqual({ Good: "Log", Amount: 2 });
    expect(Object.keys(pine.WateredNaturalResource as JsonObject)).toEqual(["DyingProgress"]);
    expect("DryObject" in pine || "NaturalResourceModelRandomizer" in pine).toBe(false);
    expect(pine.ModComponent).toEqual({ Value: 7 }); // unknown components pass through
    expect(Object.keys(pine)).toEqual(["BlockObject", "CoordinatesOffsetter", "Yielder:Cuttable", "WateredNaturalResource", "ModComponent"]);
    expect(w.entities[2].Template).toBe("UnstableCore");
    expect("UnstableCore" in comps(w, 2)).toBe(true);
    expect(isObject(w.singletons.ModdedService)).toBe(true);
    expect((w.singletons.SoilMoistureSimulator as JsonObject).Size).toBe(1);
    expect(Object.keys(w.singletons.WaterEvaporationMap as JsonObject)[0]).toBe("Levels");
  });

  it("keeps Timber Together's StartingLocationPlayer (PLAN §20, D5, D36)", () => {
    const start = comps(w, 4);
    expect(start.StartingLocationPlayer).toEqual({ PlayerIndex: 1 });
    expect("ContaminatedObject" in start).toBe(false);
  });

  it("flags faction-only plants with a one-click removal, and removes nothing itself", () => {
    expect(w.entities.some((e) => e.Template === "Maple")).toBe(true);
    expect(report.flags).toHaveLength(1);
    expect(report.flags[0].fix).toEqual({ op: "deleteEntities", label: "Remove the plants of one faction", params: { entities: ["00000000-0000-4000-8000-000000000004"] } });
  });

  it("completes the metadata, keeps extra keys, and stamps the native version", () => {
    expect(Object.keys(file.metadata!)).toEqual(["Width", "Height", "MapNameLocKey", "MapDescriptionLocKey", "MapDescription", "IsRecommended", "IsUnconventional", "IsDev", "MaxPlayers"]);
    expect(w.gameVersion).toBe(GAME_VERSION);
    expect(file.versionTxt).toBe(GAME_VERSION + "\r\n");
    expect(report.sourceVersion).toBe("0.7.10.2-5762fd5-sw");
    expect(ids).toContain("file.version");
  });

  it("is applied once: a normalized map normalizes to itself", () => {
    const again = readTimber(timber(encodeWorld(w), JSON.stringify(parse(JSON.stringify(file.metadata)))));
    // (the version stamp lives in version.txt as well; the rest is in world.json)
    again.versionTxt = GAME_VERSION + "\r\n";
    const r2 = normalizeImport(again);
    expect(r2.changes).toEqual([]);
    expect(encodeWorld(again.world)).toBe(encodeWorld(w));
  });

  it("converts a 0.6 heightmap to voxels", () => {
    const f6 = readTimber(timber(oldWorld(true)));
    expect(f6.world.legacy).toBe(true);
    const r6 = normalizeImport(f6);
    expect(r6.changes.map((c) => c.id)).toContain("terrain.heights");
    expect(f6.world.legacy).toBe(false);
    expect(Object.keys(f6.world.singletons.TerrainMap as JsonObject)).toEqual(["Voxels"]);
    expect(f6.world.layers).toBe(23);
    const text = encodeWorld(f6.world);
    expect(text).not.toContain("Heights");
  });

  it("refuses saves", () => {
    const save = zipSync({ "save_metadata.json": strToU8("{}"), "version.txt": strToU8(GAME_VERSION), "world.json": strToU8(oldWorld()) });
    expect(() => importDocument(save, "save.timber")).toThrow(ImportError);
  });

  it("an imported map exports its normalized world byte for byte, and re-imports unchanged", () => {
    const s = MapSession.importMap(timber(oldWorld()), "Old map.timber");
    expect(s.mode).toBe("import");
    const out = s.exportTimber();
    expect(out.fileName).toBe("dgm-old-map.timber");
    const world = strFromU8(unzipSync(out.bytes)["world.json"]);
    expect(world).toBe(encodeWorld(w));
    const again = MapSession.importMap(out.bytes, out.fileName);
    expect(again.meta.source!.report.changes).toEqual([]);
    expect(Buffer.from(again.exportTimber().bytes).equals(Buffer.from(out.bytes))).toBe(true);
  });
});
