// A sculpt the land wears away is refused, never a silent no-op (D342). A lone tile set far from its neighbours is a
// one-tile spike the build's integrity pass wears back (D193); unless the sculpt is exact, nothing would change while
// the step said it had (a one-tile Flatten to 15 on Lake Basin seed 4 drew 7, the renderer's report on #236).

import { describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";

const W = 64;
const r = generate(makeSpec({ seed: 4, theme: "lakeBasin", size: { x: W, y: W } }));

/** A dry tile on level ground, low enough to rise six: the 3×3 round it and the tiles either side of the row at its
 *  level and dry, and nothing standing on the row of three the test shapes. */
function levelSpot(s: MapSession): [number, number] {
  const b = s.built;
  const taken = new Set(b.entities.map((e) => e.y * W + e.x));
  for (let y = 6; y < W - 6; y++)
    for (let x = 6; x < W - 6; x++) {
      const i = y * W + x;
      const h = b.heights[i];
      let ok = h + 6 <= 16;
      for (let dy = -1; dy <= 1 && ok; dy++)
        for (let dx = -2; dx <= 2 && ok; dx++) {
          const j = (y + dy) * W + x + dx;
          if (b.heights[j] !== h || b.water[j] > 0 || (dy === 0 && Math.abs(dx) <= 1 && taken.has(j))) ok = false;
        }
      if (ok) return [x, y];
    }
  throw new Error("no level spot");
}

describe("a sculpt the land wears away is refused (D342)", () => {
  it("a lone tile flattened far above its neighbours is refused with why, the land as it was; exact, or two tiles, it stands", () => {
    const s = MapSession.fromGenerated(r, r.file);
    s.setWaterMode("defer");
    const [x, y] = levelSpot(s);
    const h = s.built.heights[y * W + x];
    const before = s.built.heights.slice();
    const lone = s.apply({ op: "sculpt", params: { mode: "flatten", cells: [[y, x, x]], level: h + 6 } });
    expect(lone.ok).toBe(false);
    expect(lone.errors[0]).toMatch(/^nothing changes: a lone tile set apart from its neighbours is worn back to them/);
    expect(Array.from(s.built.heights)).toEqual(Array.from(before));
    // (exact, it stands as set, a one-tile spike included)
    const exact = s.apply({ op: "sculpt", params: { mode: "flatten", cells: [[y, x, x]], level: h + 6, exact: true } });
    expect(exact.errors).toEqual([]);
    expect(s.built.heights[y * W + x]).toBe(h + 6);
    expect(s.undo()).toBe(true);
    // (three tiles in a row are no lone spike: they stand)
    const row = s.apply({ op: "sculpt", params: { mode: "flatten", cells: [[y, x - 1, x + 1]], level: h + 6 } });
    expect(row.errors).toEqual([]);
    expect(s.built.heights[y * W + x]).toBe(h + 6);
    expect(s.undo()).toBe(true);
    // (a flatten to the level the ground has changes nothing and was meant to: not refused)
    expect(s.apply({ op: "sculpt", params: { mode: "flatten", cells: [[y, x, x]], level: h } }).errors).toEqual([]);
  });
});
