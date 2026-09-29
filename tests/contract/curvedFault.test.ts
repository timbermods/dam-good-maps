// Curved faults and fissures (PLAN §20 D327): Quake's fault and Erupt's fissure follow the line drawn
// freehand. Lift raises along the curve; Slide moves the ground along the curve's own direction where
// each part of it lies (a straight fault keeps its one heading, exactly as before); the fissure opens
// along the line.

import { describe, expect, it } from "vitest";
import { ERUPT_DEFAULTS } from "../../src/core/forces/erupt";
import { snapshotMap } from "../../src/core/forces/force";
import { Fault, QUAKE_DEFAULTS, quake } from "../../src/core/forces/quake";
import { EruptRun } from "../../src/core/forces/runs";
import { fixture } from "./forceFixtures";

/** An L: east along y = 30 from x = 10 to 60, then south to y = 80. */
const L = [
  { x: 10, y: 30 },
  { x: 35, y: 30 },
  { x: 60, y: 30 },
  { x: 60, y: 55 },
  { x: 60, y: 80 },
];

describe("curved faults and fissures (D327)", () => {
  it("Slide moves each part of the ground the way the drawn line runs there; a straight fault its one heading", () => {
    const f = new Fault({ ...QUAKE_DEFAULTS, mode: "slide", power: 80 }, { path: L, side: 1 });
    // on the side that moves (side 1: south of the east-running leg, west of the south-running one),
    // beside the first leg the ground slides east, beside the second, south
    const east = f.movement(30, 34);
    const south = f.movement(56, 70);
    expect(Math.abs(east.dx)).toBeGreaterThan(Math.abs(east.dy));
    expect(Math.abs(south.dy)).toBeGreaterThan(Math.abs(south.dx));
    expect(Math.sign(east.dx)).toBe(1);
    expect(Math.sign(south.dy)).toBe(1);
    // a straight fault: every tile the same heading
    const straight = new Fault({ ...QUAKE_DEFAULTS, mode: "slide", power: 80 }, { path: [{ x: 5, y: 40 }, { x: 90, y: 40 }], side: 1 });
    const a = straight.movement(20, 44);
    const b = straight.movement(80, 44);
    expect([a.dx, a.dy]).toEqual([b.dx, b.dy]);
    expect(a.dx).toBeGreaterThan(0);
    expect(a.dy).toBe(0);
  });

  it("Lift raises along the whole curve, both its legs", () => {
    const m = fixture("plain", 96);
    const p = quake(snapshotMap(m), { ...QUAKE_DEFAULTS, power: 80, seed: 3 }, { path: L, side: 1 });
    const rose = (x: number, y: number) => p.map.heights[y * 96 + x] - m.heights[y * 96 + x];
    // each leg's two sides move apart: the first's north and south, the second's east and west
    const side = (x: number, y: number, other: [number, number]) => rose(x, y) !== rose(other[0], other[1]);
    expect(side(30, 27, [30, 34])).toBe(true);
    expect(side(63, 68, [56, 68])).toBe(true);
  });

  it("the fissure opens along the drawn line, both its legs", () => {
    const m = fixture("plain", 96);
    const r = new EruptRun(snapshotMap(m), { ...ERUPT_DEFAULTS, mode: "fissure", power: 60 }, { origin: 30 * 96 + 10, path: L });
    r.finishAll();
    const h = r.final()!.heights;
    const up = (x: number, y: number) => h[y * 96 + x] > m.heights[y * 96 + x];
    expect(up(35, 30)).toBe(true);
    expect(up(60, 65)).toBe(true);
    // away from the line, the land stays
    expect(up(20, 75)).toBe(false);
  });
});
