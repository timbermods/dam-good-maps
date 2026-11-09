// The game's refraction of the ground behind its water (Q9 P2) and its waterfall mask (Q9 P1), fix/water-refraction
// (D496, D497): the mask worked out from our water as the game's FindWaterfalls works it out from its own and read by
// the pixel shader as the game's reads it; the refraction drawn in the looks that follow the game's high-quality water
// (Standard and High), at the game's weights, drift, scale and falloff, its noise ours at the game's statistics.

import { describe, expect, it, vi } from "vitest";
import { DataTexture, Vector2, type WebGLRenderer } from "three";
import { FALL_MASK, FALL_MASK_GLSL, fallBytes, fallMask, fallMaskAt } from "../../src/render3d/fallMask";
import { Refraction, WATER_REFRACTION, refractionUniforms } from "../../src/render3d/refraction";
import { sceneUniforms, waterMaterial } from "../../src/render3d/materials";
import { waterHooks } from "../../src/render3d/high/shaders";
import { bakeFlow } from "../../src/render3d/high/bake";
import { WATER_SURFACE, waterSeeThrough, WATER_GLSL } from "../../src/render3d/waterPalette";
import { featureTiles, lattice, valueNoise } from "../../src/render3d/waterTextures";

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A W × H map of water at the given surfaces (NaN dry), each a level deep. */
function water(W: number, H: number, at: (x: number, y: number) => number) {
  const surface = new Float32Array(W * H);
  const depth = new Float32Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const s = at(x, y);
      surface[y * W + x] = s;
      depth[y * W + x] = Number.isNaN(s) ? 0 : 1;
    }
  return { surface, depth, contamination: new Float32Array(W * H) };
}

describe("the waterfall mask (Q9 P1)", () => {
  it("lies on the tile a fall lands in, rising from a step of 0.35 to whole at 0.6, as FindWaterfalls'", () => {
    for (const step of [0.1, 0.35, 0.4, 0.5, 0.6, 1, 3]) {
      // (a row: two tiles high, two low)
      const m = fallMask(4, 1, water(4, 1, (x) => (x < 2 ? 5 + step : 5)));
      expect(m[2], `${step}`).toBeCloseTo(smooth(FALL_MASK.from, FALL_MASK.to, step), 6);
      // (none above the fall, nor beyond the tile it lands in)
      expect(m[0]).toBe(0);
      expect(m[1]).toBe(0);
      expect(m[3]).toBe(0);
    }
    expect([FALL_MASK.from, FALL_MASK.to, FALL_MASK.tap]).toEqual([0.35, 0.6, 0.075]);
  });

  it("links a corner neighbour only where both tiles between are linked to both (BreakCornerLinks, read again 2026-11-08), and none to a dry tile", () => {
    // (a high tile at the corner of a low one; the tiles between dry, one of them wet at the low level, then both: the
    // game's BreakCornerLinks keeps a corner link only where the corner's tile is linked to both tiles between, and
    // BreakCornerLinksReversed breaks it both ways; D148: this test had the rule backwards, "only where both are dry")
    const corner = (a: number, b: number) => fallMask(2, 2, water(2, 2, (x, y) => (x === 0 && y === 0 ? 6 : x === 1 && y === 1 ? 5 : x === 1 ? a : b)));
    expect(corner(NaN, NaN)[3]).toBe(0);
    expect(corner(5, NaN)[3]).toBe(0);
    expect(corner(5, 5)[3]).toBe(1);
    // (a dry tile is no neighbour, whatever its ground)
    expect(fallMask(2, 1, water(2, 1, (x) => (x === 0 ? NaN : 5)))[1]).toBe(0);
  });

  it("rides the water's flow texture's A: 0 a dry tile, 1 + 254 × the mask a wet one, in both looks' bakes", () => {
    const sw = water(4, 1, (x) => (x === 0 ? NaN : x === 1 ? 6 : 5));
    expect([...fallBytes(4, 1, sw)]).toEqual([0, 1, 255, 1]);
    const flow = bakeFlow(4, 1, { ...sw, flowX: new Float32Array(4), flowY: new Float32Array(4) } as never).flow;
    expect([flow[3], flow[7], flow[11], flow[15]]).toEqual([0, 1, 255, 1]);
  });

  it("is read as the game's pixel shader reads it: four taps round the point, by their distance to the nearest corner, dry tiles left out, sharpened", () => {
    // (one fall's foot, whole, among plain water, and a dry tile beside)
    const bytes = [1, 255, 1, 0];
    // its middle: all four taps on it, whole
    expect(fallMaskAt(4, 1, bytes, 1.5, 0.5)).toBe(1);
    // beside a plain tile, a tap on each: half the weight each at the edge between them, so m = 0.5, sharpened to 1
    expect(fallMaskAt(4, 1, bytes, 2, 0.5)).toBe(1);
    // a quarter of the mask: sharpened to saturate(m + smoothstep(0, 0.5, m)), the game's
    const m = 0.25;
    expect(fallMaskAt(1, 1, [1 + 254 * m], 0.5, 0.5)).toBeCloseTo(m + smooth(0, 0.5, m), 2);
    // a tap on a dry tile counts for nothing: the plain tile's mask alone
    expect(fallMaskAt(4, 1, bytes, 3, 0.5)).toBe(0);
    // the shader is the same: its taps, the texel centres it reads, its weights and its sharpening
    expect(FALL_MASK_GLSL).toContain(`vec2 p = g + s * ${FALL_MASK.tap};`);
    expect(FALL_MASK_GLSL).toContain("texture2D(flowTex, (floor(p) + 0.5) / mapSize).a * 255.0");
    expect(FALL_MASK_GLSL).toContain("vec2 c = floor(g + 0.5);");
    expect(FALL_MASK_GLSL).toContain("return min(1.0, m + t * t * (3.0 - 2.0 * t));");
  });

  it("moves the see-through to the game's waterfall depth and takes the camera highlight off", () => {
    // (_TransparencyDepth 0.35 to _TransparencyWaterfallDepth 0.2, × 0.5)
    expect(waterSeeThrough(0, 0)).toBeCloseTo(1 - WATER_SURFACE.seeThrough, 9);
    expect(waterSeeThrough(0, 1)).toBeCloseTo(1 - WATER_SURFACE.fallSeeThrough, 9);
    expect(waterSeeThrough(1, 0.5)).toBeCloseTo(1 - ((WATER_SURFACE.seeThrough + WATER_SURFACE.fallSeeThrough) / 2) * (1 - 1 / WATER_SURFACE.seeThroughTo), 9);
    expect(WATER_GLSL).toContain(`mix(${WATER_SURFACE.seeThrough}, ${WATER_SURFACE.fallSeeThrough}, waterFall)`);
  });
});

describe("the refraction (Q9 P2)", () => {
  it("has the game's terms: its weights, drift, scale and falloff", () => {
    expect(WATER_REFRACTION.weights).toEqual([0.003, 0.004]);
    expect(WATER_REFRACTION.speed).toBe(0.075);
    expect(WATER_REFRACTION.scale).toBe(1.1);
    expect(WATER_REFRACTION.falloff).toEqual([40, 60]);
    expect(WATER_REFRACTION.looks).toEqual({ standard: true, high: true });
  });

  it("moves by a noise of our own at the game's PerlinNoise3 statistics: its half-width, mean and spread", () => {
    // (the pattern texture's value noise: a smoothstep-interpolated lattice, as the shader's; its half-width in cells)
    const N = WATER_REFRACTION.noise;
    const P = 64;
    const S = 512;
    const l = lattice(P, 7);
    const v = new Float64Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) v[y * S + x] = valueNoise(l, x / S, y / S);
    const cells = featureTiles(v, S, P);
    expect(Math.abs(cells / N.cells / N.halfWidth - 1)).toBeLessThan(0.05);
    const n = Array.from(v, (x) => Math.max(-1, Math.min(1, (x - 0.5) * N.gain + N.mean)));
    const mean = n.reduce((a, x) => a + x, 0) / n.length;
    const spread = Math.sqrt(n.reduce((a, x) => a + (x - mean) ** 2, 0) / n.length);
    expect(Math.abs(spread / N.spread - 1)).toBeLessThan(0.05);
    expect(Math.abs(mean - N.mean)).toBeLessThan(0.03);
  });

  it("copies the screen once a view's frame, just before its first refracting water, never into a picture", () => {
    const u = refractionUniforms();
    const r = new Refraction(u);
    const copy = vi.fn();
    const blit = vi.fn();
    let target: unknown = null;
    const ctx = {
      READ_FRAMEBUFFER: 1,
      DRAW_FRAMEBUFFER: 2,
      COLOR_BUFFER_BIT: 4,
      LINEAR: 5,
      createFramebuffer: () => ({}),
      deleteFramebuffer: vi.fn(),
      framebufferTexture2D: vi.fn(),
      blitFramebuffer: blit,
    };
    const gl = {
      getRenderTarget: () => target,
      getDrawingBufferSize: (v: Vector2) => v.set(321, 200),
      copyFramebufferToTexture: copy,
      initRenderTarget: vi.fn(),
      getContext: () => ctx,
      properties: { get: () => ({ __webglTexture: {}, __webglFramebuffer: {} }) },
      state: { bindFramebuffer: vi.fn() },
    } as unknown as WebGLRenderer;
    const refracts = { defines: { WATER_REFRACTS: 1 } } as never;
    const light = { defines: { WATER_REFRACTS: 0 } } as never;
    // (outside a view's frame: nothing)
    r.before(gl, null, null as never, null, refracts);
    expect(copy).not.toHaveBeenCalled();
    // (the light look's water never asks for it)
    r.begin(true);
    r.before(gl, null, null as never, null, light);
    expect(copy).not.toHaveBeenCalled();
    r.before(gl, null, null as never, null, refracts);
    r.before(gl, null, null as never, null, refracts);
    expect(copy).toHaveBeenCalledTimes(1);
    expect(u.refractView.value.toArray()).toEqual([1, 0, 1 / 321, 1 / 200]);
    expect(u.refractTex.value?.image.width).toBe(321);
    // (URP's opaque texture at the game's m_OpaqueDownsampling 1, _2xBilinear: half the size, by integer division, the
    // screen's copy blitted to it with a linear filter)
    expect(WATER_REFRACTION.downsampling).toBe(2);
    expect(u.refractHalf.value?.image.width).toBe(160);
    expect(u.refractHalf.value?.image.height).toBe(100);
    expect(blit).toHaveBeenCalledTimes(1);
    expect(blit).toHaveBeenCalledWith(0, 0, 321, 200, 0, 0, 160, 100, 4, 5);
    r.end();
    expect(u.refractView.value.x).toBe(0);
    // (a frame drawn into a render target, a picture: none)
    target = {};
    r.begin(true);
    r.before(gl, null, null as never, null, refracts);
    expect(copy).toHaveBeenCalledTimes(1);
    expect(u.refractView.value.x).toBe(0);
    r.end();
    r.dispose();
    expect(u.refractTex.value).toBe(null);
    expect(u.refractHalf.value).toBe(null);
    expect(ctx.deleteFramebuffer).toHaveBeenCalledTimes(1);
  });
});

describe("the looks that draw them: Standard and High, as the game's high-quality water; the light look neither", () => {
  const t = () => new DataTexture(new Uint8Array(4), 1, 1);
  const U = () => sceneUniforms(1, 1, t(), t(), t(), t());
  const looks = {
    standard: waterMaterial(U(), false),
    high: waterMaterial(U(), false, waterHooks()),
    light: waterMaterial(U(), true),
  };

  it("draws both terms in Standard and High", () => {
    for (const look of ["standard", "high"] as const) {
      const m = looks[look];
      expect(m.defines.WATER_REFRACTS, look).toBe(1);
      expect(m.defines.LITE, look).toBe(0);
      expect(m.fragmentShader, look).toContain("vec3 waterRefraction(vec2 g, vec3 world, float alpha, float shore, float film)");
      expect(m.fragmentShader, look).toContain("c += waterRefraction(g, vWorld, alpha, shore, film);");
      expect(m.fragmentShader, look).toContain("float waterFallMask(vec2 g)");
      expect(m.fragmentShader, look).toContain("waterFall = waterFallMask(g);");
      // (the refraction and the camera highlight both × (1 − the mask))
      expect(m.fragmentShader, look).toContain("(1.0 - waterFall) * film");
      expect(m.fragmentShader, look).toMatch(/waterCameraHighlight\([^;]*\* \(1\.0 - waterFall\);/);
      expect(m.uniforms.refractTex, look).toBeDefined();
      expect(m.uniforms.refractHalf, look).toBeDefined();
      // (the ground behind shows from the half-size copy, at the moved position; the blend's own from the full one)
      expect(m.fragmentShader, look).toContain("texture2D(refractHalf, clamp(here + shift, 0.0, 1.0))");
    }
  });

  it("draws neither in the light look, as the game's Low quality", () => {
    expect(looks.light.defines.WATER_REFRACTS).toBe(0);
    expect(looks.light.defines.LITE).toBe(1);
    // (both behind the looks' switches: the refraction's own define, the mask under !LITE)
    expect(looks.light.fragmentShader).toMatch(/#if WATER_REFRACTS\s+c \+= waterRefraction/);
    expect(looks.light.fragmentShader).toMatch(/#if !LITE\s+waterFall = waterFallMask\(g\);/);
  });
});
