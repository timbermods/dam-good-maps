// The DGM Probe's parity maps (tools/probe-maps/parity.ts) as the game gets them, after the probe run parity-20260930
// (PLAN §20 D337, D339): the file's water comes only from what runs at the map's start (a delayed source's pit is dry;
// a seep's pit holds no more than 0.8 over it), and the core's preview draws the water the model settles to after the
// blast, run from the file's own water.

import { describe, expect, it } from "vitest";
import { explosionAfter } from "../../src/core/doc/blast";
import { toMapObject } from "../../src/core/features/build";
import { waterModel } from "../../src/core/sim/model";
import { WaterSim } from "../../src/core/sim/water";
import { buildSample, SAMPLES } from "../../tools/probe-maps/parity";

const sample = (id: string) => buildSample(SAMPLES.find((p) => p.id === id)!);
const inBox = ([x0, y0, w, h]: number[], W: number) => Array.from({ length: w * h }, (_, k) => (y0 + Math.floor(k / w)) * W + x0 + (k % w));

describe("the probe's parity maps", () => {
  it("a delayed source's pit is dry in the file: the source that runs at once never floods it", () => {
    const { s, data } = sample("parity-delay");
    const W = s.size.x;
    const pits = data.pits as number[][];
    for (const i of inBox(pits[1], W)) expect(s.built.water[i]).toBe(0);
    // (the one that runs at once has filled its own)
    expect(s.built.water[inBox(pits[0], W)[12]]).toBeGreaterThan(1);
  });

  it("a seep's pit holds no more than 0.8 over the seep in the file, while the source's fills", () => {
    const { s, data } = sample("parity-seeps");
    const W = s.size.x;
    const [ax, ay] = (data.seep as { anchor: [number, number] }).anchor;
    const [sx, sy] = (data.source as { tile: [number, number] }).tile;
    expect(s.built.water[ay * W + ax]).toBeGreaterThan(0.6);
    expect(s.built.water[ay * W + ax]).toBeLessThanOrEqual(0.81);
    expect(s.built.water[sy * W + sx]).toBeGreaterThan(2);
  });

  it("the core's preview is the water the model settles to after the blast, run from the file's own water", () => {
    const { s, data } = sample("parity-core");
    const W = s.size.x;
    const core = (data.core as { id: string }).id;
    const after = explosionAfter(s, core);
    // the blast opens the pond into the crater: the preview has water in the crater
    const watched = data.watched as [number, number, number][];
    expect(watched.some(([x, y, d]) => d > 1 && after.heights[y * W + x] < s.built.heights[y * W + x])).toBe(true);
    const sim = new WaterSim(waterModel(W, W, after.heights, after.entities.map(toMapObject)), { depth: Float64Array.from(s.built.water), contamination: Float64Array.from(s.built.contamination) });
    sim.run(3 * 768);
    for (const [x, y, d] of watched) expect(Math.abs(sim.D[y * W + x] - d)).toBeLessThan(0.15);
  });
});
