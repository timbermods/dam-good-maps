// A force's size ring (PLAN §20 D312; Quake has none, D368 (2)) and the freehand path (D321, items 41 and 13; D327): the ring's
// radius follows Power and Size; a press becomes a drawn path once the pointer moves six pixels, a
// click otherwise; the path is kept resampled along its length, its ends exact; a river's runs from
// its higher end, whichever way it was drawn; the curve through its points passes through each.

import { describe, expect, it } from "vitest";
import { forceReach } from "../../src/core/forces/reach";
import { ERUPT_DEFAULTS } from "../../src/core/forces/erupt";
import { downhillPath, pathLength, pathTiles, resamplePath } from "../../src/core/forces/path";
import { DRAW_PX, FreehandPath } from "../../src/editor/freehand";
import { CarveRun, DEFAULTS as CARVE } from "../../src/core/forces/carve/run";
import { fixture } from "../contract/forceFixtures";

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
  });
});

describe("the freehand path (D321, item 41)", () => {
  it("a press that stays put is a click where it was pressed; one that moves six pixels draws, and ends as the path", () => {
    const g = new FreehandPath(64, 64);
    g.down({ x: 10, y: 10 }, 100, 100);
    expect(g.move({ x: 10, y: 10 }, 100 + DRAW_PX - 1, 100, 0)).toBeNull();
    expect(g.up({ x: 11, y: 10 })).toEqual({ click: { x: 10, y: 10 } });
    expect(g.pressed).toBe(false);
    g.down({ x: 10, y: 10 }, 100, 100);
    let t = 0;
    for (let k = 1; k <= 20; k++) {
      const drawn = g.move({ x: 10 + k, y: 10 + Math.round(k / 3) }, 100 + k * 10, 100, (t += 16));
      expect(drawn).not.toBeNull();
    }
    expect(g.drawing).toBe(true);
    const end = g.up({ x: 30, y: 17 });
    expect(end && "path" in end).toBe(true);
    const path = (end as { path: { x: number; y: number }[] }).path;
    expect(path[0]).toEqual({ x: 10, y: 10 });
    expect(path.at(-1)).toEqual({ x: 30, y: 17 });
    expect(pathLength(path)).toBeGreaterThan(20);
    // Esc drops a press
    g.down({ x: 1, y: 1 }, 0, 0);
    g.cancel();
    expect(g.up(null)).toBeNull();
  });

  it("is kept a point every two tiles along it (its ends exact, at most the limit), whole tiles once each in a row", () => {
    const line = Array.from({ length: 41 }, (_, k) => ({ x: k * 0.5, y: 3 }));
    const r = resamplePath(line, 2, 128);
    expect(r[0]).toEqual({ x: 0, y: 3 });
    expect(r.at(-1)).toEqual({ x: 20, y: 3 });
    expect(r.length).toBe(11);
    expect(resamplePath(Array.from({ length: 1000 }, (_, k) => ({ x: k * 0.5, y: 0 })), 2, 64).length).toBeLessThanOrEqual(64);
    expect(pathTiles([{ x: 0.2, y: 0 }, { x: 0.4, y: 0 }, { x: 1.1, y: 0 }], 8, 8)).toEqual([[0, 0], [1, 0]]);
  });

  it("a river runs from the path's higher end to its lower, whichever way it was drawn", () => {
    const W = 8;
    const heights = Uint8Array.from({ length: 64 }, (_, i) => 10 - (i % W));
    const drawnUphill = [{ x: 6, y: 2 }, { x: 3, y: 2 }, { x: 0, y: 2 }];
    expect(downhillPath(drawnUphill, heights, W, 8)[0]).toEqual({ x: 0, y: 2 });
    const drawnDownhill = drawnUphill.slice().reverse();
    expect(downhillPath(drawnDownhill, heights, W, 8)[0]).toEqual({ x: 0, y: 2 });
  });

  it("a carve drawn along a path: its curve passes through every point, and its course follows it", () => {
    const W = 64;
    const at = (x: number, y: number) => y * W + x;
    const stops = [at(10, 10), at(20, 12), at(40, 20), at(44, 40), at(30, 54)];
    const r = new CarveRun(fixture("plain", W), { ...CARVE, mode: "aim", power: 60, defyGravity: true }, { origin: stops[0], end: stops.at(-1)!, via: stops.slice(1, -1) });
    const c = r.records.curve!;
    const near = (x: number, y: number, xs: number[], ys: number[]) => Math.min(...xs.map((v, k) => Math.hypot(v - x, ys[k] - y)));
    for (const t of stops) expect(near(t % W, Math.floor(t / W), c.x, c.y)).toBeLessThan(1e-9);
    for (let k = 1; k < c.s.length; k++) expect(c.s[k]).toBeGreaterThan(c.s[k - 1]);
    // (the river keeps its own wander and physics along it: its course passes within a few tiles of each point)
    r.finish();
    for (const t of stops.slice(1, -1)) expect(near(t % W, Math.floor(t / W), r.path.map((p) => p.x), r.path.map((p) => p.y))).toBeLessThan(6);
  });
});
