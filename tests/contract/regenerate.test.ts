// Regeneration with constraints (ROADMAP M3 acceptance, PLAN §7.0, EDITOR_PLAN §3 conflict rules):
// generate, add a user feature, change a setting, regenerate: the user feature survives and nothing
// is silently dropped. The planner keeps its layout off the player's features and keep-out
// regions; what no longer applies is flagged.

import { describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import type { Feature } from "../../src/core/features/schema";
import { polygonMask } from "../../src/core/features/geometry";
import { generate } from "../../src/core/gen/generate";
import { runsToTiles, tilesToRuns } from "../../src/core/math/grid";
import { makeSpec } from "../../src/core/spec/mapspec";

const SIZE = 128;
const W = SIZE;
const box = (x0: number, y0: number, x1: number, y1: number) => {
  const t: number[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) t.push(y * W + x);
  return tilesToRuns(t, W);
};
const PLATEAU: Feature = {
  id: "7e1c2a3b-4d5e-4f60-8a7b-8c9d0e1f2a3b",
  kind: "landform",
  origin: "user",
  locked: false,
  params: { kind: "plateau", edgeStyle: "cliff", outline: [[8, 108], [24, 108], [24, 120], [8, 120]], height: 15 },
};
const FOREST: Feature = {
  id: "8e1c2a3b-4d5e-4f60-8a7b-8c9d0e1f2a3b",
  kind: "forest",
  origin: "user",
  locked: false,
  params: { area: box(100, 6, 114, 14), density: 1, speciesMix: { Oak: 1 }, life: "dead", youngShare: 0 },
};
const BERRIES: Feature = {
  id: "9e1c2a3b-4d5e-4f60-8a7b-8c9d0e1f2a3b",
  kind: "berryPatch",
  origin: "claude",
  locked: false,
  params: { area: box(100, 112, 108, 118), density: 1, ripeShare: 1 },
};

describe("regeneration keeps the player's work (ROADMAP M3 acceptance)", () => {
  const r = generate(makeSpec({ seed: 21, size: { x: SIZE, y: SIZE } }));

  it.each([
    ["a setting", { settings: { resources: { forestDensity: 150, ruins: 200 }, water: { riverFlow: "strong" } } }],
    ["the seed", { seed: 1234 }],
  ])("generate, add a user feature, change %s, regenerate: the user feature survives and nothing is silently dropped", (_what, patch) => {
    const s = MapSession.fromGenerated(r);
    for (const f of [PLATEAU, FOREST, BERRIES]) expect(s.apply({ op: "addFeature", params: { feature: f } }, f.origin === "claude" ? "claude" : "user").ok).toBe(true);
    // edits to what the generator made, which may or may not survive a new plan
    const grove = r.features.filter((f) => f.kind === "forest").at(-1)!;
    expect(s.apply({ op: "updateFeature", params: { id: grove.id, patch: { params: { density: 0.5 } } } }).ok).toBe(true);
    const tree = s.built.entities.find((e) => e.template === "Birch" && e.owner !== FOREST.id)!;
    expect(s.apply({ op: "deleteEntities", params: { entities: [tree.id] } }).ok).toBe(true);
    expect(s.apply({ op: "sculpt", params: { mode: "raise", cells: box(60, 2, 70, 4), amount: 1 } }).ok).toBe(true);
    const log = s.document.edits;

    const res = s.apply({ op: "specPatch", params: { patch } });
    expect(res.errors).toEqual([]);
    const g = res.regeneration!;
    expect(g.ok).toBe(true);
    expect(g.report!.passed).toBe(true);

    // the player's features are all still there, unchanged, and built
    expect(g.kept).toEqual([PLATEAU.id, FOREST.id, BERRIES.id]);
    for (const f of [PLATEAU, FOREST, BERRIES]) expect(s.features.find((x) => x.id === f.id)).toEqual(f);
    const plateau = polygonMask((PLATEAU.params as { outline: [number, number][] }).outline, W, W);
    for (let i = 0; i < W * W; i++) if (plateau[i]) expect(s.built.heights[i]).toBe(15);
    expect(s.built.entities.filter((e) => e.owner === FOREST.id).length).toBe(runsToTiles((FOREST.params as { area: [number, number, number][] }).area, W).length);
    // the new layout kept off them: no river, basin or generated resource on their tiles
    const theirs = new Set([...runsToTiles((FOREST.params as { area: [number, number, number][] }).area, W), ...runsToTiles((BERRIES.params as { area: [number, number, number][] }).area, W)]);
    plateau.forEach((v, i) => v && theirs.add(i));
    for (const i of theirs) expect(s.built.channel[i], `channel on tile ${i}`).toBe(0);
    const generatedOwners = new Set(s.features.filter((f) => f.origin === "generated").map((f) => f.id));
    for (const e of s.built.entities) if (generatedOwners.has(e.owner) && e.template !== "WaterSource") expect(theirs.has(e.y * W + e.x), `${e.template} on a player's tile`).toBe(false);
    expect(s.spec!.constraints.keep).toEqual(g.kept);

    // nothing silently dropped: every edit is still in the log, and each either applies or is
    // flagged with its reason
    expect(s.document.edits.map((e) => [e.seq, e.op])).toEqual(log.map((e) => [e.seq, e.op]));
    const flagged = new Map(g.orphans.map((o) => [o.seq, o.reason]));
    for (const e of s.document.edits) {
      if (e.orphaned) expect(flagged.get(e.seq)).toBe(e.orphaned);
      if (e.op === "updateFeature" && !flagged.has(e.seq)) expect(s.features.find((f) => f.id === e.params.id)!.params).toMatchObject({ density: 0.5 });
      if (e.op === "deleteEntities" && !flagged.has(e.seq)) expect(s.built.entities.some((x) => x.id === tree.id)).toBe(false);
    }
    for (const o of g.orphans) expect(o.reason.length).toBeGreaterThan(10);
    // and the edit that cannot miss its target, the sculpt, applies
    expect(flagged.has(log.find((e) => e.op === "sculpt")!.seq)).toBe(false);

    // undo brings the previous generation back exactly; redo the new one
    const after = s.exportTimber().bytes;
    s.undo();
    expect(s.spec!.seed).toBe(r.spec.seed);
    expect(s.spec!.settings).toEqual(r.spec.settings);
    expect(s.orphans()).toEqual([]);
    s.redo();
    expect(Buffer.from(s.exportTimber().bytes).equals(Buffer.from(after))).toBe(true);
  });

  it("a new seed orphans the edits of generated features that are gone, and says why", () => {
    const s = MapSession.fromGenerated(r);
    const groves = r.features.filter((f) => f.kind === "forest");
    for (const f of groves.slice(-3)) expect(s.apply({ op: "updateFeature", params: { id: f.id, patch: { params: { life: "dead" } } } }).ok).toBe(true);
    const g = s.regenerate({ seed: 999 });
    expect(g.ok).toBe(true);
    const gone = groves.slice(-3).filter((f) => !s.features.some((x) => x.id === f.id));
    expect(gone.length).toBeGreaterThan(0);
    expect(g.orphans.map((o) => o.reason)).toEqual(gone.map((f) => `feature ${f.id} no longer exists`));
  });

  it("the planner places nothing in keep-out regions", () => {
    const s = MapSession.fromGenerated(r);
    const keepOut = box(0, 0, 127, 20);
    const g = s.regenerate({ constraints: { keepOut: [{ runs: keepOut }] } });
    expect(g.ok).toBe(true);
    const out = new Set(runsToTiles(keepOut, W));
    const generated = new Set(s.features.filter((f) => f.origin === "generated").map((f) => f.id));
    for (const e of s.built.entities) if (generated.has(e.owner) && e.template !== "WaterSource" && e.template !== "Slope") expect(out.has(e.y * W + e.x)).toBe(false);
    for (const i of out) expect(s.built.channel[i]).toBe(0);
  });

  it("a regeneration that cannot keep off the player's features is refused and changes nothing", () => {
    const s = MapSession.fromGenerated(r);
    // a plateau over almost the whole map: no river finds a way that keeps off it (M9a: rivers
    // come from the land's drainage, so a wall across the map no longer forces them over it)
    const wall: Feature = { ...PLATEAU, params: { kind: "plateau", edgeStyle: "cliff", outline: [[3, 3], [124, 3], [124, 124], [3, 124]], height: 16 } };
    expect(s.apply({ op: "addFeature", params: { feature: wall } }).ok).toBe(true);
    const before = s.exportTimber().bytes;
    const g = s.regenerate({ settings: { resources: { ruins: 150 } } });
    expect(g.ok).toBe(false);
    expect(g.errors[0]).toMatch(/could not keep the river off your features/);
    expect(g.failures.length).toBe(12);
    expect(Buffer.from(s.exportTimber().bytes).equals(Buffer.from(before))).toBe(true);
    expect(s.spec!.settings.resources.ruins).toBe(100);
  });
});
