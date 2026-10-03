// The start requirements (PLAN §5.6, §11.4; D85, Kyler 2026-09-24): a unit test for each. On a
// small made-up map the validator's playability checks run on water given directly (no settle), so
// each case changes one thing: where the water is, what it is, how the start walks to it, how much
// wood and how many living berry bushes stand within 20 tiles' walk.
//
//   1. Water without stairs (amended by Kyler, 2026-09-25, D153): clean water touches a shore tile the
//      start reaches on foot over the map's own ground and its slopes (never player stairs), within
//      the rule's walk, and a pump on that shore reaches the water's surface; and (D302) a running
//      source feeds that water, or it lasts the drought: never a sealed puddle.
//   2. Starting wood (D164): the logs of the grown trees within 20 tiles' walk (slopes allowed),
//      alive or dead, by species (oak 8, pine 2, birch 1) ≥ Minimum starting wood; a sapling's
//      logs are still growing and do not count. The starting-logs floor (D224, D227) counts the
//      same logs within 40 tiles' walk, at every difficulty.
//   3. Starting bushes: living berry bushes within 20 tiles' walk ≥ Minimum starting bushes.

import { describe, expect, it } from "vitest";
import { walkDistance } from "../../src/core/analysis/walk";
import type { Orientation } from "../../src/core/format/footprints";
import { moisture } from "../../src/core/sim/moisture";
import { waterModel, type MapObject } from "../../src/core/sim/model";
import type { CanonicalWater } from "../../src/core/sim/prefill";
import { F } from "../../src/core/format/json";
import { LOG_FLOOR, LOG_FLOOR_WALK } from "../../src/core/data/logFloor";
import { DIFFICULTY_RULES, makeSpec, woodForTrees } from "../../src/core/spec/mapspec";
import { checkPlayability, rulesFor, type Rules } from "../../src/core/validate/playability";
import { Collector, type CheckResult } from "../../src/core/validate/report";

const W = 48;
const H = 48;
const N = W * H;
const START = { x: 12, y: 24 };

interface Scene {
  heights: Uint8Array;
  depth: Float64Array;
  contamination: Float64Array;
  objects: MapObject[];
}

/** Level 5 ground; the start's 3×3 at (11–13, 23–25); a river 3 wide at x = 34–36, its bed one
 *  level below the bank (4) and its water 0.6 deep, so a pump on the bank reaches it, fed by a
 *  source at its head (35, 0) (D302). The shore tile x = 33 is 20 tiles' walk from the start's 3×3. */
function scene(): Scene {
  const heights = new Uint8Array(N).fill(5);
  const depth = new Float64Array(N);
  const contamination = new Float64Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 34; x <= 36; x++) {
      heights[y * W + x] = 4;
      depth[y * W + x] = 0.6;
    }
  const objects: MapObject[] = [obj("StartingLocation", START.x - 1, START.y - 1, 5), obj("WaterSource", 35, 0, 4, "Cw0", { WaterSource: { SpecifiedStrength: 1 } })];
  return { heights, depth, contamination, objects };
}

function obj(template: string, x: number, y: number, z: number, orientation: Orientation = "Cw0", components: Record<string, unknown> = {}): MapObject {
  return { template, x, y, z, orientation, flipped: false, components: components as MapObject["components"] };
}

function plant(s: Scene, template: "Pine" | "Birch" | "Oak" | "Succulent" | "BlueberryBush", tiles: [number, number][], dead = false, components: Record<string, unknown> = {}): void {
  for (const [x, y] of tiles) s.objects.push(obj(template, x, y, s.heights[y * W + x], "Cw0", { ...(dead ? { LivingNaturalResource: { IsDead: true } } : {}), ...components }));
}

/** The moist, dry-footed tiles of a scene (where living plants survive). */
function moist(s: Scene): Uint8Array {
  const M = moisture(s.heights, s.depth, s.contamination, W, H, null);
  const out = new Uint8Array(N);
  for (let i = 0; i < N; i++) out[i] = M[i] > 0 && !(s.depth[i] > 0) ? 1 : 0;
  return out;
}

/** `n` tiles that are moist, reachable within `lo`–`hi` tiles' walk of the start (slopes allowed),
 *  and off the start, in index order. */
function spots(s: Scene, n: number, lo: number, hi: number, taken = new Set<number>()): [number, number][] {
  const m = moist(s);
  const d = walkDistance(s.heights, W, H, null, slopeLinks(s), START, 200);
  const out: [number, number][] = [];
  for (let i = 0; i < N && out.length < n; i++) {
    const x = i % W;
    const y = (i - x) / W;
    if (!m[i] || taken.has(i) || d[i] < lo || d[i] > hi || (Math.abs(x - START.x) <= 1 && Math.abs(y - START.y) <= 1)) continue;
    taken.add(i);
    out.push([x, y]);
  }
  expect(out.length, "enough places to plant").toBe(n);
  return out;
}

function slopeLinks(s: Scene): [number, number][] {
  const out: [number, number][] = [];
  for (const o of s.objects) if (o.template === "Slope" && o.orientation === "Cw90") out.push([o.y * W + o.x, o.y * W + o.x - 1]);
  return out;
}

function check(s: Scene, rules: Partial<Rules> = {}): Record<string, CheckResult> {
  const base = rulesFor(null, "normal");
  const c = new Collector("generate");
  const model = waterModel(W, H, s.heights, s.objects);
  const water: CanonicalWater = { settled: true, ticks: 0, depth: s.depth, contamination: s.contamination, sat: new Uint8Array(N) };
  checkPlayability({ W, H, surface: s.heights, objects: s.objects, model, water, rules: { ...base, ...rules }, features: null }, c);
  return Object.fromEntries(c.checks.map((r) => [r.id, r]));
}

/** A scene that meets all three requirements at Normal: 210 logs (35 pines, 15 oaks and 20
 *  birches) and 35 living bushes within 20 tiles' walk. (D227: Normal asks for 200 logs; 150 before.) */
function good(): Scene {
  const s = scene();
  const taken = new Set<number>();
  plant(s, "Pine", spots(s, 35, 2, 18, taken));
  plant(s, "Oak", spots(s, 15, 2, 18, taken));
  plant(s, "Birch", spots(s, 20, 2, 18, taken));
  plant(s, "BlueberryBush", spots(s, 35, 2, 18, taken));
  return s;
}

describe("the three start requirements (PLAN §5.6, D85, D164)", () => {
  it("Normal's defaults are 20 tiles' walk, 200 logs and 30 bushes; Easy 12, 250, 40; Hard 28, none, 30 (D227; item 47's berries for an Iron Teeth start)", () => {
    const r = (d: "easy" | "normal" | "hard") => DIFFICULTY_RULES[d];
    expect([r("easy").waterWithin, r("easy").woodWithin20, r("easy").bushesWithin20]).toEqual([12, 250, 40]);
    expect([r("normal").waterWithin, r("normal").woodWithin20, r("normal").bushesWithin20]).toEqual([20, 200, 30]);
    expect([r("hard").waterWithin, r("hard").woodWithin20, r("hard").bushesWithin20]).toEqual([28, 0, 30]);
    // D164: an old link's or project's tree count is 2 logs of grown wood a tree
    expect([woodForTrees(60), woodForTrees(40), woodForTrees(20)]).toEqual([120, 80, 40]);
    // an imported map uses its difficulty's defaults; a generated one its settings
    expect(rulesFor(null, "hard").waterWithin).toBe(28);
    const spec = makeSpec({ seed: 1, designedFor: "easy" });
    spec.settings.start.rules.waterWithin = 33;
    expect(rulesFor(spec).waterWithin).toBe(33);
  });

  it("a map that meets all three passes, and the other start rules are only targets", () => {
    const c = check(good());
    expect(c["start.water"].ok).toBe(true);
    expect(c["start.water"].value).toBe(20);
    expect(c["start.wood"].ok).toBe(true);
    expect(c["start.wood"].value).toBe(210);
    expect(c["start.wood"].message).toMatch(/^210 logs within 20 tiles' walk of the start, oak and pine \(at least 200\)$/);
    expect(c["start.wood_floor"].ok).toBe(true);
    expect(c["start.food"].ok).toBe(true);
    expect(c["start.food"].value).toBe(35);
    for (const id of ["start.badwater", "start.reach", "start.ruins_clear", "water.storage_possible"]) expect(c[id].advisory, id).toBe(true);
    expect(c["start.reach_water"]).toBeUndefined();
  });

  it("the same river with no source feeding it is a sealed puddle a drought empties, and fails (D302)", () => {
    const s = good();
    s.objects = s.objects.filter((o) => o.template !== "WaterSource");
    const c = check(s);
    expect(c["start.water"].ok).toBe(false);
    expect(c["start.water"].value).toBe("none");
    expect(c["start.water"].message).toMatch(/^the water 20 tiles' walk away is a sealed puddle no source feeds, which a 9-day drought empties/);
  });

  it("water beyond the walking distance fails, and the water setting moves the result", () => {
    const s = good();
    expect(check(s, { waterWithin: 19 })["start.water"].ok).toBe(false);
    expect(check(s, { waterWithin: 20 })["start.water"].ok).toBe(true);
    // a wall on the way: the walk goes round it, farther than the straight line
    for (let y = 10; y <= 38; y++) s.heights[y * W + 25] = 9;
    const c = check(s, { waterWithin: 20 });
    expect(c["start.water"].ok).toBe(false);
    expect(Number(c["start.water"].value)).toBeGreaterThan(20);
    expect(check(s, { waterWithin: 40 })["start.water"].ok).toBe(true);
  });

  it("water reached down a natural slope passes; the same step without one needs stairs and fails", () => {
    const s = good();
    // the start's side rises one level; the bank below it, beside the river, is reached by the
    // map's own slope (D153: levels may change along the walk, through slopes)
    for (let y = 0; y < H; y++) for (let x = 0; x <= 29; x++) s.heights[y * W + x] = 6;
    s.objects = s.objects.map((o) => (o.x <= 29 ? { ...o, z: 6 } : o));
    s.objects.push(obj("Slope", 30, 24, 5, "Cw90"));
    // the walk: 16 tiles on the start's level, 1 down the slope, 3 on the bank to the shore tile;
    // a pump on the bank (level 5) reaches the river's surface (4.6)
    const c = check(s, { waterWithin: 20 });
    expect(c["start.water"].ok).toBe(true);
    expect(c["start.water"].value).toBe(20);
    expect(check(s, { waterWithin: 19 })["start.water"].ok).toBe(false);
    // without the slope, reaching the bank takes stairs the player would build: no water
    s.objects = s.objects.filter((o) => o.template !== "Slope");
    const none = check(s, { waterWithin: 40 });
    expect(none["start.water"].ok).toBe(false);
    expect(none["start.water"].value).toBe("none");
  });

  it("the pump works from the shore it stands on: water too far below that shore fails, on any level", () => {
    const s = good();
    // the same slope down to the bank, but the river's bed drops to level 2: its surface (2.6) is
    // 2.4 below the bank, out of a pump's reach there, though the walk is short
    for (let y = 0; y < H; y++) for (let x = 0; x <= 29; x++) s.heights[y * W + x] = 6;
    s.objects = s.objects.map((o) => (o.x <= 29 ? { ...o, z: 6 } : o));
    s.objects.push(obj("Slope", 30, 24, 5, "Cw90"));
    for (let y = 0; y < H; y++) for (let x = 34; x <= 36; x++) s.heights[y * W + x] = 2;
    expect(check(s, { waterWithin: 40 })["start.water"].value).toBe("none");
    // a second slope down to a lower bank (level 4) beside it brings the pump within reach
    for (let y = 0; y < H; y++) s.heights[y * W + 33] = 4;
    s.objects.push(obj("Slope", 33, 24, 4, "Cw90"));
    const c = check(s, { waterWithin: 40 });
    expect(c["start.water"].ok).toBe(true);
    expect(c["start.water"].value).toBe(20);
  });

  it("only badwater fails", () => {
    const s = good();
    for (let i = 0; i < N; i++) if (s.depth[i] > 0) s.contamination[i] = 1;
    const c = check(s);
    expect(c["start.water"].ok).toBe(false);
    expect(c["start.water"].value).toBe("none");
  });

  it("water too shallow to pump, or out of a pump's reach, fails", () => {
    const shallow = good();
    for (let i = 0; i < N; i++) if (shallow.depth[i] > 0) shallow.depth[i] = 0.2;
    expect(check(shallow)["start.water"].ok).toBe(false);
    const deep = good();
    for (let y = 0; y < H; y++) for (let x = 34; x <= 36; x++) deep.heights[y * W + x] = 1; // surface 1.6, 3.4 below
    expect(check(deep)["start.water"].ok).toBe(false);
  });

  it("wood below the minimum fails, and Minimum starting wood moves the result", () => {
    const s = scene();
    const taken = new Set<number>();
    plant(s, "Pine", spots(s, 39, 2, 18, taken)); // 78 logs
    plant(s, "BlueberryBush", spots(s, 35, 2, 18, taken));
    expect(check(s)["start.wood"].value).toBe(78);
    expect(check(s)["start.wood"].ok).toBe(false);
    expect(check(s, { woodWithin20: 78 })["start.wood"].ok).toBe(true);
    expect(check(good(), { woodWithin20: 211 })["start.wood"].ok).toBe(false);
  });

  it("each species gives its own yield: an oak 8 logs, a pine 2, a birch 1; a succulent none", () => {
    const s = scene();
    const taken = new Set<number>();
    plant(s, "BlueberryBush", spots(s, 35, 2, 18, taken));
    plant(s, "Oak", spots(s, 1, 2, 18, taken));
    plant(s, "Pine", spots(s, 1, 2, 18, taken));
    plant(s, "Birch", spots(s, 1, 2, 18, taken));
    expect(check(s)["start.wood"].value).toBe(11);
    // a succulent yields water, not logs
    plant(s, "Succulent", spots(s, 1, 2, 18, taken));
    expect(check(s)["start.wood"].value).toBe(11);
    // the logs a tree holds in the file are what a lumberjack cuts
    plant(s, "Oak", spots(s, 1, 2, 18, taken), false, { "Yielder:Cuttable": { Yield: { Good: "Log", Amount: 3 } } });
    const c = check(s, { woodWithin20: 14 });
    expect(c["start.wood"].value).toBe(14);
    expect(c["start.wood"].ok).toBe(true);
    expect(c["start.wood"].message).toMatch(/mostly oak/);
  });

  it("a sapling's logs are still growing: shown apart, never counted, whatever form its growth takes", () => {
    const s = scene();
    const taken = new Set<number>();
    plant(s, "BlueberryBush", spots(s, 35, 2, 18, taken));
    plant(s, "Oak", spots(s, 10, 2, 18, taken)); // 80 grown logs
    // saplings: the growth as a plain number, as the parser's float, and in the older {"Value": …} form
    plant(s, "Oak", spots(s, 1, 2, 18, taken), false, { Growable: { GrowthProgress: 0.5 } });
    plant(s, "Pine", spots(s, 1, 2, 18, taken), false, { Growable: { GrowthProgress: F(0.25) } });
    plant(s, "Birch", spots(s, 1, 2, 18, taken), false, { Growable: { GrowthProgress: { Value: 0.8 } } });
    let c = check(s, { woodWithin20: 80 });
    expect(c["start.wood"].value).toBe(80);
    expect(c["start.wood"].ok).toBe(true);
    expect(c["start.wood"].message).toBe("80 logs within 20 tiles' walk of the start, all oak, plus about 11 growing (at least 80)");
    expect(check(s, { woodWithin20: 81 })["start.wood"].ok).toBe(false);
    // grown: no Growable, a growth of 1, or no readable growth (never a number made up)
    plant(s, "Pine", spots(s, 1, 2, 18, taken), false, { Growable: { GrowthProgress: F(1) } });
    plant(s, "Pine", spots(s, 1, 2, 18, taken), false, { Growable: {} });
    plant(s, "Pine", spots(s, 1, 2, 18, taken), false, { Growable: { GrowthProgress: "half" } });
    c = check(s);
    expect(c["start.wood"].value).toBe(86);
    expect(check(s, { woodWithin20: 86 })["start.wood"].ok).toBe(true);
  });

  it("wood beyond 20 tiles' walk does not count; dead trees, and trees that will die, keep their logs", () => {
    const s = scene();
    const taken = new Set<number>();
    plant(s, "BlueberryBush", spots(s, 35, 2, 18, taken));
    plant(s, "Pine", spots(s, 30, 2, 18, taken)); // 60
    plant(s, "Pine", spots(s, 20, 21.5, 40, taken)); // beyond 20 tiles' walk
    plant(s, "Pine", spots(s, 20, 2, 18, taken), true); // dead: 40
    // living trees on dry ground (moisture 0) die, and keep their logs: 20
    const dry: [number, number][] = [];
    const m = moist(s);
    for (let y = 18; y <= 30 && dry.length < 10; y++) for (let x = 3; x <= 8 && dry.length < 10; x++) if (!m[y * W + x]) dry.push([x, y]);
    expect(dry.length).toBe(10);
    plant(s, "Pine", dry);
    const c = check(s, { woodWithin20: 120 });
    expect(c["start.wood"].value).toBe(120);
    expect(c["start.wood"].ok).toBe(true);
    expect(check(s, { woodWithin20: 121 })["start.wood"].ok).toBe(false);
  });

  it("the starting-logs floor counts the same logs within 40 tiles' walk, at every difficulty, and blocks (D224, D227)", () => {
    expect(LOG_FLOOR).toBe(178);
    expect(LOG_FLOOR_WALK).toBe(40);
    const s = scene();
    const taken = new Set<number>();
    plant(s, "BlueberryBush", spots(s, 35, 2, 18, taken));
    plant(s, "Pine", spots(s, 30, 2, 18, taken)); // 60 within 20 tiles' walk
    plant(s, "Pine", spots(s, 20, 2, 18, taken), true); // dead: 40 more
    plant(s, "Pine", spots(s, 30, 21.5, 39, taken)); // 60 beyond 20 tiles' walk, within 40
    plant(s, "Oak", spots(s, 3, 21.5, 39, taken), false, { Growable: { GrowthProgress: 0.5 } }); // saplings: not counted
    let c = check(s, { woodWithin20: 0 });
    expect(c["start.wood"].value).toBe(100);
    expect(c["start.wood_floor"].value).toBe(160);
    expect(c["start.wood_floor"].limit).toBe(LOG_FLOOR);
    expect(c["start.wood_floor"].ok).toBe(false);
    // a playability check: it rejects a generated map, whatever the difficulty
    expect(c["start.wood_floor"].class).toBe("playability");
    expect(c["start.wood_floor"].severity).toBe("error");
    expect(c["start.wood_floor"].message).toBe(`160 logs within 40 tiles' walk of the start, under the floor of ${LOG_FLOOR}: not enough to build a Forester, and without one the game is over`);
    // wood beyond 40 tiles' walk does not count toward it (the far bank of the river is 45 and more)
    const beyond: [number, number][] = [];
    for (let y = 0; y < H && beyond.length < 20; y++) if (s.objects.every((o) => o.x !== 40 || o.y !== y)) beyond.push([40, y]);
    plant(s, "Oak", beyond);
    expect(check(s, { woodWithin20: 0 })["start.wood_floor"].value).toBe(160);
    // 10 more pines within 40 tiles' walk meet it: the same floor at every difficulty
    plant(s, "Pine", spots(s, 10, 21.5, 39, taken));
    for (const d of ["easy", "normal", "hard"] as const) {
      c = check(s, { ...rulesFor(null, d), woodWithin20: 0 });
      expect(c["start.wood_floor"].value, d).toBe(180);
      expect(c["start.wood_floor"].ok, d).toBe(true);
    }
    expect(c["start.wood_floor"].message).toBe(`180 logs within 40 tiles' walk of the start: enough to build a Forester (the floor is ${LOG_FLOOR})`);
  });

  it("wood across a slope counts (slopes allowed); wood on a cliff top beyond reach does not", () => {
    const s = scene();
    const taken = new Set<number>();
    plant(s, "BlueberryBush", spots(s, 35, 2, 18, taken));
    // a raised shelf north of the start, joined by a slope, with a pond on it that keeps it moist
    for (let y = 30; y <= 40; y++) for (let x = 8; x <= 20; x++) s.heights[y * W + x] = 6;
    for (let y = 34; y <= 36; y++)
      for (let x = 13; x <= 15; x++) {
        s.heights[y * W + x] = 5;
        s.depth[y * W + x] = 0.6;
      }
    s.objects.push(obj("Slope", 14, 29, 5, "Cw180"));
    const m = moist(s);
    const shelf: [number, number][] = [];
    for (let y = 31; y <= 39 && shelf.length < 42; y++) for (let x = 9; x <= 19 && shelf.length < 42; x++) if (m[y * W + x]) shelf.push([x, y]);
    expect(shelf.length).toBe(42);
    plant(s, "Pine", shelf);
    // with the slope the shelf is within reach (84 logs); without it, only its edge trees are cut
    // from below
    const withSlope = check(s, { woodWithin20: 80 });
    s.objects = s.objects.filter((o) => o.template !== "Slope");
    const without = check(s, { woodWithin20: 80 });
    expect(withSlope["start.wood"].ok).toBe(true);
    expect(Number(without["start.wood"].value)).toBeLessThan(Number(withSlope["start.wood"].value));
    expect(without["start.wood"].ok).toBe(false);
  });

  it("bushes below the minimum or too far away fail, and Minimum starting bushes moves the result", () => {
    const s = scene();
    const taken = new Set<number>();
    plant(s, "Pine", spots(s, 45, 2, 18, taken));
    plant(s, "BlueberryBush", spots(s, 25, 2, 18, taken));
    plant(s, "BlueberryBush", spots(s, 15, 21.5, 40, taken));
    const c = check(s);
    expect(c["start.food"].value).toBe(25);
    expect(c["start.food"].ok).toBe(false);
    expect(check(s, { bushesWithin20: 25 })["start.food"].ok).toBe(true);
    expect(check(s, { bushesWithin20: 26 })["start.food"].ok).toBe(false);
  });
});
