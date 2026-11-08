// A stair of slopes (core/doc/stair.ts; EDITOR_PLAN §4, the shelf's Slope; showcase-craft gap 6): the Slope dragged
// from high ground to low ground lays a stair shaped as the generator's natural ramps are (land/levels.ts): a tread of two
// to four tiles a level, a slope on the first tile of each, the high side toward the top, the ground three wide and a
// spur beside a fill, in one step; what can't take it is refused with one reason. Headless, on a 48² Highlands.

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
  it("lays a slope a level from the mesa's edge to the floor, two tiles a tread, the ground three wide with a spur beside it", () => {
    const s = mesa();
    const W = s.size.x;
    const p = planStair(s, [24, 30], [31, 30], newId);
    expect(p.ok, p.ok ? "" : p.errors.join("; ")).toBe(true);
    if (!p.ok) return;
    expect(p.steps.map((t) => [t.x, t.y, t.z])).toEqual([
      [25, 30, 9],
      [27, 30, 8],
      [29, 30, 7],
      [31, 30, 6],
    ]);
    // each slope's high side is the tile before it, toward the top
    for (const t of p.steps) expect(slopeHighSide(t.orientation).map((v) => v + 0)).toEqual([-1, 0]);
    expect(p.label).toBe("Lay a stair of 4 slopes");
    const r = s.applyAll(p.ops, "user", p.label);
    expect(r.ok, r.errors.join("; ")).toBe(true);
    const h = s.built.heights;
    const at = (x: number, y: number) => h[y * W + x];
    expect([24, 25, 26, 27, 28, 29, 30, 31, 32].map((x) => at(x, 30))).toEqual([10, 9, 9, 8, 8, 7, 7, 6, 6]);
    // three wide: the tiles beside the line stand within a level of it
    for (let x = 25; x <= 31; x++) for (const y of [29, 31]) expect(Math.abs(at(x, y) - at(x, 30))).toBeLessThanOrEqual(1);
    // the fill is a spur: the lower ground beside it rises to it a level a tile, two tiles out, and no further
    expect([28, 27, 26].map((y) => at(26, y))).toEqual([9, 8, 6]);
    expect([32, 33, 34].map((y) => at(26, y))).toEqual([9, 8, 6]);
    const slopes = s.built.entities.filter((e) => e.template === "Slope" && e.y === 30 && e.x >= 25 && e.x <= 31);
    expect(slopes.map((e) => [e.x, e.z, e.orientation]).sort()).toEqual(p.steps.map((t) => [t.x, t.z, t.orientation]).sort());
    // one step: one undo takes all of it back
    s.undo();
    for (let y = 26; y <= 34; y++) for (let x = 25; x <= 32; x++) expect(s.built.heights[y * W + x]).toBe(6);
    expect(s.built.entities.some((e) => e.template === "Slope" && e.y === 30 && e.x >= 25 && e.x <= 31)).toBe(false);
  });

  it("a longer drag deals its length to the treads, two to four tiles each and uneven, its foot where the drag ends", () => {
    const s = mesa();
    const W = s.size.x;
    const p = planStair(s, [24, 30], [34, 30], newId);
    expect(p.ok && p.steps.map((t) => t.z)).toEqual([9, 8, 7, 6]);
    if (!p.ok) return;
    const xs = [24, ...p.steps.map((t) => t.x)];
    const treads = xs.slice(1).map((x, k) => x - xs[k]);
    expect(treads[0]).toBe(1);
    for (const t of treads.slice(1)) expect(t).toBeGreaterThanOrEqual(2);
    for (const t of treads.slice(1)) expect(t).toBeLessThanOrEqual(4);
    expect(new Set(treads.slice(1)).size).toBeGreaterThan(1);
    // the last slope and the foot past it: the drag's end
    expect(p.steps[3].x + 1).toBe(34);
    // the preview is what the release lays: the same drag plans the same stair
    const again = planStair(s, [24, 30], [34, 30], newId);
    expect(again.ok && again.steps).toEqual(p.steps);
    const r = s.applyAll(p.ops, "user", p.label);
    expect(r.ok, r.errors.join("; ")).toBe(true);
    for (const t of p.steps) expect(s.built.heights[t.y * W + t.x]).toBe(t.z);
  });

  it("is the same stair dragged up from the floor, and cuts into the mesa where it starts back from the edge", () => {
    const s = mesa();
    const up = planStair(s, [31, 30], [24, 30], newId);
    expect(up.ok && up.steps.map((t) => t.x)).toEqual([25, 27, 29, 31]);
    // from x 22, two tiles back: the stair cuts the mesa at x 23 and 24 and stands out over the floor beyond
    const back = planStair(s, [22, 27], [30, 27], newId);
    expect(back.ok && back.steps.map((t) => [t.x, t.z])).toEqual([
      [23, 9],
      [25, 8],
      [27, 7],
      [29, 6],
    ]);
  });

  it("takes a tree placed by hand on its line, and leaves the ground under one beside it as it is", () => {
    const s = mesa();
    const W = s.size.x;
    const r0 = s.applyAll(
      [
        { op: "placeEntity", params: { id: "00000000-0000-4000-8000-0000000000a1", template: "Pine", x: 26, y: 30, orientation: "Cw0" } },
        { op: "placeEntity", params: { id: "00000000-0000-4000-8000-0000000000a2", template: "Pine", x: 26, y: 29, orientation: "Cw0" } },
      ],
      "user",
      "two pines",
    );
    expect(r0.ok, r0.errors.join("; ")).toBe(true);
    const p = planStair(s, [24, 30], [31, 30], newId);
    expect(p.ok, p.ok ? "" : p.errors.join("; ")).toBe(true);
    if (!p.ok) return;
    const r = s.applyAll(p.ops, "user", p.label);
    expect(r.ok, r.errors.join("; ")).toBe(true);
    const ids = new Set(s.built.entities.map((e) => e.id));
    expect(ids.has("00000000-0000-4000-8000-0000000000a1")).toBe(false);
    expect(ids.has("00000000-0000-4000-8000-0000000000a2")).toBe(true);
    expect(s.built.heights[29 * W + 26]).toBe(6);
    expect(s.built.heights[30 * W + 26]).toBe(9);
  });

  it("refuses with one reason what can't take it", () => {
    const s = mesa();
    const W = s.size.x;
    const why = (from: [number, number], to: [number, number]) => {
      const p = planStair(s, from, to, newId);
      return p.ok ? "laid" : p.errors.join("; ");
    };
    expect(why([16, 30], [22, 30])).toBe("Both ends are at level 10: drag down from higher ground");
    expect(why([24, 30], [24, 30])).toBe("Drag the slope down to the ground it leads to");
    expect(why([24, 30], [-1, 30])).toBe("The stair runs off the map");
    // the shortest stair of four levels ends at x 32: ground raised there is a wall at its foot
    const tile = (x: number, y: number, level: number) => s.applyAll([{ op: "sculpt", params: { mode: "flatten", cells: tilesToRuns([y * W + x], W), level, exact: true } }], "user", "a tile");
    expect(tile(32, 30, 8).ok).toBe(true);
    expect(why([24, 30], [31, 30])).toMatch(/^The stair's foot would meet a wall/);
    expect(tile(32, 30, 6).ok).toBe(true);
    // an object on the tile past its foot would wall it off
    const r = s.applyAll([{ op: "placeEntity", params: { id: newId(), template: "SmallRelic", x: 32, y: 30, orientation: "Cw0" } }], "user", "a relic");
    expect(r.ok, r.errors.join("; ")).toBe(true);
    expect(why([24, 30], [31, 30])).toMatch(/stands at the stair's foot$/);
    // the game drains the map's two outer rows: a stair never runs into them
    expect(tile(44, 30, 12).ok).toBe(true);
    for (const x of [45, 46, 47]) expect(tile(x, 30, 11).ok).toBe(true);
    expect(why([44, 30], [47, 30])).toBe("The stair runs into the map's edge, where the game drains the ground");
  });
});
