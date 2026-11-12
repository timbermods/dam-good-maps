// The ridge (core/doc/ridge.ts): high ground drawn along a line. It applies as one step, a refusal gives its one line,
// its land has no one-tile pillar, a project with one reopens byte for byte (D455) and its export loads.

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { applyRidge, planRidge } from "../../src/core/doc/ridge";
import { MapSession } from "../../src/core/doc/session";
import { startingLocation } from "../../src/core/format/entities";
import { writeTimber } from "../../src/core/format/timber";
import { buildFileFromHeights } from "../../src/core/places/place";
import { validateFile } from "../../src/core/validate/checks";

const W = 96;
/** Land at level 4, rising a level every 24 tiles eastward. */
function land(): MapSession {
  const h = new Uint8Array(W * W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) h[y * W + x] = 4 + Math.floor(x / 24);
  const start = startingLocation({ id: "00000000-0000-4000-8000-0000000000aa", owner: "t", x: 8, y: 88, z: h[88 * W + 8], orientation: "Cw0" });
  return MapSession.importMap(writeTimber(buildFileFromHeights(W, W, h, [start], "").file), "land.timber");
}

describe("the ridge", () => {
  it("raises a ridge in one step, without a one-tile pillar, that reopens byte for byte and loads", () => {
    const s = land();
    const before = s.built.heights.slice();
    const r = applyRidge(s, [[14, 30], [40, 24], [66, 34], [84, 44]], 8, 14, "auto", 7);
    expect(r.ok).toBe(true);
    const h = s.built.heights;
    // (high ground: its top 7 to 12 levels over the land)
    expect(r.plan.top - 5).toBeGreaterThanOrEqual(7);
    // no tile stands higher than every tile beside it, by more than a level: no one-tile pillar
    let pillars = 0;
    for (let y = 1; y < W - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        if ([i - 1, i + 1, i - W, i + W].every((j) => h[i] > h[j])) pillars++;
      }
    expect(pillars).toBe(0);
    const project = s.project();
    expect(MapSession.replayMatchesStored(decodeProject(project))).toBe(true);
    expect(MapSession.open(decodeProject(project)).project()).toEqual(project);
    const loads = validateFile(s.exportFile(), { profile: "export", spec: s.spec, features: s.features, loadOnly: true }).checks;
    expect(loads.filter((c) => !c.ok).map((c) => c.id)).toEqual([]);
    s.undo();
    expect(s.built.heights).toEqual(before);
  });
  it("is steep on the side asked", () => {
    const s = land();
    // a line west to east along y 48: left of its way is north (y more: the map's y runs north)
    const fall = (steep: "left" | "right") => {
      const p = planRidge(s, [[20, 48], [70, 48]], 8, 16, steep, 3);
      expect(p.steep).toBe(steep);
      const level = new Map(p.tiles.map((i, k) => [i, p.levels[k]]));
      let north = 0;
      let south = 0;
      for (let x = 30; x <= 60; x++)
        for (let y = 30; y <= 66; y++) {
          const i = y * W + x;
          if (level.has(i)) (y > 48 ? (north += 1) : (south += 1));
        }
      return north - south;
    };
    // (the steep side is the narrow one)
    expect(fall("left")).toBeLessThan(0);
    expect(fall("right")).toBeGreaterThan(0);
  });
  it("refuses in one line", () => {
    const s = land();
    expect(planRidge(s, [[20, 48], [70, 48]], 11, 10, "auto", 1).reason).toBe("a ridge's height must be a whole number from 2 to 10");
    expect(planRidge(s, [[20, 48], [70, 48]], 5, 3, "auto", 1).reason).toBe("a ridge's width must be a whole number from 4 to 20");
    expect(planRidge(s, [[20, 48], [21, 48]], 5, 10, "auto", 1).reason).toBe("a ridge needs a line: drag one at least 3 tiles long");
    expect(applyRidge(s, [[20, 48], [96, 48]], 5, 10, "auto", 1).errors).toEqual(["X 96 · Y 48 is off the map"]);
  });
});
