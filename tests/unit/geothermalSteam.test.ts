// A geothermal field's steam is the game's (geothermalSteam.ts, D178, D496): its puffs rise over the field's middle while
// no water stands on that tile, and stop while any does, as the game's `FloodableObject` blocks its particles.

import { describe, expect, it } from "vitest";
import { GeothermalSteam, STEAM_PUFFS, steamFields } from "../../src/render3d/geothermalSteam";
import { entityView } from "../../src/render3d/model";

const W = 20;
const H = 20;
const fields = entityView([
  { template: "GeothermalField", x: 2, y: 2, z: 4, orientation: "Cw0", owner: "a" },
  { template: "Pine", x: 9, y: 9, z: 4, orientation: "Cw0", owner: "p" },
  { template: "GeothermalField", x: 10, y: 2, z: 6, orientation: "Cw0", owner: "b" },
]);
const dry = () => ({ floor: new Float32Array(W * H), depth: new Float32Array(W * H) });

describe("a geothermal field's steam", () => {
  it("rises over each field's middle, at its level", () => {
    expect(steamFields(fields, W, H, dry(), null)).toEqual([
      [3.5, 4, -3.5],
      [11.5, 6, -3.5],
    ]);
  });

  it("stops while any water stands on the field's middle tile, and only there", () => {
    const s = dry();
    // (a film over the first field's middle: the game ceils the water's height, so any depth floods it)
    s.floor[3 * W + 3] = 4;
    s.depth[3 * W + 3] = 0.02;
    // (water beside the second field's middle does not)
    s.floor[3 * W + 12] = 6;
    s.depth[3 * W + 12] = 1;
    expect(steamFields(fields, W, H, s, null)).toEqual([[11.5, 6, -3.5]]);
    // (water under a ledge at the field's level counts too)
    expect(steamFields(fields, W, H, dry(), new Map([[6 * W * H + 3 * W + 11, 1]]))).toEqual([[3.5, 4, -3.5]]);
  });

  it("is a batch of the game's 100 puffs a field, made again only when the fields change", () => {
    const steam = new GeothermalSteam({ value: 0 });
    expect(steam.set(steamFields(fields, W, H, dry(), null))).toBe(true);
    expect(steam.mesh.count).toBe(2 * STEAM_PUFFS);
    expect(steam.count).toBe(2);
    expect(steam.set(steamFields(fields, W, H, dry(), null))).toBe(false);
    expect(steam.set([])).toBe(true);
    expect(steam.mesh.visible).toBe(false);
    steam.dispose();
  });
});
