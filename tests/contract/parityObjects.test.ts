// Parity with Timberborn's map editor (PLAN §20 D337, D338, D339), through the core: the objects the shelf places
// (seeps, aquifer and its drill, the badtide drain, unstable cores, reserves) are `placeEntity` operations that
// write the game's components in its order and round-trip exactly; their options are `setEntityProps` operations
// checked in words, never clamped; a brush stroke is one `paintObjects` operation, one undo step; and what a core
// will clear is a plain question with a plain answer (D342). No page, no worker, no DOM.

import { describe, expect, it } from "vitest";
import { blastInfo, explosionAfter } from "../../src/core/doc/blast";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { paintGround, planPaintObjects } from "../../src/core/doc/paint";
import { planEntity } from "../../src/core/doc/placing";
import { defaultOptions, markerNotes, optionProblems, placeComponents, setOptionsOp } from "../../src/core/doc/objectOps";
import type { EditOp } from "../../src/core/doc/ops";
import { entityJson } from "../../src/core/format/entities";
import { FOOTPRINTS, type Orientation } from "../../src/core/format/footprints";
import { stringify, type JsonObject } from "../../src/core/format/json";
import { writeTimber } from "../../src/core/format/timber";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";

const W = 96;

function open(): MapSession {
  const r = generate(makeSpec({ seed: 3, theme: "riverValley", size: { x: W, y: W } }));
  const s = MapSession.fromGenerated(r, r.file);
  s.setWaterMode("defer");
  return s;
}
const steps = (s: MapSession) => s.history().filter((h) => h.applied).length;

/** Level, free ground `w` × `h` (dry, no object, no cave), clear of the start; the `from`th such place. */
function spot(s: MapSession, w: number, h: number, from = 0, level = true): [number, number] {
  const g = paintGround(s);
  const start = s.built.start!;
  let seen = 0;
  for (let y = 6; y < W - 6 - h; y++)
    for (let x = 6; x < W - 6 - w; x++) {
      if (Math.hypot(x - start.x, y - start.y) < 16) continue;
      const at = g.heights[y * W + x];
      let ok = true;
      for (let dy = -1; dy <= h && ok; dy++) for (let dx = -1; dx <= w && ok; dx++) if (!g.free[(y + dy) * W + x + dx] || (level && g.heights[(y + dy) * W + x + dx] !== at)) ok = false;
      if (ok && seen++ >= from) return [x, y];
    }
  throw new Error("no open ground");
}

/** A free `n` × `n` square made level by a Flatten to the level most of it stands at (as a player would), and its corner. */
function flatten(s: MapSession, n: number): [number, number] {
  const [x, y] = spot(s, n, n, 0, false);
  const g = paintGround(s);
  const counts = new Map<number, number>();
  for (let dy = 0; dy < n; dy++) for (let dx = 0; dx < n; dx++) counts.set(g.heights[(y + dy) * W + x + dx] as number, (counts.get(g.heights[(y + dy) * W + x + dx] as number) ?? 0) + 1);
  const level = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  const cells: [number, number, number][] = [];
  for (let dy = -1; dy <= n; dy++) cells.push([y + dy, x - 1, x + n]);
  const r = s.apply({ op: "sculpt", params: { mode: "flatten", cells, level } });
  expect(r.errors).toEqual([]);
  return [x, y];
}

/** Place a template through the shelf's own plan (`planEntity`: the ground levelled, the entity placed), as one step. */
function place(s: MapSession, template: string, x: number, y: number, comps: Record<string, unknown> | undefined, orientation: Orientation = "Cw0", id = crypto.randomUUID()) {
  const plan = planEntity(s, { template, x, y, orientation, ...(comps ? { components: comps } : {}) }, id);
  if (!plan.ok) return { ok: false as const, errors: plan.errors, id };
  const r = s.applyAll(plan.ops, "user", plan.label);
  return { ...r, id };
}
const find = (s: MapSession, id: string) => s.built.entities.find((e) => e.id === id)!;
const orderOf = (s: MapSession, id: string) => Object.keys(entityJson(find(s, id)).Components as JsonObject);
const comps = (s: MapSession, id: string) => entityJson(find(s, id)).Components as Record<string, Record<string, unknown>>;

describe("the objects the shelf places, in the game's component order", () => {
  it("each is one step, written as the official maps store it, and the drill needs its aquifer", () => {
    const s = open();
    const before = steps(s);
    let at = 0;
    const cases: [string, string[]][] = [
      ["WaterSeep", ["WaterSource", "BlockObject", "WaterDepthStrengthModifier", "TimeActivatedComponent"]],
      ["BadwaterSeep", ["WaterSource", "BlockObject", "WaterDepthStrengthModifier", "TimeActivatedComponent"]],
      ["Aquifer", ["BlockObject", "WaterSource"]],
      ["BadtideDrain", ["WaterSource", "BlockObject", "TimeActivatedComponent"]],
      ["UnstableCore", ["BlockObject", "TimeActivatedComponent", "UnstableCore"]],
      ["ReservePile", ["BlockObject", "FixedStockpile", "SingleGoodAllower", "Inventory:Stockpile", "StockpileVisualizers", "Inventory:ConstructionSite"]],
      ["ReserveWarehouse", ["BlockObject", "FixedStockpile", "SingleGoodAllower", "Inventory:Stockpile", "StockpileVisualizers", "Inventory:ConstructionSite"]],
      ["ReserveTank", ["BlockObject", "FixedStockpile", "SingleGoodAllower", "Inventory:Stockpile", "StockpileVisualizers", "Inventory:ConstructionSite"]],
    ];
    let n = 0;
    for (const [template, order] of cases) {
      const fp = FOOTPRINTS[template];
      const [x, y] = spot(s, fp.size[0] + 1, fp.size[1] + 1, at++ * 3);
      const r = place(s, template, x + 1, y + 1, placeComponents(template, defaultOptions(template)));
      expect(r.errors, template).toEqual([]);
      expect(orderOf(s, r.id), template).toEqual(order);
      expect(steps(s)).toBe(before + ++n);
    }
    const aq = s.built.entities.find((e) => e.template === "Aquifer")!;
    const lone = place(s, "AncientAquiferDrill", 40, 40, undefined);
    expect(lone.errors[0]).toMatch(/needs an aquifer under it/);
    const drill = place(s, "AncientAquiferDrill", aq.x, aq.y, undefined);
    expect(drill.errors).toEqual([]);
    expect(orderOf(s, drill.id)).toEqual(["BlockObject"]);
  });

  it("a placement is refused in words: a strength over the ceiling, a bad delay, a radius, a good the reserve cannot hold; a sink is fine", () => {
    const s = open();
    const [x, y] = spot(s, 4, 4);
    const ok = (template: string, c: Record<string, unknown>) => s.check({ op: "placeEntity", params: { id: crypto.randomUUID(), template, x, y, orientation: "Cw0", components: c } });
    expect(ok("WaterSeep", { WaterSource: { SpecifiedStrength: 33, CurrentStrength: 33 }, WaterDepthStrengthModifier: { CurrentModifier: 1 } })[0]).toMatch(/at most 32 water a second/);
    expect(ok("BadwaterSource", { WaterSource: { SpecifiedStrength: 73, CurrentStrength: 73 } })[0]).toMatch(/at most 72/);
    expect(ok("WaterSource", { WaterSource: { SpecifiedStrength: -2, CurrentStrength: -2 } })).toEqual([]);
    expect(ok("WaterSource", { WaterSource: { SpecifiedStrength: 1, CurrentStrength: 1 }, TimeActivatedComponent: { IsEnabled: true, CyclesUntilCountdownActivation: 0, DaysUntilActivation: 3 } })[0]).toMatch(/from 1/);
    expect(ok("UnstableCore", { TimeActivatedComponent: { IsEnabled: true, CyclesUntilCountdownActivation: 5, DaysUntilActivation: 10.5 }, UnstableCore: { ExplosionRadius: 6 } })[0]).toMatch(/from 0 to 5/);
    expect(ok("ReserveTank", { FixedStockpile: { FixedGoodId: "Log" }, SingleGoodAllower: { AllowedGood: "Log" } })[0]).toMatch(/holds liquids: Log is not one it can hold/);
    expect(ok("ReservePile", { FixedStockpile: { FixedGoodId: "Log" }, "Inventory:Stockpile": { Storage: { Goods: [{ Good: "Log", Amount: 161 }] } } })[0]).toMatch(/at most 160/);
    expect(steps(s)).toBe(0);
  });

  it("the objects and their options survive the file and the project exactly, in the game's order, and load cleanly", () => {
    const s = open();
    const [x, y] = spot(s, 6, 6);
    const seep = place(s, "WaterSeep", x + 1, y + 1, placeComponents("WaterSeep", { strength: 2, timed: { enabled: true, cycles: 3, days: 4.5 } }));
    const [x2, y2] = spot(s, 6, 6, 6);
    const wh = place(s, "ReserveWarehouse", x2 + 1, y2 + 1, placeComponents("ReserveWarehouse", { good: "Explosives", amount: 40 }), "Cw90");
    expect(seep.errors).toEqual([]);
    expect(wh.errors).toEqual([]);
    const text = (id: string) => stringify(entityJson(find(s, id)));
    const texts = [text(seep.id), text(wh.id)];
    expect(texts[0]).toContain('"WaterSource":{"SpecifiedStrength":2.0,"CurrentStrength":0.0}');
    expect(texts[0]).toContain('"TimeActivatedComponent":{"IsEnabled":true,"CyclesUntilCountdownActivation":3,"DaysUntilActivation":4.5,"DaysPassed":0.0}');
    expect(texts[1]).toContain('"FixedStockpile":{"FixedGoodId":"Explosives"}');
    const again = MapSession.importMap(writeTimber(s.exportFile()), "again.timber");
    const raw = (m: MapSession, id: string) => stringify(entityJson(m.built.entities.find((e) => e.id === id)!));
    expect(raw(again, seep.id)).toBe(texts[0]);
    expect(raw(again, wh.id)).toBe(texts[1]);
    const reopened = MapSession.open(decodeProject(s.project()));
    expect(raw(reopened, seep.id)).toBe(texts[0]);
    expect(raw(reopened, wh.id)).toBe(texts[1]);
    expect(s.validate("export").report.checks.filter((c) => c.class === "load" && !c.ok).map((c) => c.id)).toEqual([]);
  });

  it("the badtide drain keeps the way it faces, and gives nothing before a badtide", () => {
    const s = open();
    const [x, y] = spot(s, 5, 5);
    const r = place(s, "BadtideDrain", x + 1, y + 1, placeComponents("BadtideDrain"), "Cw270");
    expect(r.errors).toEqual([]);
    expect(find(s, r.id).orientation).toBe("Cw270");
    const drain = s.built.waterModel.emitters.filter((e) => e.strength === 0 && e.contamination === 1 && e.cells.length === 1);
    expect(drain.length).toBeGreaterThanOrEqual(1);
  });
});

describe("options are operations: setEntityProps, one step each, the water answering", () => {
  it("a delay stops a source's water and no delay brings it back; a sink is a negative strength; over the ceiling is refused", () => {
    const s = open();
    const [x, y] = spot(s, 6, 6);
    const r = place(s, "WaterSeep", x + 1, y + 1, placeComponents("WaterSeep", { strength: 2 }));
    expect(r.errors).toEqual([]);
    const emitter = () => s.built.waterModel.emitters.find((e) => e.cells.length === 4 && e.depthLimit && e.cells.includes(find(s, r.id).y * W + find(s, r.id).x))!;
    expect(emitter().strength).toBe(2);
    const n0 = steps(s);
    let u = s.apply(setOptionsOp(r.id, "WaterSeep", comps(s, r.id), { timed: { enabled: true, cycles: 2, days: 3 } }));
    expect(u.ok).toBe(true);
    expect(steps(s)).toBe(n0 + 1);
    expect(emitter().strength).toBe(0);
    u = s.apply(setOptionsOp(r.id, "WaterSeep", comps(s, r.id), { timed: { enabled: false, cycles: 2, days: 3 } }));
    expect(u.ok).toBe(true);
    expect(emitter().strength).toBe(2);
    u = s.apply(setOptionsOp(r.id, "WaterSeep", comps(s, r.id), { strength: -3 }));
    expect(u.ok).toBe(true);
    expect(emitter().strength).toBe(-3);
    expect(stringify(comps(s, r.id).WaterSource as never)).toBe('{"SpecifiedStrength":-3.0,"CurrentStrength":-3.0}');
    const bad = s.apply(setOptionsOp(r.id, "WaterSeep", comps(s, r.id), { strength: 40 }));
    expect(bad.ok).toBe(false);
    expect(bad.errors[0]).toMatch(/at most 32 water a second/);
    expect(emitter().strength).toBe(-3);
  });

  it("a delayed source's strength changed (the options, or Ctrl+scroll over it): it still waits, its current strength 0, and the file's water leaves it out", () => {
    const s = open();
    const [x, y] = spot(s, 6, 6);
    const r = place(s, "WaterSource", x + 2, y + 2, placeComponents("WaterSource", { strength: 1, timed: { enabled: true, cycles: 1, days: 1 } }));
    expect(r.errors).toEqual([]);
    const u = s.apply(setOptionsOp(r.id, "WaterSource", comps(s, r.id), { strength: 3 }));
    expect(u.ok).toBe(true);
    expect(stringify(comps(s, r.id).WaterSource as never)).toBe('{"SpecifiedStrength":3.0,"CurrentStrength":0.0}');
    const at = find(s, r.id);
    expect(s.built.waterModel.emitters.find((e) => e.cells.length === 1 && e.cells[0] === at.y * W + at.x)!.strength).toBe(0);
    s.settleCanonical();
    expect(s.built.water[at.y * W + at.x]).toBe(0);
  });

  it("a core's radius and cycle, and a reserve's good and stock, keep the game's order and refuse the impossible", () => {
    const s = open();
    const [x, y] = spot(s, 6, 6);
    const core = place(s, "UnstableCore", x + 1, y + 1, placeComponents("UnstableCore", { radius: 2, cycles: 7 }));
    expect(core.errors).toEqual([]);
    expect(stringify(comps(s, core.id).UnstableCore as never)).toBe('{"ExplosionRadius":2}');
    expect(s.apply(setOptionsOp(core.id, "UnstableCore", {}, { radius: 4, cycles: 9 })).ok).toBe(true);
    expect(stringify(comps(s, core.id).UnstableCore as never)).toBe('{"ExplosionRadius":4}');
    expect(comps(s, core.id).TimeActivatedComponent.CyclesUntilCountdownActivation).toBe(9);
    expect(orderOf(s, core.id)).toEqual(["BlockObject", "TimeActivatedComponent", "UnstableCore"]);
    expect(s.apply(setOptionsOp(core.id, "UnstableCore", {}, { radius: 8 })).errors[0]).toMatch(/from 0 to 5/);
    const [x2, y2] = spot(s, 6, 6, 4);
    const pile = place(s, "ReservePile", x2 + 1, y2 + 1, placeComponents("ReservePile", { good: "Log", amount: 100 }));
    expect(pile.errors).toEqual([]);
    expect(s.apply(setOptionsOp(pile.id, "ReservePile", comps(s, pile.id), { good: "Plank" })).ok).toBe(true);
    expect(stringify(comps(s, pile.id)["Inventory:Stockpile"] as never)).toBe('{"Storage":{"Goods":[{"Good":"Plank","Amount":100}]}}');
    expect(s.apply(setOptionsOp(pile.id, "ReservePile", comps(s, pile.id), { amount: 161 })).errors[0]).toMatch(/at most 160/);
    expect(s.apply(setOptionsOp(pile.id, "ReservePile", comps(s, pile.id), { good: "Water" })).errors[0]).toMatch(/holds piles/);
    expect(s.apply(setOptionsOp(pile.id, "ReservePile", comps(s, pile.id), { amount: 0 })).ok).toBe(true);
    expect(stringify(comps(s, pile.id)["Inventory:Stockpile"] as never)).toBe('{"Storage":{"Goods":[]}}');
    expect(optionProblems("ReservePile", { FixedStockpile: { FixedGoodId: "Plank" } })).toEqual([]);
  });
});

describe("a brush stroke is one operation, one undo step (D235, D338)", () => {
  const stroke = (kind: string, template: string | undefined, cx: number, cy: number, r: number, density: number, age?: string, seed = 11): EditOp => {
    const cells: [number, number, number][] = [];
    for (let y = cy - r; y <= cy + r; y++) {
      let x0 = -1;
      let x1 = -1;
      for (let x = cx - r; x <= cx + r; x++) {
        if (Math.hypot(x - cx, y - cy) > r) continue;
        if (x0 < 0) x0 = x;
        x1 = x;
      }
      if (x0 >= 0) cells.push([y, x0, x1]);
    }
    return { op: "paintObjects", params: { kind: kind as never, ...(template ? { template } : {}), area: cells, density, ...(age ? { age: age as never } : {}), seed } };
  };

  it("trees: planted where they can grow, one step that undoes and redoes; painting again fills only what the density still asks for", () => {
    const s = open();
    const [x, y] = spot(s, 12, 12, 0, false);
    const cx = x + 6;
    const cy = y + 6;
    const count = () => s.built.entities.filter((e) => e.template === "Pine").length;
    const before = count();
    const n0 = steps(s);
    const r = s.apply(stroke("trees", "Pine", cx, cy, 5, 0.5));
    expect(r.errors).toEqual([]);
    expect(steps(s)).toBe(n0 + 1);
    const planted = count() - before;
    expect(planted).toBeGreaterThan(20);
    expect(s.history().at(-1)!.label).toBe(`Plant ${planted} pines`);
    expect(s.history().at(-1)!.count).toBe(planted);
    const tiles = s.built.entities.filter((e) => e.template === "Pine").map((e) => e.y * W + e.x);
    expect(new Set(tiles).size).toBe(tiles.length);
    const again = s.apply(stroke("trees", "Pine", cx, cy, 5, 0.5, undefined, 12));
    expect(again.ok).toBe(false);
    expect(again.errors[0]).toMatch(/already holds as many/);
    expect(s.apply(stroke("trees", "Pine", cx, cy, 5, 0.9, undefined, 13)).ok).toBe(true);
    expect(count()).toBeGreaterThan(before + planted);
    s.undo();
    expect(count()).toBe(before + planted);
    s.undo();
    expect(count()).toBe(before);
    s.redo();
    expect(count()).toBe(before + planted);
  });

  it("ruin fields and thorn patches: as generated, on one level, in the game's components, one step each", () => {
    const s = open();
    const [x, y] = flatten(s, 12);
    const ruins = () => s.built.entities.filter((e) => e.owner === "placed" && /^RuinColumnH\d$/.test(e.template));
    const before = ruins().length;
    const r = s.apply(stroke("ruins", undefined, x + 6, y + 6, 5, 1));
    expect(r.errors).toEqual([]);
    const made = ruins();
    expect(made.length).toBeGreaterThanOrEqual(12);
    for (const e of made) {
      const c = entityJson(e).Components as Record<string, Record<string, unknown>>;
      expect(Object.keys(c)).toEqual(["BlockObject", "Yielder:Ruin", "RuinModels"]);
      expect(c["Yielder:Ruin"].Yield).toEqual({ Good: "ScrapMetal", Amount: 15 * Number(e.template.slice(-1)) });
      expect(["A", "B", "C", "D", "E"]).toContain(c.RuinModels.VariantId);
    }
    expect(new Set(made.map((e) => e.z)).size).toBe(1);
    const t0 = steps(s);
    s.undo();
    expect(ruins().length).toBe(before);
    expect(steps(s)).toBe(t0 - 1);
    const thorns = () => s.built.entities.filter((e) => e.owner === "placed" && e.template === "Thorns");
    expect(thorns().length).toBe(0);
    expect(s.apply(stroke("thorns", undefined, x + 6, y + 6, 5, 0.8)).errors).toEqual([]);
    expect(thorns().length).toBeGreaterThan(5);
    expect(new Set(thorns().map((e) => e.orientation)).size).toBeGreaterThan(1);
  });

  it("refuses in words: a density or an age out of range, a template that is not the kind's, no free ground", () => {
    const s = open();
    const [x, y] = spot(s, 6, 6);
    expect(s.check(stroke("trees", "Pine", x, y, 2, 1.5))[0]).toMatch(/density/);
    expect(s.check(stroke("trees", "Pine", x, y, 2, 0.5, "old"))[0]).toMatch(/age/);
    expect(s.check(stroke("trees", "Cactus", x, y, 2, 0.5))[0]).toMatch(/is not one/);
    expect(s.check(stroke("woods", "Pine", x, y, 2, 0.5))[0]).toMatch(/take no template/);
    expect(s.check(stroke("ruins", undefined, x, y, 2, 1, "mixed"))[0]).toMatch(/no age/);
    let wet = -1;
    for (let i = 0; i < W * W && wet < 0; i++) if (s.built.water[i] > 0.5) wet = i;
    expect(wet).toBeGreaterThanOrEqual(0);
    const r = s.apply({ op: "paintObjects", params: { kind: "trees", template: "Pine", area: [[Math.floor(wet / W), wet % W, wet % W]], density: 1, seed: 1 } });
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/no free ground/);
    expect(steps(s)).toBe(0);
  });

  it("the plan is a question the page can ask: the same plan the operation places, mixed woods with saplings among them", () => {
    const s = open();
    const [x, y] = spot(s, 12, 12, 0, false);
    const op = stroke("woods", undefined, x + 6, y + 6, 5, 0.6, "mixed", 5);
    const plan = planPaintObjects(s, (op as Extract<EditOp, { op: "paintObjects" }>).params);
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    const n = plan.plan.length;
    const before = s.built.entities.length;
    expect(s.apply(op).ok).toBe(true);
    expect(s.built.entities.length - before).toBe(n);
    expect(plan.plan.every((p) => ["Pine", "Birch", "Oak"].includes(p.template))).toBe(true);
    const young = s.built.entities.filter((e) => e.owner === "placed" && "Growable" in (entityJson(e).Components as object));
    expect(young.length).toBeGreaterThan(0);
  });
});

describe("what a core will do is a plain question (D339)", () => {
  it("says what it clears, and shows the map after without touching the document: the land lower, the objects gone, the water settled again", () => {
    const s = open();
    const [x, y] = spot(s, 8, 8);
    const core = place(s, "UnstableCore", x + 2, y + 2, placeComponents("UnstableCore", { radius: 2, cycles: 4 }));
    expect(core.errors).toEqual([]);
    const e = find(s, core.id);
    const info = blastInfo(s, core.id);
    expect(info.radius).toBe(3);
    expect(info.cores).toBe(1);
    expect(info.tiles).toBeGreaterThan(15);
    const heightsBefore = s.built.heights.slice();
    const entitiesBefore = s.built.entities.length;
    const after = explosionAfter(s, core.id);
    const c = (e.y + 1) * W + e.x + 1;
    expect(after.heights[c]).toBeLessThan(heightsBefore[c]);
    expect(heightsBefore[c] - after.heights[c]).toBe(info.heightLost);
    expect(after.entities.some((g) => g.id === core.id)).toBe(false);
    expect(after.entities.length).toBeLessThan(entitiesBefore);
    expect(Array.from(s.built.heights)).toEqual(Array.from(heightsBefore));
    expect(s.built.entities.length).toBe(entitiesBefore);
    expect(after.depth.length).toBe(W * W);
    expect(steps(s)).toBe(1);
  });

  it("water follows the new ground: a core beside a lake or river changes the water round its crater", () => {
    const s = open();
    const g = paintGround(s);
    let found: [number, number] | null = null;
    for (let y = 8; y < W - 8 && !found; y++)
      for (let x = 8; x < W - 8 && !found; x++) {
        const i = y * W + x;
        if (!g.free[i] || s.built.water[i] > 0) continue;
        const level = g.heights[i];
        let wet = false;
        let flat = true;
        for (let dy = -3; dy <= 4; dy++)
          for (let dx = -3; dx <= 4; dx++) {
            const j = (y + dy) * W + x + dx;
            if (s.built.water[j] > 0.3 && Math.abs(dx) + Math.abs(dy) <= 5) wet = true;
            if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && (!g.free[j] || g.heights[j] !== level)) flat = false;
          }
        if (wet && flat && g.heights[i] >= 4) found = [x, y];
      }
    expect(found).not.toBeNull();
    const [x, y] = found!;
    const core = place(s, "UnstableCore", x, y, placeComponents("UnstableCore", { radius: 3, cycles: 4 }));
    expect(core.errors).toEqual([]);
    const a = explosionAfter(s, core.id);
    let volBefore = 0;
    let volAfter = 0;
    for (let i = 0; i < W * W; i++) {
      volBefore += s.built.water[i];
      volAfter += a.depth[i];
    }
    expect(Math.abs(volAfter - volBefore)).toBeGreaterThan(0.5);
    expect(a.moisture.length).toBe(W * W);
  });
});

describe("Markers' labels are a plain question (D338, D342)", () => {
  it("each water object, core and reserve is named with what it does, in the game's words; a plain source at once is not labelled", () => {
    const s = open();
    const put = (template: string, opts: Parameters<typeof placeComponents>[1], k: number) => {
      const fp = FOOTPRINTS[template];
      const [x, y] = spot(s, fp.size[0] + 1, fp.size[1] + 1, k * 4);
      const r = place(s, template, x + 1, y + 1, placeComponents(template, opts));
      expect(r.errors, template).toEqual([]);
      return r.id;
    };
    const seep = put("WaterSeep", { strength: 1 }, 0);
    const core = put("UnstableCore", { radius: 3, cycles: 5, days: 10.5 }, 1);
    const pile = put("ReservePile", { good: "Log", amount: 100 }, 2);
    const drain = put("BadtideDrain", { strength: 1 }, 3);
    const plain = put("WaterSource", { strength: 1 }, 4);
    const sink = put("WaterSource", { strength: -1 }, 5);
    const notes = new Map(markerNotes(s.built.entities).map((n) => [n.id, n.text]));
    expect(notes.get(seep)).toBe("Water seep · 1 water/s");
    expect(notes.get(core)).toBe("Unstable core · radius 3 · goes off in cycle 5");
    expect(notes.get(pile)).toMatch(/^Reserve pile · 100 /);
    expect(notes.get(drain)).toMatch(/^Badtide drain · 1 badwater\/s · only in a badtide/);
    expect(notes.has(plain)).toBe(false);
    expect(notes.get(sink)).toMatch(/sink 1 water\/s/);
  });
});

describe("a stroke is refused inside a group, in words (D342)", () => {
  it("applyAll says a brush stroke cannot join others", () => {
    const s = open();
    const [x, y] = spot(s, 6, 6);
    const area = [{ y, x0: x, x1: x + 5 }, { y: y + 1, x0: x, x1: x + 5 }];
    const op = { op: "paintObjects", params: { kind: "thorns", area, density: 0.8, seed: 1 } } as unknown as EditOp;
    const r = s.applyAll([op], "user", "group");
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/cannot be part of a group/);
  });
});
