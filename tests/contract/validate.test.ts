// Contract (PLAN §19.5, ROADMAP M2): the validation classes in the generate, export and import
// profiles; the result shape; the file-level path (re-reading the written .timber, as an import or
// the Python oracle does) agrees with the generator's own validation; emitters and blockers by
// footprint (PLAN §11.5).

import { describe, expect, it } from "vitest";
import { writeTimber, readTimber, type TimberFile } from "../../src/core/format/timber";
import { generate, validateBuilt } from "../../src/core/gen/generate";
import { toTimberFile } from "../../src/core/gen/pack";
import { mapObjects, waterModel, type MapObject } from "../../src/core/sim/model";
import { makeSpec } from "../../src/core/spec/mapspec";
import { validateMap } from "../../src/core/validate/checks";
import { basinLeak, EXTRA_BANDS } from "../../src/core/validate/playability";
import { blocks, type CheckResult } from "../../src/core/validate/report";
import type { JsonObject } from "../../src/core/format/json";

const spec = makeSpec({ seed: 4242, size: { x: 96, y: 96 } });
const r = generate(spec);
const file = () => readTimber(r.bytes);
const verdict = (c: CheckResult) => (c.applicable === false ? "na" : c.ok ? "pass" : "fail");

describe("validation profiles (PLAN §19.5)", () => {
  it("every result has the full shape", () => {
    for (const c of r.report.checks) {
      expect(typeof c.id).toBe("string");
      expect(["load", "playability", "design", "principle"]).toContain(c.class);
      expect(["error", "warning", "info"]).toContain(c.severity);
      expect(typeof c.ok).toBe("boolean");
      expect(typeof c.message).toBe("string");
    }
    const ids = r.report.checks.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ["water.settles", "water.no_flood", "water.clean_exists", "water.outflow", "water.clean_reach", "water.badwater_contained", "water.reservoir", "start.dry", "start.water", "start.badwater", "start.reach", "start.food", "start.wood", "start.ruins_clear", "plants.survive", "plants.drought", "resources.scrap", "resources.trees", "resources.bushes", "resources.mine_site", "ruins.fields", "ruins.access", "extras.placement"]) {
      expect(ids, id).toContain(id);
    }
  });

  it("re-reading the written file gives the generator's verdicts, check by check", () => {
    const again = validateMap(file(), { profile: "generate", spec: r.spec, features: r.features });
    expect(again.report.checks.map((c) => [c.id, verdict(c)])).toEqual(r.report.checks.map((c) => [c.id, verdict(c)]));
    expect(again.water!.ticks).toBe(r.built.settle.ticks);
    expect(Array.from(again.water!.depth)).toEqual(Array.from(r.built.water));
  });

  it("a playability failure blocks generate, warns in export, and is only reported on import", () => {
    // take every berry bush away: start.food fails
    const f = file();
    f.world.entities = f.world.entities.filter((e) => e.Template !== "BlueberryBush");
    const gen = validateMap(f, { profile: "generate", spec: r.spec, features: r.features }).report;
    const exp = validateMap(f, { profile: "export", spec: r.spec, features: r.features }).report;
    const imp = validateMap(f, { profile: "import" }).report;
    const food = (rep: typeof gen) => rep.checks.find((c) => c.id === "start.food")!;
    expect(food(gen).ok).toBe(false);
    expect(food(gen).severity).toBe("error");
    expect(gen.passed).toBe(false);
    expect(food(exp).severity).toBe("warning");
    expect(exp.passed).toBe(true);
    expect(food(imp).severity).toBe("warning");
    expect(imp.passed).toBe(true);
  });

  it("a load failure blocks export too; design failures are information on import", () => {
    const f = file();
    const dup = { ...f.world.entities[5], Id: String(f.world.entities[6].Id) } as JsonObject;
    f.world.entities = [...f.world.entities.slice(0, 5), dup, ...f.world.entities.slice(6)];
    const exp = validateMap(f, { profile: "export", spec: r.spec, loadOnly: true }).report;
    expect(exp.checks.find((c) => c.id === "entities.ids")!.severity).toBe("error");
    expect(exp.passed).toBe(false);
    const imp = validateMap(f, { profile: "import", loadOnly: true }).report;
    expect(imp.passed).toBe(true);
    const tall: CheckResult = { id: "terrain.max_height", class: "design", severity: "info", ok: false, message: "" };
    expect(blocks("import", tall)).toBe(false);
    expect(blocks("export", { ...tall, severity: "warning" })).toBe(false);
    expect(blocks("generate", { ...tall, severity: "error" })).toBe(true);
  });

  it("the advisory check and not-applicable checks never block", () => {
    const adv = r.report.checks.find((c) => c.id === "plants.drought")!;
    expect(adv.advisory).toBe(true);
    for (const p of ["generate", "export", "import"] as const) expect(blocks(p, { ...adv, ok: false })).toBe(false);
    // the map objects' placement check applies to a map with relics, fields and mine sites (M7), and
    // is not applicable, never blocking, on a map without them. Every generated map has a mine site
    // (Kyler, 2026-09-25), so the map without them is a generated one with its objects taken out of
    // its plan (D148: this used to ask for no mine sites)
    const ex = r.report.checks.find((c) => c.id === "extras.placement")!;
    expect(ex.applicable).not.toBe(false);
    expect(ex.ok).toBe(true);
    const none = { ...spec.settings, hazards: { ...spec.settings.hazards, thornBelts: "off" as const }, resources: { ...spec.settings.resources, relics: "off" as const, geothermal: "off" as const, mineSites: 1 } };
    const bare = generate({ ...makeSpec({ seed: 4242, size: { x: 96, y: 96 } }), settings: none });
    const noObjects = bare.features.filter((f) => f.kind !== "mapObject" || !(f.params.kind in EXTRA_BANDS));
    expect(noObjects.length).toBe(bare.features.length - 1);
    const na = validateBuilt(bare.spec, noObjects, bare.built).report.checks.find((c) => c.id === "extras.placement")!;
    expect(na.applicable).toBe(false);
    expect(na.ok).toBe(true);
    for (const p of ["generate", "export", "import"] as const) expect(blocks(p, na)).toBe(false);
    // a map with its badwater off has no basin: the containment check is not applicable there
    const dry = generate({ ...makeSpec({ seed: 4242, size: { x: 96, y: 96 } }), settings: { ...spec.settings, hazards: { ...spec.settings.hazards, badwater: "off" } } });
    const nb = dry.report.checks.find((c) => c.id === "water.badwater_contained")!;
    expect(nb.applicable).toBe(false);
    expect(nb.ok).toBe(true);
  });

  it("water.badwater_contained: a levee on the outlet holds each planned basin; a cut rim leaks (PLAN §9.5, D57)", () => {
    const basins = r.features.filter((f) => f.kind === "setPiece" && f.params.kind === "badwaterBasin");
    expect(basins.length).toBeGreaterThan(0);
    const c = r.report.checks.find((x) => x.id === "water.badwater_contained")!;
    expect(c.applicable).not.toBe(false);
    expect(c.ok).toBe(true);
    // cut a notch through one basin's rim, away from its outlet: the water rising in the basin
    // leaves by it, and the check fails
    const p = (basins[0].params as { plan: unknown }).plan as { x: number; y: number; floor: number; outlet: number[]; outletLevels: number[]; outletWidth: number };
    const W = r.built.W;
    const h = r.built.heights.slice();
    const out = new Set<number>();
    for (let k = 0; k + 1 < p.outlet.length; k += 2) out.add(p.outlet[k + 1] * W + p.outlet[k]);
    const cx = p.x + 1;
    const cy = p.y + 1;
    let cut = false;
    for (const [dx, dy] of [[0, 4], [0, -4], [4, 0], [-4, 0]]) {
      const a = (cy + dy) * W + cx + dx;
      const b = (cy + 2 * Math.sign(dy) + dy) * W + cx + dx + 2 * Math.sign(dx);
      if (cut || out.has(a) || out.has(b)) continue;
      for (let k = 4; k <= 6; k++) h[(cy + Math.sign(dy) * k) * W + cx + Math.sign(dx) * k] = p.floor;
      cut = true;
    }
    expect(cut).toBe(true);
    expect(basinLeak(p, r.built.heights, W, r.built.H)).toBeNull();
    expect(basinLeak(p, h, W, r.built.H)).not.toBeNull();
  });

  it("imports have no features: water.outflow is not applicable", () => {
    const imp = validateMap(file(), { profile: "import" }).report;
    expect(imp.checks.find((c) => c.id === "water.outflow")!.applicable).toBe(false);
    expect(r.report.checks.find((c) => c.id === "water.outflow")!.applicable).not.toBe(false);
  });

  it("the file without pre-filled water is the same map and still validates", () => {
    const empty: TimberFile = toTimberFile(r.spec, r.built, { emptyWater: true });
    const again = validateBuilt(r.spec, r.features, r.built, empty);
    expect(again.report.passed).toBe(true);
    const water = String(((empty.world.singletons.WaterMapNew as JsonObject).WaterColumns as JsonObject).Array);
    expect(water.split(" ").every((t) => t === "0")).toBe(true);
    expect(readTimber(writeTimber(empty)).world.entities.length).toBe(r.built.entities.length);
  });
});

describe("emitters and blockers by footprint (PLAN §11.5)", () => {
  const W = 20;
  const H = 20;
  const surface = new Uint8Array(W * H).fill(5);
  const obj = (template: string, x: number, y: number, orientation: MapObject["orientation"], components: JsonObject = {}): MapObject => ({
    template, x, y, z: 5, orientation, flipped: false, components,
  });
  const cells = (m: ReturnType<typeof waterModel>, k: number) => m.emitters[k].cells.map((i) => [i % W, Math.floor(i / W)]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  it("a rotated BadwaterSource emits on its rotated 3×3, S/9 each", () => {
    const m = waterModel(W, H, surface, [obj("BadwaterSource", 10, 10, "Cw90", { WaterSource: { SpecifiedStrength: 2 } })]);
    expect(cells(m, 0)).toEqual([[10, 8], [10, 9], [10, 10], [11, 8], [11, 9], [11, 10], [12, 8], [12, 9], [12, 10]]);
    expect(m.emitters[0].contamination).toBe(1);
    expect(m.emitters[0].strength).toBe(2);
  });

  it("seeps get their depth limit; aquifers, badtide drains and delayed sources are off", () => {
    const ws = (s: number, delayed = false): JsonObject => ({ WaterSource: { SpecifiedStrength: s }, ...(delayed ? { TimeActivatedComponent: { IsEnabled: true } } : {}) });
    const m = waterModel(W, H, surface, [
      obj("WaterSeep", 2, 2, "Cw0", ws(1)),
      obj("Aquifer", 6, 6, "Cw0", ws(1)),
      obj("BadtideDrain", 12, 2, "Cw0", ws(1)),
      obj("WaterSource", 15, 15, "Cw0", ws(0.5, true)),
      obj("WaterSource", 0, 7, "Cw0", ws(0.5)),
    ]);
    expect(m.emitters.map((e) => e.strength)).toEqual([1, 0, 0, 0, 0.5]);
    expect(m.emitters[0].depthLimit).toEqual({ anchor: 2 * W + 2, off: 0.8, on: 0.72 });
    expect(cells(m, 1)).toEqual([[7, 7]]); // the aquifer's centre
    expect(m.floor[2 * W + 12]).toBe(6); // the drain's back wall is a full obstacle
  });

  it("a map's objects come in file order from world.json", () => {
    const world = { entities: [
      { Id: "a", Template: "WaterSource", Components: { WaterSource: { SpecifiedStrength: 1 }, BlockObject: { Coordinates: { X: 1, Y: 2, Z: 5 } } } },
      { Id: "b", Template: "BeaverAdult", Components: {} },
      { Id: "c", Template: "Thorns", Components: { BlockObject: { Coordinates: { X: 3, Y: 4, Z: 5 }, Orientation: "Cw90" } } },
    ] as JsonObject[] };
    expect(mapObjects(world).map((o) => [o.template, o.x, o.y, o.orientation])).toEqual([["WaterSource", 1, 2, "Cw0"], ["Thorns", 3, 4, "Cw90"]]);
  });
});
