// ROADMAP M7: resources, map objects, themes II.
// - Resource areas respect moisture reach and the calibrated clustering: a forest or berry patch
//   drawn in the editor grows alive only on moist soil (and says where), ruin areas become fields
//   of the official shape (PLAN §9.7).
// - Invalid placements are shown and refused: map objects on uneven ground, in rivers, on other
//   objects or at the start, entities the game would delete on load.
// - Every new object passes the placement emulation (entities.placement, the loader's rules), on
//   edited maps and on generated maps of all six themes; the Python validator agrees (npm run
//   oracle).

import { describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import { acrossRiver, entityProblem, footprintCheck, objectGround, planArea, planEntity, planObject, planRiverBadwater } from "../../src/core/doc/placing";
import { planPiece } from "../../src/core/doc/tools";
import { footprintAt, fitProblems } from "../../src/core/features/objects";
import type { MapObjectKind, RiverFeature } from "../../src/core/features/schema";
import { generate } from "../../src/core/gen/generate";
import { decodeSpecFragment, makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
import { validateFile } from "../../src/core/validate/checks";
import { components, walkRegions } from "../../src/core/analysis/regions";
import type { BuildResult } from "../../src/core/features/build";
import { entityTiles } from "../../src/core/features/edits";
import { pathField } from "../../src/core/features/geometry";
import { objectTiles } from "../../src/core/features/objects";
import { obstacleTiles, type ObstaclePlan } from "../../src/core/features/setpieces/obstaclePayoff";
import { pumpableWithin, type DistrictPlan } from "../../src/core/features/setpieces/secondDistrict";
import { slopeHighSide } from "../../src/core/format/footprints";
import { levelRegions } from "../../src/core/math/grid";
import { WALK_BLOCKERS } from "../../src/core/validate/playability";

const uuid = (k: number) => `0b8e9a64-${String(1000 + k)}-4c2d-9e1f-2a3b4c5d6e7f`;

function session(fragment: string): MapSession {
  const d = decodeSpecFragment(fragment)!;
  const r = generate(d.spec);
  expect(r.report.passed).toBe(true);
  return MapSession.fromGenerated(r);
}

/** A tile where a single object of this kind fits, scanning from the far corner of the start. */
function spotFor(s: MapSession, kind: MapObjectKind): [number, number] {
  const g = objectGround(s);
  const { W, H } = g;
  for (let y = 4; y < H - 8; y += 2) for (let x = 4; x < W - 8; x += 2) if (!fitProblems(kind, footprintAt(kind, x, y, "Cw0"), g).length) return [x, y];
  throw new Error(`no spot for ${kind}`);
}

function loadChecks(s: MapSession) {
  return validateFile(s.exportFile(), { profile: "export", spec: s.spec, features: s.features, loadOnly: true }).checks;
}

describe("map objects placed in the editor (ROADMAP M7)", () => {
  const s = session("s=4242&t=riverValley&z=128&d=n");
  const W = 128;

  it("single objects fit on level, dry, free ground, pass the placement emulation, and say how far out they are", () => {
    let k = 0;
    for (const kind of ["mineSite", "relicSmall", "relicMedium", "relicLarge", "geothermal", "unstableCore"] as MapObjectKind[]) {
      const at = spotFor(s, kind);
      const p = planObject(s, { kind, at, orientation: "Cw90", ...(kind === "unstableCore" ? { core: { radius: 2, cycles: 6 } } : {}) }, uuid(k++));
      expect(p.ok, JSON.stringify(p)).toBe(true);
      if (!p.ok) continue;
      expect(p.report.join(" ")).toMatch(/tiles from the start/);
      const r = s.applyAll(p.ops, "user", p.label);
      expect(r.errors).toEqual([]);
    }
    const placement = loadChecks(s).find((c) => c.id === "entities.placement")!;
    expect(placement.ok, placement.message).toBe(true);
    for (const t of ["UndergroundRuins", "SmallRelic", "MediumRelic", "LargeRelic", "GeothermalField", "UnstableCore"]) expect(s.built.entities.some((e) => e.template === t && e.owner.startsWith("0b8e9a64")), t).toBe(true);
    const core = s.built.entities.find((e) => e.template === "UnstableCore" && e.owner.startsWith("0b8e9a64"))!;
    expect(core.components.UnstableCore).toEqual({ ExplosionRadius: 2 });
  });

  it("refuses a placement that does not fit, and says why", () => {
    const g = objectGround(s);
    const h = s.built.heights;
    // uneven ground: a tile beside a step
    let uneven: [number, number] | null = null;
    for (let y = 4; y < 120 && !uneven; y++) for (let x = 4; x < 120 && !uneven; x++) if (h[y * W + x] !== h[y * W + x + 3] && !g.channel![y * W + x] && !g.occupied![y * W + x]) uneven = [x, y];
    const a = planObject(s, { kind: "mineSite", at: uneven!, orientation: "Cw0" }, uuid(50));
    expect(a.ok).toBe(false);
    if (!a.ok) expect(a.errors[0]).toMatch(/not level/);
    // in a river
    const river = s.features.find((f): f is RiverFeature => f.kind === "river")!;
    const [px, py] = river.params.path[8];
    const b = planObject(s, { kind: "geothermal", at: [Math.round(px) - 1, Math.round(py) - 1], orientation: "Cw0" }, uuid(51));
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.errors[0]).toMatch(/river|water/);
    // at the start
    const st = s.built.start!;
    const c = planObject(s, { kind: "relicSmall", at: [st.x, st.y], orientation: "Cw0" }, uuid(52));
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.errors[0]).toMatch(/start|object/);
    // an entity the game would delete: on a slope, and floating off a step
    const slope = s.built.entities.find((e) => e.template === "Slope")!;
    expect(entityProblem(s, { template: "Blockage", x: slope.x, y: slope.y, orientation: "Cw0" })).toMatch(/slope/);
    const refused = s.apply({ op: "placeEntity", params: { id: "33333333-2222-4333-8444-555555555555", template: "LargeRelic", x: uneven![0], y: uneven![1], orientation: "Cw0" } });
    expect(refused.ok).toBe(false);
    expect(refused.errors.join(" ")).toMatch(/can't stand there/);
  });

  it("previews the footprint under the pointer: red with the reason where the click would be refused", () => {
    const river = s.features.find((f): f is RiverFeature => f.kind === "river")!;
    const [px, py] = river.params.path[8];
    const at: [number, number] = [Math.round(px) - 1, Math.round(py) - 1];
    const red = footprintCheck(s, { tool: "object", kind: "geothermal", at, orientation: "Cw0" });
    expect(red.tiles.length).toBe(9);
    expect(red.problem).toMatch(/river|water/);
    const refused = planObject(s, { kind: "geothermal", at, orientation: "Cw0" }, uuid(60));
    expect(refused.ok ? null : refused.errors[0]).toBe(red.problem);
    const ok = spotFor(s, "geothermal");
    const green = footprintCheck(s, { tool: "object", kind: "geothermal", at: ok, orientation: "Cw0" });
    expect(green.problem).toBeNull();
    expect(new Set(green.tiles)).toEqual(new Set(footprintAt("geothermal", ok[0], ok[1], "Cw0").map(([x, y]) => y * W + x)));
    // an entity by hand: the loader's reason, the same one placeEntity refuses with
    const slope = s.built.entities.find((e) => e.template === "Slope")!;
    const e = footprintCheck(s, { tool: "entity", template: "Blockage", x: slope.x, y: slope.y, orientation: "Cw0" });
    expect(e.tiles).toEqual([slope.y * W + slope.x]);
    expect(e.problem).toMatch(/slope/);
  });

  it("a weir and a plug close a river's channel wall to wall and hold its water", () => {
    const river = s.features.find((f): f is RiverFeature => f.kind === "river" && f.role === "river/main")!;
    const at = 30;
    const line = acrossRiver(s, river.id, at);
    expect(line.length).toBeGreaterThanOrEqual(3);
    const weir = planObject(s, { kind: "weir", river: { id: river.id, at } }, uuid(60));
    expect(weir.ok, JSON.stringify(weir)).toBe(true);
    if (weir.ok) expect(s.applyAll(weir.ops, "user", weir.label).errors).toEqual([]);
    expect(s.built.waterModel.dam).not.toBeNull();
    const plug = planObject(s, { kind: "plug", river: { id: river.id, at: at + 30 } }, uuid(61));
    expect(plug.ok, JSON.stringify(plug)).toBe(true);
    if (plug.ok) expect(s.applyAll(plug.ops, "user", plug.label).errors).toEqual([]);
    const blocks = s.built.entities.filter((e) => e.template === "Blockage" && e.owner === uuid(61));
    expect(blocks.length).toBeGreaterThanOrEqual(3);
    for (const e of blocks) expect(s.built.waterModel.floor[e.y * W + e.x]).toBe(e.z + 1);
    expect(loadChecks(s).find((c) => c.id === "entities.placement")!.ok).toBe(true);
  });

  it("a thorn belt keeps to dry ground and dries the soil under it", () => {
    const tiles: number[] = [];
    for (let y = 100; y < 104; y++) for (let x = 20; x < 60; x++) tiles.push(y * W + x);
    const p = planObject(s, { kind: "thornBelt", tiles, density: 0.6 }, uuid(70));
    expect(p.ok, JSON.stringify(p)).toBe(true);
    if (!p.ok) return;
    s.applyAll(p.ops, "user", p.label);
    const thorns = s.built.entities.filter((e) => e.template === "Thorns" && e.owner === uuid(70));
    expect(thorns.length).toBeGreaterThan(10);
    for (const e of thorns) {
      expect(s.built.water[e.y * W + e.x]).toBeLessThanOrEqual(0.05);
      expect(s.built.moisture[e.y * W + e.x]).toBe(0);
    }
  });

  it("an entity placed by hand passes the loader's rules", () => {
    const at = spotFor(s, "relicMedium");
    const p = planEntity(s, { template: "MediumRelic", x: at[0], y: at[1] + 1, orientation: "Cw0" }, "44444444-2222-4333-8444-555555555555");
    expect(p.ok, JSON.stringify(p)).toBe(true);
    if (p.ok) expect(s.applyAll(p.ops, "user", p.label).errors).toEqual([]);
    expect(loadChecks(s).find((c) => c.id === "entities.placement")!.ok).toBe(true);
  });
});

describe("resource areas respect moisture reach and the calibrated clustering (ROADMAP M7)", () => {
  const s = session("s=77&t=riverValley&z=128&d=n");
  const W = 128;
  // a big rectangle across the valley: moist ground by the river, dry ground on the terraces
  const outline: [number, number][] = [[30.5, 20.5], [70.5, 20.5], [70.5, 107.5], [30.5, 107.5]];

  it("a forest grows alive only where the soil stays moist, as its preview said", () => {
    const p = planArea(s, { kind: "forest", outline, density: 0.5, species: "Oak", life: "alive" }, uuid(1));
    expect(p.ok, JSON.stringify(p)).toBe(true);
    if (!p.ok || !p.preview) return;
    expect(p.preview.alive.length).toBeGreaterThan(20);
    expect(p.preview.bare.length).toBeGreaterThan(20);
    s.applyAll(p.ops, "user", p.label);
    const trees = s.built.entities.filter((e) => e.owner === uuid(1));
    expect(trees.length).toBe(p.preview.alive.length);
    for (const e of trees) {
      const i = e.y * W + e.x;
      expect(s.built.moisture[i]).toBeGreaterThan(0);
      expect(e.components.LivingNaturalResource).toBeUndefined();
    }
    // with dead trees on dry ground, as the official maps store them
    const q = planArea(s, { kind: "forest", outline: [[80.5, 20.5], [120.5, 20.5], [120.5, 60.5], [80.5, 60.5]], density: 0.5, species: "Pine", life: "auto" }, uuid(2));
    expect(q.ok).toBe(true);
    if (q.ok && q.preview) expect(q.preview.dead.length).toBeGreaterThan(0);
    const plants = validateFile(s.exportFile(), { profile: "export", spec: s.spec, features: s.features }).checks.find((c) => c.id === "plants.survive")!;
    expect(plants.ok, plants.message).toBe(true);
  });

  it("berry bushes only on moist ground", () => {
    const p = planArea(s, { kind: "berryPatch", outline, density: 0.4 }, uuid(3));
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    s.applyAll(p.ops, "user", p.label);
    for (const e of s.built.entities.filter((x) => x.owner === uuid(3))) expect(s.built.moisture[e.y * W + e.x]).toBeGreaterThan(0);
  });

  it("ruins grow as fields of the official shape: one level each, 10+ columns, holes and clumps", () => {
    const p = planArea(s, { kind: "ruinField", outline: [[80.5, 64.5], [124.5, 64.5], [124.5, 110.5], [80.5, 110.5]], density: 1 }, uuid(4));
    expect(p.ok, JSON.stringify(p)).toBe(true);
    if (!p.ok) return;
    expect(p.ops.length).toBeGreaterThanOrEqual(1);
    s.applyAll(p.ops, "user", p.label);
    const ids = new Set(p.ops.map((o) => (o.op === "addFeature" ? o.params.feature.id : "")));
    for (const id of ids) {
      const cols = s.built.entities.filter((e) => e.owner === id);
      expect(cols.length).toBeGreaterThanOrEqual(10);
      // one level, and one blob of touching columns
      expect(new Set(cols.map((e) => e.z)).size).toBe(1);
      const m = new Uint8Array(W * W);
      for (const e of cols) m[e.y * W + e.x] = 1;
      expect(components(m, W, W, true).sizes.filter((n) => n >= 10).reduce((a, n) => a + n, 0) / cols.length).toBeGreaterThanOrEqual(0.8);
      // it fills its box roughly as official fields do (0.56 median)
      const xs = cols.map((e) => e.x);
      const ys = cols.map((e) => e.y);
      const box = (Math.max(...xs) - Math.min(...xs) + 1) * (Math.max(...ys) - Math.min(...ys) + 1);
      expect(cols.length / box).toBeGreaterThan(0.3);
      expect(cols.length / box).toBeLessThan(0.95);
    }
    const checks = validateFile(s.exportFile(), { profile: "export", spec: s.spec, features: s.features }).checks;
    for (const id of ["ruins.fields", "ruins.access"]) expect(checks.find((c) => c.id === id)!.ok, id).toBe(true);
  });
});

describe("spillways and badwater rivers in the editor (ROADMAP M7)", () => {
  it("a plugged spillway drains a lake only over its plug", () => {
    const s = session("s=5&t=lakeBasin&z=96&d=n");
    const lake = s.features.find((f) => f.kind === "lake" && f.role === "lake/central")!;
    if (lake.kind !== "lake") return;
    const [x, y] = lake.params.outline[8];
    const p = planPiece(s, "plugSpillway", { lake: lake.id, at: [x, y], width: 3 }, uuid(80));
    expect(p.ok, JSON.stringify(p)).toBe(true);
    if (!p.ok) return;
    expect(p.report.join(" ")).toMatch(/demolishing the plug lowers the lake/);
    s.applyAll(p.ops, "user", p.label);
    const plug = s.built.entities.filter((e) => e.template === "Blockage" && e.owner === uuid(80));
    expect(plug.length).toBeGreaterThanOrEqual(2);
    expect(loadChecks(s).find((c) => c.id === "entities.placement")!.ok).toBe(true);
    // the lake still stands at its sill
    const W = 96;
    let deep = 0;
    for (let i = 0; i < W * W; i++) if (s.built.heights[i] <= lake.params.outlet.sill - 1 && s.built.water[i] > 0.5) deep++;
    expect(deep).toBeGreaterThan(100);
  });

  it("a river made badwater gets BadwaterSources on its mouth and carries badwater", () => {
    const s = session("s=4242&t=riverValley&z=128&d=n");
    const river = s.features.find((f): f is RiverFeature => f.kind === "river" && f.role === "river/main")!;
    const p = planRiverBadwater(s, river.id, true);
    expect(p.ok, JSON.stringify(p)).toBe(true);
    if (!p.ok) return;
    expect(p.report.join(" ")).toMatch(/trees and bushes there die/);
    // the start drinks from its main river: a warning before the change is made
    expect(p.report.join(" ")).toMatch(/start is beside this river/);
    s.applyAll(p.ops, "user", p.label);
    expect(s.built.entities.some((e) => e.template === "BadwaterSource" && e.owner === river.id)).toBe(true);
    const W = 128;
    let bad = 0;
    for (let i = 0; i < W * W; i++) if (s.built.channel[i] && s.built.contamination[i] > 0.5) bad++;
    expect(bad).toBeGreaterThan(50);
    expect(loadChecks(s).find((c) => c.id === "entities.placement")!.ok).toBe(true);
  });
});

describe("generated maps: every new object passes the placement emulation (ROADMAP M7)", () => {
  const themes: ThemeId[] = ["riverValley", "canyon", "highlands", "lakeBasin", "delta", "islands"];
  it.each(themes)("%s, every map object on, 96²", (theme) => {
    // seed 15: a seed on which every theme places every kind of object (a thorn belt is left out
    // where it would cut the colony's land in two; generator 0.6.0 moved the start, D85, and 0.6.2
    // the objects and resources)
    const spec = makeSpec({ seed: 15, size: { x: 96, y: 96 }, theme });
    spec.settings.hazards.thornBelts = "some";
    spec.settings.hazards.unstableCores = "on";
    spec.settings.resources.mineSites = 3;
    const r = generate(spec);
    expect(r.report.passed, r.report.checks.filter((c) => !c.ok && !c.advisory).map((c) => c.id).join(", ")).toBe(true);
    for (const id of ["entities.placement", "entities.components", "extras.placement"]) {
      const c = r.report.checks.find((x) => x.id === id)!;
      expect(c.ok, `${id}: ${c.message}`).toBe(true);
    }
    const templates = new Set(r.built.entities.map((e) => e.template));
    for (const t of ["UndergroundRuins", "GeothermalField", "UnstableCore", "Thorns"]) expect(templates.has(t), t).toBe(true);
    expect(["SmallRelic", "MediumRelic", "LargeRelic"].some((t) => templates.has(t))).toBe(true);
  });
});

/** Walk regions from the start: same level, the built slopes, round the objects that block walking. */
function walkFromStart(b: BuildResult): { labels: Int32Array; root: number } {
  const { W, H } = b;
  const blocked = new Uint8Array(W * H);
  const links: [number, number][] = [];
  for (const e of b.entities) {
    if (WALK_BLOCKERS.has(e.template)) for (const [x, y] of entityTiles(e)) blocked[y * W + x] = 1;
    if (e.template !== "Slope") continue;
    const [dx, dy] = slopeHighSide(e.orientation);
    links.push([e.y * W + e.x, (e.y + dy) * W + e.x + dx]);
  }
  const labels = walkRegions(b.heights, W, H, blocked, links);
  return { labels, root: labels[b.start!.y * W + b.start!.x] };
}

describe("the generator's M7 set pieces keep their rules (ROADMAP M7)", () => {
  it("a second district's site: 60–120 tiles out, 600+ tiles of level land, its own water, joined by slopes, with trees and bushes", () => {
    let sites = 0;
    // maps with a site at generator 0.6.0 (D77: a site only where one fits; D85 moved the start)
    for (const [theme, seed] of [["delta", 1], ["delta", 2], ["lakeBasin", 3], ["riverValley", 2]] as [ThemeId, number][]) {
      const r = generate(makeSpec({ seed, size: { x: 128, y: 128 }, theme }));
      expect(r.report.passed).toBe(true);
      const f = r.features.find((g) => g.kind === "setPiece" && g.params.kind === "secondDistrict");
      if (!f || f.kind !== "setPiece") continue;
      sites++;
      const b = r.built;
      const p = f.params.plan as unknown as DistrictPlan;
      const st = b.start!;
      const d = Math.sqrt((p.x - st.x) * (p.x - st.x) + (p.y - st.y) * (p.y - st.y));
      expect(d, `${theme} ${seed}`).toBeGreaterThanOrEqual(60);
      expect(d).toBeLessThanOrEqual(120);
      const reg = levelRegions(b.heights, b.W, b.H);
      expect(reg.size[reg.labels[p.y * b.W + p.x]]).toBeGreaterThanOrEqual(600);
      expect(pumpableWithin({ W: b.W, H: b.H, heights: b.heights, water: b.water, contamination: b.contamination }, p.x, p.y, b.heights[p.y * b.W + p.x], 16)).toBeLessThanOrEqual(16);
      const walk = walkFromStart(b);
      expect(walk.labels[p.y * b.W + p.x], `${theme} ${seed}: the site is joined to the start`).toBe(walk.root);
      let trees = 0;
      let bushes = 0;
      for (const e of b.entities) {
        if ((e.x - p.x) * (e.x - p.x) + (e.y - p.y) * (e.y - p.y) > 400 || "LivingNaturalResource" in e.components) continue;
        if (["Pine", "Birch", "Oak", "Succulent"].includes(e.template)) trees++;
        if (e.template === "BlueberryBush") bushes++;
      }
      expect(trees, `${theme} ${seed}: living trees within 20 of the site`).toBeGreaterThanOrEqual(40);
      expect(bushes, `${theme} ${seed}: living bushes within 20 of the site`).toBeGreaterThanOrEqual(20);
    }
    expect(sites).toBeGreaterThanOrEqual(3);
  });

  it("ruins on a plateau: out of reach without stairs, and one flight of stairs reaches them", () => {
    let seen = 0;
    for (const seed of [1, 3, 4]) {
      const r = generate(makeSpec({ seed, size: { x: 128, y: 128 }, theme: "riverValley" }));
      const f = r.features.find((g) => g.kind === "setPiece" && g.params.kind === "obstaclePayoff");
      if (!f || f.kind !== "setPiece") continue;
      seen++;
      const b = r.built;
      const p = f.params.plan as unknown as ObstaclePlan;
      const disc = new Set(obstacleTiles(p, b.W, b.H));
      const walk = walkFromStart(b);
      expect([...disc].some((i) => walk.labels[i] === walk.root), `seed ${seed}: the plateau is reached without stairs`).toBe(false);
      // a tile the colony walks on beside the plateau, two levels below its top: one flight of stairs
      let stair = false;
      for (const i of disc) {
        const x = i % b.W;
        const y = (i - x) / b.W;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const j = (y + dy) * b.W + x + dx;
          if (!disc.has(j) && walk.labels[j] === walk.root && b.heights[j] === p.top - 2) stair = true;
        }
      }
      expect(stair, `seed ${seed}: one flight of stairs reaches the plateau`).toBe(true);
      expect(b.entities.some((e) => e.template.startsWith("RuinColumn") && disc.has(e.y * b.W + e.x))).toBe(true);
    }
    expect(seen).toBeGreaterThanOrEqual(2);
  });

  it("a generated weir holds its river about 0.65 above the bed, inside the channel", () => {
    let seen = 0;
    for (const [theme, seed] of [["lakeBasin", 1], ["lakeBasin", 2], ["lakeBasin", 3], ["lakeBasin", 4], ["highlands", 1], ["highlands", 2], ["highlands", 3]] as [ThemeId, number][]) {
      const r = generate(makeSpec({ seed, size: { x: 96, y: 96 }, theme }));
      const w = r.features.find((g) => g.kind === "mapObject" && g.params.kind === "weir");
      if (!w || w.kind !== "mapObject") continue;
      seen++;
      const b = r.built;
      const tiles = objectTiles(w, b.W, b.H).map(([x, y]) => y * b.W + x);
      const river = r.features
        .filter((g) => g.kind === "river")
        .map((g) => ({ g, field: pathField((g.params as { path: [number, number][] }).path, b.W, b.H) }))
        .reduce((a, c) => (tiles.reduce((t, i) => t + c.field.d[i], 0) < tiles.reduce((t, i) => t + a.field.d[i], 0) ? c : a));
      const at = tiles.reduce((t, i) => t + river.field.s[i], 0) / tiles.length;
      let depth = 0;
      let n = 0;
      for (let i = 0; i < b.W * b.H; i++) {
        if (!b.channel[i] || river.field.s[i] < at - 3 || river.field.s[i] > at - 1 || tiles.includes(i)) continue;
        depth += b.water[i];
        n++;
      }
      expect(n).toBeGreaterThan(0);
      expect(depth / n, `${theme} ${seed}: water just upstream of the weir`).toBeGreaterThan(0.6);
      for (const id of ["entities.placement", "water.settles"]) expect(r.report.checks.find((c) => c.id === id)!.ok, id).toBe(true);
    }
    expect(seen).toBeGreaterThanOrEqual(1);
  });
});
