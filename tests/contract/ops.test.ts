// The operations engine (EDITOR_PLAN §3, §9 "Unit"): every operation applies and undoes, invalid
// ones are rejected with reasons and change nothing, validation fixes are operations, orphaned
// edits are detected and reported, and a rebuild touches only the area an edit affects.

import { createHash } from "node:crypto";
import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";
import opsSchema from "../../src/core/doc/ops.schema.json" with { type: "json" };
import { checkSchema } from "../../src/core/spec/schema";
import { MapSession } from "../../src/core/doc/session";
import { entityProblem } from "../../src/core/doc/placing";
import type { EditOp } from "../../src/core/doc/ops";
import type { ForestFeature, SetPieceFeature } from "../../src/core/features/schema";
import { generate } from "../../src/core/gen/generate";
import { runsToTiles, tilesToRuns } from "../../src/core/math/grid";
import { makeSpec } from "../../src/core/spec/mapspec";
import { stringify } from "../../src/core/format/json";
import type { FixOp } from "../../src/core/validate/report";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const r = generate(makeSpec({ seed: 77, size: { x: 96, y: 96 } }));
const W = 96;
const fresh = () => MapSession.fromGenerated(r);
const rectRuns = (x0: number, y0: number, x1: number, y1: number) => {
  const t: number[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) t.push(y * W + x);
  return tilesToRuns(t, W);
};
const USER = "5e1c2a3b-4d5e-4f60-8a7b-8c9d0e1f2a3b";

describe("every operation applies and undoes", () => {
  const forest = r.features.find((f): f is ForestFeature => f.kind === "forest")!;
  const tree = r.built.entities.find((e) => e.template === "Pine")!;
  const slope = r.built.entities.find((e) => e.template === "Slope")!;
  // a tile near the south-west corner where the game keeps the moved tree (placeEntity and
  // moveEntity refuse what its loader would delete)
  const to = ((): [number, number] => {
    const s0 = fresh();
    for (let y = 2; y < 30; y++) for (let x = 2; x < 30; x++) if (!entityProblem(s0, { template: tree.template, x, y, orientation: tree.orientation }, tree.id)) return [x, y];
    throw new Error("no free tile for the tree");
  })();
  const cases: [string, EditOp, (s: MapSession) => void][] = [
    ["addFeature", { op: "addFeature", params: { feature: { id: USER, kind: "landform", origin: "user", locked: false, params: { kind: "hill", edgeStyle: "gentle", outline: [[10, 70], [20, 70], [20, 80], [10, 80]], height: 13 } } } }, (s) => expect(s.built.heights[75 * W + 15]).toBe(13)],
    ["updateFeature", { op: "updateFeature", params: { id: forest.id, patch: { params: { life: "dead" } } } }, (s) => expect(s.built.entities.filter((e) => e.owner === forest.id).every((e) => "LivingNaturalResource" in e.components)).toBe(true)],
    ["deleteFeature", { op: "deleteFeature", params: { id: forest.id } }, (s) => expect(s.built.entities.some((e) => e.owner === forest.id)).toBe(false)],
    ["reorderFeature", { op: "reorderFeature", params: { id: forest.id, index: 0 } }, (s) => expect(s.features[0].id).toBe(forest.id)],
    ["sculpt", { op: "sculpt", params: { mode: "flatten", cells: rectRuns(3, 3, 8, 6), level: 12 } }, (s) => expect(s.built.heights[4 * W + 5]).toBe(12)],
    ["placeEntity", { op: "placeEntity", params: { id: "11111111-2222-4333-8444-555555555555", template: "Blockage", x: 40, y: 3, orientation: "Cw90" } }, (s) => expect(s.built.entities.find((e) => e.id === "11111111-2222-4333-8444-555555555555")?.orientation).toBe("Cw90")],
    ["moveEntity", { op: "moveEntity", params: { id: tree.id, x: to[0], y: to[1] } }, (s) => expect(s.built.entities.find((e) => e.id === tree.id)).toMatchObject({ x: to[0], y: to[1] })],
    ["deleteEntities", { op: "deleteEntities", params: { entities: [tree.id] } }, (s) => expect(s.built.entities.some((e) => e.id === tree.id)).toBe(false)],
    ["setEntityProps", { op: "setEntityProps", params: { id: tree.id, components: { Growable: { GrowthProgress: 0.5 } } } }, (s) => expect(stringify(s.exportFile().world.entities.find((e) => e.Id === tree.id)!)).toContain('"Growable":{"GrowthProgress":0.5}')],
    ["removeSlope", { op: "removeSlope", params: { x: slope.x, y: slope.y } }, (s) => expect(s.built.entities.some((e) => e.id === slope.id)).toBe(false)],
    ["pinSlope", { op: "pinSlope", params: { x: slope.x, y: slope.y, orientation: "Cw180" } }, (s) => expect(s.built.entities.find((e) => e.template === "Slope" && e.x === slope.x && e.y === slope.y)?.orientation).toBe("Cw180")],
  ];
  it.each(cases)("%s", (_name, op, check) => {
    const s = fresh();
    const res = s.apply(op);
    expect(res.errors).toEqual([]);
    expect(res.applied[0].seq).toBe(1);
    check(s);
    expect(s.history().map((h) => h.label)).toHaveLength(1);
    const edited = sha(s.exportTimber().bytes);
    s.undo();
    expect(sha(s.exportTimber().bytes)).toBe(sha(r.bytes));
    expect(s.features).toEqual(r.features);
    s.redo();
    expect(sha(s.exportTimber().bytes)).toBe(edited);
    check(s);
  });
});

describe("invalid operations are rejected with a reason and change nothing", () => {
  const s = fresh();
  const start = r.features.find((f) => f.kind === "start")!;
  const river = r.features.find((f) => f.kind === "river")!;
  const forest = r.features.find((f) => f.kind === "forest")!;
  const bad: [string, unknown, RegExp][] = [
    ["an unknown operation", { op: "explode", params: {} }, /must be one of/],
    ["an unknown parameter", { op: "deleteFeature", params: { id: forest.id, why: "x" } }, /unknown property "why"/],
    ["a missing parameter", { op: "moveEntity", params: { id: "11111111-2222-4333-8444-555555555555" } }, /missing "x"/],
    ["an out-of-range value", { op: "updateFeature", params: { id: forest.id, patch: { params: { density: 2 } } } }, /density: must be <= 1/],
    ["cells outside the map", { op: "sculpt", params: { mode: "raise", cells: [[100, 0, 3]], amount: 1 } }, /outside the 96×96 map/],
    ["a feature that does not exist", { op: "updateFeature", params: { id: "f-aaaaaaaaaaaaa", patch: { locked: true } } }, /does not exist/],
    ["entities that do not exist", { op: "deleteEntities", params: { entities: ["11111111-2222-4333-8444-555555555555"] } }, /do not exist/],
    ["a slope that is not there", { op: "removeSlope", params: { x: 0, y: 0 } }, /no slope at \(0, 0\)/],
    ["deleting a river others build on", { op: "deleteFeature", params: { id: river.id } }, /build on it/],
    ["a second start", { op: "addFeature", params: { feature: { ...start, id: USER, origin: "user" } } }, /already has its start/],
    ["a feature claiming to be generated", { op: "addFeature", params: { feature: { ...forest, id: USER } } }, /only the generator/],
    // set pieces are built by their builders (M5): a request outside the hard bounds, a plan
    // outside them, and a kind this version does not build are all rejected
    ["a set piece with an empty request", { op: "addFeature", params: { feature: { id: USER, kind: "setPiece", origin: "claude", locked: false, params: { kind: "waterfall", request: {}, plan: {}, report: [] } } } }, /missing "mode"/],
    [
      "a waterfall whose plan drops 20 levels",
      {
        op: "addFeature",
        params: {
          feature: {
            id: USER,
            kind: "setPiece",
            origin: "claude",
            locked: false,
            params: { kind: "waterfall", request: { mode: "on-river", river: river.id, at: 30, drop: 20 }, plan: { mode: "on-river", river: river.id, at: 30, drop: 20 }, report: [] },
          },
        },
      },
      /drop of 1–15/,
    ],
    // every set piece is built since M7; natural bridges (a map object) come later
    ["a map object not built yet", { op: "addFeature", params: { feature: { id: USER, kind: "mapObject", origin: "claude", locked: false, params: { kind: "bridge", placement: { x: 3, y: 3, orientation: "Cw0" } } } } }, /later version/],
    ["a set piece whose stored plan is out of bounds", { op: "addFeature", params: { feature: { id: USER, kind: "setPiece", origin: "claude", locked: false, params: { kind: "plugSpillway", request: { lake: "x" }, plan: {}, report: [] } } } }, /belongs to a lake/],
    ["the naturalize brush", { op: "sculpt", params: { mode: "naturalize", cells: [[1, 1, 3]] } }, /roadmap M10/],
    ["a faction-only plant", { op: "placeEntity", params: { id: "11111111-2222-4333-8444-555555555555", template: "Maple", x: 3, y: 3, orientation: "Cw0" } }, /cannot be placed/],
    ["an object without its required components", { op: "placeEntity", params: { id: "11111111-2222-4333-8444-555555555555", template: "UnstableCore", x: 3, y: 3, orientation: "Cw0" } }, /needs its components/],
    ["a malformed id", { op: "placeEntity", params: { id: "not-a-guid", template: "Pine", x: 3, y: 3, orientation: "Cw0" } }, /must match/],
  ];
  it.each(bad)("%s", (_name, op, reason) => {
    const before = sha(s.exportTimber().bytes);
    const res = s.apply(op as EditOp);
    expect(res.ok).toBe(false);
    expect(res.errors.join("; ")).toMatch(reason);
    expect(s.document.edits).toEqual([]);
    expect(sha(s.exportTimber().bytes)).toBe(before);
  });

  it("an imported map has no settings to change", () => {
    const imported = MapSession.importMap(r.bytes, "x.timber");
    expect(imported.apply({ op: "specPatch", params: { patch: { seed: 1 } } }).errors).toEqual(["an imported map has no settings to change"]);
  });

  it("a settings change that breaks the spec schema is rejected, not clamped", () => {
    const res = s.apply({ op: "specPatch", params: { patch: { settings: { resources: { ruins: 900 } } } } });
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toMatch(/ruins: must be <= 300/);
    expect(s.spec!.settings.resources.ruins).toBe(100);
  });

  it("a group of operations is one step: one undo takes it all back", () => {
    const g = fresh();
    const tree = r.built.entities.find((e) => e.template === "Birch")!;
    const res = g.applyAll(
      [
        { op: "sculpt", params: { mode: "raise", cells: rectRuns(2, 2, 4, 4), amount: 1 } },
        { op: "deleteEntities", params: { entities: [tree.id] } },
      ],
      "claude",
      "Raise the corner and clear a tree",
    );
    expect(res.ok).toBe(true);
    expect(g.history()).toEqual([{ label: "Raise the corner and clear a tree", op: "sculpt", seq: 1, count: 2, applied: true }]);
    g.undo();
    expect(sha(g.exportTimber().bytes)).toBe(sha(r.bytes));
    g.redo();
    expect(g.built.entities.some((e) => e.id === tree.id)).toBe(false);
  });

  it("a group of operations applies all or nothing", () => {
    const res = s.applyAll([
      { op: "sculpt", params: { mode: "raise", cells: rectRuns(2, 2, 4, 4), amount: 1 } },
      { op: "deleteFeature", params: { id: "f-aaaaaaaaaaaaa" } },
    ]);
    expect(res.ok).toBe(false);
    expect(s.document.edits).toEqual([]);
    expect(sha(s.exportTimber().bytes)).toBe(sha(r.bytes));
  });
});

describe("operations and the validation report share one shape", () => {
  it("a fix from the report applies as one step and clears its check", () => {
    const s = fresh();
    // a large relic on level ground, then the ground under part of it raised: that part stands in
    // the terrain, so the game would delete it on load (placing it there directly is refused)
    let at = -1;
    for (let i = W * 5 + 5; i < W * (W - 5) && at < 0; i++) {
      const x = i % W;
      const y = (i - x) / W;
      if (x > W - 5) continue;
      if (entityProblem(s, { template: "LargeRelic", x, y, orientation: "Cw0" }) === null) at = i;
    }
    expect(at).toBeGreaterThan(0);
    const [ax, ay] = [at % W, Math.floor(at / W)];
    expect(s.apply({ op: "placeEntity", params: { id: "22222222-2222-4333-8444-555555555555", template: "LargeRelic", x: ax, y: ay, orientation: "Cw0" } }).ok).toBe(true);
    // (two tiles: a single raised tile is a spike the integrity pass removes)
    expect(s.apply({ op: "sculpt", params: { mode: "raise", cells: [[ay + 1, ax + 1, ax + 2]], amount: 1 } }).ok).toBe(true);
    const failing = s.validate("export").report.checks.find((c) => c.id === "entities.placement")!;
    expect(failing.ok).toBe(false);
    expect(failing.fix![0].params).toEqual({ entities: ["22222222-2222-4333-8444-555555555555"] });
    const fix: FixOp = failing.fix![0];
    const res = s.applyAll([fix], "fix", fix.label);
    expect(res.ok).toBe(true);
    expect(s.history().at(-1)!.label).toBe("Remove the objects the game would delete");
    expect(s.validate("export").report.checks.find((c) => c.id === "entities.placement")!.ok).toBe(true);
  });

  it("the operation schema agrees with Ajv", () => {
    const ajv = new Ajv2020({ strict: false, allErrors: true });
    const validate = ajv.compile(opsSchema);
    const samples: unknown[] = [
      { op: "sculpt", params: { mode: "raise", cells: [[1, 2, 3]], amount: 2 } },
      { op: "sculpt", params: { mode: "raise", cells: [[1, 2, 3]], amount: 20 } },
      { op: "deleteEntities", params: { entities: ["11111111-2222-4333-8444-555555555555"], label: 1 } },
      { op: "deleteEntities", params: { entities: ["11111111-2222-4333-8444-555555555555"] }, label: "Remove" },
      { op: "moveEntity", params: { id: "11111111-2222-4333-8444-555555555555", x: 300, y: 1 } },
      { op: "specPatch", params: { patch: { seed: 3 } } },
      { op: "nope", params: {} },
    ];
    for (const v of samples) expect(checkSchema(opsSchema as Record<string, unknown>, v).length === 0, JSON.stringify(v)).toBe(validate(v));
  });
});

describe("orphaned edits are detected and reported (PLAN §19.4)", () => {
  it("an entity edit whose target a later feature edit removed", () => {
    const s = fresh();
    const forest = r.features.find((f): f is ForestFeature => f.kind === "forest" && r.built.entities.filter((e) => e.owner === f.id).length > 3)!;
    const trees = s.built.entities.filter((e) => e.owner === forest.id);
    expect(s.apply({ op: "deleteEntities", params: { entities: [trees[0].id] } }).ok).toBe(true);
    expect(s.apply({ op: "setEntityProps", params: { id: trees[1].id, components: { Growable: { GrowthProgress: 0.3 } } } }).ok).toBe(true);
    expect(s.orphans()).toEqual([]);
    expect(s.apply({ op: "deleteFeature", params: { id: forest.id } }).ok).toBe(true);
    expect(s.orphans().map((o) => [o.seq, o.op])).toEqual([
      [1, "deleteEntities"],
      [2, "setEntityProps"],
    ]);
    expect(s.orphans()[1].reason).toBe(`entity ${trees[1].id} no longer exists`);
    s.undo();
    expect(s.orphans()).toEqual([]);
  });

  it("a feature edit whose target a regeneration removed", () => {
    const s = fresh();
    const grove = r.features.filter((f) => f.kind === "forest").at(-1)!;
    expect(s.apply({ op: "updateFeature", params: { id: grove.id, patch: { params: { density: 0.5 } } } }).ok).toBe(true);
    const res = s.apply({ op: "specPatch", params: { patch: { seed: 78 } } });
    expect(res.ok).toBe(true);
    const gone = !s.features.some((f) => f.id === grove.id);
    expect(gone).toBe(true);
    expect(res.regeneration!.orphans).toEqual([{ seq: 1, op: "updateFeature", label: "Change a feature", reason: `feature ${grove.id} no longer exists` }]);
    // the orphaned edit is kept in the document, and comes back to life if its target does
    expect(s.document.edits.map((e) => e.seq)).toEqual([1]);
    s.undo();
    expect(s.orphans()).toEqual([]);
    expect(s.features.find((f) => f.id === grove.id)!.params).toMatchObject({ density: 0.5 });
  });
});

describe("a rebuild touches only what an edit affects (PLAN §19.7)", () => {
  it("resource edits keep the terrain and the water settle", () => {
    const s = fresh();
    const settle = s.built.settle;
    const forest = r.features.find((f) => f.kind === "forest")!;
    s.apply({ op: "updateFeature", params: { id: forest.id, patch: { params: { density: 0.3 } } } });
    expect(s.built.dirty).toMatchObject({ terrain: null, region: null, water: false, entities: true });
    expect(s.built.settle).toBe(settle);
  });

  it("a sculpt rebuilds its own rectangle", () => {
    const s = fresh();
    const dam = r.features.find((f): f is SetPieceFeature => f.kind === "setPiece" && f.params.kind === "damSite")!;
    const gorgeX = Math.round((dam.params.plan as { at: number }).at);
    const x0 = gorgeX < W / 2 ? W - 12 : 4;
    s.apply({ op: "sculpt", params: { mode: "raise", cells: rectRuns(x0, 2, x0 + 5, 5), amount: 1 } });
    expect(s.built.dirty!.region).toEqual({ x0, y0: 2, x1: x0 + 5, y1: 5 });
  });

  it("the tiles an edit changed are the ones reported", () => {
    const s = fresh();
    const runs = rectRuns(20, 20, 23, 22);
    s.apply({ op: "sculpt", params: { mode: "flatten", cells: runs, level: 15 } });
    const changed = runsToTiles(runs, W).filter((i) => r.built.heights[i] !== 15);
    const d = s.built.dirty!.terrain!;
    for (const i of changed) {
      const x = i % W;
      const y = (i - x) / W;
      expect(x >= d.x0 && x <= d.x1 && y >= d.y0 && y <= d.y1).toBe(true);
    }
  });
});
