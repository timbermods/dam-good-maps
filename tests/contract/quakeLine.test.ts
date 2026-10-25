// Quake keeps to its line (D344 A6: the quake's line is its length): the ground it changes lies along the
// drawn line, a small margin set by Power past its ends and sides (`quakeMargin`), plus where a Slide
// carries it; a short line carries it no further than its own length. Not the 40 tiles the old shaking
// reached. A force always has a visible effect (D356). On generated, non-repeating ground.

import { describe, expect, it } from "vitest";
import { snapshotMap } from "../../src/core/forces/force";
import { QUAKE_DEFAULTS, quake, quakeExtent, quakeMargin, slideTravel } from "../../src/core/forces/quake";
import { fullForceMapOf } from "../../src/core/forces/start";
import { generate } from "../../src/core/gen/generate";
import { MapSession } from "../../src/core/doc/session";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";

const W = 128;
const A = { x: 60, y: 64 };
const B = { x: 68, y: 64 };

/** How far tile (x, y) lies from the segment A–B. */
function away(x: number, y: number): number {
  const t = Math.max(0, Math.min(1, ((x - A.x) * (B.x - A.x) + (y - A.y) * (B.y - A.y)) / ((B.x - A.x) ** 2 + (B.y - A.y) ** 2)));
  return Math.hypot(x - (A.x + t * (B.x - A.x)), y - (A.y + t * (B.y - A.y)));
}

describe.each([
  ["highlands", 3],
  ["riverValley", 3],
] as [ThemeId, number][])("Quake keeps to its line on %s", (theme, seed) => {
  const s = MapSession.fromGenerated(generate(makeSpec({ seed, theme, size: { x: W, y: W } })));
  const base = fullForceMapOf(s.built, { rockLayers: [], lava: null, down: new Map(), usedIds: new Set() });
  for (const mode of ["lift", "slide"] as const)
    for (const power of [0, 30, 60, 100])
      for (const side of [1, -1] as const)
        it(`${mode} at Power ${power}, side ${side}: an 8-tile line changes ground only within its margin${mode === "slide" ? " and the slide" : ""}, and visibly`, () => {
          const p = quake(snapshotMap(base), { ...QUAKE_DEFAULTS, mode, power }, { path: [A, B], side });
          let far = 0;
          let changed = 0;
          for (let i = 0; i < p.map.heights.length; i++) {
            if (p.map.heights[i] === base.heights[i]) continue;
            changed++;
            far = Math.max(far, away(i % W, Math.floor(i / W)));
          }
          // (the fault's roughness bends it by up to 2 tiles)
          expect(far, `${changed} tiles changed`).toBeLessThanOrEqual(quakeExtent(power, 8, mode) + 2);
          // a visible effect (D356)
          expect(changed).toBeGreaterThanOrEqual(9);
        });
});

describe("the margin and the travel", () => {
  it("the margin grows with Power, from 2 to 8 tiles, and a long line still moves a block 1.3 times its length", () => {
    expect([quakeMargin(0), quakeMargin(50), quakeMargin(100)]).toEqual([2, 5, 8]);
    expect(quakeExtent(100, 8, "lift")).toBe(16);
    expect(quakeExtent(100, 100, "lift")).toBe(130);
  });

  it("a short line slides ground no further than its own length in whole tiles (at least 2); a long line the full 2 to 20", () => {
    expect([slideTravel(0, 8), slideTravel(60, 8), slideTravel(100, 8)]).toEqual([2, 8, 8]);
    // (whole tiles: a slanted line's length is rounded down, as the block moves only whole tiles)
    expect([slideTravel(100, 8.06), slideTravel(100, 16.03)]).toEqual([8, 16]);
    expect(slideTravel(100, 0.25)).toBe(2);
    expect([slideTravel(0, 120), slideTravel(100, 120)]).toEqual([2, 20]);
  });
});
