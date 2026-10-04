// ROADMAP M7: resources, map objects, themes II.
// - Invalid placements are shown and refused: objects the game would delete on load.
// - Every new object passes the placement emulation (entities.placement, the loader's rules), on
//   edited maps and on generated maps of all six themes; the Python validator agrees (npm run
//   oracle).

import { describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import { footprintCheck, planEntity } from "../../src/core/doc/placing";
import { generate } from "../../src/core/gen/generate";
import { decodeSpecFragment, makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
import { validateFile } from "../../src/core/validate/checks";
import { walkRegions } from "../../src/core/analysis/regions";
import { walkWorld } from "../../src/core/analysis/walk";
import type { BuildResult } from "../../src/core/features/build";
import { pathField } from "../../src/core/features/geometry";
import { objectTiles } from "../../src/core/features/objects";
import { obstacleTiles, type ObstaclePlan } from "../../src/core/features/setpieces/obstaclePayoff";
import { pumpableWithin, type DistrictPlan } from "../../src/core/features/setpieces/secondDistrict";
import { levelRegions } from "../../src/core/math/grid";

const uuid = (k: number) => `0b8e9a64-${String(1000 + k)}-4c2d-9e1f-2a3b4c5d6e7f`;

function session(fragment: string): MapSession {
  const d = decodeSpecFragment(fragment)!;
  const r = generate(d.spec);
  expect(r.report.passed).toBe(true);
  return MapSession.fromGenerated(r);
}

/** A tile where an object from the shelf stands as it is, without levelling (its footprint check
 *  green, on level dry ground), scanning from the far corner of the start (every other row, from
 *  row 4 + `row`). */
function spotFor(s: MapSession, template: string, row = 0): [number, number] {
  const { x: W, y: H } = s.size;
  for (let y = 4 + row; y < H - 8; y += 2)
    for (let x = 4; x < W - 8; x += 2) {
      const f = footprintCheck(s, { template, x, y, orientation: "Cw0" });
      if (!f.problem && f.tiles.every((i) => s.built.heights[i] === s.built.heights[f.tiles[0]] && !s.built.water[i])) return [x, y];
    }
  throw new Error(`no spot for ${template}`);
}

function loadChecks(s: MapSession) {
  return validateFile(s.exportFile(), { profile: "export", spec: s.spec, features: s.features, loadOnly: true }).checks;
}

describe("objects placed from the shelf (ROADMAP M7)", () => {
  const s = session("s=4242&t=riverValley&z=128&d=n");
  const W = 128;

  it("previews the footprint under the pointer: red with the reason where the click would be refused", () => {
    // on a slope: the loader's reason, the same one the placement refuses with
    const slope = s.built.entities.find((e) => e.template === "Slope")!;
    const e = footprintCheck(s, { template: "Blockage", x: slope.x, y: slope.y, orientation: "Cw0" });
    expect(e.tiles).toEqual([slope.y * W + slope.x]);
    expect(e.problem).toMatch(/slope/);
    const refused = planEntity(s, { template: "Blockage", x: slope.x, y: slope.y, orientation: "Cw0" }, uuid(60));
    expect(refused.ok ? null : refused.errors[0]).toBe(e.problem);
    const ok = spotFor(s, "GeothermalField");
    const green = footprintCheck(s, { template: "GeothermalField", x: ok[0], y: ok[1], orientation: "Cw0" });
    expect(green.problem).toBeNull();
    expect(green.tiles.length).toBe(9);
  });

  it("an entity placed by hand passes the loader's rules", () => {
    // off the scan's even rows
    const at = spotFor(s, "MediumRelic", 1);
    const p = planEntity(s, { template: "MediumRelic", x: at[0], y: at[1], orientation: "Cw0" }, "44444444-2222-4333-8444-555555555555");
    expect(p.ok, JSON.stringify(p)).toBe(true);
    if (p.ok) expect(s.applyAll(p.ops, "user", p.label).errors).toEqual([]);
    expect(loadChecks(s).find((c) => c.id === "entities.placement")!.ok).toBe(true);
  });
});

describe("generated maps: every new object passes the placement emulation (ROADMAP M7)", () => {
  const themes: ThemeId[] = ["riverValley", "canyon", "highlands", "lakeBasin", "delta", "islands"];
  // seed 3: a seed on which every theme places every kind of object (a thorn belt is left out where it
  // would cut the colony's land in two; seed 1 until 0.8.0, whose Delta had no room for one, then seed
  // 2, whose Lake Basin has none on D333's maps, D148)
  const everyObject = (theme: ThemeId) => {
    const spec = makeSpec({ seed: 3, size: { x: 96, y: 96 }, theme });
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
  };
  it.each(themes.filter((t) => t !== "canyon"))("%s, every map object on, 96²", (theme) => everyObject(theme));
  // An expected failure, kept on the seed that caught it (Kyler, 2026-10-02): with every object on and
  // three mine sites, M9b's Canyon 96² seed 3 finds no start on its shown land (one map of 60 such);
  // M9b's work on starts that run out on a shown land. When it passes, `fails` comes off.
  it.fails("canyon, every map object on, 96²: no start on the shown land with three mine sites", () => everyObject("canyon"));
});

/** Walk regions from the start: same level, the built slopes, round the objects that block walking. */
function walkFromStart(b: BuildResult): { labels: Int32Array; root: number } {
  const { W, H } = b;
  const { blocked, links } = walkWorld(b.entities, W, H);
  const labels = walkRegions(b.heights, W, H, blocked, links);
  return { labels, root: labels[b.start!.y * W + b.start!.x] };
}

describe("the generator's M7 set pieces keep their rules (ROADMAP M7)", () => {
  it("a second district's site: 60–120 tiles out, 600+ tiles of level land, its own water, joined by slopes, with trees and bushes", () => {
    let sites = 0;
    // maps with a site at generator 0.8.0 (D77: a site only where one fits; re-seeded for M9b's
    // maps, for batch 5's, for D333's, whose check walks round the objects that block the way, and
    // for D348–D360's, and for M9b's small starts and speed rounds, which left canyon 3 without a site;
    // Islands 3 for 2 since Islands' second shape round, D417, D429, left seed 2 without one, D148)
    for (const [theme, seed] of [["islands", 3], ["riverValley", 3], ["canyon", 4], ["riverValley", 4]] as [ThemeId, number][]) {
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
    expect(sites).toBe(4);
  });

  it("ruins on a rise: out of reach without stairs, one flight of stairs reaches them, and the rise is the land's own", () => {
    // nothing is stamped (M9a): the generator finds a rise the land already holds, on maps that
    // have one (generator 0.8.0; re-seeded for M9b's maps, for batch 5's, for D333's and for
    // D348–D360's, and for M9b's small starts and speed rounds, which left islands 1 and 4, highlands 4 and any 6 without a rise, D148)
    let seen = 0;
    for (const [theme, seed] of [["highlands", 2], ["highlands", 7], ["riverValley", 2], ["canyon", 3]] as [ThemeId, number][]) {
      const r = generate(makeSpec({ seed, size: { x: 128, y: 128 }, theme }));
      const f = r.features.find((g) => g.kind === "setPiece" && g.params.kind === "obstaclePayoff");
      if (!f || f.kind !== "setPiece") continue;
      seen++;
      const b = r.built;
      const p = f.params.plan as unknown as ObstaclePlan;
      const disc = new Set(obstacleTiles(p, b.W, b.H));
      const walk = walkFromStart(b);
      expect([...disc].some((i) => walk.labels[i] === walk.root), `${theme} ${seed}: the rise is reached without stairs`).toBe(false);
      // the field holds the rise: the piece is read back and cuts nothing
      expect(r.field?.contains).toContain(f.id);
      expect(p.rise === 1 || p.rise === 2).toBe(true);
      // a tile the colony walks on beside the rise, its rise below its top: one flight of stairs
      let stair = false;
      for (const i of disc) {
        const x = i % b.W;
        const y = (i - x) / b.W;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const j = (y + dy) * b.W + x + dx;
          if (!disc.has(j) && walk.labels[j] === walk.root && b.heights[j] === p.top - p.rise) stair = true;
        }
      }
      expect(stair, `${theme} ${seed}: one flight of stairs reaches the rise`).toBe(true);
      expect(b.entities.some((e) => e.template.startsWith("RuinColumn") && disc.has(e.y * b.W + e.x))).toBe(true);
      for (const i of disc) expect(b.heights[i]).toBe(p.top);
    }
    expect(seen).toBe(4);
  });

  it("a generated weir holds its river about 0.65 above the bed, inside the channel", () => {
    let seen = 0;
    // maps with a weir at generator 0.8.0 (half the maps try one, where a river's channel takes it;
    // re-seeded for M9b's maps, for batch 5's, for D333's and for M9b's small starts and speed rounds, which left canyon 10 and highlands 2 without a weir, D148;
    // canyon 3 for canyon 1, whose river after D447's bank rule takes no weir)
    for (const [theme, seed] of [["canyon", 6], ["canyon", 7], ["canyon", 3], ["canyon", 16], ["highlands", 1]] as [ThemeId, number][]) {
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
        if (!b.channel[i] || river.field.d[i] > 6 || river.field.s[i] < at - 3 || river.field.s[i] > at - 1 || tiles.includes(i)) continue;
        depth += b.water[i];
        n++;
      }
      expect(n).toBeGreaterThan(0);
      expect(depth / n, `${theme} ${seed}: water just upstream of the weir`).toBeGreaterThan(0.6);
      for (const id of ["entities.placement", "water.settles"]) expect(r.report.checks.find((c) => c.id === id)!.ok, id).toBe(true);
    }
    expect(seen).toBe(5);
  });
});
