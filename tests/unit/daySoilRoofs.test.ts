// The file's own soil stays under an edited import's roofs, on a held day as on Day 0 (src/worker/daySoil.ts).

import { expect, it } from "vitest";
import { soilUnderRoofs } from "../../src/worker/daySoil";
import { soilView } from "../../src/render3d/model";

it("a day's soil takes the file's values on the roofed tiles and nowhere else", () => {
  const day = soilView([0, 0.2, 0.4, 0.6], [0, 0, 0, 0]);
  const before = { moisture: Array.from(day.moisture), contamination: Array.from(day.contamination) };
  const file = { moisture: [1, 1, 0, 0], contamination: [0, 0.5, 0, 0] };
  const same = soilUnderRoofs(day, new Set([1, 2]), file);
  expect(same).toBe(day);
  const want = soilView(file.moisture, file.contamination);
  for (const i of [1, 2]) {
    expect(day.moisture[i]).toBe(want.moisture[i]);
    expect(day.contamination[i]).toBe(want.contamination[i]);
  }
  for (const i of [0, 3]) {
    expect(day.moisture[i]).toBe(before.moisture[i]);
    expect(day.contamination[i]).toBe(before.contamination[i]);
  }
  expect(day.moisture[2]).not.toBe(before.moisture[2]);
});
