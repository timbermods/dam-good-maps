// A real place finished (Kyler, 2026-09-29, PLAN §20 D331; the forces-preview feedback's item 27):
// the edge lip beside a river's head (tools/places/finish.ts `edgeLips`, water/edgeLip.ts), the
// start's land (analysis/startLand.ts), a badwater spring's stream kept off the start's water and
// farmland (analysis/sources.ts `streamOf`, resources/badwater.ts `avoid`), and two mine sites the
// colony reaches (resources/plan.ts `reachableMines`).

import { describe, expect, it } from "vitest";
import { startingLocation } from "../../src/core/format/entities";
import { streamOf, waterWays } from "../../src/core/analysis/sources";
import { FARMLAND_NEAR, startLand } from "../../src/core/analysis/startLand";
import { walkDistance } from "../../src/core/analysis/walk";
import { badwaterBudget, pickBadwaterSprings } from "../../src/core/resources/badwater";
import { planMapResources } from "../../src/core/resources/plan";
import { mapObjects, waterModel } from "../../src/core/sim/model";
import { canonicalSettle } from "../../src/core/sim/prefill";
import { defaultSettings } from "../../src/core/spec/mapspec";
import { mapObject, sourceEntities } from "../../tools/places/convert";
import { edgeLips } from "../../tools/places/finish";

const W = 96;
const N = W * W;
const noWater = new Float64Array(N);
const emitting = new Uint8Array(N);

/** A plateau at 6, the start at (16, 30) on it, and a side valley at 3 in rows 60–68 from the west
 *  edge to x = 69, closed at its east end, so its water leaves by the west edge. */
function westValley(): Uint8Array {
  const h = new Uint8Array(N).fill(6);
  for (let y = 60; y <= 68; y++) for (let x = 0; x < 70; x++) h[y * W + x] = 3;
  return h;
}
const start = { x: 16, y: 30 };

describe("a real place finished (D331, item 27)", () => {
  it("the start's land: the moist farmland and level land within 20 tiles' walk, never past a step", () => {
    const h = new Uint8Array(N).fill(6);
    for (let y = 0; y < W; y++) for (let x = 24; x < W; x++) h[y * W + x] = 7;
    const moist = new Float64Array(N).fill(1);
    const walk = walkDistance(h, W, W, null, [], start, 24);
    const a = startLand({ W, H: W, heights: h, walk, depth: noWater, moisture: moist, soilContamination: noWater });
    expect(a.farmland).toBeGreaterThanOrEqual(FARMLAND_NEAR);
    expect(a.level).toBe(a.farmland);
    // nothing past the step at x = 24 counts, and dry or contaminated soil is no farmland
    for (let i = 0; i < N; i++) if (i % W >= 24) expect(walk[i]).toBe(Infinity);
    const dirty = new Float64Array(N).fill(1);
    expect(startLand({ W, H: W, heights: h, walk, depth: noWater, moisture: moist, soilContamination: dirty }).farmland).toBe(0);
    expect(startLand({ W, H: W, heights: h, walk, depth: noWater, moisture: noWater, soilContamination: noWater }).farmland).toBe(0);
  });

  it("a spring's stream runs down its valley to the edge it leaves by, as a sheet over a flat", () => {
    const h = westValley();
    const ways = waterWays(waterModel(W, W, h, []), emitting);
    const stream = streamOf(ways, W, W, [64 * W + 60]);
    expect(stream[64 * W + 0] || stream[63 * W + 0] || stream[65 * W + 0]).toBeTruthy();
    // never up onto the plateau; over the valley's flat floor as a sheet
    for (let i = 0; i < N; i++) if (stream[i]) expect(h[i]).toBe(3);
    expect(stream[64 * W + 69]).toBe(1);
    // down a slope: the lowest way, never back up it
    const slope = new Uint8Array(N);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) slope[y * W + x] = Math.min(15, Math.floor(x / 6));
    const down = streamOf(waterWays(waterModel(W, W, slope, []), emitting), W, W, [40 * W + 60]);
    expect(down[40 * W + 0]).toBe(1);
    for (let i = 0; i < N; i++) if (down[i]) expect(slope[i]).toBeLessThanOrEqual(slope[40 * W + 60]);
  });

  it("no badwater spring whose stream would reach the start's water or first farmland", () => {
    const h = westValley();
    const budget = badwaterBudget(W, W, "normal", 3);
    const input = { W, H: W, heights: h, water: noWater, taken: new Uint8Array(N), start, within: 15, budget, seed: 3 };
    expect(pickBadwaterSprings(input).length).toBeGreaterThanOrEqual(1);
    // the start's water in the valley's west end: every spring up the valley would run through it
    const tiles = new Uint8Array(N);
    for (let y = 60; y <= 68; y++) for (let x = 4; x < 10; x++) tiles[y * W + x] = 1;
    const ways = waterWays(waterModel(W, W, h, []), emitting);
    expect(pickBadwaterSprings({ ...input, avoid: { tiles, ways } })).toEqual([]);
    // the valley draining east instead: its springs run away from it
    const east = new Uint8Array(N).fill(6);
    for (let y = 60; y <= 68; y++) for (let x = 26; x < W; x++) east[y * W + x] = 3;
    const eastWays = waterWays(waterModel(W, W, east, []), emitting);
    const springs = pickBadwaterSprings({ ...input, heights: east, avoid: { tiles, ways: eastWays } });
    expect(springs.length).toBeGreaterThanOrEqual(1);
  });

  it("a place's objects: two mine sites the colony reaches, and badwater clear of the start's water and farmland", () => {
    const h = westValley();
    const startEntity = startingLocation({ id: "s", owner: "t", x: start.x - 1, y: start.y - 1, z: 6, orientation: "Cw0" });
    const settle = canonicalSettle(waterModel(W, W, h, mapObjects({ entities: [] })));
    const moisture = new Float64Array(N);
    for (let i = 0; i < N; i++) if (Math.hypot((i % W) - start.x, Math.floor(i / W) - start.y) < 14) moisture[i] = 1;
    const input = {
      W,
      H: W,
      heights: h,
      water: settle.depth,
      moisture,
      soilContamination: new Float64Array(N),
      entities: [startEntity],
      start,
      settings: defaultSettings("riverValley", "normal", { x: W, y: W }).resources,
      seed: 4,
      nearStart: { wood: 108, bushes: 48 },
      ruinsClear: 22,
      badwater: { setting: "normal" as const, within: 15, clearOfStart: 20 },
      reachableMines: 2,
    };
    const r = planMapResources(input);
    expect(r.mines.filter((m) => m.reachable).length).toBeGreaterThanOrEqual(2);
    // the farmland near the start stays clean in the settle the file carries
    if (r.water) for (let i = 0; i < N; i++) if (moisture[i] > 0) expect(r.water.soilContamination[i]).toBe(0);
    // deterministic
    expect(planMapResources(input).entities.map((e) => e.id)).toEqual(r.entities.map((e) => e.id));
  });

  it("item 27: a row of sources on the edge gets a lip beside it, never on the row; a spring gets none", () => {
    const S = 40;
    const h = new Uint8Array(S * S).fill(8);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if ((x >= 19 && x <= 21) || (y < 6 && Math.abs(x - 20) <= 10)) h[y * S + x] = 3;
    const sources: [number, number, number][] = [
      [19, 0, 0.5],
      [20, 0, 0.5],
      [21, 0, 0.5],
    ];
    const objects = sourceEntities(sources, h, S).map(mapObject);
    const water = canonicalSettle(waterModel(S, S, h, objects));
    const lipped = h.slice();
    const raised = edgeLips(lipped, S, sources, water);
    expect(raised).toBeGreaterThan(0);
    for (const [x, y] of sources) expect(lipped[y * S + x]).toBe(3);
    // the edge beside the row stands above the head's water now
    expect(lipped[0 * S + 18]).toBeGreaterThan(3);
    expect(lipped[0 * S + 22]).toBeGreaterThan(3);
    // the water floor's spring (D300) is not a river's head
    const spring = h.slice();
    expect(edgeLips(spring, S, sources, water, sources.map(([x, y]) => [x, y] as [number, number]))).toBe(0);
    expect(spring).toEqual(h);
  });
});
