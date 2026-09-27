// Contract (PLAN §19.6, §20 D16 and D37): every theme's project file reopens and rebuilds the same
// .timber. Lake Basin's and Islands' terrace rings reach past the map (Lake Basin seed 1 at 96²:
// x = −2.02), and the feature schema's points allowed only −1…257 until 0.5.0's fix, so their project
// files were refused as damaged on open. Points may now lie one map side past each edge (−256…512);
// outlines are never clamped, so every map keeps its bytes. Project files written before the fix
// open too (tests/fixtures/projects, written by d3b08d5).

import Ajv2020 from "ajv/dist/2020";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeProject, encodeProject, toDocument } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import type { Feature } from "../../src/core/features/schema";
import { generate, type GenerateResult } from "../../src/core/gen/generate";
import { makeSpec, SIZE_PRESETS, THEMES, type ThemeId } from "../../src/core/spec/mapspec";
import { FEATURES_SCHEMA, validateFeatures } from "../../src/core/spec/schema";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const ajvFeatures = new Ajv2020({ allErrors: true, strict: false }).compile(FEATURES_SCHEMA);

/** Every point of the features the schema checks as one (`$defs/point`). */
function schemaPoints(features: readonly Feature[]): number[][] {
  const out: number[][] = [];
  for (const f of features) {
    if (f.kind === "river") out.push(...f.params.path);
    if (f.kind === "lake") {
      out.push(...f.params.outline, f.params.outlet.at);
      for (const island of f.params.islands ?? []) out.push(...island.outline);
    }
    if (f.kind === "landform" && f.params.outline) out.push(...f.params.outline);
  }
  return out;
}

/** Past the bounds the feature schema had before the fix (−1…257). */
const pastOldBounds = (features: readonly Feature[]) => schemaPoints(features).some((p) => p.some((v) => v < -1 || v > 257));

const generated = new Map<string, GenerateResult>();
function gen(theme: ThemeId, size: number, seed: number): GenerateResult {
  const key = `${theme}/${size}/${seed}`;
  let r = generated.get(key);
  if (!r) generated.set(key, (r = generate(makeSpec({ seed, theme, size: { x: size, y: size } }))));
  return r;
}

// One seed per theme and size. Lake Basin's and Islands' seeds are ones whose terrace rings reach
// past the old bounds (at 0.5.0); the other themes keep their points on the map.
const RING_SEEDS: Partial<Record<ThemeId, Record<number, number>>> = {
  lakeBasin: { 96: 1, 128: 2, 192: 1, 256: 2 },
  islands: { 96: 1, 128: 1, 192: 2, 256: 2 },
};
const SIZES = Object.values(SIZE_PRESETS);
const CASES = THEMES.flatMap((theme) => SIZES.map((size) => [theme, size, RING_SEEDS[theme]?.[size] ?? 1] as const));

describe("every theme's project file reopens and rebuilds the same .timber (PLAN §19.6)", () => {
  it.each(CASES)("%s at %i², seed %i", (theme, size, seed) => {
    const r = gen(theme, size, seed);
    expect(r.report.passed).toBe(true);
    // the runtime checker (D16) and Ajv agree on the generated features
    expect(validateFeatures(r.features)).toEqual([]);
    expect(ajvFeatures(r.features), JSON.stringify(ajvFeatures.errors?.slice(0, 3))).toBe(true);
    const bytes = encodeProject(toDocument(r.spec, r.features, r.built, r.file));
    const doc = decodeProject(bytes);
    const s = MapSession.open(doc);
    expect(s.mode).toBe("live");
    expect(sha(s.exportTimber().bytes)).toBe(sha(r.bytes));
    // the editor's autosave (a faster gzip level) opens the same way
    expect(decodeProject(s.project(6)).features).toEqual(doc.features);
  });

  it("Lake Basin seed 1 at 96² (the reported map) has a terrace ring past the old bounds, and reopens", () => {
    const r = gen("lakeBasin", 96, 1);
    const xs = schemaPoints(r.features).map((p) => p[0]);
    expect(Math.min(...xs)).toBe(-2.02);
    expect(pastOldBounds(r.features)).toBe(true);
    expect(sha(MapSession.open(decodeProject(encodeProject(toDocument(r.spec, r.features, r.built, r.file)))).exportTimber().bytes)).toBe(sha(r.bytes));
  });
});

describe("generated outlines past the map edge are edited and locked (decisions-pending #30, D103)", () => {
  it("a Lake Basin terrace ring past the edge: locked, changed and moved in the editor; the unedited map keeps its bytes", () => {
    const r = gen("lakeBasin", 96, 1);
    const s = MapSession.fromGenerated(r, r.file);
    const W = s.size.x;
    const ring = s.features.find((f) => f.kind === "landform" && f.origin === "generated" && (f.params.outline ?? []).some(([x, y]) => x < 0 || y < 0 || x > W - 1 || y > W - 1));
    expect(ring, "a ring reaching past the map").toBeDefined();
    if (!ring || ring.kind !== "landform") return;
    // locking it changes nothing on the map
    const lock = s.apply({ op: "updateFeature", params: { id: ring.id, patch: { locked: true } } });
    expect(lock.errors).toEqual([]);
    expect(sha(s.exportTimber().bytes)).toBe(sha(r.bytes));
    // its height changes, and it moves, with its outline still past the edge
    expect(s.apply({ op: "updateFeature", params: { id: ring.id, patch: { params: { height: ring.params.height! - 1 } } } }).errors).toEqual([]);
    const moved = ring.params.outline!.map(([x, y]) => [x + 2, y + 1]);
    expect(s.apply({ op: "updateFeature", params: { id: ring.id, patch: { params: { outline: moved } } } }).errors).toEqual([]);
    // the edits undo to the generator's own file
    while (s.undo());
    expect(sha(s.exportTimber().bytes)).toBe(sha(r.bytes));
    // an outline the player draws stays on the map's tiles
    const mine = { id: "8b8b8b8b-2222-4222-8333-444455556666", kind: "landform", origin: "user", locked: false, params: { kind: "plateau", edgeStyle: "cliff", outline: [[-3, 10], [10, 10], [10, 20], [-3, 20]], height: 9 } } as unknown as Feature;
    expect(s.check({ op: "addFeature", params: { feature: mine } })[0]).toMatch(/leaves the map/);
    const edge = { ...mine, params: { ...(mine.params as object), outline: [[-0.5, 10], [10, 10], [10, 20], [-0.5, 20]] } } as unknown as Feature;
    expect(s.check({ op: "addFeature", params: { feature: edge } })).toEqual([]);
  });
});

describe("the feature schema's points (PLAN §19.2)", () => {
  const landform = (outline: number[][]): Feature[] => [
    { id: "f-aaaaaaaaaaaaa", kind: "landform", origin: "user", locked: false, params: { kind: "plateau", edgeStyle: "cliff", outline: outline as [number, number][], height: 8 } },
  ];
  const both = (outline: number[][]) => [validateFeatures(landform(outline)).length === 0, ajvFeatures(landform(outline)) as boolean];

  it("lie up to one map side (256 tiles) past each edge, in the runtime checker and in Ajv alike", () => {
    expect(both([[-256, -256], [512, -256], [512, 512], [-256, 512]])).toEqual([true, true]);
    expect(both([[-2.02, 40], [10, 40], [10, 60]])).toEqual([true, true]);
    expect(both([[-256.01, 40], [10, 40], [10, 60]])).toEqual([false, false]);
    expect(both([[0, 0], [512.01, 0], [0, 10]])).toEqual([false, false]);
  });
});

describe("project files saved before the fix (tests/fixtures/projects, written by d3b08d5)", () => {
  const fixture = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/projects/${name}`));

  it("River Valley 96², seed 11 (every point on the map; the page's download) opens and rebuilds its .timber", () => {
    const doc = decodeProject(fixture("river-valley-96-11.damgoodmaps.json"));
    // saved before D164: its 50 starting trees open as 100 logs of starting wood
    expect(doc.spec!.settings.start.rules).toEqual({ waterWithin: 16, woodWithin20: 100, bushesWithin20: 40, badwaterWithin: 30, ruinsWithin: 15 });
    expect(pastOldBounds(doc.features)).toBe(false);
    const s = MapSession.open(doc);
    expect(s.history()).toEqual([]);
    // the .timber the pre-fix generator made from this spec
    expect(sha(s.exportTimber().bytes)).toBe("86cbf24ca5630f798841a94df7d16ec6f5f49137a5fae7693f0e903076fe8c1e");
  });

  it("Lake Basin 96², seed 1 (a ring at x = −2.02; the editor's autosave after one edit), refused before, opens with its edit", () => {
    const doc = decodeProject(fixture("lake-basin-96-1-autosave.damgoodmaps.json"));
    expect(pastOldBounds(doc.features)).toBe(true);
    const s = MapSession.open(doc);
    expect(s.history().map((h) => h.label)).toEqual(["Raise terrain"]);
    // the edited map, as the pre-fix session exported it (with the generator that wrote the file)
    if (s.mode === "live") expect(sha(s.exportTimber().bytes)).toBe("e495ff0ab37f9120a40abe711cba3747f011bb995825a4f94eb97e337722a66c");
    // the edit undoes to the generated map, as the pre-fix generator made it
    expect(s.undo()).toBe(true);
    expect(sha(s.exportTimber().bytes)).toBe("18d19835a495d41b3b63e0ab8a9d1d5c606b67003ba3aaff9883212120a9daee");
  });
});
