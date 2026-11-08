// The game's own pattern over its water sources in play (Q9 P7, fix/water-shore): a seep's (2 × 2, while it can run)
// and a badwater source's (3 × 3, while its strength is over 0), none over the plain water source. Its `WaterSourceShape`
// drawn in polar coordinates round the footprint's middle, streaming out, gone at its inscribed circle; it lifts clean
// water's colour toward the detail albedo and tints badwater's emission. Ours is made in code at the game's statistics
// (waterTextures.ts `makeSourceShape`; tools/game-water-shader.py --textures measures the game's: numbers only), and every
// look draws it, under our rings and bubbles (D196, an editing aid).

import { describe, expect, it } from "vitest";
import { DataTexture } from "three";
import { badwaterPatternTexture, SEEP_MARK, sceneUniforms, waterMaterial } from "../../src/render3d/materials";
import { waterHooks } from "../../src/render3d/high/shaders";
import { entityView } from "../../src/render3d/model";
import { markSourceTiles } from "../../src/render3d/sourceMarks";
import { GAME_WATER_SOURCE, WATER_GLSL } from "../../src/render3d/waterPalette";
import { featureTiles, GAME_SOURCE_SHAPE as G, makeBadwaterTexture, makeSourceShape, PATTERN_PERCENTILES } from "../../src/render3d/waterTextures";

const N = 512;
const tex = () => new DataTexture(new Uint8Array(4), 1, 1);
const U = () => sceneUniforms(1, 1, tex(), tex(), tex(), tex());

describe("the water sources' own pattern (Q9 P7)", () => {
  it("is a pattern of our own at the game's statistics: its distribution, its feature scale, and it rides in badwater's texture's A", () => {
    const shape = makeSourceShape(N);
    const n = shape.length;
    const mean = shape.reduce((a, v) => a + v, 0) / n;
    const spread = Math.sqrt(shape.reduce((a, v) => a + (v - mean) ** 2, 0) / n);
    expect(Math.abs(mean - G.mean)).toBeLessThan(1.5);
    expect(Math.abs(spread / G.spread - 1)).toBeLessThan(0.03);
    const sorted = Uint8Array.from(shape).sort();
    PATTERN_PERCENTILES.forEach((q, k) => expect(Math.abs(sorted[Math.floor(q * (n - 1))] - G.percentiles[k]), `${q}`).toBeLessThanOrEqual(1));
    // (soft blobs about 27 texels of 1024 across at their half-width)
    expect(Math.abs(featureTiles(shape, N, 1) / G.feature - 1)).toBeLessThan(0.1);
    const bad = makeBadwaterTexture(64);
    const small = makeSourceShape(64);
    for (const i of [0, 100, 2000, 4095]) expect(bad[i * 4 + 3]).toBe(small[i]);
    // (flat at its mean until the bake worker has made it)
    expect((badwaterPatternTexture().image.data as Uint8Array)[3]).toBe(Math.round(G.mean));
  });

  it("is marked where the game draws it: a badwater source's middle while it runs, a seep's first tile but in a drought, never the plain source", () => {
    const W = 8;
    const e = entityView([
      { template: "WaterSource", x: 1, y: 1, z: 2, orientation: "Cw0", owner: "", strength: 2 },
      { template: "BadwaterSource", x: 4, y: 4, z: 2, orientation: "Cw0", owner: "", strength: 1 },
      { template: "BadwaterSource", x: 4, y: 0, z: 2, orientation: "Cw0", owner: "", strength: 0 },
      { template: "WaterSeep", x: 0, y: 5, z: 2, orientation: "Cw0", owner: "" },
      { template: "BadwaterSeep", x: 6, y: 1, z: 2, orientation: "Cw90", owner: "" },
    ]);
    const d = new Uint8Array(W * W * 4);
    const at = (x: number, y: number) => Array.from(d.subarray((y * W + x) * 4, (y * W + x) * 4 + 2));
    markSourceTiles(d, e, W, W, false);
    expect(at(1, 1)).toEqual([255, 0]);
    expect(at(5, 5)).toEqual([0, 255]);
    // (no strength: its rings stay, under the rings' threshold of a half it is not; the pattern's 255 it is not)
    expect(at(5, 1)).toEqual([0, 254]);
    expect(at(0, 5)).toEqual([SEEP_MARK, 0]);
    // (turned, its footprint's first tile)
    const seep = [...Array(W * W).keys()].filter((i) => d[i * 4] === SEEP_MARK);
    expect(seep).toHaveLength(2);
    expect(SEEP_MARK / 255).toBeLessThan(0.5);
    markSourceTiles(d, e, W, W, true);
    expect([...Array(W * W).keys()].filter((i) => d[i * 4] === SEEP_MARK)).toHaveLength(0);
    expect(at(5, 5)).toEqual([0, 255]);
  });

  it("is the game's term in every look: its shape streaming out, the lift of clean water, badwater's emission tinted and its overlay held back", () => {
    // (the game's: s = saturate(8 × shape × k² + min(1, 2.5 k⁶)), k = max(0, 1 − 2r): whole at the middle, gone at r 0.5)
    const s = (shape: number, r: number) => {
      const k = Math.max(0, 1 - 2 * r);
      return Math.min(1, 8 * shape * k * k + Math.min(1, 2.5 * k ** 6));
    };
    expect(s(0, 0)).toBe(1);
    expect(s(1, 0.5)).toBe(0);
    expect(s(0, 0.25)).toBeCloseTo(2.5 / 64, 6);
    for (const m of [waterMaterial(U()), waterMaterial(U(), false, waterHooks()), waterMaterial(U(), true)]) {
      const f = m.fragmentShader;
      expect(f).toContain("waterSource = n.y > 0.5 ? waterSourcePattern(g) : 0.0;");
      expect(f).toContain(`2.0 * r - ${GAME_WATER_SOURCE.scroll} * time`);
      expect(f).toContain("clamp(8.0 * shape * k2 + min(1.0, 2.5 * k2 * k2 * k2), 0.0, 1.0)");
      expect(f).toContain("a = waterSourceLift(a);");
      // (our rings, D196, after it: an editing aid over the game's own)
      expect(f.indexOf("every source wells up")).toBeGreaterThan(f.indexOf("waterSource = n.y"));
    }
    expect(WATER_GLSL).toContain(`(max(a, waterSource * waterDetail) - a) * ${GAME_WATER_SOURCE.lift}`);
    expect(WATER_GLSL).toContain("col = mix(col, over, (1.0 - c * 0.5) * (1.0 - waterSource));");
    expect(WATER_GLSL).toMatch(/pattern = mix\(pattern, 0\.74\d*, waterSource\);/);
    const tint = GAME_WATER_SOURCE.colour.map((v) => v * GAME_WATER_SOURCE.strength);
    tint.forEach((v) => expect(v).toBeGreaterThan(0.5));
  });
});
