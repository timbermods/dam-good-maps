// The first-visit maps (docs/UI-BRIEF.md §7, PLAN §20 D330): one of a handful of ready-made 128²
// maps, picked at random, made and checked by tools/first-visit-maps.ts at each generator release.
// The committed files must open as project files and be this generator's (a page on another
// version would open them frozen): when this fails after a generator change, run
// `npx tsx tools/first-visit-maps.ts`.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { decodeProject, encodeProject, generatedDocument } from "../../src/core/doc/document";
import { generate } from "../../src/core/gen/generate";
import { FIRST_VISIT_DIR, FIRST_VISIT_SIZE, firstVisitProblems, pickFirstVisit, reopensAs, type FirstVisitIndex } from "../../src/core/library/firstVisit";
import { GENERATOR_VERSION, makeSpec } from "../../src/core/spec/mapspec";
import { thumbnailPixels } from "../../src/core/render/thumb";

const DIR = resolve(__dirname, "../../public", FIRST_VISIT_DIR);

describe("picking a first-visit map", () => {
  const index: FirstVisitIndex = {
    format: 1,
    generatorVersion: "9.9.9",
    size: 128,
    maps: ["a", "b", "c"].map((id) => ({ id, file: `${id}.json.gz`, name: id, theme: "canyon", seed: 1, fragment: "", bytes: 0, sha256: "" })),
  };
  it("picks one at random", () => {
    expect(pickFirstVisit(index, "9.9.9", () => 0)?.id).toBe("a");
    expect(pickFirstVisit(index, "9.9.9", () => 0.5)?.id).toBe("b");
    expect(pickFirstVisit(index, "9.9.9", () => 0.9999)?.id).toBe("c");
  });
  it("none for another generator, or none at all: the page generates live", () => {
    expect(pickFirstVisit(index, "1.0.0")).toBe(null);
    expect(pickFirstVisit({ ...index, maps: [] }, "9.9.9")).toBe(null);
    expect(pickFirstVisit(null, "9.9.9")).toBe(null);
  });
});

describe("what makes a first-visit map", () => {
  it("a map that passes the release checks, and reopens as itself from its project file", () => {
    const r = generate(makeSpec({ seed: 1, theme: "riverValley", size: { x: 96, y: 96 } }));
    const why = firstVisitProblems(r);
    // every reason is a plain line; a passing map has none
    for (const w of why) expect(w).toMatch(/^(its|it) /);
    if (r.report.passed) expect(why.filter((w) => w.startsWith("its checks fail"))).toEqual([]);
    else expect(why[0]).toMatch(/^its checks fail \(/);
    const back = reopensAs(r, encodeProject(generatedDocument(r)));
    expect(back.same).toBe(true);
  });
});

describe("the committed first-visit maps", () => {
  it("are this generator's, 128², and open as project files", () => {
    const path = join(DIR, "index.json");
    expect(existsSync(path), "public/first-visit/index.json is missing: run npx tsx tools/first-visit-maps.ts").toBe(true);
    const index = JSON.parse(readFileSync(path, "utf8")) as FirstVisitIndex;
    expect(index.generatorVersion, "the first-visit maps are another generator's: run npx tsx tools/first-visit-maps.ts").toBe(GENERATOR_VERSION);
    expect(index.size).toBe(FIRST_VISIT_SIZE);
    expect(index.maps.length).toBeGreaterThanOrEqual(3);
    for (const m of index.maps) {
      const doc = decodeProject(new Uint8Array(readFileSync(join(DIR, m.file))));
      expect(doc.generatorVersion).toBe(GENERATOR_VERSION);
      expect(doc.spec?.size).toEqual({ x: FIRST_VISIT_SIZE, y: FIRST_VISIT_SIZE });
      expect(doc.spec?.seed).toBe(m.seed);
      expect(doc.edits).toEqual([]);
    }
  });
});

describe("the thumbnail", () => {
  it("is the map's longer side at most 64 pixels, north up", () => {
    const W = 128;
    const H = 64;
    const heights = new Uint8Array(W * H);
    // the northern half high
    for (let y = H / 2; y < H; y++) for (let x = 0; x < W; x++) heights[y * W + x] = 12;
    const p = thumbnailPixels(heights, W, H, null);
    expect([p.w, p.h]).toEqual([64, 32]);
    const lum = (row: number) => p.rgba[row * p.w * 4] + p.rgba[row * p.w * 4 + 1] + p.rgba[row * p.w * 4 + 2];
    // the top row is the north: the high ground, drawn lighter
    expect(lum(0)).toBeGreaterThan(lum(p.h - 1));
  });
});
