// Lake Basin round 2 (PLAN §20 D453, D458): one valley basin in a stronger radial catchment, only on
// the default Normal square Lake Basin map from 96² to 256². Every other spec keeps the shared path:
// a setting the player changed, another difficulty, a size outside the range, a non-square map.

import { describe, expect, it } from "vitest";
import { drawGenome, leanGenome, type Genome } from "../../src/core/land/genome";
import { shapeLakeBasin } from "../../src/core/land/lakeBasin";
import { makeSpec, type Difficulty, type Settings } from "../../src/core/spec/mapspec";

const genome = (W: number, H: number, settings: Settings, designedFor: Difficulty): Genome => {
  const g = drawGenome("lakeBasin", 7, W, H, 0);
  leanGenome(g, settings, W, H, 7, 0, designedFor);
  return g;
};
const shaped = (W: number, H: number, settings: Settings, designedFor: Difficulty = "normal"): boolean => {
  const g = genome(W, H, settings, designedFor);
  const before = JSON.stringify(g);
  shapeLakeBasin(g, settings, W, H, 7, 0, designedFor);
  return JSON.stringify(g) !== before;
};

describe("Lake Basin round 2 shapes the default map only (D453)", () => {
  const preset = (n: number) => makeSpec({ seed: 7, theme: "lakeBasin", size: { x: n, y: n } }).settings;

  it("the default Normal square map from 96² to 256²: one valley basin, a radial catchment", () => {
    for (const n of [96, 128, 256]) {
      expect(shaped(n, n, preset(n)), `${n}²`).toBe(true);
      const g = genome(n, n, preset(n), "normal");
      shapeLakeBasin(g, preset(n), n, n, 7, 0, "normal");
      expect(g.parts.filter((p) => p.kind === "basin" || p.kind === "caldera").map((p) => p.shape)).toEqual(["valley"]);
      expect(g.tiltKind).toBe("radial");
      expect(g.hydro.delta).toBe(0);
    }
  });

  it("anything else keeps the shared path", () => {
    expect(shaped(128, 128, preset(128), "hard")).toBe(false);
    expect(shaped(48, 48, preset(48))).toBe(false);
    expect(shaped(128, 96, makeSpec({ seed: 7, theme: "lakeBasin", size: { x: 128, y: 96 } }).settings)).toBe(false);
    const changed = structuredClone(preset(128));
    changed.terrain.verticality = 90;
    expect(shaped(128, 128, changed)).toBe(false);
  });
});
