// Quake keeps to its line (D344 A6: the quake's line is its length): the ground it changes lies along the
// drawn line, a small margin set by Power past its ends and sides (`quakeMargin`), plus where a Slide
// carries it; not the 40 tiles the old shaking reached. A force always has a visible effect (D356).

import { describe, expect, it } from "vitest";
import { snapshotMap } from "../../src/core/forces/force";
import { QUAKE_DEFAULTS, quake, quakeExtent, quakeMargin, slideTiles } from "../../src/core/forces/quake";
import { fixture } from "./forceFixtures";

const W = 160;
const base = fixture("plain", W);
// (lumpy ground, so a Slide shows)
for (let i = 0; i < base.heights.length; i++) base.heights[i] = 6 + ((i % W) % 5) + (Math.floor(i / W) % 4);

/** A 8-tile line, west to east, in the middle of the map. */
const LINE = [{ x: 76, y: 80 }, { x: 84, y: 80 }];

describe("Quake keeps to its line", () => {
  for (const mode of ["lift", "slide"] as const)
    for (const power of [0, 30, 60, 100])
      for (const side of [1, -1] as const)
        it(`${mode} at Power ${power}, side ${side}: an 8-tile line changes ground only within its margin${mode === "slide" ? " and the slide" : ""}, and visibly`, () => {
          const p = quake(snapshotMap(base), { ...QUAKE_DEFAULTS, mode, power }, { path: LINE, side });
          // how far from the drawn line (the segment) any changed tile lies
          let far = 0;
          let changed = 0;
          for (let i = 0; i < p.map.heights.length; i++) {
            if (p.map.heights[i] === base.heights[i]) continue;
            changed++;
            const x = i % W;
            const y = Math.floor(i / W);
            const alongOut = x < 76 ? 76 - x : x > 84 ? x - 84 : 0;
            far = Math.max(far, Math.hypot(alongOut, y - 80));
          }
          // (the fault's roughness bends it by up to 2 tiles; a Slide's land lands up to its travel along the line)
          const bound = quakeExtent(power, 8, mode) + 2 + (mode === "slide" ? slideTiles(power) : 0);
          expect(far, `${changed} tiles changed`).toBeLessThanOrEqual(bound);
          // far less than the old 14 + Power / 2 shaking ring plus the block's end margins
          expect(far).toBeLessThanOrEqual(mode === "slide" ? 30 : 20);
          // always a visible effect (D356)
          expect(changed).toBeGreaterThanOrEqual(9);
        });

  it("the margin grows with Power, from 2 to 8 tiles, and a long line still moves a block 1.3 times its length across", () => {
    expect([quakeMargin(0), quakeMargin(50), quakeMargin(100)]).toEqual([2, 5, 8]);
    expect(quakeExtent(100, 8, "lift")).toBe(16);
    expect(quakeExtent(100, 100, "lift")).toBe(130);
  });
});
