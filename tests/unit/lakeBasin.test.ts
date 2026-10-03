// Lake Basin round 2 (PLAN §20 D453, D458): one valley basin in a stronger radial catchment, on every
// Lake Basin map, whatever its settings, difficulty, size, intentions or siblings (Kyler, 2026-10-03;
// until then only the default Normal square map from 96² to 256², so Another like this and every
// setting away from the preset lost the theme: the release-gate generator hunt's findings 1 and 2).
// The player's Rivers count and a Lakes setting away from the preset's keep their lean.

import { describe, expect, it } from "vitest";
import { drawGenome, leanGenome, type Genome } from "../../src/core/land/genome";
import { shapeLakeBasin } from "../../src/core/land/lakeBasin";
import { makeSpec, type Difficulty, type Settings } from "../../src/core/spec/mapspec";

const genome = (W: number, H: number, settings: Settings, designedFor: Difficulty): Genome => {
  const g = drawGenome("lakeBasin", 7, W, H, 0);
  leanGenome(g, settings, W, H, 7, 0, designedFor);
  return g;
};
const shape = (W: number, H: number, settings: Settings, designedFor: Difficulty = "normal"): { shaped: boolean; before: Genome; g: Genome } => {
  const g = genome(W, H, settings, designedFor);
  const before = structuredClone(g);
  shapeLakeBasin(g, settings, W, H, 7, 0, designedFor);
  return { shaped: JSON.stringify(g) !== JSON.stringify(before), before, g };
};
const isLakeBasin = (g: Genome) => {
  expect(g.parts.filter((p) => p.kind === "basin" || p.kind === "caldera").map((p) => p.shape)).toEqual(["valley"]);
  expect(g.tiltKind).toBe("radial");
  expect(g.hydro.delta).toBe(0);
};

describe("Lake Basin round 2 shapes every Lake Basin map (D453; Kyler, 2026-10-03)", () => {
  const preset = (x: number, y = x) => makeSpec({ seed: 7, theme: "lakeBasin", size: { x, y } }).settings;

  it("the default Normal square map from 96² to 256²: one valley basin, a radial catchment", () => {
    for (const n of [96, 128, 256]) {
      const r = shape(n, n, preset(n));
      expect(r.shaped, `${n}²`).toBe(true);
      isLakeBasin(r.g);
      expect(r.g.hydro.lakeBudget).toBe(0.36);
    }
  });

  it("another difficulty, a small or non-square map, and a setting the player changed are shaped the same", () => {
    isLakeBasin(shape(128, 128, preset(128), "hard").g);
    isLakeBasin(shape(48, 48, preset(48)).g);
    isLakeBasin(shape(128, 96, preset(128, 96)).g);
    const changed = structuredClone(preset(128));
    changed.terrain.verticality = 90;
    isLakeBasin(shape(128, 128, changed).g);
  });

  it("the player's Rivers count and a Lakes setting away from the preset's keep their lean", () => {
    const rivers = structuredClone(preset(128));
    rivers.water.rivers = 3;
    const r = shape(128, 128, rivers);
    isLakeBasin(r.g);
    expect(r.g.hydro.exactInflows).toBe(true);
    expect(r.g.hydro.inflows).toBe(3);
    const lakes = structuredClone(preset(128));
    lakes.water.lakes = "none";
    const l = shape(128, 128, lakes);
    isLakeBasin(l.g);
    expect(l.g.hydro.lakeBudget).toBe(l.before.hydro.lakeBudget);
  });

  it("another theme keeps the shared path", () => {
    const g = drawGenome("riverValley", 7, 128, 128, 0);
    const s = preset(128);
    leanGenome(g, s, 128, 128, 7, 0, "normal");
    const before = JSON.stringify(g);
    shapeLakeBasin(g, s, 128, 128, 7, 0, "normal");
    expect(JSON.stringify(g)).toBe(before);
  });
});
