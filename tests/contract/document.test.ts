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
    expect(reopened.history().map((h) => h.label)).toEqual(["Raise terrain", "Add forest"]);
    while (reopened.undo());
    expect(sha(reopened.exportTimber().bytes)).toBe(sha(r.bytes));
    // the next operation continues the numbering
    expect(MapSession.open(doc).apply({ op: "removeSlope", params: { x: r.built.slopes[0].x, y: r.built.slopes[0].y } }).applied[0].seq).toBe(3);
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

  it("a map from another generator version opens exactly from its stored base (PLAN §19.7)", () => {
    const doc = { ...generatedDocument(r), generatorVersion: "0.1.9" };
    doc.spec = { ...doc.spec!, generatorVersion: "0.1.9" };
    const s = MapSession.open(decodeProject(encodeProject(doc)));
    expect(s.mode).toBe("frozen");
    expect(s.notices[0]).toMatch(/made with generator 0\.1\.9/);
    // unedited, it is the stored file byte for byte
    expect(sha(s.exportTimber().bytes)).toBe(sha(r.bytes));
    // what the generator made waits for a rebuild; the player's own edits apply to the stored map
    const forest = r.features.find((f) => f.kind === "forest")!;
    expect(s.apply({ op: "updateFeature", params: { id: forest.id, patch: { params: { density: 0.5 } } } }).errors[0]).toMatch(/rebuild the map with generator/);
    expect(s.apply({ op: "sculpt", params: { mode: "flatten", cells: box(3, 3, 6, 6), level: 14 } }).ok).toBe(true);
    expect(s.built.heights[4 * W + 4]).toBe(14);
    expect(s.rebuildWithCurrentGenerator()).toBe(true);
    expect(s.mode).toBe("live");
    expect(s.built.heights[4 * W + 4]).toBe(14);
    expect(s.document.generatorVersion).toBe(GENERATOR_VERSION);
    s.undo();
    expect(s.mode).toBe("frozen");
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
