// Project files (PLAN §19.6, §19.7): they store the generator version and the built base, open
// exactly even when the generator has changed, keep the edit log (so its operations still undo),
// and refuse damaged files. Format-1 files (the M1 and M2 downloads) still open.

import { createHash } from "node:crypto";
import { gunzipSync, gzipSync, strFromU8, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { baseTerrain, fileFromBase } from "../../src/core/doc/base";
import { decodeProject, encodeProject, ProjectError, generatedDocument } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { toBase64 } from "../../src/core/format/base64";
import { encodeWorld } from "../../src/core/format/world";
import { generate } from "../../src/core/gen/generate";
import { runsToTiles, tilesToRuns } from "../../src/core/math/grid";
import { GENERATOR_VERSION, makeSpec } from "../../src/core/spec/mapspec";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const r = generate(makeSpec({ seed: 33, size: { x: 96, y: 96 } }));
const W = 96;
const box = (x0: number, y0: number, x1: number, y1: number) => {
  const t: number[] = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) t.push(y * W + x);
  return tilesToRuns(t, W);
};

describe("project files (PLAN §19.6)", () => {
  it("store the generator version and the built base: the generator's own file", () => {
    const doc = decodeProject(encodeProject(generatedDocument(r)));
    expect(doc.formatVersion).toBe(3);
    expect(doc.generatorVersion).toBe(GENERATOR_VERSION);
    expect(doc.base.source).toBe("generated");
    const base = fileFromBase(doc.base);
    expect(encodeWorld(base.world)).toBe(encodeWorld(r.file.world));
    expect(Buffer.from(base.thumbnail!).equals(Buffer.from(r.file.thumbnail!))).toBe(true);
    expect(doc.base.owners).toEqual(r.built.entities.map((e) => e.owner));
    expect(baseTerrain(doc.base).columns.size).toBe(0); // generated maps are heightfields
    expect(MapSession.open(doc).mode).toBe("live");
    expect(sha(MapSession.open(doc).exportTimber().bytes)).toBe(sha(r.bytes));
  });

  it("an edited document round-trips with its log, and its operations still undo", () => {
    const s = MapSession.fromGenerated(r);
    s.apply({ op: "sculpt", params: { mode: "raise", cells: box(4, 4, 9, 8), amount: 2 } });
    s.apply({ op: "addFeature", params: { feature: { id: "6e1c2a3b-4d5e-4f60-8a7b-8c9d0e1f2a3b", kind: "forest", origin: "user", locked: false, params: { area: box(60, 60, 70, 66), density: 0.7, speciesMix: { Birch: 1 }, life: "auto", youngShare: 0.2 } } } });
    const bytes = s.project();
    const doc = decodeProject(bytes);
    expect(doc.edits.map((e) => [e.seq, e.op])).toEqual([
      [1, "sculpt"],
      [2, "addFeature"],
    ]);
    expect(doc.nextSeq).toBe(3);
    const reopened = MapSession.open(doc);
    expect(sha(reopened.exportTimber().bytes)).toBe(sha(s.exportTimber().bytes));
    // (it opened from its stored map: undo goes below the save point once the log's replay is
    // compared with it, D455; tests/contract/storedMap.test.ts)
    expect(reopened.checkReplay()).toBe(true);
    expect(reopened.history().map((h) => h.label)).toEqual(["Raise terrain", "Add forest"]);
    while (reopened.undo());
    expect(sha(reopened.exportTimber().bytes)).toBe(sha(r.bytes));
    // the next operation continues the numbering (on a slope the edits leave where it was: one in
    // the raised box went with it on batch 5's maps, D148)
    const kept = r.built.slopes.find((q) => (q.x < 2 || q.x > 11 || q.y < 2 || q.y > 10) && (q.x < 58 || q.x > 72 || q.y < 58 || q.y > 68))!;
    expect(MapSession.open(doc).apply({ op: "removeSlope", params: { x: kept.x, y: kept.y } }).applied[0].seq).toBe(3);
  });

  it("an old project with a lock, a setLock edit and a stamp feature still opens, with its land as it was kept (D253, D270)", () => {
    const region = box(4, 4, 20, 20);
    const tiles = runsToTiles(region, W) ?? [];
    const raw = JSON.parse(strFromU8(gunzipSync(encodeProject(generatedDocument(r)))));
    raw.spec.constraints.locks = [{ runs: region }];
    raw.locks = [{ id: "corner", region: { runs: region } }];
    raw.edits = [{ op: "setLock", params: { id: "corner", region: { runs: region } }, seq: 1, origin: "user" }];
    raw.nextSeq = 2;
    raw.features[0].origin = "stamp";
    raw.baseFeatures = raw.features;
    const before = raw.base.heights;
    const doc = decodeProject(gzipSync(strToU8(JSON.stringify(raw))));
    expect(doc.spec!.constraints).not.toHaveProperty("locks");
    expect(doc).not.toHaveProperty("locks");
    expect(doc.edits).toEqual([]);
    expect(doc.features[0].origin).toBe("user");
    // its land opens exactly as it was stored, untouched by dropping the lock
    expect(doc.base.heights).toBe(before);
    const s = MapSession.open(doc);
    expect(s.notices.some((n) => /lock/.test(n))).toBe(true);
    expect(s.notices.some((n) => /stamp/.test(n))).toBe(true);
    expect(sha(s.exportTimber().bytes)).toBe(sha(r.bytes));
  });

  it("an old project holding the editor's retired set pieces opens without them (D462)", () => {
    // the shapes the retired tools saved: a gorge the generator made, and a waterfall the player put
    // on a river (its step in the river's bed names it), then changed
    const plain = JSON.parse(strFromU8(gunzipSync(encodeProject(generatedDocument(r)))));
    const river = plain.features.find((f: { kind: string }) => f.kind === "river");
    const stepped = { ...river, params: { ...river.params, bedProfile: { ...river.params.bedProfile, steps: [{ at: 20, drop: 1 }] } } };
    const opened = (raw: unknown) => decodeProject(gzipSync(strToU8(JSON.stringify(raw))));
    // the project as it opens: the river keeps its step, without the fall
    const without = { ...plain, edits: [{ op: "updateFeature", params: { id: river.id, patch: { params: { bedProfile: { steps: [{ at: 20, drop: 1 }] } } } }, seq: 1, origin: "user" }], nextSeq: 2 };
    without.baseFeatures = plain.features;
    without.features = plain.features.map((f: { id: string }) => (f.id === river.id ? stepped : f));
    const gorge = { id: "0d1e2f3a-4b5c-4d6e-8f70-000000000001", kind: "setPiece", origin: "generated", role: "setpiece/gorge/1", locked: false, params: { kind: "gorge", request: { river: river.id, from: 30, length: 10, width: 3, wallHeight: 3, access: "none" }, plan: { river: river.id, from: 30, to: 40, width: 3, wallHeight: 3 }, report: [] } };
    const fall = { id: "0d1e2f3a-4b5c-4d6e-8f70-000000000002", kind: "setPiece", origin: "user", locked: false, params: { kind: "waterfall", request: { mode: "on-river", river: river.id, at: 20, drop: 1 }, plan: { mode: "on-river", river: river.id, at: 20, drop: 1 }, report: [] } };
    const changed = { ...fall, params: { ...fall.params, report: ["changed"] } };
    const raw = { ...plain, nextSeq: 4 };
    raw.baseFeatures = [...plain.features, gorge];
    raw.edits = [
      { op: "addFeature", params: { feature: fall }, seq: 1, origin: "user" },
      { op: "updateFeature", params: { id: river.id, patch: { params: { bedProfile: { steps: [{ at: 20, drop: 1, setPiece: fall.id }] } } } }, seq: 2, origin: "user" },
      { op: "updateFeature", params: { id: fall.id, patch: { params: { report: ["changed"] } } }, seq: 3, origin: "user" },
    ];
    raw.features = [...raw.baseFeatures.map((f: { id: string }) => (f.id === river.id ? { ...stepped, params: { ...stepped.params, bedProfile: { ...stepped.params.bedProfile, steps: [{ at: 20, drop: 1, setPiece: fall.id }] } } } : f)), changed];
    const doc = opened(raw);
    expect(doc.features.some((f) => f.kind === "setPiece" && (f.params.kind === "gorge" || f.params.kind === "waterfall"))).toBe(false);
    expect(doc.edits.map((e) => e.op)).toEqual(["updateFeature"]);
    const s = MapSession.open(doc);
    expect(s.notices.some((n) => /a waterfall and a gorge|a gorge and a waterfall/.test(n))).toBe(true);
    expect(s.history().map((h) => h.applied)).toEqual([true]);
    expect(sha(s.exportTimber().bytes)).toBe(sha(MapSession.open(opened(without)).exportTimber().bytes));
  });

  it("a map from another generator version opens exactly from its stored base (PLAN §19.7)", () => {
    const doc = { ...generatedDocument(r), generatorVersion: "0.1.9" };
    doc.spec = { ...doc.spec!, generatorVersion: "0.1.9" };
    const s = MapSession.open(decodeProject(encodeProject(doc)));
    expect(s.mode).toBe("frozen");
    expect(s.notices[0]).toMatch(/made with generator 0\.1\.9/);
    // unedited, it is the stored file byte for byte
    expect(sha(s.exportTimber().bytes)).toBe(sha(r.bytes));
    // what the generator made stays as it was saved (no rebuild keeps the edits: edits never replay
    // onto new land, D336); the player's edits apply to the stored map, a generated feature's too
    // (it leaves the stored map and is built as it now says, D336 (2))
    expect(s.notices[0]).not.toMatch(/rebuild/);
    expect("rebuildWithCurrentGenerator" in s).toBe(false);
    const forest = r.features.find((f) => f.kind === "forest" && r.built.entities.some((e) => e.owner === f.id))!;
    const trees = () => s.built.entities.filter((e) => e.owner === forest.id).length;
    const before = trees();
    expect(s.apply({ op: "updateFeature", params: { id: forest.id, patch: { params: { density: 0.05 } } } }).ok).toBe(true);
    expect(trees()).toBeLessThan(before);
    expect(s.orphans()).toEqual([]);
    expect(s.apply({ op: "sculpt", params: { mode: "flatten", cells: box(3, 3, 6, 6), level: 14 } }).ok).toBe(true);
    expect(s.built.heights[4 * W + 4]).toBe(14);
    // and reopening it replays them onto the same land
    const again = MapSession.open(decodeProject(s.project()));
    expect(again.mode).toBe("frozen");
    expect(sha(again.exportTimber().bytes)).toBe(sha(s.exportTimber().bytes));
    s.undo();
    s.undo();
    expect(sha(s.exportTimber().bytes)).toBe(sha(r.bytes));
  });

  it("format-1 project files (the M1 and M2 downloads) open and rebuild their map", () => {
    // a format-1 file stored its spec, features and heights; its land is rebuilt from those heights.
    // A map with natural ramps needs the field's slope targets, which format 1 never held (M1 and
    // M2 maps had none), so the stand-in is a map without them
    let m = r;
    for (let seed = 34; m.field?.ramps && seed < 60; seed++) m = generate(makeSpec({ seed, size: { x: 96, y: 96 } }));
    expect(m.field?.ramps).toBeUndefined();
    const v1 = {
      formatVersion: 1,
      app: "dam-good-maps",
      generatorVersion: m.spec.generatorVersion,
      spec: m.spec,
      base: { sizeX: 96, sizeY: 96, heights: toBase64(m.built.heights) },
      features: m.features,
      edits: [],
      locks: [],
      meta: { name: "River Valley", premise: "", designedFor: "normal" },
    };
    const doc = decodeProject(gzipSync(strToU8(JSON.stringify(v1))));
    expect(doc.base.world).toBeNull();
    const s = MapSession.open(doc);
    expect(s.mode).toBe("live");
    expect(s.notices).toEqual([]);
    expect(sha(s.exportTimber().bytes)).toBe(sha(m.bytes));
    const old = MapSession.open(decodeProject(gzipSync(strToU8(JSON.stringify({ ...v1, generatorVersion: "0.1.0", spec: { ...m.spec, generatorVersion: "0.1.0" } })))));
    expect(old.notices[0]).toMatch(/made with generator 0\.1\.0 and stores no map/);
  });

  it("damaged or foreign files are refused", () => {
    const doc = generatedDocument(r);
    // features that do not match the generation and the edit log
    expect(() => decodeProject(encodeProject({ ...doc, baseFeatures: doc.features, features: doc.features.slice(1) }))).toThrow(ProjectError);
    expect(() => decodeProject(strToU8("{}"))).toThrow(/not a Dam Good Maps project file/);
    expect(() => decodeProject(strToU8(JSON.stringify({ ...doc, formatVersion: 9 })))).toThrow(/newer/);
  });

  it("an unedited document stores its features once", () => {
    const doc = JSON.parse(strFromU8(gunzipSync(encodeProject(generatedDocument(r)))));
    expect("baseFeatures" in doc).toBe(false);
    expect(doc.features).toEqual(JSON.parse(JSON.stringify(r.features)));
  });
});
