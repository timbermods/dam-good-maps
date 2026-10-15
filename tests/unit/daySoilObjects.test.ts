// The soil worker's day soil (`computeDaySoil` over `soilObjects`, the objects the soil reads and nothing else) is the game's
// soil of the whole map (`soilOnWater`), byte for byte, on a map with obstacles, a drain, Thorns and plain trees.

import { expect, it } from "vitest";
import { soilOnWater, toMapObject } from "../../src/core/features/build";
import { soilObjects } from "../../src/core/sim/columns";
import type { EntitySpec } from "../../src/core/format/entities";
import { soilView } from "../../src/render3d/model";
import { computeDaySoil } from "../../src/worker/daySoil";

const W = 32;
const H = 32;

it("the worker's soil equals soilOnWater, byte for byte, with objects beyond Thorns", () => {
  const heights = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) heights[y * W + x] = 3 + (x > 20 ? 2 : 0) + ((x * 7 + y * 3) % 5 === 0 ? 1 : 0);
  const depth = new Float64Array(W * H);
  const contamination = new Float64Array(W * H);
  for (let y = 4; y < 20; y++)
    for (let x = 2; x < 16; x++) {
      depth[y * W + x] = 0.5 + ((x + y) % 3) * 0.4;
      contamination[y * W + x] = x > 8 ? 0.6 : 0;
    }
  let n = 0;
  const at = (template: string, x: number, y: number, orientation: EntitySpec["orientation"] = "Cw0"): EntitySpec => ({ id: `e${n++}`, template, x, y, z: heights[y * W + x], orientation, flipped: false, components: {}, owner: "test" });
  const entities = [
    at("Blockage", 6, 8),
    at("NaturalDam", 9, 10),
    at("NaturalOverhang3x1", 4, 14),
    at("BadtideDrain", 12, 6, "Cw90"),
    at("Thorns", 10, 12),
    at("Thorns", 11, 12),
    at("Pine", 14, 14),
    at("Birch", 15, 15),
  ];
  const m = { W, H, heights, entities };
  const want = soilOnWater(m, depth, contamination);
  const objects = soilObjects(entities.map(toMapObject));
  expect(objects.map((o) => o.template).sort()).toEqual(["BadtideDrain", "Blockage", "NaturalDam", "NaturalOverhang3x1", "Thorns", "Thorns"]);
  const got = computeDaySoil({ base: { W, H, heights, objects }, depth, contamination });
  const wantView = soilView(want.moisture, want.contamination);
  expect(Buffer.from(got.moisture).equals(Buffer.from(wantView.moisture))).toBe(true);
  expect(Buffer.from(got.contamination).equals(Buffer.from(wantView.contamination))).toBe(true);
  // (the objects matter: the same water without them gives another soil)
  const bare = soilOnWater({ W, H, heights, entities: [] }, depth, contamination);
  expect(Buffer.from(soilView(bare.moisture, bare.contamination).moisture).equals(Buffer.from(wantView.moisture))).toBe(false);
});
