// Contract (D357, custom sizes): a map of any size is editable to its last tile. The operation schemas and the
// engine take coordinates to 511, tile indices to 262143 and one operation as large as the map; anything past
// the map's own edge is refused with its one-line reason, never clamped. Tested on a 512×512 map, a 512×64 map
// (the long side across) and a 64×512 map (the long side down), through the session's own entry points.

import { describe, expect, it } from "vitest";
import type { EditOp } from "../../src/core/doc/ops";
import { maxOpTiles } from "../../src/core/doc/ops";
import { QUAKE_DEFAULTS } from "../../src/core/forces/quake";
import { openHeights, rect } from "./gateWater";

const GUID = "0badc0de-1111-4222-8333-444444444444";
const SOURCE = { WaterSource: { SpecifiedStrength: 1, CurrentStrength: 1 } };
const quake = (path: [number, number][], tiles: number[], heights: number[]): EditOp => ({ op: "forceResult", params: { version: 1, verb: "quake", settings: { ...QUAKE_DEFAULTS, power: 60 }, where: { path, side: 1 }, steps: 1, reason: "done", tiles, heights, removed: [] } });

describe.each([[512, 512], [512, 64], [64, 512]])("a %i×%i map is editable to its last tile", (W, H) => {
  const s = openHeights(W, H, new Uint8Array(W * H).fill(8));
  const x = W - 1;
  const y = H - 1;
  const i = y * W + x;

  it.each<[string, EditOp]>([
    ["a brush stroke", { op: "brush", params: { tool: "raise", size: 3, strength: 5, dabs: [4 * x, 4 * y, 4 * x - 2, 4 * y - 2] } }],
    ["a sculpt", { op: "sculpt", params: { mode: "flatten", cells: [[y, x - 3, x]], level: 5 } }],
    ["a placement", { op: "placeEntity", params: { id: GUID, template: "WaterSource", x, y, orientation: "Cw0", components: SOURCE } }],
    ["a force's result", quake([[x - 6, y], [x, y]], [i - 1, i], [9, 9])],
    ["a forest feature", { op: "addFeature", params: { feature: { id: GUID, kind: "forest", origin: "user", locked: false, params: { area: [[y, x - 3, x]], density: 0.7, speciesMix: { Birch: 1 }, life: "auto", youngShare: 0.2 } } } }],
    ["a paint stroke",{ op: "paintObjects", params: { kind: "trees", template: "Pine", area: [[y, x - 3, x]], density: 0.5, seed: 7 } }],
  ])("%s at the far corner validates and applies", (_what, op) => {
    const r = s.apply(op);
    expect(r.errors).toEqual([]);
    expect(s.undo()).toBe(true);
  });

  it("a whole-map selection is one operation's size, and no more", () => {
    expect(maxOpTiles(W, H)).toBe(W * H);
    expect(s.apply({ op: "sculpt", params: { mode: "flatten", cells: rect(0, 0, x, y), level: 8 } }).errors).toEqual([]);
    s.undo();
  });

  // one tile past the edge: on the short side when there is one (the engine's reason), else past 511 (the schema's)
  const px = W < 512 ? W : x;
  const py = W < 512 ? y : H;
  const viaSchema = Math.max(px, py) > 511;
  it.each<[string, EditOp, string]>([
    ["a brush dab", { op: "brush", params: { tool: "raise", size: 3, strength: 5, dabs: [4 * px, 4 * py] } }, `a dab at (${px}, ${py}) is outside the ${W}×${H} map`],
    ["a sculpt run", { op: "sculpt", params: { mode: "flatten", cells: [[py, px - 3, px]], level: 5 } }, `sculpt cells: the run [${py}, ${px - 3}, ${px}] is outside the ${W}×${H} map`],
    ["a placement", { op: "placeEntity", params: { id: GUID, template: "WaterSource", x: px, y: py, orientation: "Cw0", components: SOURCE } }, `(${px}, ${py}) is outside the map`],
    ["a forest feature", { op: "addFeature", params: { feature: { id: GUID, kind: "forest", origin: "user", locked: false, params: { area: [[py, px - 3, px]], density: 0.7, speciesMix: { Birch: 1 }, life: "auto", youngShare: 0.2 } } } }, `forest area: the run [${py}, ${px - 3}, ${px}] is outside the ${W}×${H} map`],
    ["a force's line",quake([[x - 6, y], [px, py]], [i], [9]), "a painted line needs 2 to 512 points on the map"],
    ["a force's tile", quake([[x - 6, y], [x, y]], [W * H], [9]), "a force's tiles must be on the map, in order, once each"],
  ])("%s past the edge is refused with its one-line reason", (what, op, reason) => {
    const errors = s.apply(op).errors;
    expect(errors).toHaveLength(1);
    if (what === "a force's tile") expect(errors[0]).toMatch(W * H > 262143 ? /: must be <= 262143$/ : /^a force's tiles must be on the map/);
    else if (viaSchema) expect(errors[0]).toMatch(/: must be <= (511|2047)$/);
    else expect(errors[0]).toBe(reason);
  });
});
