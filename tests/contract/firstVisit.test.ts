// The first-visit maps (docs/UI-BRIEF.md §7, PLAN §20 D330, D343): one of a handful of ready-made
// 128² maps, picked at random. tools/first-visit-maps.ts builds them during the deploy and stops it
// when a check fails; these are its checks (`firstVisitProblems`, `reopensAs`), on one small map:
// it passes them all, and each check, made to fail, turns it away with a plain reason.

import { describe, expect, it } from "vitest";
import { encodeProject, generatedDocument } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { readTimber, writeTimber } from "../../src/core/format/timber";
import { generate, type GenerateResult } from "../../src/core/gen/generate";
import { generatedThemeOf } from "../../src/core/gen/pack";
import { firstVisitProblems, pickFirstVisit, reopensAs, type FirstVisitIndex } from "../../src/core/library/firstVisit";
import { makeSpec } from "../../src/core/spec/mapspec";
import { thumbnailPixels } from "../../src/core/render/thumb";

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
    expect(pickFirstVisit(index, "1.0.0", () => 0)).toBe(null);
    expect(pickFirstVisit({ ...index, maps: [] }, "9.9.9", () => 0)).toBe(null);
    expect(pickFirstVisit(null, "9.9.9", () => 0)).toBe(null);
  });
});

describe("the deploy's checks on a first-visit map", () => {
  // (seed 5 on M9b's maps, D148: canyon seeds 1, 3, 4, 9 and 10 miss one of the three outcomes there; 5 meets them all, and 2, the map it must not reopen as, is another)
  const r = generate(makeSpec({ seed: 5, theme: "canyon", size: { x: 96, y: 96 } }));
  // (the project file as the tool writes it: with the map stored, so it opens without rebuilding, D367)
  const project = MapSession.fromGenerated(r).project();

  it("a map that passes them all, and reopens as itself from its project file, from its stored map", () => {
    expect(firstVisitProblems(r)).toEqual([]);
    expect(reopensAs(r, project).same).toBe(true);
    // a project without its stored map would open by rebuilding: not a first-visit map
    expect(reopensAs(r, encodeProject(generatedDocument(r))).same).toBe(false);
  });

  it("turns a map away when its own checks fail", () => {
    const failed = { ...r, report: { ...r.report, passed: false, checks: [...r.report.checks, { id: "start.water", ok: false, severity: "error", message: "no water" }] } } as GenerateResult;
    expect(firstVisitProblems(failed)).toEqual(["its checks fail (start.water)"]);
  });

  it("turns a map away when its written file fails the validator or the starting-logs floor", () => {
    // the same map's file with its trees taken out: the report still passes; the file must not
    const file = readTimber(r.bytes);
    file.world.entities = file.world.entities.filter((e) => !["Pine", "Birch", "Oak", "Succulent"].includes(String(e.Template)));
    const why = firstVisitProblems({ ...r, bytes: writeTimber(file) } as GenerateResult);
    expect(why).toContain("its file misses the starting-logs floor");
    expect(why.some((w) => /^its file fails .*start\.wood_floor/.test(w))).toBe(true);
  });

  it("turns a map away when it misses one of the three outcomes (M9b)", () => {
    const missed = { ...r, outcomes: { met: false } } as GenerateResult;
    expect(firstVisitProblems(missed)).toEqual(["it misses one of the three outcomes"]);
  });

  it("judges the file under its own theme's thresholds: an Islands sea over 35% of the map is no flood, as a first-visit file and opened again as an import (D369)", () => {
    // (seed 2 at 96²: 60% sea, and quick to make)
    const isl = generate(makeSpec({ seed: 2, theme: "islands", size: { x: 96, y: 96 } }));
    const flood = isl.report.checks.find((c) => c.id === "water.no_flood");
    // (the sea is more than the other themes' 0.35 cap, and within Islands' 0.70)
    expect(flood?.ok).toBe(true);
    expect(Number(/(\d+)%/.exec(flood?.message ?? "")?.[1])).toBeGreaterThan(35);
    expect(firstVisitProblems(isl).join("; ")).not.toMatch(/water\.no_flood/);
    // the player's path: the exported file opened in the editor, with no spec, reads its theme from its description
    expect(generatedThemeOf(String(readTimber(isl.bytes).metadata?.MapDescription))).toBe("islands");
    const opened = MapSession.importMap(isl.bytes, "dgm-islands-2.timber").validate().report.checks.find((c) => c.id === "water.no_flood");
    expect(opened?.ok).toBe(true);
    expect(opened?.limit).toBe(0.7);
  });

  it("reads a theme only from a description Dam Good Maps wrote", () => {
    expect(generatedThemeOf("Lake Basin, 128×128, designed for hard. Its land … Made with Dam Good Maps 0.8.9, seed 7.")).toBe("lakeBasin");
    expect(generatedThemeOf("A map, 96×96, designed for normal. Made with Dam Good Maps 0.8.9, seed 3.")).toBe("any");
    // (an official map, a real place, or the theme's line edited away: none)
    expect(generatedThemeOf("Islands, 128×128, designed for normal. A map of my own.")).toBe(null);
    expect(generatedThemeOf("Made with Dam Good Maps from public elevation data: somewhere.")).toBe(null);
    expect(generatedThemeOf("My islands. Made with Dam Good Maps 0.8.9, seed 3.")).toBe(null);
  });

  it("turns a map away when its project file reopens as another map", () => {
    const other = generate(makeSpec({ seed: 2, theme: "canyon", size: { x: 96, y: 96 } }));
    expect(reopensAs(r, MapSession.fromGenerated(other).project()).same).toBe(false);
  });
});

describe("the thumbnail", () => {
  it("is the map's longer side 256 pixels, north up", () => {
    const W = 128;
    const H = 64;
    const heights = new Uint8Array(W * H);
    // the northern half high
    for (let y = H / 2; y < H; y++) for (let x = 0; x < W; x++) heights[y * W + x] = 12;
    const p = thumbnailPixels(heights, W, H, null);
    expect([p.w, p.h]).toEqual([256, 128]);
    const lum = (row: number) => p.rgba[row * p.w * 4] + p.rgba[row * p.w * 4 + 1] + p.rgba[row * p.w * 4 + 2];
    // the top row is the north: the high ground, drawn lighter
    expect(lum(0)).toBeGreaterThan(lum(p.h - 1));
  });
});
