// Quake keeps to its line (D344 A6: the quake's line is its length): the ground it changes lies along the
// drawn line, a small margin set by Power past its ends and sides (`quakeMargin`), plus where a Slide
// carries it; a short line carries it no further than its own length. Not the 40 tiles the old shaking
// reached. A force always has a visible effect (D356). On generated, non-repeating ground.

import { describe, expect, it } from "vitest";
import { snapshotMap } from "../../src/core/forces/force";
import { LIFT_REACH, QUAKE_DEFAULTS, liftReach, quake, quakeExtent, quakeMargin, slideTravel } from "../../src/core/forces/quake";
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

// A Lift is a landform, not a block (the force audit's findings 1 and 12): along a 44-tile fault at Power 60 the
// raised side moves most at the fault and fades within 20 tiles, nothing moves past the fault's tips, and the other
// side keeps its ground but for a trough at the scarp's foot, 1 to 2 levels deep, no wider than 6 tiles.
describe.each([
  ["highlands", 4242],
  ["riverValley", 1],
] as [ThemeId, number][])("a Lift fades from its fault on %s", (theme, seed) => {
  const s = MapSession.fromGenerated(generate(makeSpec({ seed, theme, size: { x: W, y: W } })));
  const base = fullForceMapOf(s.built, { rockLayers: [], lava: null, down: new Map(), usedIds: new Set() });
  const P = { x: 42, y: 64 };
  const Q = { x: 86, y: 64 };
  for (const scarp of ["sheer", "stepped"] as const)
    for (const quakeSeed of [1, 2])
      it(`${scarp}, roll ${quakeSeed}`, () => {
        const p = quake(snapshotMap(base), { ...QUAKE_DEFAULTS, scarp, seed: quakeSeed }, { path: [P, Q], side: 1 });
        // (rise[k]: the most the raised side rose k tiles from the fault, by the middle half of its length)
        const rise = new Array(LIFT_REACH + 4).fill(0);
        let changed = 0;
        for (let i = 0; i < p.map.heights.length; i++) {
          const d = p.map.heights[i] - base.heights[i];
          if (!d) continue;
          changed++;
          const x = i % W;
          const y = Math.floor(i / W);
          const along = Math.max(P.x, Math.min(Q.x, x));
          const away = Math.hypot(x - along, y - P.y);
          // (the fault's roughness bends it by up to 2 tiles)
          expect(away, `${x}, ${y}`).toBeLessThanOrEqual(LIFT_REACH + 2);
          expect(x, "past the fault's tips").toBeGreaterThanOrEqual(P.x - 2);
          expect(x, "past the fault's tips").toBeLessThanOrEqual(Q.x + 2);
          // the fault runs east and side 1 raises +y's side (south on the map), so the trough is north of it
          if (y < P.y - 2) {
            expect(d, `the down side at ${x}, ${y}`).toBeLessThan(0);
            expect(d).toBeGreaterThanOrEqual(-3);
            expect(away, `the trough at ${x}, ${y}`).toBeLessThanOrEqual(6 + 2);
          }
          if (y > P.y && x >= 53 && x <= 75) rise[Math.round(away)] = Math.max(rise[Math.round(away)], d);
        }
        // a quarter of the old block's 6,600 tiles at most
        expect(changed).toBeLessThan(1650);
        // (a stepped scarp climbs in benches over its first tiles before it fades)
        const scarpTop = Math.max(...rise.slice(0, 8));
        expect(scarpTop).toBeGreaterThanOrEqual(4);
        expect(rise[14]).toBeLessThan(scarpTop);
        expect(rise[14]).toBeGreaterThan(0);
        expect(rise[LIFT_REACH]).toBe(0);
      });
});

describe("the margin and the travel", () => {
  it("the margin grows with Power, from 2 to 8 tiles; a long Slide still moves a block 1.3 times its length, a Lift never past 20 tiles", () => {
    expect([quakeMargin(0), quakeMargin(50), quakeMargin(100)]).toEqual([2, 5, 8]);
    expect(quakeExtent(100, 100, "slide")).toBe(130 + 4 + 20);
    // (the force audit's finding 1: a Lift fades from its fault, whatever the line's length)
    expect(quakeExtent(100, 8, "lift")).toBe(LIFT_REACH);
    expect(quakeExtent(100, 100, "lift")).toBe(LIFT_REACH);
    expect(liftReach(0)).toBeGreaterThan(3);
    expect(liftReach(0)).toBeLessThan(liftReach(60));
  });

  it("a short line slides ground no further than its own length in whole tiles (at least 2); a long line the full 2 to 20", () => {
    expect([slideTravel(0, 8), slideTravel(60, 8), slideTravel(100, 8)]).toEqual([2, 8, 8]);
    // (whole tiles: a slanted line's length is rounded down, as the block moves only whole tiles)
    expect([slideTravel(100, 8.06), slideTravel(100, 16.03)]).toEqual([8, 16]);
    expect(slideTravel(100, 0.25)).toBe(2);
    expect([slideTravel(0, 120), slideTravel(100, 120)]).toEqual([2, 20]);
  });
});
