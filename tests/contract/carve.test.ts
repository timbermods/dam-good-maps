// Carve, the first force of nature (PLAN §20 D194, D199, D203): the force itself, ported from the
// prototype (PR #47) with its checks, and the carve as the document keeps it. Blocking, breakage
// (Kyler's brief): a carve is one operation, one undo step, stored literally, so it replays to the
// same bytes; an incremental rebuild equals a full one; undo brings back exactly what was there;
// Try another path replaces a carve, and undoing it brings the earlier one back.

import Ajv2020 from "ajv/dist/2020";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import opsSchema from "../../src/core/doc/ops.schema.json" with { type: "json" };
import type { EditOp } from "../../src/core/doc/ops";
import { MapSession } from "../../src/core/doc/session";
import { naturalWidth } from "../../src/core/forces/carve/character";
import { carveForceParams, forceMapOf } from "../../src/core/forces/carve/result";
import { CarveRun, DEFAULTS, hardness, mapSeed, modelFor, sourceStrength, type CarveIntent, type CarveSettings } from "../../src/core/forces/carve/run";
import type { ForceResultParams } from "../../src/core/forces/op";
import { protectedGround, STEPS_PER_SECOND, type ForceMap } from "../../src/core/forces/force";
import { generate } from "../../src/core/gen/generate";
import { readTimber } from "../../src/core/format/timber";
import { storedWater } from "../../src/core/format/world";
import { oxbowBasin, oxbowLake } from "../../src/core/forces/carve/water";
import { decodeHeights, decodePlaceFile, placeEntities } from "../../src/core/places/place";
import { canonicalRun, canonicalSettle } from "../../src/core/sim/prefill";
import { SETTLE_DAYS, TICKS_PER_DAY, WaterSim } from "../../src/core/sim/water";
import { checkSchema } from "../../src/core/spec/schema";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";
import { study } from "./carveFixtures";

function complete(m: ForceMap, s: Partial<CarveSettings> = {}, intent: CarveIntent = { origin: 54 * m.W + 32 }): CarveRun {
  const r = new CarveRun(m, { ...DEFAULTS, ...s }, intent);
  for (let k = 0; k < 1200 && !r.done; k++) r.step();
  expect(r.done).toBe(true);
  return r;
}

/** Tiles lower or higher than all four neighbours. */
function extrema(h: Uint8Array, W: number, H: number): Set<number> {
  const out = new Set<number>();
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const n = [h[i - 1], h[i + 1], h[i - W], h[i + W]];
      if (h[i] < Math.min(...n) || h[i] > Math.max(...n)) out.add(i);
    }
  return out;
}

const mountain = study("mountain", 64);
const intent = { origin: 54 * 64 + 32 };

describe("the force: every step keeps the rules", () => {
  it("whole levels, one direction a tile, no new one-tile pit or spike, the start's ground untouched, and every block cut accounted for", () => {
    const initial = extrema(mountain.heights, 64, 64);
    const keep = protectedGround(mountain);
    const run = new CarveRun(mountain, { ...DEFAULTS, power: 95, walls: "wide" }, intent);
    const sign = new Int8Array(4096);
    for (let k = 0; k < 350 && !run.done; k++) {
      const old = run.map.heights.slice();
      run.step();
      for (let i = 0; i < old.length; i++) {
        const d = Math.sign(run.map.heights[i] - old[i]);
        if (d) {
          expect(!sign[i] || sign[i] === d).toBe(true);
          sign[i] = d;
        }
        expect(run.map.heights[i]).toBeLessThanOrEqual(16);
        if (keep[i]) expect(run.map.heights[i]).toBe(mountain.heights[i]);
      }
      for (const i of extrema(run.map.heights, 64, 64)) expect(initial.has(i), `new isolated pit or spike at ${i}`).toBe(true);
      expect(run.metrics.cut).toBe(run.metrics.deposited + run.metrics.exported + run.metrics.suspended);
    }
    expect(run.done).toBe(true);
    expect(run.reason).toBe("lake");
    expect(run.metrics.cut).toBeGreaterThan(3000);
    expect(run.metrics.deposited).toBeGreaterThan(10);
  });

  it("its first second cuts near the head, not a sheet far away", () => {
    const r = new CarveRun(mountain, DEFAULTS, intent);
    for (let k = 0; k < STEPS_PER_SECOND; k++) r.step();
    expect(r.metrics.cut).toBeGreaterThan(100);
    for (let i = 0; i < 4096; i++) if (r.map.heights[i] !== mountain.heights[i]) expect(Math.hypot((i % 64) - 32, Math.floor(i / 64) - 54)).toBeLessThan(20);
    expect(r.metrics.distance).toBeGreaterThan(5);
    expect(r.metrics.distance).toBeLessThan(9);
  });

  it("the same input and number of steps give the same land, however the steps are batched", () => {
    const a = new CarveRun(mountain, DEFAULTS, intent);
    const b = new CarveRun(mountain, DEFAULTS, intent);
    for (let k = 0; k < 45; k++) a.step();
    for (const batch of [3, 12, 1, 19, 10]) for (let k = 0; k < batch; k++) b.step();
    expect(Array.from(a.map.heights)).toEqual(Array.from(b.map.heights));
    expect(a.head).toEqual(b.head);
    expect(a.metrics).toEqual(b.metrics);
  });

  it("invalid settings are refused, and settings without Wander, Width or seed take their defaults", () => {
    const legacy: Partial<CarveSettings> = { ...DEFAULTS };
    delete legacy.width;
    delete legacy.wander;
    delete legacy.seed;
    new CarveRun(mountain, Object.freeze(legacy) as CarveSettings, intent);
    expect(legacy.seed).toBeUndefined();
    for (const s of [{ width: 0 }, { width: 25 }, { wander: -1 }, { wander: 101 }, { seed: -1 }, { seed: 1.5 }, { seed: 4294967296 }]) expect(() => new CarveRun(mountain, { ...DEFAULTS, ...s }, intent)).toThrow(/Invalid character/);
    // the start's own ground is a carve's like any other (D257: the editor carries the start)
    const start = mountain.entities.find((e) => e.template === "StartingLocation")!;
    expect(() => new CarveRun(mountain, DEFAULTS, { origin: start.y * 64 + start.x + 1 })).not.toThrow();
    // what it leaves alone is only what it is told to (the land above the layer showing, caves)
    const keep = new Uint8Array(64 * 64);
    keep[20 * 64 + 20] = 1;
    expect(() => new CarveRun(mountain, DEFAULTS, { origin: 20 * 64 + 20 }, { keep })).toThrow(/land showing/);
  });
});

describe("the force: Power, Width, walls and rock", () => {
  const low = complete(mountain, { power: 15 });
  const high = complete(mountain, { power: 95 });

  it("Power sets incision and width: a catastrophe removes much more land than a creek", () => {
    expect(high.metrics.cut).toBeGreaterThan(low.metrics.cut * 5);
    expect(high.head.width).toBeGreaterThan(low.head.width * 2);
    expect(high.map.heights[intent.origin]).toBeLessThan(low.map.heights[intent.origin]);
  });

  it("wide walls make broad terraces; steep walls keep a narrower gorge", () => {
    const steep = complete(mountain, { power: 65, walls: "steep" });
    const wide = complete(mountain, { power: 65, walls: "wide" });
    expect(wide.metrics.bankCuts).toBeGreaterThan(steep.metrics.bankCuts * 1.4);
    expect(wide.metrics.cut).toBeGreaterThan(steep.metrics.cut);
  });

  it("hard layers delay a breakthrough, and the layers come from the land itself", () => {
    const layered = new CarveRun(mountain, { ...DEFAULTS, power: 35 }, intent);
    const soft = new CarveRun(mountain, { ...DEFAULTS, power: 35, layers: false }, intent);
    for (let k = 0; k < 8; k++) {
      layered.step();
      soft.step();
    }
    expect(soft.metrics.cut).toBeGreaterThan(layered.metrics.cut);
    expect(mapSeed(mountain)).toBe(mapSeed(structuredClone(mountain)));
    expect(Array.from({ length: 16 }, (_, i) => hardness(i, true, mapSeed(mountain))).filter((v) => v === 1).length).toBe(4);
  });

  it("objects on cut ground go; the start never does", () => {
    const m = structuredClone(mountain);
    m.entities.push({ id: "test-object", owner: "study", template: "Blockage", x: 32, y: 52, z: m.heights[52 * 64 + 32], orientation: "Cw0", flipped: false, components: {} });
    const r = complete(m, { power: 95 });
    expect(r.map.entities.some((e) => e.id === "test-object")).toBe(false);
    expect(r.map.entities.some((e) => e.template === "StartingLocation")).toBe(true);
    expect(r.map.entities.length).toBeLessThan(m.entities.length);
  });

  it("Keep river leaves a source group whose strength follows the Width (linked to Power by default; a row across the flow, D314); Dry canyon leaves none", () => {
    expect(high.source).not.toBeNull();
    // a second carve keeps the first one's river: both groups stand
    const another = new CarveRun(high.map, DEFAULTS, { origin: 54 * 64 + 53 }, { sourceId: "second" });
    const ids = (r: CarveRun) => r.group.map((g) => g.id);
    const sources = another.map.entities.filter((e) => e.template === "WaterSource").map((e) => e.id);
    expect(sources.length).toBe(ids(high).length + ids(another).length);
    for (const id of [...ids(high), ...ids(another)]) expect(sources).toContain(id);
    expect(sourceStrength(100)).toBe(8);
    expect(sourceStrength(0)).toBe(0.5);
    expect(sourceStrength(95, 2)).toBe(0.5);
    expect(sourceStrength(15, 24)).toBe(8);
    expect(sourceStrength(85, naturalWidth(85))).toBe(sourceStrength(85));
    const slot = new CarveRun(mountain, { ...DEFAULTS, power: 95, width: 2 }, intent);
    const broad = new CarveRun(mountain, { ...DEFAULTS, power: 15, width: 24 }, intent);
    // (the group's strengths sum to it: one source or a row sharing it, D314)
    const total = (r: CarveRun) => Math.round(r.group.reduce((a, g) => a + g.strength, 0) * 1000) / 1000;
    expect(total(slot)).toBe(0.5);
    expect(total(broad)).toBe(8);
    expect(broad.group.length).toBeGreaterThan(1);
    expect(broad.group[0].tile).toBe(intent.origin);
    const emitted = (r: CarveRun) => modelFor(r.map).emitters.filter((e) => r.group.some((g) => e.cells.includes(g.tile))).reduce((a, e) => a + e.strength, 0);
    expect(emitted(slot)).toBeCloseTo(0.5, 3);
    expect(emitted(broad)).toBeCloseTo(8, 3);
    const dry = complete(mountain, { dry: true, power: 95 });
    expect(dry.source).toBeNull();
    expect(dry.group).toEqual([]);
    expect(canonicalSettle(modelFor(dry.map)).depth.every((v) => v === 0)).toBe(true);
    // the water never changes the land it cuts
    expect(Array.from(dry.map.heights)).toEqual(Array.from(high.map.heights));
  });
});

describe("the force: Aim, Defy gravity and Wander", () => {
  const ridge = study("ridge", 64);
  const aim = { origin: 54 * 64 + 32, end: 10 * 64 + 32 };

  it("Aim breaks through a ridge on a curved course; at low Power the land wins", () => {
    const hi = complete(ridge, { power: 95, mode: "aim" }, aim);
    const lo = complete(ridge, { power: 15, mode: "aim" }, aim);
    expect(hi.reason).toBe("destination");
    expect(lo.reason).not.toBe("destination");
    expect(hi.path.some((s) => Math.abs(s.x - 32) > 2), "not a ruler line").toBe(true);
    expect(Math.min(...hi.map.heights.slice(32 * 64 + 15, 32 * 64 + 49))).toBeLessThanOrEqual(2);
    expect(ridge.heights[32 * 64 + 32]).toBeGreaterThanOrEqual(12);
  });

  it("Defy gravity cuts to an uphill end, on a floor that never rises", () => {
    const uphill = study("uphill", 64);
    expect(uphill.heights[aim.end]).toBeGreaterThan(uphill.heights[aim.origin]);
    expect(() => new CarveRun(uphill, { ...DEFAULTS, mode: "aim" }, aim)).toThrow(/uphill/);
    const defy = complete(uphill, { power: 95, mode: "aim", defyGravity: true }, aim);
    expect(defy.reason).toBe("destination");
    let last = Infinity;
    for (const s of defy.path) {
      const h = defy.map.heights[Math.round(s.y) * 64 + Math.round(s.x)];
      expect(h).toBeLessThanOrEqual(last);
      last = h;
    }
    expect(defy.map.heights[aim.end]).toBeLessThanOrEqual(defy.map.heights[aim.origin]);
  });

  const large = study("ridge", 96);
  const largeAim = { origin: 80 * 96 + 48, end: 14 * 96 + 48 };

  it("Wander makes a longer, swinging course through the land that still reaches its end", () => {
    const straight = complete(large, { mode: "aim", power: 85, width: 6, wander: 0, seed: 1 }, largeAim);
    const winding = complete(large, { mode: "aim", power: 85, width: 6, wander: 100, seed: 1 }, largeAim);
    const totalTurn = (r: CarveRun) =>
      r.path.reduce((sum, p, k) => {
        const a = r.path[k - 1];
        return sum + (a ? Math.abs(Math.atan2(p.dx * a.dy - p.dy * a.dx, p.dx * a.dx + p.dy * a.dy)) : 0);
      }, 0);
    expect(straight.reason).toBe("destination");
    expect(winding.reason).toBe("destination");
    expect(winding.metrics.distance).toBeGreaterThan(straight.metrics.distance * 1.5);
    expect(totalTurn(winding)).toBeGreaterThan(totalTurn(straight) * 3);
    expect(Math.max(...winding.path.map((s) => s.x)) - Math.min(...winding.path.map((s) => s.x))).toBeGreaterThan(20);
  });

  it("a set Width makes deep slots or wide shallow cuts; Width following Power is its natural width", () => {
    const slot = complete(large, { mode: "aim", power: 95, width: 2, wander: 15, seed: 1 }, largeAim);
    const lazy = complete(large, { mode: "aim", power: 15, width: 24, wander: 15, seed: 1 }, largeAim);
    const area = (r: CarveRun) => large.heights.reduce((n, h, i) => n + Number(h > r.map.heights[i]), 0);
    const depth = (r: CarveRun) => Math.max(...Array.from(large.heights, (h, i) => Math.max(0, h - r.map.heights[i])));
    expect(area(lazy)).toBeGreaterThan(area(slot) * 4);
    expect(depth(slot)).toBeGreaterThanOrEqual(8);
    expect(depth(lazy)).toBeLessThanOrEqual(2);
    expect(slot.metrics.cut / area(slot)).toBeGreaterThan((lazy.metrics.cut / area(lazy)) * 3);
    const linked = complete(mountain, { width: null });
    const explicit = complete(mountain, { width: naturalWidth(DEFAULTS.power) });
    expect(Array.from(linked.map.heights)).toEqual(Array.from(explicit.map.heights));
  });

  it("each seed (Try another path) is exact; another seed changes the course but never the rock", () => {
    const a = complete(large, { mode: "aim", power: 85, wander: 65, seed: 1 }, largeAim);
    const b = complete(large, { mode: "aim", power: 85, wander: 65, seed: 1 }, largeAim);
    const c = complete(large, { mode: "aim", power: 85, wander: 65, seed: 2 }, largeAim);
    expect(Array.from(a.map.heights)).toEqual(Array.from(b.map.heights));
    expect(a.path).toEqual(b.path);
    expect(Array.from(a.map.heights)).not.toEqual(Array.from(c.map.heights));
    expect(Array.from(a.character.rock)).toEqual(Array.from(c.character.rock));
    expect(a.character.knobs).toEqual(c.character.knobs);
  });

  it("smooth reaches narrow into rapids, with real whole-level falls", () => {
    const m = study("mountain", 96);
    const r = complete(m, { power: 85, wander: 0, seed: 1 }, { origin: 80 * 96 + 48 });
    const widths = r.path.map((s) => s.width);
    expect(Math.max(...widths) / Math.min(...widths)).toBeGreaterThan(1.3);
    expect(r.metrics.rapids).toBeGreaterThan(0);
    expect(r.metrics.waterfalls).toBeGreaterThan(0);
    expect(r.path.some((s, k) => k && r.path[k - 1].bed - s.bed >= 2)).toBe(true);
  });

  it("a split runs round a hard core and rejoins, on a way down, with no flicker or one-tile rubble", () => {
    const m = study("uphill", 96);
    const r = new CarveRun(m, { ...DEFAULTS, mode: "aim", defyGravity: true, power: 85, wander: 35, seed: 1 }, largeAim);
    const original = extrema(m.heights, 96, 96);
    const signs = new Int8Array(9216);
    for (let k = 0; k < 1200 && !r.done; k++) {
      const old = r.map.heights.slice();
      r.step();
      for (let i = 0; i < 9216; i++) {
        const d = Math.sign(r.map.heights[i] - old[i]);
        if (d) {
          expect(!signs[i] || signs[i] === d).toBe(true);
          signs[i] = d;
        }
      }
      for (const i of extrema(r.map.heights, 96, 96)) expect(original.has(i), "split created an isolated extremum").toBe(true);
    }
    expect(r.metrics.splits).toBeGreaterThan(0);
    expect(r.reason).toBe("destination");
    const fork = r.path.filter((s) => s.lanes.length === 2);
    expect(fork.length).toBeGreaterThan(5);
    const gap = (s: (typeof fork)[number]) => Math.hypot(s.lanes[0].x - s.lanes[1].x, s.lanes[0].y - s.lanes[1].y);
    const widest = fork.reduce((a, b) => (gap(a) > gap(b) ? a : b));
    expect(gap(widest)).toBeGreaterThan(widest.lanes[0].width * 2);
    for (const k of r.character.knobs) expect(r.map.heights[k.y * 96 + k.x]).toBe(m.heights[k.y * 96 + k.x]);
    const seen = new Set([largeAim.origin]);
    const queue = [largeAim.origin];
    for (let n = 0; n < queue.length; n++) {
      const i = queue[n];
      for (const j of [i - 96, i + 96, ...(i % 96 ? [i - 1] : []), ...(i % 96 < 95 ? [i + 1] : [])])
        if (j >= 0 && j < 9216 && !seen.has(j) && r.map.heights[j] <= r.map.heights[i]) {
          seen.add(j);
          queue.push(j);
        }
    }
    expect(seen.has(largeAim.end)).toBe(true);
    expect(r.path[r.path.length - 1].lanes.length).toBe(1);
    for (const lane of widest.lanes) {
      const i = Math.round(lane.y) * 96 + Math.round(lane.x);
      expect(seen.has(i)).toBe(true);
      expect(m.heights[i] - r.map.heights[i]).toBeGreaterThan(5);
    }
  });

  it("a real place takes a carve at its source", () => {
    const p = decodePlaceFile(gunzipSync(readFileSync("public/real-places/data/near-grand-canyon-colorado.json.gz")));
    const h = decodeHeights(p.heights);
    const m: ForceMap = { W: p.W, H: p.H, heights: h, entities: placeEntities(p, h), water: { depth: new Float64Array(h.length), contamination: new Float64Array(h.length) }, maxHeight: 16 };
    const r = new CarveRun(m, DEFAULTS, { origin: Math.floor(m.H * 0.8) * m.W + Math.floor(m.W * 0.5) });
    for (let k = 0; k < 20; k++) r.step();
    expect(r.metrics.cut).toBeGreaterThan(0);
  });
});

describe("the force: varied bends and oxbow lakes (D199, D216; #47's two touches)", () => {
  const ox = study("oxbow", 96);
  const winding: Partial<CarveSettings> = { mode: "aim", power: 85, width: 6, wander: 100, seed: 1 };
  const aimed = { origin: 80 * 96 + 48, end: 96 + 48 };
  const at = (p: { x: number; y: number }) => Math.round(p.y) * 96 + Math.round(p.x);
  const r = complete(ox, winding, aimed);
  const cut = r.oxbows[0];
  const lake = oxbowLake(r);
  const model = { ...modelFor(r.map), ...(lake ? { retained: [lake] } : {}) };
  const water = canonicalSettle(model);

  it("bends are wider and deeper on the outside, the straights narrower: never a uniform tube", () => {
    const bends = r.path.slice(8, 24).filter((p) => Math.abs(p.bend) > 0.6);
    const sample = (p: (typeof bends)[number], side: number) => r.map.heights[Math.round(p.y - p.dx * side * Math.sign(p.bend)) * 96 + Math.round(p.x + p.dy * side * Math.sign(p.bend))];
    expect(bends.length).toBeGreaterThanOrEqual(6);
    // the outer bank is deeper and cut further out than the inner one
    expect(bends.filter((p) => sample(p, 2) < sample(p, -2)).length).toBeGreaterThanOrEqual(bends.length * 0.8);
    expect(bends.filter((p) => sample(p, 4) < sample(p, -4)).length).toBeGreaterThanOrEqual(bends.length * 0.7);
    // broad bends, contracting straights
    const ratios = r.path.map((p, k) => ({ bend: Math.abs(p.bend), ratio: p.width / r.character.width(k * 1.35) }));
    const mean = (a: typeof ratios) => a.reduce((v, p) => v + p.ratio, 0) / a.length;
    expect(mean(ratios.filter((p) => p.bend > 0.8))).toBeGreaterThan(mean(ratios.filter((p) => p.bend < 0.15)) * 1.4);
  });

  it("a cut-off bend becomes an oxbow lake, sealed by sediment at both mouths, and the shortcut carries the river", () => {
    expect(r.reason).toBe("destination");
    expect(r.oxbows.length).toBe(1);
    expect((cut.end - cut.start) * 1.35).toBeGreaterThan(Math.hypot(cut.neck[0].x - cut.neck.at(-1)!.x, cut.neck[0].y - cut.neck.at(-1)!.y) * 2.2);
    expect(lake).not.toBeNull();
    expect(cut.pool.filter((p) => water.depth[at(p)] > 1).length).toBeGreaterThan(12);
    for (const b of cut.bars) {
      expect(water.depth[at(b)]).toBe(0);
      expect(r.sediment[at(b)]).toBeGreaterThan(0);
      expect(r.map.heights[at(b)]).toBeGreaterThanOrEqual(b.level);
    }
    const basin = oxbowBasin(r);
    expect(basin.length).toBeGreaterThan(70);
    expect(cut.pool.every((p) => basin.includes(at(p)))).toBe(true);
    expect(lake!.tiles).toEqual(basin.slice().sort((a, b) => a - b));
    expect(cut.neck.every((p) => water.depth[at(p)] > 0.05)).toBe(true);
    // the game's settle from the land and the sources alone would leave the crescent dry
    const fresh = canonicalSettle(modelFor(r.map));
    expect(cut.pool.filter((p) => fresh.depth[at(p)] > 1).length).toBeLessThan(cut.pool.filter((p) => water.depth[at(p)] > 1).length / 4);
    // the two-stage settle is exact however it is sliced
    const run = canonicalRun(model);
    let sliced = run.advance(7);
    while (!sliced) sliced = run.advance(7);
    expect(Array.from(sliced.depth)).toEqual(Array.from(water.depth));
    // a dry canyon keeps no water
    const dry = complete(ox, { ...winding, dry: true }, aimed);
    expect(dry.oxbows.length).toBe(1);
    expect(oxbowLake(dry)).toBeNull();
    expect(canonicalSettle(modelFor(dry.map)).depth.every((v) => v === 0)).toBe(true);
  });

  it("an unfed oxbow lake evaporates under the game's rules: correct physics, and nothing refills it", () => {
    // no source feeds it: the carve's only sources are its row at its origin (D314)
    expect(r.map.entities.filter((e) => e.template === "WaterSource").map((e) => e.y * 96 + e.x).sort()).toEqual(r.group.map((g) => g.tile).sort());
    expect(r.group[0].tile).toBe(aimed.origin);
    const sim = new WaterSim(model, water);
    const volume = () => lake!.tiles.reduce((v, i) => v + sim.D[i], 0);
    sim.run(256);
    // it survives the next ticks of the game's rules as a lake
    expect(cut.pool.every((p) => sim.D[at(p)] > 2)).toBe(true);
    let last = volume();
    for (let k = 0; k < 6; k++) {
      sim.run(256);
      const v = volume();
      expect(v).toBeLessThan(last);
      last = v;
    }
    for (const b of cut.bars) expect(sim.D[at(b)]).toBe(0);
  });
});

// ------------------------------------------------------------------------ the carve in the document

/** A carve run to its end (or `steps` steps) on the session's map, as the operation the editor makes. */
function carveOp(s: MapSession, settings: Partial<CarveSettings>, origin: [number, number], steps = 1200, extra: Partial<ForceResultParams> = {}, end?: [number, number]): EditOp & { op: "forceResult" } {
  const m = forceMapOf(s.built);
  const W = m.W;
  const set = { ...DEFAULTS, ...settings };
  const sourceId = "0c0ffee0-0000-4000-8000-" + String(origin[0] * 1000 + origin[1] + (settings.seed ?? 0)).padStart(12, "0");
  const r = new CarveRun(m, set, { origin: origin[1] * W + origin[0], ...(end ? { end: end[1] * W + end[0] } : {}) }, { sourceId });
  for (let k = 0; k < steps && !r.done; k++) r.step();
  const params = carveForceParams(m, r, { settings: set, origin, ...(end ? { end } : {}), cut: null })!;
  return { op: "forceResult", params: { ...params, ...extra } };
}

/** A tile well away from the start, on land. */
function farFromStart(s: MapSession): [number, number] {
  const b = s.built;
  const st = b.start!;
  let best: [number, number] = [0, 0];
  let far = -1;
  for (let y = 12; y < b.H - 12; y += 4)
    for (let x = 12; x < b.W - 12; x += 4) {
      const i = y * b.W + x;
      if (b.water[i] > 0) continue;
      const d = Math.hypot(x - st.x, y - st.y) + b.heights[i] * 2;
      if (d > far) {
        far = d;
        best = [x, y];
      }
    }
  return best;
}

const ids = (s: MapSession) => s.built.entities.map((e) => e.id).sort();

describe("a carve in the document (breakage rule)", () => {
  it("one operation, one undo step: it builds its levels exactly, keeps its source, clears its objects, and replays to the same file", () => {
    const r = generate(makeSpec({ seed: 3, theme: "highlands", size: { x: 96, y: 96 } }));
    const s = MapSession.fromGenerated(r, r.file);
    s.setWaterMode("defer");
    const before = s.built.heights.slice();
    const beforeIds = ids(s);
    const op = carveOp(s, { power: 80 }, farFromStart(s));
    expect(op.params.tiles.length).toBeGreaterThan(50);
    const u = s.apply(op, "user");
    expect(u.errors).toEqual([]);
    expect(s.history().at(-1)?.label ?? "").toMatch(/Carve a river/);
    // its levels, exactly
    op.params.tiles.forEach((i, k) => expect(s.built.heights[i]).toBe(op.params.heights[k]));
    // its source, and none of the objects it removed
    const source = s.built.entities.find((e) => e.id === op.params.source!.id)!;
    expect(source.template).toBe("WaterSource");
    const gone = new Set(op.params.removed);
    expect(s.built.entities.some((e) => gone.has(e.id))).toBe(false);
    expect(s.built.orphans ?? []).toEqual([]);
    // an incremental build is a full one; the project file replays it
    expect(Array.from(s.fullBuild().heights)).toEqual(Array.from(s.built.heights));
    const again = MapSession.open(decodeProject(s.project()));
    expect(Array.from(again.built.heights)).toEqual(Array.from(s.built.heights));
    // the objects once the water has settled (the resources follow the settled water, not the water
    // carried over while it settles)
    s.settleCanonical();
    expect(ids(again)).toEqual(ids(s));
    expect(Buffer.from(s.exportTimber().bytes).equals(Buffer.from(again.exportTimber().bytes))).toBe(true);
    // undo: exactly what was there
    expect(s.undo()).toBe(true);
    expect(Array.from(s.built.heights)).toEqual(Array.from(before));
    expect(ids(s)).toEqual(beforeIds);
    expect(s.redo()).toBe(true);
    op.params.tiles.forEach((i, k) => expect(s.built.heights[i]).toBe(op.params.heights[k]));
  });

  it("Try another path replaces the carve; undoing it brings the earlier carve back", () => {
    const r = generate(makeSpec({ seed: 5, theme: "highlands", size: { x: 96, y: 96 } }));
    const s = MapSession.fromGenerated(r, r.file);
    s.setWaterMode("defer");
    const at = farFromStart(s);
    const original = s.built.heights.slice();
    const first = carveOp(s, { power: 70, wander: 60, seed: 0 }, at);
    expect(s.apply(first, "user").errors).toEqual([]);
    const seq = s.history().at(-1)!.seq;
    const withFirst = s.built.heights.slice();
    const firstIds = ids(s);
    // the next seed, on the land as it was before the first carve
    const probe = MapSession.fromGenerated(r, r.file);
    probe.setWaterMode("defer");
    const second = carveOp(probe, { power: 70, wander: 60, seed: 1 }, at, 1200, { replaces: seq });
    expect(Array.from(second.params.heights)).not.toEqual(Array.from(first.params.heights));
    expect(s.apply(second, "user").errors).toEqual([]);
    expect(s.history().at(-1)?.label).toBe("Try another path");
    // the same land as the second carve alone on the uncarved map
    const { replaces: _, ...alone } = second.params;
    expect(probe.apply({ op: "forceResult", params: alone }, "user").errors).toEqual([]);
    expect(Array.from(s.built.heights)).toEqual(Array.from(probe.built.heights));
    expect(ids(s)).toEqual(ids(probe));
    // the first carve's own tiles that the second leaves alone are back as they were
    const own = new Set(second.params.tiles);
    for (const i of first.params.tiles) if (!own.has(i)) expect(s.built.heights[i]).toBe(original[i]);
    expect(Array.from(s.fullBuild().heights)).toEqual(Array.from(s.built.heights));
    const again = MapSession.open(decodeProject(s.project()));
    expect(Array.from(again.built.heights)).toEqual(Array.from(s.built.heights));
    // undo: the first carve, exactly
    expect(s.undo()).toBe(true);
    expect(Array.from(s.built.heights)).toEqual(Array.from(withFirst));
    expect(ids(s)).toEqual(firstIds);
    expect(s.undo()).toBe(true);
    expect(Array.from(s.built.heights)).toEqual(Array.from(original));
  });

  it("a carve stopped early keeps what it cut, and a dry canyon keeps no source", () => {
    const r = generate(makeSpec({ seed: 7, theme: "riverValley", size: { x: 96, y: 96 } }));
    const s = MapSession.fromGenerated(r, r.file);
    s.setWaterMode("defer");
    const op = carveOp(s, { power: 60, dry: true }, farFromStart(s), 25);
    expect(op.params.reason).toBe("stopped");
    expect(op.params.source).toBeUndefined();
    const sources = s.built.entities.filter((e) => e.template === "WaterSource").length;
    expect(s.apply(op, "user").errors).toEqual([]);
    expect(s.history().at(-1)?.label).toBe("Carve a dry canyon");
    expect(s.built.entities.filter((e) => e.template === "WaterSource").length).toBeLessThanOrEqual(sources);
    op.params.tiles.forEach((i, k) => expect(s.built.heights[i]).toBe(op.params.heights[k]));
  });

  it("an oxbow lake's water is kept with its carve: the map settles with it, the project and the file keep it, and undo takes it away", () => {
    // (a carve that cuts a bend off and seals its lake on 0.8.0's maps: Highlands 96² seed 2, from
    // (48, 86) toward (48, 10); Canyon 96² seed 5 until M9b turned and replanned the land, seed 11
    // until its water took the game's rules, seed 22 until batch 5 raised the land on its floor, seed
    // 44 until D333's maps, where no Canyon seed to 400 seals one; Highlands 96² seed 8 with the carve's seed 4 since
    // M9b's small starts and speed rounds, where seed 2 and Canyon seeds 1–6 seal none, D148)
    const r = generate(makeSpec({ seed: 8, theme: "highlands", size: { x: 96, y: 96 } }));
    const s = MapSession.fromGenerated(r, r.file);
    const before = Array.from(s.built.water);
    const op = carveOp(s, { mode: "aim", power: 85, width: 6, wander: 100, seed: 4, defyGravity: true }, [48, 86], 1200, {}, [48, 10]);
    const lake = op.params.lake!;
    expect(lake.tiles.length).toBeGreaterThan(70);
    expect(checkSchema(opsSchema as Record<string, unknown>, op)).toEqual([]);
    expect(s.apply(op, "user").errors).toEqual([]);
    s.settleCanonical();
    const deep = lake.tiles.filter((i) => s.built.water[i] > 1).length;
    expect(deep).toBeGreaterThan(lake.tiles.length / 2);
    // only the lake still changes, by evaporating: the water has settled (D222), the settle stops
    // there, before its cap (D413), and the quiet dot says so (on M9b's Highlands 8 the rest of the
    // water steadies after four days, 3,072 ticks; the cap is SETTLE_DAYS, D358)
    expect(s.built.settle.settled).toBe(false);
    expect(s.built.settle.steadyTicks).toBe(s.built.settle.ticks);
    expect(s.built.settle.ticks).toBeLessThan(SETTLE_DAYS * TICKS_PER_DAY);
    // the lake is stored with the water its carve kept (D413): it stopped draining before saving,
    // and the game evaporates it from there. This carve kept it mid-flow (its surface 2 to 12 over a
    // rim at 4), so it is stored at rest, levelled into its hollow up to its lowest rim (the release
    // gate's bug hunt, D385: stored as kept, the game moved it by up to 8 levels at once)
    const floor = s.built.waterModel.floor;
    const surfaces = lake.tiles.filter((i) => s.built.water[i] > 0).map((i) => floor[i] + s.built.water[i]);
    expect(surfaces.length).toBeGreaterThan(lake.tiles.length / 2);
    expect(Math.max(...surfaces) - Math.min(...surfaces)).toBeLessThan(1e-9);
    const settles = s.validate("export").report.checks.find((c) => c.id === "water.settles")!;
    expect(settles.ok, settles.message).toBe(true);
    expect(settles.message).toMatch(/a sealed lake keeps slowly evaporating/);
    // the same carve without its kept water: the game's settle from the land and the sources alone
    const bare = MapSession.fromGenerated(r, r.file);
    const { lake: _lake, ...params } = op.params;
    expect(bare.apply({ op: "forceResult", params }, "user").errors).toEqual([]);
    bare.settleCanonical();
    expect(lake.tiles.filter((i) => bare.built.water[i] > 1).length).toBeLessThan(deep / 4);
    // the project file replays it, and the file the game loads holds the lake
    const again = MapSession.open(decodeProject(s.project()));
    again.settleCanonical();
    expect(Array.from(again.built.water)).toEqual(Array.from(s.built.water));
    const file = s.exportTimber().bytes;
    expect(Buffer.from(file).equals(Buffer.from(again.exportTimber().bytes))).toBe(true);
    const stored = storedWater(readTimber(file).world.singletons, 96, 96);
    const wet = new Map(Array.from(stored.tile, (t, k) => [t, stored.depth[k]]));
    expect(lake.tiles.filter((i) => (wet.get(i) ?? 0) > 1).length).toBe(deep);
    // undo: the water as it was
    expect(s.undo()).toBe(true);
    s.settleCanonical();
    expect(Array.from(s.built.water)).toEqual(before);
  });

  it("the engine refuses a carve that doesn't fit: off the map, out of order, past the levels, or with objects that aren't there", () => {
    const r = generate(makeSpec({ seed: 3, theme: "highlands", size: { x: 64, y: 64 } }));
    const s = MapSession.fromGenerated(r, r.file);
    s.setWaterMode("defer");
    const base: ForceResultParams = { version: 1, verb: "carve", settings: { mode: "unleash", power: 50, wander: 35, width: null, seed: 0, walls: "steep", defyGravity: false, dry: true }, where: { origin: [30, 30] }, steps: 1, reason: "stopped", tiles: [30 * 64 + 30], heights: [2], removed: [] };
    const set = (x: object) => ({ settings: { ...base.settings, ...x } as ForceResultParams["settings"] });
    expect(s.apply({ op: "forceResult", params: base }).errors).toEqual([]);
    s.undo();
    const bad: Partial<ForceResultParams>[] = [
      { where: { origin: [70, 3] } },
      { tiles: [5, 4], heights: [1, 1] },
      { tiles: [64 * 64], heights: [1] },
      { heights: [40] },
      { tiles: [1, 2], heights: [1] },
      { removed: ["00000000-0000-4000-8000-000000000000"] },
      set({ mode: "aim" }),
      set({ width: 1 }),
      set({ walls: "sheer" }),
      { replaces: 999 },
      { lake: { tiles: [5, 4], floor: [1, 1], depth: [1, 1], contamination: [0, 0] } },
      { lake: { tiles: [5], floor: [1, 2], depth: [1], contamination: [0] } },
      { lake: { tiles: [5], floor: [1], depth: [-1], contamination: [0] } },
      { lake: { tiles: [64 * 64], floor: [1], depth: [1], contamination: [0] } },
    ];
    for (const b of bad) expect(s.apply({ op: "forceResult", params: { ...base, ...b } }).errors.length, JSON.stringify(b)).toBeGreaterThan(0);
    // the carve operation of before D220 is no longer one: a project holding it converts it as it opens
    expect(s.apply({ op: "carve", params: base } as never).errors.length).toBeGreaterThan(0);
    // the schema agrees with Ajv
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    const validate = ajv.compile(opsSchema);
    const samples: unknown[] = [
      { op: "forceResult", params: base },
      { op: "forceResult", params: { ...base, ...set({ width: 6, mode: "aim" }), where: { origin: [30, 30], end: [3, 4] }, source: { id: "11111111-2222-4333-8444-555555555555", x: 1, y: 2, strength: 4.5 }, replaces: 3, cut: 9 } },
      { op: "forceResult", params: { ...base, ...set({ width: 1 }) } },
      { op: "forceResult", params: { ...base, ...set({ walls: "sheer" }) } },
      { op: "forceResult", params: { ...base, source: { id: "x", x: 1, y: 2, strength: 4 } } },
      { op: "forceResult", params: { ...base, heights: undefined } },
      { op: "forceResult", params: { ...base, lake: { tiles: [5, 6], floor: [3, 3], depth: [1.25, 0.5], contamination: [0, 0.1] } } },
      { op: "forceResult", params: { ...base, lake: { tiles: [5], floor: [3], depth: [-1], contamination: [0] } } },
      { op: "forceResult", params: { ...base, lake: { tiles: [5], floor: [3], depth: [1] } } },
      { op: "carve", params: base },
      { op: "deleteEntities", params: { entities: ["11111111-2222-4333-8444-555555555555"], quiet: true } },
    ];
    for (const v of samples) expect(checkSchema(opsSchema as Record<string, unknown>, v).length === 0, JSON.stringify(v)).toBe(validate(v));
    // a carve's quiet removal is its own: an operation in the log can't ask for it
    const any = s.built.entities.find((e) => e.template !== "StartingLocation")!;
    expect(s.apply({ op: "deleteEntities", params: { entities: [any.id], quiet: true } }).errors.length).toBeGreaterThan(0);
  });
});

describe("a carve at work in the editor's worker", () => {
  it("worked out first, then shown a frame at a time (D321, item 29); Esc drops all of it; kept part way it keeps its whole result, as one step; Try another path replaces it", async () => {
    const W = 96;
    await runGenerate(makeSpec({ seed: 21, theme: "highlands", size: { x: W, y: W } }));
    ed.refine();
    const open = ed.sessionView();
    const ground = open.view.heights.slice();
    const steps = () => ed.sessionInfo().history.filter((h) => h.applied).length;
    const n0 = steps();
    const s = MapSession.open(decodeProject(ed.project().bytes));
    const origin = farFromStart(s);
    const settings = { ...DEFAULTS, power: 70 };
    // worked out a slice a call (nothing changes on the land meanwhile), then shown a frame at a time
    const st = ed.forceStart({ verb: "carve", settings, origin, cut: null });
    expect(st.errors).toEqual([]);
    expect(ed.carving()).toBe(true);
    let shown: Uint8Array = ground.slice();
    const show = (f: ed.ForceFrame | null) => {
      expect(f).not.toBeNull();
      if (f!.heights) shown = f!.heights;
      return f!;
    };
    show(st.frame);
    for (let k = 0; k < 200 && !show(ed.forceAdvance(1)).planned; k++) expect(Array.from(shown)).toEqual(Array.from(ground));
    const worked = ed.forceAdvance(0)!;
    expect(worked.planned).toBe(true);
    expect(worked.total).toBeGreaterThan(3 * STEPS_PER_SECOND);
    for (let k = 0; k < 3; k++) show(ed.forceAdvance(STEPS_PER_SECOND));
    expect(ed.forceAdvance(0)!.shown).toBe(3 * STEPS_PER_SECOND);
    expect(Array.from(shown)).not.toEqual(Array.from(ground));
    // (no frame carries water: a carve's own flows as a stroke's does, carveBornAsItCuts.test.ts)
    expect("water" in worked).toBe(false);
    // Esc: all of it goes at once, and the history never had it
    const back = ed.forceCancel();
    expect(Array.from(back.heights!)).toEqual(Array.from(ground));
    expect(ed.carving()).toBe(false);
    expect(steps()).toBe(n0);
    // kept part way (Watch's jump to the end): one step, the whole result, the same as shown to its end
    show(ed.forceStart({ verb: "carve", settings, origin, cut: null }).frame);
    for (let k = 0; k < 4; k++) show(ed.forceAdvance(STEPS_PER_SECOND));
    const partWay = shown;
    const kept = ed.forceStop();
    expect(kept.errors).toEqual([]);
    expect(kept.kept).toBe(true);
    expect(steps()).toBe(n0 + 1);
    expect(kept.info.history.filter((h) => h.applied).at(-1)!.label).toBe("Carve a river");
    const first = ed.terrainNow().heights;
    expect(Array.from(first)).not.toEqual(Array.from(partWay));
    ed.undo();
    show(ed.forceStart({ verb: "carve", settings, origin, cut: null }).frame);
    for (let k = 0; k < 2000 && !show(ed.forceAdvance(STEPS_PER_SECOND)).done; k++);
    expect(ed.forceStop().kept).toBe(true);
    expect(Array.from(ed.terrainNow().heights)).toEqual(Array.from(first));
    expect(Array.from(first)).toEqual(Array.from(shown));
    expect(kept.info.forceAgain).toBe("carve");
    // Try another path: the same carve from the same land, the next seed; it replaces the first
    const again = ed.forceAgain();
    expect(again.errors).toEqual([]);
    expect(again.settings!.seed).toBe(1);
    show(again.frame);
    for (let k = 0; k < 2000 && !show(ed.forceAdvance(STEPS_PER_SECOND)).done; k++);
    const other = ed.forceStop();
    expect(other.kept).toBe(true);
    expect(other.info.history.filter((h) => h.applied).at(-1)!.label).toBe("Try another path");
    expect(Array.from(ed.terrainNow().heights)).toEqual(Array.from(shown));
    expect(Array.from(shown)).not.toEqual(Array.from(first));
    // undo: the first carve, exactly; again: the land before it
    ed.undo();
    expect(Array.from(ed.terrainNow().heights)).toEqual(Array.from(first));
    expect(ed.sessionInfo().forceAgain).toBe("carve");
    ed.undo();
    expect(Array.from(ed.terrainNow().heights)).toEqual(Array.from(ground));
    expect(ed.sessionInfo().forceAgain).toBeNull();
    expect(ed.forceAgain().ok).toBe(false);
    ed.settleWater();
  });

  it("carves only the land showing: under a cut, the ground above it stays as it is (D207)", async () => {
    const W = 96;
    await runGenerate(makeSpec({ seed: 21, theme: "highlands", size: { x: W, y: W } }));
    ed.refine();
    const ground = ed.sessionView().view.heights.slice();
    const s = MapSession.open(decodeProject(ed.project().bytes));
    const origin = farFromStart(s);
    const cut = ground[origin[1] * W + origin[0]];
    // (the ground above the cut can't be a carve's origin)
    let above = -1;
    for (let i = 0; i < ground.length && above < 0; i++) if (ground[i] > cut) above = i;
    if (above >= 0) expect(ed.forceStart({ verb: "carve", settings: DEFAULTS, origin: [above % W, Math.floor(above / W)], cut }).ok).toBe(false);
    expect(ed.forceStart({ verb: "carve", settings: { ...DEFAULTS, power: 90, walls: "wide" }, origin, cut }).ok).toBe(true);
    for (let k = 0; k < 6; k++) ed.forceAdvance(STEPS_PER_SECOND);
    expect(ed.forceStop().kept).toBe(true);
    const after = ed.terrainNow().heights;
    let changed = 0;
    for (let i = 0; i < ground.length; i++) {
      if (after[i] !== ground[i]) changed++;
      if (ground[i] > cut) expect(after[i], `tile ${i}`).toBe(ground[i]);
    }
    expect(changed).toBeGreaterThan(20);
    ed.settleWater();
  });
});
