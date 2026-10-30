// Seeing the land behind objects (objectFade.ts): the region test the object program and the sun's depth pass share.
// Objects within the radius show a quarter of themselves and cast no shadow; past it they come back to full over a
// tile; with no region nothing changes. The dither keeps a quarter of the pixels at a quarter.

import { describe, expect, it } from "vitest";
import { DITHER_GLSL, OBJECT_FADE, OBJECT_FADE_EDGE, OBJECT_FADE_GLSL, objectFadeAt, shadowDropped, validRegion } from "../../src/render3d/objectFade";

describe("the fade round the pointer", () => {
  const region = { x: 10.5, y: 20.5, radius: 3 };

  it("fades every object within the radius to a quarter, and none past its edge", () => {
    expect(OBJECT_FADE).toBe(0.25);
    expect(objectFadeAt(region, 10.5, 20.5)).toBeCloseTo(0.25, 9);
    expect(objectFadeAt(region, 13.4, 20.5)).toBeCloseTo(0.25, 9);
    expect(objectFadeAt(region, 10.5, 23.5)).toBeCloseTo(0.25, 9);
    expect(objectFadeAt(region, 10.5 + 3 + OBJECT_FADE_EDGE, 20.5)).toBe(1);
    expect(objectFadeAt(region, 40, 40)).toBe(1);
  });

  it("comes back to full smoothly across the edge", () => {
    let last = 0;
    for (let d = 3; d <= 4; d += 0.05) {
      const a = objectFadeAt(region, 10.5 + d, 20.5);
      expect(a).toBeGreaterThanOrEqual(last);
      last = a;
    }
    expect(objectFadeAt(region, 10.5 + 3.5, 20.5)).toBeCloseTo((1 + OBJECT_FADE) / 2, 9);
  });

  it("is the same in every direction (a circle round the pointer)", () => {
    for (let k = 0; k < 16; k++) {
      const t = (k / 16) * Math.PI * 2;
      expect(objectFadeAt(region, 10.5 + 3.2 * Math.cos(t), 20.5 + 3.2 * Math.sin(t))).toBeCloseTo(objectFadeAt(region, 13.7, 20.5), 9);
    }
  });

  it("changes nothing with no region, and a radius of 0 fades only what stands at the point", () => {
    expect(objectFadeAt(null, 10.5, 20.5)).toBe(1);
    expect(shadowDropped(null, 10.5, 20.5)).toBe(false);
    const point = { x: 5, y: 5, radius: 0 };
    expect(objectFadeAt(point, 5, 5)).toBeCloseTo(0.25, 9);
    expect(objectFadeAt(point, 6.5, 5)).toBe(1);
  });

  it("drops the shadows of the objects faded more than halfway", () => {
    expect(shadowDropped(region, 10.5, 20.5)).toBe(true);
    expect(shadowDropped(region, 13.4, 20.5)).toBe(true);
    expect(shadowDropped(region, 10.5 + 3.4, 20.5)).toBe(true);
    expect(shadowDropped(region, 10.5 + 3.6, 20.5)).toBe(false);
    expect(shadowDropped(region, 30, 20.5)).toBe(false);
  });

  it("takes only a finite region with a radius of 0 or more", () => {
    expect(validRegion(null)).toBe(true);
    expect(validRegion(region)).toBe(true);
    expect(validRegion({ x: 0, y: 0, radius: -1 })).toBe(false);
    expect(validRegion({ x: Number.NaN, y: 0, radius: 1 })).toBe(false);
    expect(validRegion({ x: 0, y: Infinity, radius: 1 })).toBe(false);
  });

  it("is the shaders' own test: the same fade, edge and halfway mark", () => {
    expect(OBJECT_FADE_GLSL).toContain("mix(0.25, 1.0, smoothstep(objectFade.z, objectFade.z + 1.0, distance(at, objectFade.xy)))");
    expect(OBJECT_FADE_GLSL).toContain(`objectFadeAt(at) < ${(1 + OBJECT_FADE) / 2}`);
  });

  it("dithers a quarter of the pixels at a quarter, each threshold once in the 4 × 4 pattern", () => {
    const list = DITHER_GLSL.match(/int\[16\]\(([^)]*)\)/)![1].split(",").map((v) => Number(v.trim()));
    expect([...list].sort((a, b) => a - b)).toEqual(Array.from({ length: 16 }, (_, i) => i));
    // a pixel is kept where the fade is above its threshold, (b + 0.5) / 16
    const kept = list.filter((b) => OBJECT_FADE > (b + 0.5) / 16).length;
    expect(kept).toBe(4);
    // and the four kept are spread, one in each 2 × 2 quarter of the cell
    const at = list.map((b, i) => [i % 4, Math.floor(i / 4), b]).filter(([, , b]) => OBJECT_FADE > (b + 0.5) / 16);
    expect(new Set(at.map(([x, y]) => `${Math.floor(x / 2)}${Math.floor(y / 2)}`)).size).toBe(4);
  });
});
