// The game's own pattern over its water sources in play (Q9 P7, fix/water-shore): a seep's (2 × 2, while it can run)
// and a badwater source's (3 × 3, while its strength is over 0), none over the plain water source. Its `WaterSourceShape`
// drawn in polar coordinates round the footprint's middle, streaming out, gone at its inscribed circle; it lifts clean
// water's colour toward the detail albedo and tints badwater's emission. Ours is made in code at the game's statistics
// (waterTextures.ts `makeSourceShape`; tools/game-water-shader.py --textures measures the game's: numbers only), and every
// look draws it, under our rings and bubbles (D249, an editing aid shown only with Markers on, D497).

import { describe, expect, it } from "vitest";
import { DataTexture } from "three";
import { badwaterPatternTexture, sceneUniforms, SOURCE_FOOTPRINT as F, waterMaterial } from "../../src/render3d/materials";
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

  it("is marked where the game draws it, each tile its place in the footprint: a badwater source's 3 × 3 while it runs, a seep's 2 × 2 but in a drought, never the plain source", () => {
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
    const seepTiles = () => [...Array(W * W).keys()].filter((i) => d[i * 4] >= F.seep && d[i * 4] < F.seep + 4).length;
    markSourceTiles(d, e, W, W, false);
    // (the plain water source: its rings' mark alone)
    expect(at(1, 1)).toEqual([255, 0]);
    // (a running badwater source: its rings' mark at its middle, and its nine tiles from its least corner, in rows)
    expect(at(5, 5)).toEqual([F.square + 4, 255]);
    expect(at(4, 4)).toEqual([F.square, 0]);
    expect(at(6, 4)).toEqual([F.square + 2, 0]);
    expect(at(4, 6)).toEqual([F.square + 6, 0]);
    // (no strength: its rings stay, the game's pattern does not)
    expect(at(5, 1)).toEqual([0, 254]);
    expect(at(4, 0)).toEqual([0, 0]);
    // (a seep's four tiles, turned or not)
    expect([at(0, 5), at(1, 5), at(0, 6), at(1, 6)].map((v) => v[0])).toEqual([F.seep, F.seep + 1, F.seep + 2, F.seep + 3]);
    expect(seepTiles()).toBe(8);
    // (every place under the rings' threshold, so they draw none where they drew none)
    expect((F.seep + 3) / 255).toBeLessThan(0.5);
    markSourceTiles(d, e, W, W, true);
    expect(seepTiles()).toBe(0);
    expect(at(5, 5)).toEqual([F.square + 4, 255]);
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
      expect(f).toContain("return clamp(8.0 * shape * k2 + min(1.0, 2.5 * k2 * k2 * k2), 0.0, 1.0);");
      expect(f).toContain("a = waterSourceLift(a);");
      // (our rings, D249, after it: an editing aid over the game's own, with Markers on)
      expect(f.indexOf("every source wells up")).toBeGreaterThan(f.indexOf("waterSource = n.y"));
    }
    expect(WATER_GLSL).toContain(`(max(a, waterSource * waterDetail) - a) * ${GAME_WATER_SOURCE.lift}`);
    expect(WATER_GLSL).toContain("col = mix(col, over, (1.0 - c * 0.5) * (1.0 - waterSource));");
    expect(WATER_GLSL).toMatch(/pattern = mix\(pattern, 0\.74\d*, waterSource\);/);
    const tint = GAME_WATER_SOURCE.colour.map((v) => v * GAME_WATER_SOURCE.strength);
    tint.forEach((v) => expect(v).toBeGreaterThan(0.5));
  });

  it("leaves our rings and bubbles to Markers (D249, D497): off, they mix in nothing; on, they show as before", () => {
    /** Whether the place `at` in `src` lies inside a branch taken only with Markers on. */
    const underMarkers = (src: string, at: number) => {
      const open = "if (markers > 0.5) {";
      for (let k = src.indexOf(open); k >= 0 && k < at; k = src.indexOf(open, k + 1)) {
        let depth = 0;
        let end = k + open.length - 1;
        for (; end < src.length; end++) {
          depth += src[end] === "{" ? 1 : src[end] === "}" ? -1 : 0;
          if (depth === 0) break;
        }
        if (at < end) return true;
      }
      return false;
    };
    const u = U();
    for (const m of [waterMaterial(u), waterMaterial(u, false, waterHooks())]) {
      // (the renderer's one Markers switch reaches the water in Standard and High: the scene's own uniform, off when a
      // map opens)
      expect(m.uniforms.markers).toBe(u.markers);
      expect(u.markers.value).toBe(0);
      const f = m.fragmentShader;
      const start = f.indexOf("every source wells up with Markers on");
      expect(start).toBeGreaterThan(0);
      const block = f.slice(start, f.indexOf("#endif", start));
      // off: every term the rings and bubbles add sits under the switch (up, its badwater colour, its mix into the
      // water), and nothing else writes them, so the water over a plain source is the plain surface
      for (const term of ["up = max(up, here);", "badSrc = max(badSrc, sv.g * here);", "c = mix(c, uc, up * 0.55);", "alpha = max(alpha, mix(alpha, 0.85, up * 0.5));"]) {
        expect(block.indexOf(term), term).toBeGreaterThan(0);
        expect(underMarkers(block, block.indexOf(term)), term).toBe(true);
      }
      expect(block.match(/(?<!float )\b(up|badSrc) = /g)).toEqual(["up = ", "badSrc = "]);
      // on: the rings as they were, 0.07 tiles wide, 1.4 tiles out every 1 / 0.35 s, mixed in by up to 0.8 × 0.55
      expect(block).toContain("float ph = fract(time * 0.35 + (sq.x * 0.37 + sq.y * 0.61));");
      expect(block).toContain("(1.0 - smoothstep(0.0, 0.07, abs(d - ph * 1.4))) * (1.0 - ph)");
      expect(block).toContain("float here = max(ring * 0.8, bub) * (1.0 - smoothstep(1.1, 1.5, d));");
      // (the hover's glow on the sources feeding the pointer's water is its own channel, with or without Markers)
      expect(underMarkers(block, block.indexOf("hl = max(hl, sv.b"))).toBe(false);
      expect(underMarkers(block, block.indexOf("c = mix(c, WATER_SOURCE_GLOW, hl * 0.45);"))).toBe(false);
    }
  });
});
