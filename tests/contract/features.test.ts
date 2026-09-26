// Contract (PLAN §15, ROADMAP M1 acceptance): features survive a JSON round trip; build(features)
// equals the generated map byte for byte; rebuilding from the project file reproduces the .timber;
// removing one ruin field leaves every other feature and entity id unchanged; the same spec gives
// the same bytes; generated maps pass the generate profile.

import { layoutTargets } from "../../src/core/gen/layout";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decodeProject, encodeProject, toDocument } from "../../src/core/doc/document";
import { generate, rebuild } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
import { validateFeatures, validateSpec } from "../../src/core/spec/schema";
import { readTimber } from "../../src/core/format/timber";
import { encodeWorld } from "../../src/core/format/world";
import type { Feature } from "../../src/core/features/schema";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

describe.each([
  [96, 11],
  [128, 4242],
  [256, 7],
])("generated %i² map, seed %i", (size, seed) => {
  const spec = makeSpec({ seed, size: { x: size, y: size } });
  const r = generate(spec);

  it("passes the generate profile", () => {
    // every check passes except, possibly, the advisory ones (PLAN §11, §19.5): plants.drought;
    // from M8, the start targets and the stored drought water (D85); since maps need not hold their
    // water (D152), how much clean water the map keeps; and the resource amounts, which are
    // information (Kyler, 2026-09-25: resources like the official maps; D148)
    expect(r.report.checks.filter((c) => !c.ok && !c.advisory)).toEqual([]);
    expect(r.report.checks.filter((c) => c.advisory).map((c) => c.id)).toEqual(["water.clean_exists", "water.clean_reach", "start.badwater", "start.reach", "start.ruins_clear", "plants.drought", "water.reservoir", "resources.scrap", "resources.trees", "resources.bushes"]);
    expect(r.report.passed).toBe(true);
  });

  it("exposes its parts as schema-valid features with stable ids", () => {
    expect(validateFeatures(r.features)).toEqual([]);
    expect(validateSpec(r.spec)).toEqual([]);
    const kinds = new Set(r.features.map((f) => f.kind));
    for (const k of ["river", "lake", "landform", "setPiece", "forest", "berryPatch", "ruinField", "mapObject", "start"]) expect(kinds.has(k as Feature["kind"])).toBe(true);
    const ids = r.features.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    const setPieces = r.features.filter((f) => f.kind === "setPiece").map((f) => (f.params as { kind: string }).kind).sort();
    // the badwater setting's strength in basins of 1–3 each (0.65 × 7.2 at 256² makes two); since
    // M7 also ruins on a plateau (where it fits) and, from 128², a second district's site
    const basins = Math.ceil(layoutTargets(r.spec).badwater / 3);
    const layoutPieces = setPieces.filter((k) => k !== "obstaclePayoff" && k !== "secondDistrict");
    expect(layoutPieces).toEqual([...Array(basins).fill("badwaterBasin"), "damSite", "waterfall", "waterfall"]);
    expect(setPieces.filter((k) => k === "obstaclePayoff" || k === "secondDistrict").length).toBeLessThanOrEqual(2);
  });

  it("every entity records its owning feature", () => {
    const ids = new Set(r.features.map((f) => f.id));
    for (const e of r.built.entities) expect(e.owner === "derived:slopes" || ids.has(e.owner), e.owner).toBe(true);
  });

  it("features survive a JSON round trip and rebuild to the same bytes", () => {
    const features = JSON.parse(JSON.stringify(r.features)) as Feature[];
    expect(features).toEqual(r.features);
    expect(sha(rebuild(r.spec, features).bytes)).toBe(sha(r.bytes));
  });

  it("the project file rebuilds the .timber byte for byte", () => {
    const doc = decodeProject(encodeProject(toDocument(r.spec, r.features, r.built)));
    expect(doc.spec).toEqual(r.spec);
    expect(sha(rebuild(doc.spec!, doc.features).bytes)).toBe(sha(r.bytes));
    expect(sha(encodeProject(toDocument(r.spec, r.features, r.built)))).toBe(sha(encodeProject(toDocument(r.spec, r.features, r.built))));
  });

  it("is deterministic: the same spec gives the same bytes", () => {
    expect(sha(generate(spec).bytes)).toBe(sha(r.bytes));
  });

  it("removing one ruin field leaves every other feature and entity id unchanged", () => {
    const fields = r.features.filter((f) => f.kind === "ruinField");
    expect(fields.length).toBeGreaterThan(0);
    const removed = fields[Math.floor(fields.length / 2)];
    const rest = r.features.filter((f) => f.id !== removed.id);
    const again = rebuild(r.spec, rest);
    const before = new Map(r.built.entities.filter((e) => e.owner !== removed.id).map((e) => [e.id, e]));
    const after = new Map(again.built.entities.map((e) => [e.id, e]));
    expect([...after.keys()].sort()).toEqual([...before.keys()].sort());
    for (const [id, e] of after) expect(e, id).toEqual(before.get(id));
    expect(rest.map((f) => f.id)).toEqual(r.features.map((f) => f.id).filter((id) => id !== removed.id));
    expect(again.report.passed).toBe(true);
  });

  it("reads back through the reader with the same world", () => {
    const back = readTimber(r.bytes);
    expect(back.world.sizeX).toBe(size);
    expect(back.world.entities.length).toBe(r.built.entities.length);
    expect(encodeWorld(readTimber(r.bytes).world)).toBe(encodeWorld(back.world));
  });
});
