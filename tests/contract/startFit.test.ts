// The start's one fit rule (PLAN §20 D342): edge, river, water and every other object's whole footprint stop the
// district center; plants and ruins of a generated map make room for it. Beyond the refusals, `startFitWarnings` says
// what the checks would flag with it there (the generation's objects out of their distance band from the start).
// The core's `startProblem`, the move operation (`planStart`) and the page's preview share the rule, and the checks
// (`entities.placement`, `start.clear`, `extras.placement`) agree with it on a generated map.

import { describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import { moveStartNear, startGroundOf, startMiddle, startProblem } from "../../src/core/doc/start";
import { makesRoomForStart, startFitProblem, startFitWarnings, takenTiles, type StartFitGround } from "../../src/core/doc/startFit";
import { moveEdit, planStart } from "../../src/core/doc/tools";
import { objectTiles } from "../../src/core/features/objects";
import type { MapObjectFeature, StartFeature } from "../../src/core/features/schema";
import { entityTiles } from "../../src/core/features/edits";
import { footprintTiles } from "../../src/core/format/footprints";
import { writeTimber } from "../../src/core/format/timber";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";

const W = 20;
const ground = (over: Partial<StartFitGround> = {}): StartFitGround => ({ W, H: W, river: () => false, depth: () => 0, taken: () => false, ...over });

describe("startFitProblem", () => {
  it("fits on clear ground and refuses the edge, a river, water and an object on any of its tiles, the door too", () => {
    expect(startFitProblem(ground(), 10, 10, [11, 8])).toBeNull();
    expect(startFitProblem(ground(), 1, 10, [2, 8])).toBe("too close to the map edge");
    expect(startFitProblem(ground({ river: (i) => i === 9 * W + 9 }), 10, 10, [11, 8])).toBe("in a river");
    expect(startFitProblem(ground({ depth: (i) => (i === 11 * W + 11 ? 0.5 : 0) }), 10, 10, [11, 8])).toBe("under water");
    // (a corner of the 3×3 and the door tile each)
    expect(startFitProblem(ground({ taken: (i) => i === 11 * W + 11 }), 10, 10, [11, 8])).toBe("on an object");
    expect(startFitProblem(ground({ taken: (i) => i === 8 * W + 11 }), 10, 10, [11, 8])).toBe("on an object");
  });

  it("makes room only for a generated plant or ruin, and the start itself", () => {
    expect(makesRoomForStart("Pine", false)).toBe(true);
    expect(makesRoomForStart("Pine", true)).toBe(false);
    expect(makesRoomForStart("GeothermalField", false)).toBe(false);
    expect(makesRoomForStart("StartingLocation", true)).toBe(true);
  });
});

describe("takenTiles", () => {
  it("covers every tile of an object's footprint, not only the tile it is anchored on (a geothermal field, a mine site), but for plants a generated map made room for and the start's own feature", () => {
    const o = (template: string, extra: object = {}) => ({ template, tiles: () => footprintTiles(template, { template, x: 30, y: 30, z: 0, orientation: "Cw0", flipped: false }), ...extra });
    for (const template of ["GeothermalField", "UndergroundRuins"]) {
      const tiles = footprintTiles(template, { template, x: 30, y: 30, z: 0, orientation: "Cw0", flipped: false });
      expect(tiles.length, template).toBeGreaterThan(1);
      const taken = takenTiles(64, 64, [o(template)], null);
      for (const [x, y] of tiles) expect(taken[y * 64 + x], `${template} at ${x},${y}`).toBe(1);
      // the start on any of them is refused
      const g: StartFitGround = { W: 64, H: 64, river: () => false, depth: () => 0, taken: (i) => !!taken[i] };
      for (const [x, y] of tiles) expect(startFitProblem(g, x, y, [x, y - 2]), `${template} at ${x},${y}`).toBe("on an object");
    }
    expect(takenTiles(64, 64, [o("Pine")], null).some(Boolean)).toBe(false);
    expect(takenTiles(64, 64, [o("Pine", { raw: {} })], null).some(Boolean)).toBe(true);
    expect(takenTiles(64, 64, [o("GeothermalField", { owner: "start-feature" })], "start-feature").some(Boolean)).toBe(false);
  });
});

describe("startFitWarnings", () => {
  it("names a generated object out of its band, in the checks' own words and distance; none inside it", () => {
    const W = 256;
    const tiles = [[100, 100], [101, 100], [100, 101], [101, 101]] as const;
    const extras = [{ kind: "geothermal" as const, tiles }];
    // the start's 3×3 at (90, 100) ends at x = 91, the field starts at x = 100: 9 tiles
    expect(startFitWarnings(extras, W, W, 90, 100)).toEqual(["Geothermal field 9 tiles from the start, wanted 30–120"]);
    expect(startFitWarnings(extras, W, W, 60, 100)).toEqual([]);
    expect(startFitWarnings(extras, W, W, 254, 100)[0]).toMatch(/^Geothermal field 1\d\d tiles from the start, wanted 30–120$/);
    // a smaller map scales the scaled bands (side ÷ 128)
    expect(startFitWarnings([{ kind: "geothermal", tiles: [[10, 30]] }], 64, 64, 20, 30)).toEqual(["Geothermal field 9 tiles from the start, wanted 15–60"]);
  });
});

describe("an imported map's start", () => {
  it("is refused on a geothermal field, a mine site, a relic or thorns, though every imported object is owned by \"import\" (the start is skipped by its template, not its owner)", () => {
    const g = generate(makeSpec({ seed: 3, theme: "highlands", size: { x: 128, y: 128 } }));
    const s = MapSession.importMap(writeTimber(g.file), "valley.timber");
    const start = s.built.entities.find((e) => e.template === "StartingLocation")!;
    expect(start.owner).toBe("import");
    const objects = s.built.entities.filter((e) => /^(GeothermalField|UndergroundRuins|SmallRelic|MediumRelic|Thorns)$/.test(e.template));
    expect(objects.length).toBeGreaterThan(0);
    let refused = 0;
    for (const e of objects) {
      const [x, y] = entityTiles(e)[0];
      if (x < 3 || y < 3 || x > 124 || y > 124) continue;
      const plan = planStart(s, x, y, undefined, () => "x");
      expect(plan.ok, `${e.template} at ${x},${y}`).toBe(false);
      refused++;
    }
    expect(refused).toBeGreaterThan(0);
    // and the search for the nearest good spot never lands on one
    const at = startMiddle(s)!;
    const ops = moveStartNear(s, at[0], at[1]);
    if (ops) {
      const move = ops.find((o) => o.op === "moveEntity") as { params: { x: number; y: number } };
      const ground = startGroundOf(s.built, s.features, null);
      expect(startProblem(s.built, move.params.x + 1, move.params.y + 1, start.orientation, true, null, null, ground)).toBeNull();
    }
  });
});

describe("the fit rule and the checks agree on a generated map", () => {
  const r = generate(makeSpec({ seed: 3, theme: "highlands", size: { x: 128, y: 128 } }));
  const objects = r.features.filter((f): f is MapObjectFeature => f.kind === "mapObject" && f.origin === "generated" && ["geothermal", "mineSite", "relicSmall", "relicMedium"].includes(f.params.kind));
  const fresh = () => MapSession.fromGenerated(r, r.file);

  it("a start on an object's footprint is refused and the checks flag it; one the rule warns about is flagged by extras.placement; one it accepts raises neither", () => {
    expect(objects.length).toBeGreaterThan(0);
    const base = fresh();
    const feat = base.features.find((f): f is StartFeature => f.kind === "start")!;
    const ground = startGroundOf(base.built, base.features, feat.id);
    const o = feat.params.orientation;
    const { x: W, y: H } = base.size;
    const verdict = (x: number, y: number) => {
      const problem = startProblem(base.built, x, y, o, false, feat.id, null, ground, false);
      return problem ? ("on" as const) : startProblem(base.built, x, y, o, false, feat.id, null, ground, true) ? ("warn" as const) : ("clear" as const);
    };
    // spots on, beside and a few tiles from each object, and where the start stands now
    const tried: { x: number; y: number; kind: "on" | "warn" | "clear" }[] = [];
    const seen = { on: 0, warn: 0, clear: 0 };
    const cap = { on: 2, warn: 3, clear: 2 };
    const now = startMiddle(base)!;
    const spots: [number, number][] = [[now[0], now[1]]];
    for (const f of objects) {
      const tiles = objectTiles(f, W, H);
      const [cx, cy] = tiles[Math.floor(tiles.length / 2)];
      for (const [dx, dy] of [[0, 0], [3, 0], [-3, 0], [0, 4], [0, -4], [8, 0], [-8, 0], [0, 12]]) spots.push([cx + dx, cy + dy]);
    }
    for (const [x, y] of spots) {
      if (x < 3 || y < 3 || x > W - 4 || y > H - 4) continue;
      const kind = verdict(x, y);
      const hard = startProblem(base.built, x, y, o, false, feat.id, null, ground, false);
      // (only an object's footprint is tried as a refusal: the water and the river have their own tests)
      if (hard && hard !== "on an object") continue;
      if (seen[kind] < cap[kind]) {
        seen[kind]++;
        tried.push({ x, y, kind });
      }
    }
    expect(seen.on).toBeGreaterThan(0);
    expect(seen.warn).toBeGreaterThan(0);
    expect(seen.clear).toBeGreaterThan(0);
    const checksOf = (s: MapSession) => Object.fromEntries(s.validate().report.checks.map((c) => [c.id, c]));
    for (const t of tried) {
      const s = fresh();
      const plan = planStart(s, t.x, t.y, undefined, () => "x");
      if (t.kind === "on") {
        // the operation refuses it, and the checks flag it where it is forced
        expect(plan.ok, `on an object at ${t.x},${t.y}`).toBe(false);
        const at = startMiddle(s)!;
        const forced = moveEdit(s, feat.id, t.x - at[0], t.y - at[1]);
        expect(forced.ok).toBe(true);
        if (!forced.ok) continue;
        expect(s.applyAll(forced.ops, "user", "forced").ok).toBe(true);
        expect(checksOf(s)["entities.placement"]?.ok, `entities.placement at ${t.x},${t.y}`).toBe(false);
        continue;
      }
      expect(plan.ok, `${t.kind} at ${t.x},${t.y}`).toBe(true);
      if (!plan.ok) continue;
      expect(s.applyAll(plan.ops, "user", plan.label).ok).toBe(true);
      expect(startMiddle(s)).toEqual([t.x, t.y]);
      const checks = checksOf(s);
      expect(checks["entities.placement"]?.ok && checks["start.clear"]?.ok, `entities.placement and start.clear at ${t.x},${t.y}`).toBe(true);
      expect(checks["extras.placement"]?.ok, `extras.placement at ${t.x},${t.y} (${t.kind})`).toBe(t.kind === "clear");
    }
  });

  it("the start's own fix never moves it to a spot the checks would flag for the generation's objects", () => {
    const s = fresh();
    const at = startMiddle(s)!;
    // (from beside a mine site, where the nearest good spot is close to an object with a band)
    const f = objects.find((g) => g.params.kind === "mineSite")!;
    const [fx, fy] = objectTiles(f, s.size.x, s.size.y)[0];
    for (const from of [at, [fx, fy] as [number, number]]) {
      const ops = moveStartNear(s, from[0], from[1]);
      if (!ops) continue;
      const move = ops.find((o) => o.op === "updateFeature") as { params: { patch: { params?: { position?: [number, number] } } } };
      const pos = move.params.patch.params!.position!;
      const feat = s.features.find((g): g is StartFeature => g.kind === "start")!;
      expect(startProblem(s.built, pos[0], pos[1], feat.params.orientation, false, feat.id, null, startGroundOf(s.built, s.features, feat.id), true)).toBeNull();
    }
  });
});

describe("an imported map", () => {
  it("refuses the start over another object, though every imported object is owned by 'import'", () => {
    const r = generate(makeSpec({ seed: 3, theme: "highlands", size: { x: 128, y: 128 } }));
    const imp = MapSession.importMap(writeTimber(r.file), "valley.timber");
    expect(imp.features.some((f) => f.kind === "start")).toBe(false);
    const own = imp.built.entities.find((e) => e.template === "StartingLocation")!;
    expect(own.owner).toBe("import");
    const refused = imp.built.entities
      .filter((e) => e.template !== "StartingLocation" && e.x > 4 && e.y > 4 && e.x < 123 && e.y < 123)
      .filter((e) => (planStart(imp, e.x, e.y, undefined, () => "x") as { errors?: string[] }).errors?.[0]?.endsWith("on an object"));
    expect(refused.length).toBeGreaterThan(0);
  });
});
