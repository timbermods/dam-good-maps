// The Badtide view's contamination veins (the Weather view, D133, D334): the held day's soil is what the ground shader
// reads, so every tile the day's water poisons shows the veins. A held day sends the page its soil
// (`soilView(moisture, soilContamination)`); the shader reads it through the tile data's contamination nibble and the
// level's veins (`contaminationVeins`). No poisoned tile may be dropped on the way, and no clean tile may gain veins.

import { describe, expect, it } from "vitest";
import { soilNibbles, tileData } from "../../src/render3d/light";
import { soilView } from "../../src/render3d/model";
import { contaminationVeins } from "../../src/render3d/palette";

const contaminationOf = (nibbles: number) => nibbles & 15;

describe("a held day's contamination reaches the veins", () => {
  it("every contaminated tile keeps a contamination level in the tile data, and its veins are in; a clean tile has none", () => {
    // contamination as the core hands it over (0–1), from none through barely there to the most
    const levels = [0, 1e-6, 0.004, 0.03, 0.06, 0.2, 0.5, 1];
    const moisture = levels.map(() => 0.7);
    const soil = soilView(moisture, levels);
    const heights = new Uint8Array(levels.length).fill(4);
    const data = tileData(levels.length, 1, heights, soil, null);
    levels.forEach((c, i) => {
      const nib = contaminationOf(data[i * 4 + 1]);
      if (c > 0) {
        expect(nib, `contamination ${c}`).toBeGreaterThan(0);
        // (the level the shader reads is the nibble over 15: the veins have come in from the second step on)
        expect(contaminationVeins(nib / 15).onset, `veins at ${c}`).toBeGreaterThan(0.9);
      } else {
        expect(nib).toBe(0);
        expect(contaminationVeins(0).onset).toBe(0);
      }
    });
  });

  it("the level grows with the contamination, never shrinks, and moisture is kept apart from it", () => {
    let last = 0;
    for (let b = 1; b <= 255; b++) {
      const nib = contaminationOf(soilNibbles(100, b));
      expect(nib).toBeGreaterThanOrEqual(last);
      expect(soilNibbles(100, b) >> 4).toBe(soilNibbles(100, 0) >> 4);
      last = nib;
    }
    expect(last).toBe(15);
  });
});
