// The opening picture (analysis/picture.ts) reads the land as the game draws it (D496): its grass rule is the
// renderer's desert rule, and a map's picture is the same everywhere and quick enough to score every Showcase
// candidate (D453).

import { describe, expect, it } from "vitest";
import { GRASS_RULE, PICTURE_H, PICTURE_W, PIXEL } from "../../src/core/analysis/picture";
import { generate } from "../../src/core/gen/generate";
import { looksOf } from "../../src/core/gen/showcase";
import { makeSpec } from "../../src/core/spec/mapspec";
import { DESERT } from "../../src/render3d/palette";

describe("the opening picture", () => {
  it("its grass rule is the renderer's desert rule (the game's SoilMoistureSimulatorSpec)", () => {
    expect(GRASS_RULE).toEqual(DESERT);
  });

  it("shows the land, its water and its sky, the same each time", () => {
    const r = generate(makeSpec({ seed: 4242, theme: "riverValley", size: { x: 64, y: 64 } }));
    const a = looksOf(r)!;
    const b = looksOf(r)!;
    expect(a.picture.w * a.picture.h).toBe(PICTURE_W * PICTURE_H);
    expect(Buffer.from(a.picture.kind).equals(Buffer.from(b.picture.kind))).toBe(true);
    expect(a.looks).toEqual(b.looks);
    const seen = new Set(a.picture.kind);
    for (const k of [PIXEL.void, PIXEL.water, PIXEL.grass]) expect(seen.has(k)).toBe(true);
    for (const v of Object.values(a.looks)) expect(Number.isFinite(v)).toBe(true);
  }, 120_000);
});
