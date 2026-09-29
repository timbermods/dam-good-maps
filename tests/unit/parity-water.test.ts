// The water rules of the fluid objects (PLAN §20 D337): seeps stop while the water over them is deeper than
// 0.8, a delayed source waits, an aquifer and a badtide drain give nothing at the map's start, a sink drains what
// stands there, and the ceilings hold. Each case is a sealed basin with a rim, so the water stays where it is put.

import { describe, expect, it } from "vitest";
import type { Orientation } from "../../src/core/format/footprints";
import { MAX_STRENGTH_PER_TILE, waterModel, type MapObject } from "../../src/core/sim/model";
import { WaterSim } from "../../src/core/sim/water";

const W = 24;
const H = 24;
const N = W * H;
const RIM = 9;
const FLOOR = 3;

/** A basin 8 × 8 at level 3 in the middle of a level-9 ring, so nothing leaves it. */
function basin(): Uint8Array {
  const h = new Uint8Array(N).fill(RIM);
  for (let y = 8; y < 16; y++) for (let x = 8; x < 16; x++) h[y * W + x] = FLOOR;
  return h;
}
const INSIDE = (() => {
  const out: number[] = [];
  for (let y = 8; y < 16; y++) for (let x = 8; x < 16; x++) out.push(y * W + x);
  return out;
})();

function obj(template: string, x: number, y: number, comps: Record<string, unknown> = {}, orientation: Orientation = "Cw0"): MapObject {
  return { template, x, y, z: FLOOR, orientation, flipped: false, components: comps as MapObject["components"] };
}
const strength = (s: number) => ({ WaterSource: { SpecifiedStrength: s } });
const volume = (sim: WaterSim) => INSIDE.reduce((a, i) => a + sim.D[i], 0);

describe("the water objects' rules on the game's terms (D337)", () => {
  it("a seep stops while the water over it is deeper than 0.8, and never fills a crater; a source of the same strength does", () => {
    const seep = new WaterSim(waterModel(W, H, basin(), [obj("WaterSeep", 11, 11, { ...strength(1), WaterDepthStrengthModifier: { CurrentModifier: 1 } })])).run(3000);
    const source = new WaterSim(waterModel(W, H, basin(), [obj("WaterSource", 11, 11, strength(1))])).run(3000);
    const seepDepth = seep.D[11 * W + 11];
    // (it fills the pool to 0.8 and holds there: it switches off above 0.8 and back on below 0.72)
    expect(seepDepth).toBeGreaterThan(0.7);
    expect(seepDepth).toBeLessThan(0.86);
    expect(source.D[11 * W + 11]).toBeGreaterThan(2);
    // the seep's tiles emit into the four tiles of its footprint at a share each
    expect(seep.emitters[0].cells).toHaveLength(4);
    expect(seep.emitters[0].depthLimit).toMatchObject({ off: 0.8, on: 0.72 });
  });

  it("a delayed source runs no water until it starts; an aquifer gives none without a drill, nor a drain outside a badtide", () => {
    const delayed = waterModel(W, H, basin(), [obj("WaterSource", 11, 11, { ...strength(2), TimeActivatedComponent: { IsEnabled: true, CyclesUntilCountdownActivation: 2, DaysUntilActivation: 3 } })]);
    expect(delayed.emitters[0].strength).toBe(0);
    expect(volume(new WaterSim(delayed).run(500))).toBe(0);
    // the same source with no delay runs
    const now = waterModel(W, H, basin(), [obj("WaterSource", 11, 11, { ...strength(2), TimeActivatedComponent: { IsEnabled: false, CyclesUntilCountdownActivation: 5 } })]);
    expect(now.emitters[0].strength).toBe(2);
    // an aquifer (its drill starts without power) and a badtide drain run nothing in temperate weather
    expect(waterModel(W, H, basin(), [obj("Aquifer", 10, 10, strength(1))]).emitters[0].strength).toBe(0);
    expect(waterModel(W, H, basin(), [obj("BadtideDrain", 11, 11, strength(1))]).emitters[0]).toMatchObject({ strength: 0, contamination: 1 });
    // a delayed seep, and a badwater seep, likewise
    expect(waterModel(W, H, basin(), [obj("BadwaterSeep", 11, 11, { ...strength(1), TimeActivatedComponent: { IsEnabled: true } })]).emitters[0].strength).toBe(0);
  });

  it("a negative strength is a sink: it drains the water that stands on its tile, down to dry, and the model keeps it", () => {
    const m = waterModel(W, H, basin(), [obj("WaterSource", 11, 11, strength(-2))]);
    expect(m.emitters[0].strength).toBe(-2);
    const depth = new Float64Array(N);
    for (const i of INSIDE) depth[i] = 1;
    const sim = new WaterSim(m, { depth, contamination: new Float64Array(N) });
    const before = volume(sim);
    sim.run(30);
    expect(volume(sim)).toBeLessThan(before);
    sim.run(3000);
    expect(volume(sim)).toBeLessThan(0.01 * before);
    // (depth never goes below zero)
    for (const i of INSIDE) expect(sim.D[i]).toBeGreaterThanOrEqual(0);
  });

  it("a sink beside a source takes what the source gives, the pool between them held to what the flow allows", () => {
    // 2 in, 2 out: the water stays a shallow stream instead of filling the basin
    const m = waterModel(W, H, basin(), [obj("WaterSource", 9, 9, strength(2)), obj("WaterSource", 14, 14, strength(-2))]);
    const sim = new WaterSim(m).run(4000);
    expect(volume(sim)).toBeLessThan(25);
    const filled = new WaterSim(waterModel(W, H, basin(), [obj("WaterSource", 9, 9, strength(2))])).run(4000);
    expect(volume(filled)).toBeGreaterThan(150);
  });

  it("the ceilings: 8 for each tile an object emits into, so a source gives at most 8, a seep 32 and a badwater source 72", () => {
    expect(MAX_STRENGTH_PER_TILE).toBe(8);
    const at = (template: string, s: number) => waterModel(W, H, basin(), [obj(template, 10, 10, strength(s))]).emitters[0].strength;
    expect(at("WaterSource", 100)).toBe(8);
    expect(at("WaterSeep", 100)).toBe(32);
    expect(at("BadwaterSeep", 100)).toBe(32);
    expect(at("BadwaterSource", 100)).toBe(72);
    expect(at("WaterSeep", 20)).toBe(20);
  });
});
