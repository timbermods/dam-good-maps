// Erupt to the demo Kyler approved (PLAN §20 D226), against the prototype itself (investigation/erupt:
// the same engine as forces-core's, #50/#59), the same seeds and settings. Where the prototype's
// volcano had the room under the map's ceiling it rises as the prototype's did, reshaped by D321's
// item 14 (a volcano always looks like a volcano: a clear crater, a skirt of lava that never turns it
// into a mound, a surface of rock rather than single-tile noise), so it no longer matches it level for
// level. Where
// it hadn't (the prototype pressed its top flat against the ceiling: the mesa), the editor's keeps a
// peak within the room it has, broader rather than taller; with no room at the vent it breaks out on
// the flank, so overlapping eruptions build new cones on the flanks; and it always completes. Size
// sets its breadth, Power its height.

import { describe, expect, it } from "vitest";
import { DEFAULTS as PROTO_DEFAULTS, EruptPlan as ProtoPlan, type Settings } from "../../investigation/erupt/engine";
import { fixture } from "../../investigation/erupt/maps";
import { ERUPT_DEFAULTS, eruptAnatomy, EruptPlan, NO_ROOM_REASON, type EruptSettings } from "../../src/core/forces/erupt";
import type { FullForceMap } from "../../src/core/forces/force";
import { EruptRun } from "../../src/core/forces/runs";

type ProtoMap = ReturnType<typeof fixture>;
const W = 128;
const CENTRE = 64 * W + 64;

/** The demo's own study (open woodland at level 3, its ceiling 22), or raised to `level` under
 *  `ceiling`; without its start (D257: the prototype kept the start's ground, which a force now
 *  treats as any other; D148). */
function study(level = 3, ceiling = 22): ProtoMap {
  const m = fixture("plain", W);
  m.entities = m.entities.filter((e) => e.template !== "StartingLocation");
  if (level !== 3) {
    for (let i = 0; i < m.heights.length; i++) m.heights[i] = level;
    for (const e of m.entities) e.z = level;
  }
  m.maxHeight = ceiling;
  return m;
}
const copy = (m: ProtoMap): ProtoMap => ({ ...m, heights: m.heights.slice(), entities: structuredClone(m.entities), fallen: [], lava: m.lava.slice(), water: { depth: m.water.depth.slice(), contamination: m.water.contamination.slice() } });
const asForce = (m: ProtoMap) => m as unknown as FullForceMap;
function planned<T extends { advance(rows: number): boolean }>(p: T): T {
  while (!p.advance(8)) {
    // a few rows at a time
  }
  return p;
}
const proto = (m: ProtoMap, s: Settings, origin = CENTRE) => planned(new ProtoPlan(copy(m), s, { origin })).map;
const editor = (m: ProtoMap, s: Partial<EruptSettings>, origin = CENTRE) => new EruptPlan(asForce(copy(m)), { ...ERUPT_DEFAULTS, ...s } as EruptSettings, { origin }).map;

/** The highest level within `r` of (x, y), and how many tiles stand at it there (its top). */
function top(h: Uint8Array, x: number, y: number, r = 12): { peak: number; at: number } {
  let peak = 0;
  for (let i = 0; i < h.length; i++) if (Math.hypot((i % W) - x, Math.floor(i / W) - y) < r) peak = Math.max(peak, h[i]);
  let at = 0;
  for (let i = 0; i < h.length; i++) if (Math.hypot((i % W) - x, Math.floor(i / W) - y) < r && h[i] === peak) at++;
  return { peak, at };
}
const raisedOf = (after: Uint8Array, before: Uint8Array) => after.reduce((n, v, i) => n + (v !== before[i] ? 1 : 0), 0);

const GRID: Partial<Settings>[] = [];
for (const power of [20, 62, 96]) for (const shape of ["steep", "broad"] as const) for (const summit of ["auto", "peak", "crater", "caldera"] as const) GRID.push({ power, shape, summit, seed: 890 });

describe("Erupt against the prototype Kyler approved (D226)", () => {
  it("where the prototype's volcano has the room, the editor's rises as high at the same vent, its cone the dominant shape (D321, item 14): low and high power, Steep and Broad, each summit, vents and fissures", () => {
    let compared = 0;
    for (const [level, ceiling] of [
      [3, 22],
      [3, 16],
      [12, 16],
    ] as const) {
      const m = study(level, ceiling);
      for (const g of GRID) {
        const s = { ...PROTO_DEFAULTS, ...g } as Settings;
        const a = proto(m, s);
        if (Math.max(...a.heights) >= ceiling) continue;
        const b = editor(m, s);
        const what = JSON.stringify({ level, ceiling, ...g });
        const pa = Math.max(...a.heights);
        const pb = Math.max(...b.heights);
        expect(Math.abs(pb - pa), what).toBeLessThanOrEqual(3);
        // (its highest ground is its cone's, within its radius: never the skirt of lava beyond)
        const cone = eruptAnatomy(asForce(m), { ...ERUPT_DEFAULTS, ...s } as EruptSettings, { origin: CENTRE }).radius;
        expect(top(b.heights, 64, 64, cone).peak, what).toBe(pb);
        // fresh rock exactly where it raised the ground, no more
        for (let i = 0; i < b.heights.length; i++) if (b.heights[i] === m.heights[i]) expect(b.lava[i], `${what} ${i}`).toBe(0);
        compared++;
      }
      // a fissure painted across the study
      const s = { ...PROTO_DEFAULTS, mode: "fissure", power: 40, seed: 53 } as Settings;
      const path = [
        { x: 40, y: 60 },
        { x: 64, y: 66 },
        { x: 88, y: 60 },
      ];
      const pa = planned(new ProtoPlan(copy(m), s, { origin: 60 * W + 40, path })).map;
      if (Math.max(...pa.heights) < ceiling) {
        const pb = new EruptPlan(asForce(copy(m)), s as EruptSettings, { origin: 60 * W + 40, path }).map;
        expect(Math.abs(Math.max(...pb.heights) - Math.max(...pa.heights))).toBeLessThanOrEqual(2);
        compared++;
      }
    }
    // (the demo's own study had the room for nearly all of them)
    expect(compared).toBeGreaterThanOrEqual(40);
  });

  it("near the ceiling it keeps a peak within the room it has, broader rather than taller, where the prototype pressed its top flat", () => {
    for (const [level, ceiling] of [
      [3, 16],
      [12, 16],
    ] as const) {
      const m = study(level, ceiling);
      for (const power of [20, 62, 96])
        for (const shape of ["steep", "broad"] as const)
          for (const summit of ["auto", "peak"] as const) {
            const s = { ...PROTO_DEFAULTS, power, shape, summit, seed: 890 } as Settings;
            const a = proto(m, s);
            if (Math.max(...a.heights) < ceiling) continue;
            const b = editor(m, s);
            const pt = top(a.heights, 64, 64);
            const et = top(b.heights, 64, 64);
            const what = JSON.stringify({ level, ceiling, power, shape, summit });
            // never past the ceiling; a peak (Auto's too, unless it keeps most of its rise as a
            // caldera, whose floor is flat by design): its top a few tiles, never a plateau
            expect(Math.max(...b.heights), what).toBeLessThanOrEqual(ceiling);
            if (eruptAnatomy(asForce(m), { ...ERUPT_DEFAULTS, ...s } as EruptSettings, { origin: CENTRE }).summit !== "peak") continue;
            expect(et.at, what).toBeLessThanOrEqual(90);
            expect(et.peak, what).toBeGreaterThanOrEqual(ceiling - 1);
            // (where the prototype had no room at all, its top was pressed flat: a mesa, several
            // times the editor's top)
            if (level === 12 && power >= 62) expect(pt.at, what).toBeGreaterThan(et.at * 2);
            if (level === 12 && power >= 62) expect(pt.at, what).toBeGreaterThanOrEqual(400);
          }
      // a steep peak with little room grows broader: its cone reaches further out than a lower
      // prototype-shaped cone would, and it is still a peak
      const s = { power: 62, shape: "steep" as const, summit: "peak" as const, seed: 890 };
      const a = eruptAnatomy(asForce(m), { ...ERUPT_DEFAULTS, ...s }, { origin: CENTRE });
      const natural = eruptAnatomy(asForce(study(3, 22)), { ...ERUPT_DEFAULTS, ...s }, { origin: CENTRE });
      expect(a.scale).toBeLessThan(1);
      expect(a.radius).toBeGreaterThan(natural.radius);
      expect(a.height).toBeLessThan(natural.height);
    }
  });

  it("with no room at its vent it breaks out on the flank: overlapping eruptions build new cones on the flanks; each completes; at the ceiling everywhere, it says there is no room", () => {
    let m = study(3, 16);
    const vents: { x: number; y: number }[] = [];
    for (let k = 0; k < 5; k++) {
      const s = { ...ERUPT_DEFAULTS, power: 62, shape: "steep" as const, summit: "peak" as const, seed: 100 + k };
      const a = eruptAnatomy(asForce(m), s, { origin: CENTRE });
      vents.push({ x: a.x, y: a.y });
      const p = new EruptPlan(asForce(copy(m)), s, { origin: CENTRE });
      const next = { ...m, heights: p.map.heights, lava: p.map.lava };
      // never a mesa: the top round each vent is a few tiles
      expect(top(next.heights, a.x, a.y, 8).at, `eruption ${k}`).toBeLessThanOrEqual(40);
      m = next;
    }
    // the first rose where it was asked; the later ones, with no room left there, on its flanks
    expect(vents[0]).toEqual({ x: 64, y: 64 });
    expect(vents.slice(1).some((v) => v.x !== 64 || v.y !== 64)).toBe(true);
    // at the ceiling everywhere: no room, said plainly
    const full = study(16, 16);
    expect(() => new EruptPlan(asForce(copy(full)), ERUPT_DEFAULTS, { origin: CENTRE })).toThrow(NO_ROOM_REASON);
  });

  it("an eruption always completes: its staged run ends, and what it shows last is what is kept, at every stage count", () => {
    for (const [level, ceiling] of [
      [3, 22],
      [12, 16],
    ] as const) {
      const m = asForce(study(level, ceiling));
      const run = new EruptRun(m, { ...ERUPT_DEFAULTS, power: 96 }, { origin: CENTRE });
      let guard = 0;
      while (!run.done && guard++ < 1000) run.step();
      expect(run.done).toBe(true);
      expect(run.reason).toBe("done");
      expect([...run.map.heights]).toEqual([...run.final()!.heights]);
    }
  });

  it("Size sets its breadth and Power its strength within it (D226, D361 (3)): a set Size spreads it wider or narrower; up to Power's own breadth at the same peak, wider than it lower", () => {
    const m = study(3, 22);
    const narrow = editor(m, { power: 40, summit: "peak", size: 24 });
    const wide = editor(m, { power: 40, summit: "peak", size: 80 });
    const natural = editor(m, { power: 40, summit: "peak" });
    expect(raisedOf(wide.heights, m.heights)).toBeGreaterThan(raisedOf(natural.heights, m.heights));
    expect(raisedOf(narrow.heights, m.heights)).toBeLessThan(raisedOf(natural.heights, m.heights));
    expect(top(narrow.heights, 64, 64).peak).toBe(top(natural.heights, 64, 64).peak);
    // (broader than Power's own volcano, it rises in proportion: D361 (3))
    expect(top(wide.heights, 64, 64).peak).toBeLessThan(top(natural.heights, 64, 64).peak);
    // Size absent (an operation from before D226) is Size following Power
    const s = { ...PROTO_DEFAULTS, power: 40, summit: "peak", seed: 890 } as Settings;
    const { size: _size, ...absent } = { ...ERUPT_DEFAULTS, ...s, size: null };
    expect([...editor(m, absent).heights]).toEqual([...editor(m, { ...s, size: null }).heights]);
    expect(() => new EruptPlan(asForce(copy(m)), { ...ERUPT_DEFAULTS, size: 200 }, { origin: CENTRE })).toThrow();
  });

  it("a volcano always looks like a volcano (D321, item 14): a clear crater with Summit: Crater, a cone that stays the highest ground, rock rather than single-tile noise, and High Power toward the 22-level ceiling", () => {
    const m = study(3, 22);
    for (const flows of ["light", "heavy"] as const) {
      const s = { power: 74, shape: "steep" as const, summit: "crater" as const, flows, seed: 890 };
      const b = editor(m, s);
      const a = eruptAnatomy(asForce(m), { ...ERUPT_DEFAULTS, ...s }, { origin: CENTRE });
      // the crater: its floor at least two levels under its rim
      const rim = top(b.heights, 64, 64, a.radius * 0.3).peak;
      expect(rim - b.heights[CENTRE], flows).toBeGreaterThanOrEqual(2);
      // the cone is the highest ground: nothing past its radius as high as its rim
      let beyond = 0;
      for (let i = 0; i < b.heights.length; i++) if (Math.hypot((i % W) - 64, Math.floor(i / W) - 64) > a.radius) beyond = Math.max(beyond, b.heights[i]);
      expect(beyond, flows).toBeLessThan(rim - 3);
      // no lone raised tile above or below all four of its neighbours, away from the summit
      let lone = 0;
      for (let y = 1; y < W - 1; y++)
        for (let x = 1; x < W - 1; x++) {
          const i = y * W + x;
          if (b.heights[i] === m.heights[i] || Math.hypot(x - 64, y - 64) < Math.max(2.5, a.radius * 0.15)) continue;
          const n = [b.heights[i - 1], b.heights[i + 1], b.heights[i - W], b.heights[i + W]];
          if (b.heights[i] > Math.max(...n) || b.heights[i] < Math.min(...n)) lone++;
        }
      expect(lone, flows).toBe(0);
    }
    // High Power rises toward the ceiling, never stopping at 16 (D244)
    const high = editor(m, { power: 100, shape: "steep", summit: "peak", flows: "heavy", seed: 890 });
    expect(Math.max(...high.heights)).toBeGreaterThanOrEqual(20);
    expect(Math.max(...high.heights)).toBeLessThanOrEqual(22);
  });
});
