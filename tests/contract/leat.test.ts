// The leat (core/doc/leat.ts): a channel that leads water. Its bed falls steadily and holds what runs in it; a path
// the land can't give a fall along is refused with one line; a project with one reopens byte for byte (D455).

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { applyLeat, leatLine, planLeat } from "../../src/core/doc/leat";
import { planEntity } from "../../src/core/doc/placing";
import { MapSession } from "../../src/core/doc/session";
import { startingLocation } from "../../src/core/format/entities";
import { writeTimber } from "../../src/core/format/timber";
import { buildFileFromHeights } from "../../src/core/places/place";

const W = 96;
/** A slope falling east from 12 to 4, with a hollow two deep across the path and a bump two high further on; from
 *  y 60 down, a terrace: level 8 north of y 70, level 5 south of it. */
function slope(): MapSession {
  const h = new Uint8Array(W * W);
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      let v = Math.max(4, 12 - Math.floor(x / 10));
      if (x >= 40 && x <= 46 && y >= 20 && y <= 40) v -= 2;
      if (x >= 60 && x <= 62 && y >= 25 && y <= 35) v += 2;
      if (y >= 60) v = y < 70 ? 8 : 5;
      h[y * W + x] = v;
    }
  const start = startingLocation({ id: "00000000-0000-4000-8000-0000000000aa", owner: "t", x: 5, y: 50, z: h[50 * W + 5], orientation: "Cw0" });
  return MapSession.importMap(writeTimber(buildFileFromHeights(W, W, h, [start], "").file), "slope.timber");
}

describe("the leat", () => {
  it("walks its path edge to edge", () => {
    const line = leatLine([[0, 0], [3, 2], [3, 5]]);
    expect(line[0]).toEqual([0, 0]);
    expect(line[line.length - 1]).toEqual([3, 5]);
    for (let k = 1; k < line.length; k++) expect(Math.abs(line[k][0] - line[k - 1][0]) + Math.abs(line[k][1] - line[k - 1][1])).toBe(1);
  });
  it("cuts a bed that never rises, holds the water a source runs down it, undoes in one step and reopens byte for byte", () => {
    const s = slope();
    const before = s.built.heights.slice();
    const r = applyLeat(s, [[8, 30], [78, 30]], 2, 1, true);
    expect(r.ok).toBe(true);
    expect([r.plan.from, r.plan.to]).toEqual([11, 4]);
    const row = Array.from({ length: 71 }, (_, k) => s.built.heights[30 * W + 8 + k]);
    for (let k = 1; k < row.length; k++) expect(row[k]).toBeLessThanOrEqual(row[k - 1]);
    const src = planEntity(s, { template: "WaterSource", x: 8, y: 30, z: s.built.heights[30 * W + 8], orientation: "Cw0", flipped: false }, "00000000-0000-4000-8000-000000000001");
    expect(src.ok && s.applyAll(src.ops).ok).toBe(true);
    const bed = new Set(r.plan.bed);
    const water = s.waterNow().depth;
    let leaked = 0;
    for (let i = 0; i < W * W; i++) if (water[i] > 0.01 && !bed.has(i) && i % W < 78) leaked++;
    expect(leaked).toBe(0);
    for (const i of bed) expect(water[i]).toBeGreaterThan(0.01);
    const project = s.project();
    expect(MapSession.replayMatchesStored(decodeProject(project))).toBe(true);
    expect(MapSession.open(decodeProject(project)).project()).toEqual(project);
    s.undo();
    s.undo();
    expect(s.built.heights).toEqual(before);
  });
  it("raises a bank where the land beside the bed is lower than its water would stand", () => {
    const s = slope();
    // along the terrace's edge: the bed at 7 on the upper side (y 69), the lower ground (5) beside it at y 70
    const p = planLeat(s, [[10, 69], [60, 69]], 1, 1, true);
    expect(p.reason).toBeNull();
    expect(p.banks.length).toBeGreaterThan(40);
    expect(p.banks.every((i) => Math.floor(i / W) === 70)).toBe(true);
    expect(p.banks.every((i) => p.levels[p.tiles.indexOf(i)] === 8)).toBe(true);
  });
  it("Dry leaves the first tile of its line standing", () => {
    const s = slope();
    const p = planLeat(s, [[8, 30], [78, 30]], 1, 1, false);
    expect(p.reason).toBeNull();
    expect(p.tiles.includes(30 * W + 8)).toBe(false);
    expect(p.tiles.includes(30 * W + 9)).toBe(true);
  });
  it("refuses, in one line that says where, a path the land rises along", () => {
    const s = slope();
    expect(planLeat(s, [[78, 30], [8, 30]], 2, 1, true).reason).toBe("the land rises 4 levels above the leat's fall at X 39 · Y 30: it can't keep falling there");
    expect(planLeat(s, [[8, 30], [78, 30]], 7, 1, true).reason).toBe("a leat's width must be a whole number from 1 to 6");
    expect(planLeat(s, [[8, 30]], 2, 1, true).reason).toBe("a leat needs a path: drag from where the water is to where it should go");
  });
});
