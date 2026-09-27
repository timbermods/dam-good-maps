// Drought and Badtide, day by day (PLAN §20 D267, D268): the hazard's days are the game's weather
// rules run day after day (the same water as one continuous run), the notes say when each tile's
// water dries or turns bad, and the start's marker falls on the day its water leaves a pump's reach.

import { describe, expect, it } from "vitest";
import { startMarker, startNote, startWalk, startWater } from "../../src/core/analysis/startWater";
import { ALREADY_BAD, framesPerDay, HazardRun, hazardNote, LASTS, NOT_WATER } from "../../src/core/sim/hazard";
import { waterModel } from "../../src/core/sim/model";
import { TICKS_PER_DAY, WaterSim } from "../../src/core/sim/water";
import { soilContamination } from "../../src/core/sim/contamination";
import { PUMP_DEPTH } from "../../src/core/analysis/walk";

const W = 24;
const H = 24;
/** Level ground at 4 with a still pond near the start: a 4 × 4 hollow at 3 holding `deep` of water. */
function pondMap(deep: number) {
  const heights = new Uint8Array(W * H).fill(4);
  const depth = new Float64Array(W * H);
  const pond: number[] = [];
  for (let y = 10; y < 14; y++)
    for (let x = 4; x < 8; x++) {
      const i = y * W + x;
      heights[i] = 3;
      depth[i] = deep;
      pond.push(i);
    }
  return { heights, depth, contamination: new Float64Array(W * H), pond, model: waterModel(W, H, heights, []) };
}

describe("a hazard, day by day", () => {
  it("a length of 3 is three days, each with its frames, and its last day is one continuous run's water", () => {
    const m = pondMap(0.8);
    const run = new HazardRun({ model: m.model, depth: m.depth, contamination: m.contamination, hazard: "drought", days: 3, framesPerDay: 6 });
    const seen: { day: number; frame: number }[] = [];
    for (let f = run.step(); f; f = run.step()) seen.push(f);
    expect(run.days).toBe(3);
    expect(seen).toHaveLength(18);
    expect(seen.at(-1)).toEqual({ day: 3, frame: 5 });
    expect(seen.filter((f) => f.frame === 5).map((f) => f.day)).toEqual([1, 2, 3]);
    const sim = new WaterSim(m.model, { depth: Float64Array.from(m.depth), contamination: Float64Array.from(m.contamination) });
    sim.run(3 * TICKS_PER_DAY, 0);
    expect(Array.from(run.sim.D)).toEqual(Array.from(sim.D));
  });

  it("the length stays within 1 to 30 days, and the frames kept fit a memory budget", () => {
    const m = pondMap(0.8);
    expect(new HazardRun({ model: m.model, depth: m.depth, contamination: m.contamination, hazard: "drought", days: 0, framesPerDay: 4 }).days).toBe(1);
    expect(new HazardRun({ model: m.model, depth: m.depth, contamination: m.contamination, hazard: "drought", days: 45, framesPerDay: 4 }).days).toBe(30);
    expect(framesPerDay(9, 5000)).toBe(24);
    expect(framesPerDay(30, 60000)).toBe(4);
    expect(() => new HazardRun({ model: m.model, depth: m.depth, contamination: m.contamination, hazard: "drought", days: 3, framesPerDay: 7 })).toThrow();
  });

  it("each tile of water says the day it dries, or that it lasts the drought", () => {
    const m = pondMap(0.3);
    const run = new HazardRun({ model: m.model, depth: m.depth, contamination: m.contamination, hazard: "drought", days: 9, framesPerDay: 4 });
    while (run.step());
    const c = run.change[m.pond[5]];
    expect(c).toBeGreaterThan(0);
    expect(c).toBeLessThan(LASTS);
    expect(hazardNote("drought", c)).toBe(`Dry on day ${c}`);
    expect(run.change[0]).toBe(NOT_WATER);
    expect(hazardNote("drought", NOT_WATER)).toBeNull();
    // a deep pond lasts
    const deep = pondMap(3);
    const r2 = new HazardRun({ model: deep.model, depth: deep.depth, contamination: deep.contamination, hazard: "drought", days: 9, framesPerDay: 4 });
    while (r2.step());
    expect(r2.change[deep.pond[5]]).toBe(LASTS);
    expect(hazardNote("drought", LASTS)).toBe("Lasts the drought");
  });

  it("in a badtide, a clean source's water turns bad on day 1, and badwater there already says so", () => {
    const m = pondMap(0.8);
    const src = { cells: [11 * W + 5], strength: 1, contamination: 0 };
    const model = { ...m.model, emitters: [src] };
    const run = new HazardRun({ model, depth: m.depth, contamination: m.contamination, hazard: "badtide", days: 4, framesPerDay: 4 });
    while (run.step());
    expect(run.change[11 * W + 5]).toBe(1);
    expect(hazardNote("badtide", 1)).toBe("Turns bad on day 1");
    // the source gives clean water again after the badtide: its own copy was changed, not the map's
    expect(src.contamination).toBe(0);
    const bad = pondMap(0.8);
    bad.contamination.fill(1);
    const r2 = new HazardRun({ model: bad.model, depth: bad.depth, contamination: bad.contamination, hazard: "badtide", days: 2, framesPerDay: 4 });
    expect(r2.change[bad.pond[0]]).toBe(ALREADY_BAD);
    expect(hazardNote("badtide", ALREADY_BAD)).toBe("Badwater already");
    expect(hazardNote("badtide", LASTS)).toBe("Stays clean");
  });

  it("the start's marker falls on the day its water leaves a pump's reach", () => {
    const m = pondMap(0.6);
    const walk = startWalk([], m.heights, W, H, { x: 12, y: 12 });
    const moisture = new Float64Array(W * H);
    const sw = startWater({ W, H, heights: m.heights, walk, within: 10, depth: m.depth, contamination: m.contamination, moisture });
    // the pond is the start's water, and it is highlighted whole
    expect(sw.pumped.length).toBeGreaterThan(0);
    expect([...sw.body].sort((a, b) => a - b)).toEqual(m.pond);
    // the day the pond, evaporating, is too shallow to pump (an independent run of the same water)
    const sim = new WaterSim(m.model, { depth: Float64Array.from(m.depth), contamination: Float64Array.from(m.contamination) });
    let expected = 0;
    for (let d = 1; d <= 30 && !expected; d++) {
      sim.run(TICKS_PER_DAY, 0);
      if (Math.max(...m.pond.map((i) => sim.D[i])) < PUMP_DEPTH) expected = d;
    }
    expect(expected).toBeGreaterThan(1);
    const run = new HazardRun({ model: m.model, depth: m.depth, contamination: m.contamination, hazard: "drought", days: 30, framesPerDay: 4 });
    let marker: string | null = null;
    let day = 0;
    for (let f = run.step(); f && !marker; f = run.step()) {
      if (f.frame !== 3) continue;
      marker = startMarker("drought", sw, true, f.day, m.heights, W, H, run.sim.D, run.sim.C, soilContamination(m.heights, run.sim.D, run.sim.C, W, H));
      day = f.day;
    }
    expect(day).toBe(expected);
    expect(marker).toBe(`Day ${expected}: your start's water is gone`);
    expect(startNote("drought", true)).toBe("Your start's water lasts the drought");
  });

  it("in a badtide, the marker falls on the day badwater reaches the start's water", () => {
    const m = pondMap(0.8);
    const walk = startWalk([], m.heights, W, H, { x: 12, y: 12 });
    const sw = startWater({ W, H, heights: m.heights, walk, within: 10, depth: m.depth, contamination: m.contamination, moisture: new Float64Array(W * H) });
    const bad = new Float64Array(W * H);
    expect(startMarker("badtide", sw, true, 2, m.heights, W, H, m.depth, bad, new Float64Array(W * H))).toBeNull();
    bad[sw.pumped[0]] = 0.4;
    expect(startMarker("badtide", sw, true, 2, m.heights, W, H, m.depth, bad, new Float64Array(W * H))).toBe("Day 2: badwater reaches your start's water");
  });
});
