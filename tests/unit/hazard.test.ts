// Drought and Badtide, day by day (PLAN §20 D267, D268): the hazard's days are the game's weather
// rules run day after day (the same water as one continuous run), the notes say when each tile's
// water dries or turns bad, and the start's marker falls on the day its water leaves a pump's reach.

import { describe, expect, it } from "vitest";
import { startMarker, startNote, startWalk, startWater } from "../../src/core/analysis/startWater";
import { ALREADY_BAD, FLOODS_NOTE, floodedTiles, framesPerDay, HazardRun, hazardNote, LASTS, NOT_WATER } from "../../src/core/sim/hazard";
import { droughtStrength, droughtTransitionDays } from "../../src/core/sim/weather";
import { storedOutflows } from "../../src/core/format/world";
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
    const seen: { day: number; frame: number; end: boolean }[] = [];
    for (let f = run.step(); f; f = run.step()) seen.push(f);
    expect(run.days).toBe(3);
    // (no source: nothing to ease down, the drought starts at once)
    expect(run.lead).toBe(0);
    expect(seen).toHaveLength(18);
    expect(seen.at(-1)).toMatchObject({ day: 3, frame: 5, end: true });
    expect(seen.filter((f) => f.end).map((f) => f.day)).toEqual([1, 2, 3]);
    const sim = new WaterSim(m.model, { depth: Float64Array.from(m.depth), contamination: Float64Array.from(m.contamination) }, { edgeSpill: true });
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
      if (!f.end) continue;
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

  it("before a drought each source eases down over its own transition, as the game does (DroughtWaterStrengthModifier)", () => {
    // about S / 2.67 days: a strength of 8 takes three days
    expect(droughtTransitionDays(8)).toBeCloseTo(8 / (Math.fround(768 * Math.fround(0.6)) * Math.fround(0.0058)), 9);
    expect(droughtTransitionDays(8)).toBeCloseTo(2.993, 3);
    const T = droughtTransitionDays(2);
    // full strength before its ease, 1 − p(0.85p + 0.15) of it p of the way through, none in the drought
    expect(droughtStrength(-T - 0.01, 2)).toBe(1);
    expect(droughtStrength(-T, 2)).toBeCloseTo(1, 9);
    expect(droughtStrength(-T / 2, 2)).toBeCloseTo(1 - 0.5 * (0.85 * 0.5 + Math.fround(0.15)), 5);
    expect(droughtStrength(-1e-9, 2)).toBeCloseTo(0, 6);
    expect(droughtStrength(0, 2)).toBe(0);
    expect(droughtStrength(5, 2)).toBe(0);
  });

  it("a drought's run starts a source's ease before its day 1; the water at the drought's start is what the ease left", () => {
    const m = pondMap(0.8);
    const cell = 11 * W + 5;
    const model = { ...m.model, emitters: [{ cells: [cell], strength: 2, contamination: 0 }] };
    const run = new HazardRun({ model, depth: m.depth, contamination: m.contamination, hazard: "drought", days: 2, framesPerDay: 4 });
    expect(run.lead).toBe(Math.round(droughtTransitionDays(2) * TICKS_PER_DAY));
    expect(run.leadFrames).toBe(4);
    const frames = [];
    for (let f = run.step(); f; f = run.step()) frames.push(f);
    // the ease is day 1's first frames (the step from Day 0), its last the drought's start
    expect(frames.slice(0, 4).map((f) => [f.day, f.start])).toEqual([[1, false], [1, false], [1, false], [1, true]]);
    expect(frames.filter((f) => f.day === 1)).toHaveLength(8);
    expect(frames.filter((f) => f.end).map((f) => f.day)).toEqual([1, 2]);
    // the same water as a run with the source eased tick by tick by hand
    const sim = new WaterSim({ ...model, emitters: [{ ...model.emitters[0] }] }, { depth: Float64Array.from(m.depth), contamination: Float64Array.from(m.contamination) }, { edgeSpill: true });
    for (let t = 0; t < run.lead + 2 * TICKS_PER_DAY; t++) {
      sim.emitters[0].strength = 2 * droughtStrength((t + 1 - run.lead) / TICKS_PER_DAY, 2);
      sim.run(1);
    }
    expect(Array.from(run.sim.D)).toEqual(Array.from(sim.D));
    // the map's own source is untouched
    expect(model.emitters[0].strength).toBe(2);
    // a badtide starts at once
    expect(new HazardRun({ model, depth: m.depth, contamination: m.contamination, hazard: "badtide", days: 2, framesPerDay: 4 }).lead).toBe(0);
    // a lead given (the probe's three temperate days from 04:00) is kept whole
    expect(new HazardRun({ model, depth: m.depth, contamination: m.contamination, hazard: "drought", days: 2, framesPerDay: 4, lead: 3 - 128 / 768 }).lead).toBe(3 * 768 - 128);
  });

  it("the run starts from the water's outflows, as the file stores them and the game loads them", () => {
    const m = pondMap(0.8);
    const out = new Float64Array(4 * W * H);
    out[4 * (11 * W + 5) + 3] = 0.25;
    const a = new HazardRun({ model: m.model, depth: m.depth, contamination: m.contamination, out, hazard: "drought", days: 1, framesPerDay: 4 });
    expect(a.sim.out[4 * (11 * W + 5) + 3]).toBe(0.25);
    const b = new HazardRun({ model: m.model, depth: m.depth, contamination: m.contamination, hazard: "drought", days: 1, framesPerDay: 4 });
    a.step();
    b.step();
    expect(Array.from(a.sim.D)).not.toEqual(Array.from(b.sim.D));
    // the file's ColumnOutflows (FORMAT.md §4.3): Bottom:Left:Top:Right, each targetIndex|flow in the
    // game's grid padded by one tile
    const X = 3;
    const tokens = Array.from({ length: 9 }, () => "0");
    // tile (1, 1): 0.5 toward +x (its neighbour (2, 1), padded index (1 + 1)·5 + 2 + 1 = 13), 0.25 toward −y ((1, 0): 1·5 + 2 = 7)
    tokens[4] = "7|0.25:0:0:13|0.5";
    // a flow to a tile that isn't its neighbour is left out
    tokens[0] = "0:0:0:99|1";
    const read = storedOutflows({ WaterMapNew: { ColumnOutflows: { Array: tokens.join(" ") } } }, X, X)!;
    expect(Array.from(read.slice(16, 20))).toEqual([0.25, 0, 0, 0.5]);
    expect(Array.from(read.slice(0, 4))).toEqual([0, 0, 0, 0]);
    expect(storedOutflows({ WaterMapNew: {} }, X, X)).toBeNull();
  });

  it("a hazard's water keeps the game's spill threshold at the map's edge: a trickle on floor 0 stands a tenth deep there", () => {
    // a floor-0 channel running off the map's edge, fed by a trickle at its head
    const W2 = 8;
    const H2 = 5;
    const h = new Uint8Array(W2 * H2).fill(3);
    for (let x = 1; x < W2; x++) h[2 * W2 + x] = 0;
    const model = { ...waterModel(W2, H2, h, []), emitters: [{ cells: [2 * W2 + 1], strength: 0.02, contamination: 0 }] };
    const row = (edgeSpill: boolean) => Array.from(new WaterSim(model, undefined, { edgeSpill }).run(3000).D.slice(2 * W2 + 1, 3 * W2));
    // the heightfield port's settle (no threshold at the edge): a thin film, under the wet line
    expect(Math.max(...row(false))).toBeLessThan(0.05);
    // the game's: the water stands at the threshold all along the channel
    for (const d of row(true)) expect(d).toBeCloseTo(0.1, 3);
    expect(new HazardRun({ model, depth: new Float64Array(W2 * H2), contamination: new Float64Array(W2 * H2), hazard: "drought", days: 1, framesPerDay: 4 }).sim.edgeSpill).toBe(true);
  });

  it("flooded floor (D307): dry on Day 0, wet on the shown day and joined to the river's water; a puddle on its own is not", () => {
    // a 6 × 3 map: a river along the top row on Day 0; on the shown day it spills onto the floor below
    // it, and a lone puddle stands in the bottom right corner
    const W6 = 6;
    const change = new Uint8Array(18);
    for (let x = 0; x < W6; x++) change[x] = LASTS;
    const depth = new Float32Array(18);
    for (let x = 0; x < W6; x++) depth[x] = 0.6;
    depth[W6 + 1] = 0.2; // floor joined to the river
    depth[W6 + 2] = 0.2;
    depth[2 * W6 + 2] = 0.1; // joined through the floor above it
    depth[2 * W6 + 5] = 0.3; // a puddle joined to nothing
    depth[W6 + 4] = 0.03; // a film under the wet line
    const f = floodedTiles(W6, 3, change, depth);
    expect([...f.keys()].filter((i) => f[i])).toEqual([W6 + 1, W6 + 2, 2 * W6 + 2]);
    // the river itself says when it dries, not that it floods
    expect(f[0]).toBe(0);
    expect(FLOODS_NOTE).toBe("Floods when the river refills");
    // a river gone dry on the shown day floods nothing
    expect(Array.from(floodedTiles(W6, 3, change, new Float32Array(18)))).toEqual(new Array(18).fill(0));
  });
});
