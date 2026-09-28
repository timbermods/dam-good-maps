// A force's reach ring and Carve's waypoints (PLAN §20 D312): the ring's radius follows Power and
// Size; the waypoint gesture adds, removes, launches and cancels as described; the curve through
// them passes through every point.

import { describe, expect, it } from "vitest";
import { waypointCurve } from "../../src/core/forces/carve/course";
import { forceReach } from "../../src/core/forces/reach";
import { ERUPT_DEFAULTS } from "../../src/core/forces/erupt";
import { waypointTiles, Waypoints, type Waypoint } from "../../src/editor/waypoints";

describe("a force's reach at its Power and Size (D312)", () => {
  it("follows Power while Size is Auto, and Size once set", () => {
    for (const verb of ["carve", "craterize"] as const) {
      const at = (power: number, size: number | null) => forceReach(verb === "carve" ? { verb, settings: { power, width: size } } : { verb, settings: { power, size } });
      expect(at(80, null), verb).toBeGreaterThan(at(20, null));
      expect(at(20, 12)).toBe(6);
      expect(at(80, 12)).toBe(6);
    }
    const erupt = (power: number, size: number | null) => forceReach({ verb: "erupt", settings: { ...ERUPT_DEFAULTS, power, size } });
    expect(erupt(90, null)).toBeGreaterThan(erupt(20, null));
    expect(erupt(20, 30)).toBe(15);
    expect(forceReach({ verb: "quake", settings: { power: 80 } })).toBeGreaterThan(forceReach({ verb: "quake", settings: { power: 20 } }));
  });
});

describe("the waypoint gesture (D312)", () => {
  function gesture() {
    const shown: (readonly Waypoint[])[] = [];
    const launched: (readonly Waypoint[])[] = [];
    const w = new Waypoints({ changed: (p) => shown.push(p.slice()), launch: (p) => launched.push(p.slice()) });
    return { w, shown, launched };
  }

  it("Shift+click adds, Backspace removes the last, Esc drops them all", () => {
    const { w, shown, launched } = gesture();
    expect(w.active).toBe(false);
    expect(w.key("Backspace")).toBe(false);
    w.add([1, 1]);
    w.add([5, 2]);
    w.add([5, 2]);
    w.add([9, 6]);
    expect(w.points).toEqual([[1, 1], [5, 2], [9, 6]]);
    expect(w.key("Backspace")).toBe(true);
    expect(w.points).toEqual([[1, 1], [5, 2]]);
    expect(w.key("Escape")).toBe(true);
    expect(w.points).toEqual([]);
    expect(shown.at(-1)).toEqual([]);
    expect(launched).toEqual([]);
  });

  it("a click without Shift launches with its tile the end; Enter launches with the last waypoint the end", () => {
    const { w, launched } = gesture();
    expect(w.click([3, 3])).toBe(false);
    w.add([1, 1]);
    w.add([5, 2]);
    expect(w.click([9, 9])).toBe(true);
    expect(launched.at(-1)).toEqual([[1, 1], [5, 2], [9, 9]]);
    expect(w.active).toBe(false);
    w.add([1, 1]);
    expect(w.key("Enter")).toBe(true);
    expect(launched).toHaveLength(1);
    w.add([4, 4]);
    expect(w.key("Enter")).toBe(true);
    expect(launched.at(-1)).toEqual([[1, 1], [4, 4]]);
  });

  it("is drawn as markers joined by a thin line; the curve passes through every point", () => {
    const t = waypointTiles([[2, 2], [10, 2], [10, 8]], 16, 16);
    expect(t.markers).toContain(2 * 16 + 2);
    expect(t.markers).toContain(8 * 16 + 10);
    expect(t.line).toContain(2 * 16 + 6);
    expect(t.line).toContain(5 * 16 + 10);
    const pts = [{ x: 2, y: 2 }, { x: 10, y: 2 }, { x: 10, y: 8 }, { x: 3, y: 12 }];
    const c = waypointCurve(pts);
    for (const p of pts) expect(Math.min(...c.x.map((x, k) => Math.hypot(x - p.x, c.y[k] - p.y)))).toBeLessThan(1e-9);
    for (let k = 1; k < c.s.length; k++) expect(c.s[k]).toBeGreaterThan(c.s[k - 1]);
  });
});
