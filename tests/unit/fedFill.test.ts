// Remove unfed water and Fill in the water engine (D387 (2) and (3), D394): which water a source
// feeds (sim/fed.ts), the drained tiles of the canonical settle (prefill.ts `canonicalRun`), the
// stored water's order (water.ts `composeKept`), and a Fill's hollow and how long it lasts
// (sim/fill.ts), on a small hand-made map the game's rules run on exactly.

import { describe, expect, it } from "vitest";
import { drainUnfed, fedTiles, unfedBodies } from "../../src/core/sim/fed";
import { fillDays, fillLake } from "../../src/core/sim/fill";
import { moisture } from "../../src/core/sim/moisture";
import { canonicalSettle } from "../../src/core/sim/prefill";
import { composeKept, TICKS_PER_DAY, waterSteady, WaterSim, type Emitter, type RetainedWater, type WaterModel } from "../../src/core/sim/water";

const W = 32;
const H = 32;
const at = (x: number, y: number) => y * W + x;

/** A plateau at level 6 with: a river trench (y 14–16, floor 2) from a row of three sources (D314's
 *  grouped sources) running off the east edge; a badwater trench (y 3–7, floor 3) from a 3×3
 *  badwater source running off the east edge; a pit beside the river behind a rim (x 8–12, y 9–12,
 *  floor 3) and a pit far from any water (x 6–12, y 21–27, floor 3), both holding no source. */
function world(): { m: WaterModel; pitNear: number[]; pitFar: number[]; river: number[]; badwater: number[] } {
  const floor = new Float64Array(W * H).fill(6);
  const river: number[] = [];
  const badwater: number[] = [];
  const pitNear: number[] = [];
  const pitFar: number[] = [];
  for (let y = 14; y <= 16; y++) for (let x = 4; x < W; x++) river.push(at(x, y));
  for (let y = 3; y <= 7; y++) for (let x = 18; x < W; x++) badwater.push(at(x, y));
  for (let y = 9; y <= 12; y++) for (let x = 8; x <= 12; x++) pitNear.push(at(x, y));
  for (let y = 21; y <= 27; y++) for (let x = 6; x <= 12; x++) pitFar.push(at(x, y));
  for (const i of river) floor[i] = 2;
  for (const i of badwater) floor[i] = 3;
  for (const i of [...pitNear, ...pitFar]) floor[i] = 3;
  const emitters: Emitter[] = [
    { cells: [at(5, 14)], strength: 0.5, contamination: 0 },
    { cells: [at(5, 15)], strength: 0.5, contamination: 0 },
    { cells: [at(5, 16)], strength: 0.5, contamination: 0 },
  ];
  const bad: number[] = [];
  for (let y = 4; y <= 6; y++) for (let x = 19; x <= 21; x++) bad.push(at(x, y));
  emitters.push({ cells: bad, strength: 1.5, contamination: 1 });
  return { m: { W, H, floor, dam: null, emitters }, pitNear: pitNear.sort((a, b) => a - b), pitFar: pitFar.sort((a, b) => a - b), river, badwater };
}

/** A Fill of `tiles` to `level` on `m`'s ground, as a lake. */
function lakeOf(m: WaterModel, tiles: number[], level: number): RetainedWater {
  return { tiles, floor: tiles.map((i) => m.floor[i]), depth: tiles.map((i) => level - m.floor[i]), contamination: tiles.map(() => 0) };
}

describe("fed water (sim/fed.ts)", () => {
  it("water from grouped sources and a badwater source is fed; pools no source reaches are not", () => {
    const { m, pitNear, pitFar, river, badwater } = world();
    const kept = { ...m, retained: [lakeOf(m, pitNear, 5), lakeOf(m, pitFar, 5)] };
    const w = canonicalSettle(kept);
    const fed = fedTiles(kept, w.depth);
    // the river and the badwater stream are wet and fed, every tile of them
    for (const i of [...river, ...badwater]) {
      expect(w.depth[i]).toBeGreaterThan(0);
      expect(fed[i]).toBe(1);
    }
    // the two pools keep their water and are unfed, the one beside the river too (its rim stands above the river's surface)
    for (const i of [...pitNear, ...pitFar]) {
      expect(w.depth[i]).toBeGreaterThan(1.5);
      expect(fed[i]).toBe(0);
    }
    expect(unfedBodies(kept, w.depth)).toEqual([pitNear, pitFar]);
  });

  it("a pool the river's water stands above is fed, so it is never taken", () => {
    const { m, river } = world();
    // a side pocket of the trench (floor 2), open to it: the river's surface is over its floor
    const pocket = [at(10, 17), at(11, 17), at(12, 17)];
    for (const i of pocket) m.floor[i] = 2;
    const w = canonicalSettle(m);
    const fed = fedTiles(m, w.depth);
    for (const i of pocket) {
      expect(w.depth[i]).toBeGreaterThan(0);
      expect(fed[i]).toBe(1);
    }
    expect(unfedBodies(m, w.depth)).toEqual([]);
    expect(river.every((i) => fed[i])).toBe(true);
  });

  it("a selection takes the bodies it touches, whole, and leaves the others", () => {
    const { m, pitNear, pitFar } = world();
    const kept = { ...m, retained: [lakeOf(m, pitNear, 5), lakeOf(m, pitFar, 5)] };
    const w = canonicalSettle(kept);
    const inside = new Uint8Array(W * H);
    // one corner tile of the far pit, and a strip of fed river
    inside[at(12, 27)] = 1;
    for (let x = 10; x < 20; x++) inside[at(x, 15)] = 1;
    expect(unfedBodies(kept, w.depth, inside)).toEqual([pitFar]);
    // a selection that holds no unfed water takes nothing
    const dry = new Uint8Array(W * H);
    for (let y = 0; y < 3; y++) for (let x = 0; x < W; x++) dry[at(x, y)] = 1;
    expect(unfedBodies(kept, w.depth, dry)).toEqual([]);
  });

  it("a natural dam the fed water doesn't overtop holds it back", () => {
    const m: WaterModel = { W: 8, H: 3, floor: new Float64Array(24).fill(1), dam: new Float64Array(24).fill(-1), emitters: [{ cells: [8], strength: 1, contamination: 0 }] };
    m.dam![10] = 0.65;
    const depth = new Float64Array(24);
    for (let x = 0; x < 8; x++) depth[8 + x] = x < 2 ? 0.3 : 0.5;
    // the source's water (surface 1.3) is under the dam's top (1.65): beyond it is unfed
    let fed = fedTiles(m, depth);
    expect(Array.from(fed.subarray(8, 16))).toEqual([1, 1, 0, 0, 0, 0, 0, 0]);
    depth[8] = depth[9] = 0.8;
    fed = fedTiles(m, depth);
    expect(Array.from(fed.subarray(8, 16))).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
  });
});

describe("drained tiles in the canonical settle (D387 (2))", () => {
  it("the unfed water goes, fed water stays as it was, and the game's rules never bring it back", () => {
    const { m, pitNear, pitFar, river, badwater } = world();
    const lakes = [{ lake: lakeOf(m, pitNear, 5) }, { lake: lakeOf(m, pitFar, 5) }];
    const before = canonicalSettle({ ...m, ...composeKept(lakes) });
    const model = { ...m, ...composeKept([...lakes, { drain: pitNear }]) };
    expect(model.drained).toEqual(pitNear);
    // the near pit's lake is taken out of the stored water; the far one is kept
    expect(model.retained).toHaveLength(1);
    const after = canonicalSettle(model);
    for (const i of pitNear) expect(after.depth[i]).toBe(0);
    for (const i of pitFar) expect(after.depth[i]).toBeGreaterThan(1.5);
    // fed water: within the settle's own tolerance of what it was
    for (const i of [...river, ...badwater]) expect(Math.abs(after.depth[i] - before.depth[i])).toBeLessThan(0.005);
    // the game, from that water: three days on, the near pit is still dry
    const sim = new WaterSim(model, { depth: after.depth.slice(), contamination: after.contamination.slice() });
    sim.setOut(after.out!);
    sim.run(3 * TICKS_PER_DAY);
    for (const i of pitNear) expect(sim.D[i]).toBe(0);
  });

  it("water standing on drained tiles is taken once the water settles, and the water settles on", () => {
    const { m, pitNear } = world();
    // a model whose drained tiles still start wet (a lake stored there; a hollow the pre-fill fills
    // is the same): the settle runs, then takes that water and runs on
    const model: WaterModel = { ...m, retained: [lakeOf(m, pitNear, 5)], drained: pitNear };
    const w = canonicalSettle(model);
    for (const i of pitNear) expect(w.depth[i]).toBe(0);
    const plain = canonicalSettle({ ...m, retained: [lakeOf(m, pitNear, 5)] });
    for (const i of pitNear) expect(plain.depth[i]).toBeGreaterThan(1.5);
    expect(w.ticks).toBeGreaterThan(plain.ticks);
  });

  it("a drained tile a source feeds keeps its water (only unfed water is ever taken)", () => {
    const { m, river } = world();
    const model: WaterModel = { ...m, drained: river.slice(0, 12).sort((a, b) => a - b) };
    const plain = canonicalSettle(m);
    const w = canonicalSettle(model);
    expect(Array.from(w.depth)).toEqual(Array.from(plain.depth));
    expect(w.ticks).toBe(plain.ticks);
  });

  it("drainUnfed takes only the drained tiles' unfed water", () => {
    const { m, pitNear, pitFar, river } = world();
    const kept = { ...m, retained: [lakeOf(m, pitNear, 5), lakeOf(m, pitFar, 5)] };
    const w = canonicalSettle(kept);
    const depth = w.depth.slice();
    const cont = w.contamination.slice();
    expect(drainUnfed({ ...kept, drained: [...pitNear, ...river.slice(0, 5)].sort((a, b) => a - b) }, depth, cont)).toBe(true);
    for (const i of pitNear) expect(depth[i]).toBe(0);
    for (const i of [...pitFar, ...river]) expect(depth[i]).toBe(w.depth[i]);
  });

  it("composeKept keeps the operations' order: a removal takes the lakes before it, a later Fill comes back", () => {
    const { m, pitNear, pitFar } = world();
    const a = lakeOf(m, pitNear, 5);
    const b = lakeOf(m, pitFar, 4);
    expect(composeKept([{ lake: a }, { lake: b }])).toEqual({ retained: [a, b] });
    expect(composeKept([])).toEqual({});
    const removed = composeKept([{ lake: a }, { drain: pitNear }, { lake: b }]);
    expect(removed).toEqual({ retained: [b], drained: pitNear });
    const refilled = composeKept([{ lake: a }, { drain: pitNear }, { lake: a }]);
    expect(refilled).toEqual({ retained: [a] });
    // a removal over part of a lake keeps the rest of it
    const half = pitFar.slice(0, 10);
    const part = composeKept([{ lake: b }, { drain: half }]);
    expect(part.retained![0].tiles).toEqual(pitFar.slice(10));
    expect(part.retained![0].depth).toEqual(b.depth.slice(10));
    expect(part.drained).toEqual(half);
  });
});

describe("Fill (D387 (3), D394)", () => {
  it("fills the hollow round a tile to the level, clean, and says why when it can't", () => {
    const { m, pitFar } = world();
    const r = fillLake(m, 8, 23, 5);
    expect("lake" in r).toBe(true);
    const lake = (r as { lake: RetainedWater }).lake;
    expect(lake.tiles).toEqual(pitFar);
    expect(lake.depth.every((d) => d === 2)).toBe(true);
    expect(lake.contamination.every((c) => c === 0)).toBe(true);
    // the rim is at 6: a fill to 6 is still the pit; past 6 it would run over the plateau and off the map
    expect((fillLake(m, 8, 23, 6) as { lake: RetainedWater }).lake.tiles).toEqual(pitFar);
    expect(fillLake(m, 8, 23, 6.5)).toEqual({ reason: "at level 6.5 the water would spill off the map at (0, 23): the hollow doesn't hold it" });
    expect(fillLake(m, 8, 23, 3)).toEqual({ reason: "level 3 is at or below the ground at (8, 23), which stands at 3" });
    expect(fillLake(m, 8, 23, 2)).toEqual({ reason: "level 2 is at or below the ground at (8, 23), which stands at 3" });
    expect(fillLake(m, 40, 2, 5)).toEqual({ reason: "(40, 2) is off the map" });
    // a trench open to the map edge never holds water
    expect(fillLake(m, 10, 15, 4)).toEqual({ reason: "at level 4 the water would spill off the map at (31, 15): the hollow doesn't hold it" });
    // water already standing at the level
    const depth = new Float64Array(W * H);
    for (const i of pitFar) depth[i] = 2;
    expect(fillLake(m, 8, 23, 5, depth)).toEqual({ reason: "water already stands at level 5 there" });
  });

  it("evaporates at the game's rates, lasting about as long as fillDays says, and the ground dries after", () => {
    const { m, pitFar } = world();
    const lake = lakeOf(m, pitFar, 4);
    const model: WaterModel = { W, H, floor: m.floor, dam: null, emitters: [], retained: [lake] };
    const w = canonicalSettle(model);
    // a sealed lake only evaporating: steady by D222, though the settle's own test never passes
    expect(waterSteady(w)).toBe(true);
    const sim = new WaterSim(model, { depth: w.depth.slice(), contamination: w.contamination.slice() });
    const vol = () => pitFar.reduce((s, i) => s + sim.D[i], 0);
    // one day: what the game's evaporation takes from water this deep (1e-4 a second times each
    // tile's saturation modifier), not a hand-coded rate
    const sat = sim.saturation();
    let perDay = 0;
    for (const i of pitFar) {
      const t = 10 - sat[i];
      perDay += 1e-4 * (0.0595 * t * t + 0.101 * t + 0.72) * TICKS_PER_DAY * 0.6;
    }
    const v0 = vol();
    sim.run(TICKS_PER_DAY);
    expect(Math.abs(v0 - vol() - perDay) / perDay).toBeLessThan(0.02);
    const moistBefore = moisture(new Uint8Array(m.floor), sim.D, sim.C, W, H, null);
    expect(pitFar.every((i) => moistBefore[i] > 0)).toBe(true);
    // on until it is gone; from the start of the game (the canonical settle ran `w.ticks` already)
    let days = 1;
    while (vol() > 0 && days < 60) {
      sim.run(TICKS_PER_DAY);
      days++;
    }
    expect(vol()).toBe(0);
    const lasted = days + w.ticks / TICKS_PER_DAY;
    const said = fillDays(W, H, lake);
    expect(Math.abs(lasted - said)).toBeLessThan(Math.max(1.5, said * 0.08));
    // the ground under it dries once it is gone
    const moist = moisture(new Uint8Array(m.floor), sim.D, sim.C, W, H, null);
    expect(pitFar.every((i) => moist[i] === 0)).toBe(true);
  });

  it("fillDays: wide deep water lasts depth / 0.0535 days, near enough; a pool that splits lasts as long as its deepest part", () => {
    const big = 40;
    const tiles: number[] = [];
    for (let y = 1; y < big - 1; y++) for (let x = 1; x < big - 1; x++) tiles.push(y * big + x);
    const lake: RetainedWater = { tiles, floor: tiles.map(() => 0), depth: tiles.map(() => 1), contamination: tiles.map(() => 0) };
    const d = fillDays(big, big, lake);
    // corners and edges evaporate faster than the middle: a little under 1 / 0.0535 = 18.7
    expect(d).toBeGreaterThan(16);
    expect(d).toBeLessThan(18.8);
    // deeper water lasts longer, shallow water far less (under 0.02 deep it goes ten times faster)
    expect(fillDays(big, big, { ...lake, depth: tiles.map(() => 2) })).toBeGreaterThan(1.9 * d);
    expect(fillDays(big, big, { ...lake, depth: tiles.map(() => 0.01) })).toBeLessThan(0.05);
  });

  it("a hollow that splits into two pools as it sinks lasts as the game's rules say", () => {
    // pit A (floor 3) and pit B (floor 4) joined by a passage at floor 5, filled to 5.5
    const floor = new Float64Array(W * H).fill(7);
    const tiles: number[] = [];
    for (let y = 10; y < 14; y++) for (let x = 4; x < 8; x++) floor[at(x, y)] = 3;
    for (let y = 10; y < 14; y++) for (let x = 12; x < 16; x++) floor[at(x, y)] = 4;
    for (let x = 8; x < 12; x++) floor[at(x, 11)] = 5;
    const m: WaterModel = { W, H, floor, dam: null, emitters: [] };
    const r = fillLake(m, 5, 11, 5.5);
    expect("lake" in r).toBe(true);
    const lake = (r as { lake: RetainedWater }).lake;
    tiles.push(...lake.tiles);
    expect(tiles).toHaveLength(36);
    const said = fillDays(W, H, lake);
    // the game's rules on that water (the canonical settle's start: the hollow full to its level)
    const depth = new Float64Array(W * H);
    for (let k = 0; k < tiles.length; k++) depth[tiles[k]] = lake.depth[k];
    const fresh = new WaterSim({ ...m, retained: [lake] }, { depth, contamination: new Float64Array(W * H) });
    let days = 0;
    const vol = () => tiles.reduce((s, i) => s + fresh.D[i], 0);
    while (vol() > 0 && days < 120) {
      fresh.run(TICKS_PER_DAY);
      days++;
    }
    expect(vol()).toBe(0);
    expect(Math.abs(days - said)).toBeLessThan(Math.max(1.5, said * 0.08));
  });

  it("the same input settles to the same bytes", () => {
    const { m, pitNear, pitFar } = world();
    const model = (): WaterModel => ({ ...m, ...composeKept([{ lake: lakeOf(m, pitNear, 5) }, { lake: lakeOf(m, pitFar, 4.5) }, { drain: pitNear }]) });
    const a = canonicalSettle(model());
    const b = canonicalSettle(model());
    expect(Array.from(a.depth)).toEqual(Array.from(b.depth));
    expect(Array.from(a.contamination)).toEqual(Array.from(b.contamination));
    expect(a.ticks).toBe(b.ticks);
  });
});
