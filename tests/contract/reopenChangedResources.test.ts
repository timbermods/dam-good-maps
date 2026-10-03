// A reopened project is the map the session showed, byte for byte, after a resource feature the
// player changed (PLAN §20 D404, D425; found by the nightly property test, tests/contract/
// properties.test.ts). An edited generated map keeps the objects its generation placed, marked dead or
// alive by the ground under them; a berry patch or forest the player has changed is built as it now
// says (MapSession.generatedResources). The session kept the generation's objects of a feature changed
// after its first rebuild: its cache of the kept features was keyed on the feature list, which the
// operations change in place, so it never saw the change. The live map then kept the dead bushes and
// trees an edit had left standing, and the reopened project (which reads the changed feature afresh)
// had none, so its export differed from the session's.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { entityJson } from "../../src/core/format/entities";
import { generate } from "../../src/core/gen/generate";
import { runsToTiles } from "../../src/core/math/grid";
import { makeSpec } from "../../src/core/spec/mapspec";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const W = 96;

describe("a reopened project keeps what the session showed after a changed berry patch or forest (D404, D425)", () => {
  const r = generate(makeSpec({ seed: 2, size: { x: W, y: W }, theme: "riverValley" }));
  const s = MapSession.fromGenerated(r);
  const of = (id: string) => s.built.entities.filter((e) => e.owner === id);
  const dead = (id: string) => of(id).filter((e) => (entityJson(e).Components as { LivingNaturalResource?: { IsDead?: boolean } }).LivingNaturalResource?.IsDead === true);
  // the map's first berry patch, and a forest that stands dead on dry ground
  const patch = s.features.find((f) => f.kind === "berryPatch" && of(f.id).length > 0)!;
  const forest = s.features.find((f) => f.kind === "forest" && of(f.id).length > 0 && dead(f.id).length === of(f.id).length)!;

  it("a brush leaves dead bushes standing, then the patch and the forest change: the reopened project exports the same bytes", () => {
    expect(r.report.passed).toBe(true);
    expect(patch && forest).toBeTruthy();
    const bushes = of(patch.id).length;
    expect(dead(patch.id)).toEqual([]);
    // raising the patch's middle dries it: its bushes stay, the dried ones dead (D404, D425)
    const tiles = runsToTiles((patch.params as { area: [number, number, number][] }).area, W);
    const cx = Math.round((tiles.reduce((a, i) => a + (i % W), 0) / tiles.length) * 4);
    const cy = Math.round((tiles.reduce((a, i) => a + Math.floor(i / W), 0) / tiles.length) * 4);
    expect(s.apply({ op: "brush", params: { tool: "raise", size: 6, strength: 10, dabs: [cx, cy, cx, cy] } }).errors).toEqual([]);
    expect(of(patch.id).length).toBe(bushes);
    expect(dead(patch.id).length).toBeGreaterThan(0);
    expect(sha(MapSession.open(decodeProject(s.project())).exportTimber().bytes)).toBe(sha(s.exportTimber().bytes));

    // the player changes the patch and the forest: each is built as it now says, in the session as
    // in the reopened project (no dead bush on dry ground, no tree on dry ground for a live forest)
    expect(s.apply({ op: "updateFeature", params: { id: patch.id, patch: { params: { ripeShare: 0.9 } } } }).errors).toEqual([]);
    expect(s.apply({ op: "updateFeature", params: { id: forest.id, patch: { params: { life: "alive" } } } }).errors).toEqual([]);
    const reopened = MapSession.open(decodeProject(s.project()));
    expect(sha(reopened.exportTimber().bytes)).toBe(sha(s.exportTimber().bytes));
    expect(s.generatedResources()?.has(patch.id)).toBe(false);
    expect(s.generatedResources()?.has(forest.id)).toBe(false);
    expect(dead(patch.id)).toEqual([]);
    expect(dead(forest.id)).toEqual([]);

    // undoing both changes brings the generation's objects back, the dried bushes dead again
    s.undo();
    s.undo();
    expect(s.generatedResources()?.has(patch.id)).toBe(true);
    expect(of(patch.id).length).toBe(bushes);
    expect(dead(patch.id).length).toBeGreaterThan(0);
    expect(sha(MapSession.open(decodeProject(s.project())).exportTimber().bytes)).toBe(sha(s.exportTimber().bytes));
  });
});
