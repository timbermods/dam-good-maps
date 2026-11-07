// A stair of slopes (core/doc/stair.ts; EDITOR_PLAN §4, the shelf's Slope; showcase-craft gap 6): the Slope dragged
// from high ground to low ground lays one slope a level, each tile set exactly a level below the one before, the high
// side toward the top, in one step; what can't take it is refused with one reason. Headless, on a 48² Highlands.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { planStair } from "../../src/core/doc/stair";
import { slopeHighSide } from "../../src/core/format/footprints";
import { tilesToRuns } from "../../src/core/math/grid";

const bytes = new Uint8Array(readFileSync("tests/fixtures/projects/collab-highlands-48-5.damgoodmaps"));
let ids = 0;
const newId = () => `00000000-0000-4000-8000-${(++ids).toString(16).padStart(12, "0")}`;

/** A session with a dry mesa four levels above a dry floor: the floor at level `low` over x 14…34, y 26…34 (dry ground
 *  in the fixture), the mesa at `low` + 4 over x 14…24 (its edge between x 24 and 25), nothing standing on either. */
function mesa(low = 6): MapSession {
  const s = MapSession.open(decodeProject(bytes));
  s.setWaterMode("defer");
  const W = s.size.x;
  const tiles = (x0: number, y0: number, x1: number, y1: number) => {
    const out: number[] = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push(y * W + x);
    return out;
  };
  const clear = s.built.entities.filter((e) => e.x >= 12 && e.x <= 36 && e.y >= 24 && e.y <= 36 && e.template !== "StartingLocation").map((e) => e.id);
  const r = s.applyAll(
    [
      ...(clear.length ? [{ op: "deleteEntities" as const, params: { entities: clear } }] : []),
      { op: "sculpt", params: { mode: "flatten", cells: tilesToRuns(tiles(14, 26, 34, 34), W), level: low, exact: true } },
      { op: "sculpt", params: { mode: "flatten", cells: tilesToRuns(tiles(14, 26, 24, 34), W), level: low + 4, exact: true } },
    ],
    "user",
    "the test's mesa",
  );
  expect(r.ok, r.errors.join("; ")).toBe(true);
  return s;
}

describe("a stair of slopes", () => {
  it("lays one slope a level from the mesa's edge to the floor, each step a level below the one before", () => {
    const s = mesa();
    const W = s.size.x;
    const p = planStair(s, [24, 30], [31, 30], newId);
    expect(p.ok, p.ok ? "" : p.errors.join("; ")).toBe(true);
    if (!p.ok) return;
    expect(p.steps.map((t) => [t.x, t.y, t.z])).toEqual([
      [25, 30, 9],
      [26, 30, 8],
      [27, 30, 7],
      [28, 30, 6],
    ]);
    // each slope's high side is the tile before it, toward the top
    for (const t of p.steps) expect(slopeHighSide(t.orientation).map((v) => v + 0)).toEqual([-1, 0]);
    expect(p.label).toBe("Lay a stair of 4 slopes");
    const r = s.applyAll(p.ops, "user", p.label);
    expect(r.ok, r.errors.join("; ")).toBe(true);
    const h = s.built.heights;
    expect([24, 25, 26, 27, 28, 29].map((x) => h[30 * W + x])).toEqual([10, 9, 8, 7, 6, 6]);
    const slopes = s.built.entities.filter((e) => e.template === "Slope" && e.y === 30 && e.x >= 25 && e.x <= 28);
    expect(slopes.map((e) => [e.x, e.z, e.orientation]).sort()).toEqual(p.steps.map((t) => [t.x, t.z, t.orientation]).sort());
    // one step: one undo takes all of it back
    s.undo();
    expect([25, 26, 27, 28].map((x) => s.built.heights[30 * W + x])).toEqual([6, 6, 6, 6]);
    expect(s.built.entities.some((e) => e.template === "Slope" && e.y === 30 && e.x >= 25 && e.x <= 28)).toBe(false);
  });

  it("is the same stair dragged up from the floor, and cuts into the mesa where it starts back from the edge", () => {
    const s = mesa();
    const up = planStair(s, [31, 30], [24, 30], newId);
    expect(up.ok && up.steps.map((t) => t.x)).toEqual([25, 26, 27, 28]);
    // from x 22, two tiles back: the stair cuts the mesa at x 23 and 24 and stands out over the floor at x 25 and 26
    const back = planStair(s, [22, 27], [30, 27], newId);
    expect(back.ok && back.steps.map((t) => [t.x, t.z])).toEqual([
      [23, 9],
      [24, 8],
      [25, 7],
      [26, 6],
    ]);
  });

  it("refuses with one reason what can't take it", () => {
    const s = mesa();
    const why = (from: [number, number], to: [number, number]) => {
      const p = planStair(s, from, to, newId);
      return p.ok ? "laid" : p.errors.join("; ");
    };
    expect(why([16, 30], [22, 30])).toBe("Both ends are at level 10: drag down from higher ground");
    expect(why([24, 30], [24, 30])).toBe("Drag the slope down to the ground it leads to");
    // from deep in the mesa, four steps down end against the mesa itself
    expect(why([15, 30], [31, 30])).toMatch(/^The stair's foot would meet a wall/);
    expect(why([24, 30], [-1, 30])).toBe("The stair runs off the map");
  });
});
