// The load checks against files the game would refuse or prune (investigation/notes/blocks_and_placement.md §6).
import { buildMap } from "../../../src/core/features/build";
import { readTimber, writeTimber } from "../../../src/core/format/timber";
import { toTimberFile } from "../../../src/core/gen/pack";
import { makeSpec } from "../../../src/core/spec/mapspec";
import { validateMap } from "../../../src/core/validate/checks";
import type { JsonObject } from "../../../src/core/format/json";

const W = 48, H = 48;
const heights = new Uint8Array(W * H).fill(4);
for (let y = 20; y < 28; y++) for (let x = 0; x < W; x++) heights[y * W + x] = 2; // a channel
const built = buildMap({ W, H, seed: 1, features: [], base: { heights, columns: new Map(), entities: [] } });
const base = toTimberFile(makeSpec({ seed: 1, theme: "highlands", size: { x: W, y: H } }), built);
const ent = (id: string, template: string, x: number, y: number, z: number, orientation = "Cw0", comps: JsonObject = {}): JsonObject => ({ Id: id, Template: template, Components: { BlockObject: { Coordinates: { X: x, Y: y, Z: z }, Orientation: orientation }, ...comps } });
const guid = (n: number) => `0000000${n}-0000-4000-8000-000000000000`.slice(-36);
const cases: [string, JsonObject[]][] = [
  ["tree floating one above ground", [ent(guid(1), "Pine", 5, 5, 5)]],
  ["tree inside terrain", [ent(guid(1), "Pine", 5, 5, 3)]],
  ["tree at z 33", [ent(guid(1), "Pine", 5, 5, 33)]],
  ["two trees on one tile", [ent(guid(1), "Pine", 5, 5, 4), ent(guid(2), "Birch", 5, 5, 4)]],
  ["duplicate ids", [ent(guid(1), "Pine", 5, 5, 4), ent(guid(1), "Birch", 6, 5, 4)]],
  ["uppercase guid", [ent(guid(1).toUpperCase(), "Pine", 5, 5, 4)]],
  ["orientation cw90 (wrong case)", [ent(guid(1), "Pine", 5, 5, 4, "cw90")]],
  ["slope high side wrong", [ent(guid(1), "Slope", 10, 19, 2, "Cw0")]],
  ["water source off the first column", [ent(guid(1), "WaterSource", 5, 5, 4, "Cw0", { WaterSource: { SpecifiedStrength: 1, CurrentStrength: 1 } })]],
  ["water source missing component", [ent(guid(1), "WaterSource", 5, 24, 2)]],
  ["ruin missing RuinModels", [ent(guid(1), "RuinColumnH1", 5, 5, 4)]],
  ["tree over the channel's water", [ent(guid(1), "Pine", 5, 24, 2)]],
  ["two starts", [ent(guid(1), "StartingLocation", 10, 10, 4), ent(guid(2), "StartingLocation", 30, 10, 4)]],
  ["tree on the start", [ent(guid(1), "StartingLocation", 10, 10, 4), ent(guid(2), "Pine", 11, 11, 4)]],
  ["start on the map edge", [ent(guid(1), "StartingLocation", 0, 0, 4)]],
  ["maple (faction-only)", [ent(guid(1), "Maple", 5, 5, 4)]],
  ["flipped on a tree", [{ ...ent(guid(1), "Pine", 5, 5, 4), Components: { BlockObject: { Coordinates: { X: 5, Y: 5, Z: 4 }, Orientation: "Cw0" }, FlipState: { Flipped: true } } }]],
];
for (const [name, entities] of cases) {
  const file = { ...base, world: { ...base.world, entities } };
  const v = validateMap(readTimber(writeTimber(file)), { profile: "export", loadOnly: true });
  const bad = v.report.checks.filter((c) => !c.ok).map((c) => `${c.id}: ${c.message.slice(0, 90)}`);
  console.log(`${bad.length ? "REFUSED" : "PASSES"} ${name}${bad.length ? "\n   " + bad.join("\n   ") : ""}`);
}
