// Map look, badwater blends into clean water (PLAN §20 D177): each water tile is coloured by its
// badwater share, blended over the connected water a few tiles round and shared at the tops'
// corners, so where badwater meets clean water the colour turns in a soft gradient over several
// tiles, never in streaks or patches; clean water stays exactly as it was; water partly bad darkens
// in proportion and turns early from teal through a teal-grey and a warm brown to crimson, never
// purple (Kyler's reviews of #41); badwater is #38's approved crimson, matte and nearly opaque, and
// darkens with depth (option A).

import { describe, expect, it } from "vitest";
import { DataTexture } from "three";
import { sceneUniforms, waterMaterial } from "../../src/render3d/materials";
import { CHUNK } from "../../src/render3d/mesh";
import { surfaceWater, waterFromDepth, type SurfaceWater } from "../../src/render3d/model";
import { BADWATER, badwaterBody, badwaterOpacity, cleanWaterBody, WATER, WATER_BLEND, WATER_CALIBRATION, WATER_GLSL, waterBlend, waterBody } from "../../src/render3d/waterPalette";
import { blendedBadwater, changedWaterChunks, lowerByTile, meshWaterChunk, type WaterMeshData } from "../../src/render3d/waterMesh";

/** CIE L* of a display colour (sRGB). */
const lightness = (c: readonly number[]) => {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const y = 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
};

/** A map of one level (ground at 2, water 0.6 deep where `wet`), with each tile's badwater share. */
function flat(W: number, H: number, share: (x: number, y: number) => number, wet: (x: number, y: number) => boolean = () => true) {
  const heights = new Uint8Array(W * H).fill(2);
  const depth = new Float64Array(W * H);
  const cont = new Float64Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!wet(x, y)) {
        heights[y * W + x] = 4;
        continue;
      }
      depth[y * W + x] = 0.6;
      cont[y * W + x] = share(x, y);
    }
  const view = waterFromDepth(heights, depth, cont);
  const sw = surfaceWater(W, H, view);
  return { heights, view, sw };
}

/** The badwater share at each corner of the water tops (tile-corner coordinates "x,y"). */
function cornerShares(meshes: WaterMeshData[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const m of meshes)
    for (let q = 0; q < m.quads; q++) {
      if (m.normals[q * 12 + 1] <= 0) continue;
      for (let v = 0; v < 4; v++) {
        const k = q * 4 + v;
        const key = `${Math.round(m.positions[k * 3])},${Math.round(-m.positions[k * 3 + 2])}`;
        const c = m.data[k * 2 + 1];
        // a corner shared by several tops has one share
        if (out.has(key)) expect(out.get(key)).toBeCloseTo(c, 6);
        out.set(key, c);
      }
    }
  return out;
}

/** Every chunk's water mesh. */
function meshAll(W: number, H: number, heights: Uint8Array, sw: SurfaceWater, view: ReturnType<typeof waterFromDepth>): WaterMeshData[] {
  const out: WaterMeshData[] = [];
  for (let cy = 0; cy * CHUNK < H; cy++) for (let cx = 0; cx * CHUNK < W; cx++) out.push(meshWaterChunk(W, H, heights, sw, view, lowerByTile(sw, view), cx, cy));
  return out;
}

describe("badwater meeting clean water", () => {
  it("turns in a soft gradient over several tiles, with no big step between neighbouring tiles", () => {
    // badwater west of x = 16, clean water east of it, 32 × 9 tiles of one water
    const W = 32;
    const H = 9;
    const { heights, view, sw } = flat(W, H, (x) => (x < 16 ? 1 : 0));
    const shares = cornerShares(meshAll(W, H, heights, sw, view));
    for (let y = 0; y <= H; y++) {
      const row = Array.from({ length: W + 1 }, (_, x) => shares.get(`${x},${y}`)!);
      // far from the front: pure badwater and clean water, exactly
      for (let x = 0; x <= 12; x++) expect(row[x]).toBe(1);
      for (let x = 20; x <= W; x++) expect(row[x]).toBe(0);
      // across it: always turning one way, never a step between neighbouring corners above 0.3
      for (let x = 1; x <= W; x++) {
        expect(row[x]).toBeLessThanOrEqual(row[x - 1]);
        expect(row[x - 1] - row[x]).toBeLessThan(0.3);
      }
      // the gradient spans several tiles: between 5% and 95% bad over at least 4
      expect(row.filter((c) => c > 0.05 && c < 0.95).length).toBeGreaterThanOrEqual(4);
      // the colour follows the same way, a level deep: no step above 6 L* between corners
      for (let x = 1; x <= W; x++) expect(Math.abs(lightness(waterBody(1, row[x])) - lightness(waterBody(1, row[x - 1])))).toBeLessThan(6);
    }
    // the tiles' blended shares: the same (a front along a column blends along the rows)
    const b = blendedBadwater(W, H, sw);
    for (let x = 1; x < W; x++) expect(b[4 * W + x - 1] - b[4 * W + x]).toBeLessThan(0.33);
  });

  it("blends a diagonal front and a narrow tongue of badwater too, without steps", () => {
    const W = 40;
    const H = 40;
    // a diagonal front, and a tongue of badwater 3 tiles wide running into clean water
    for (const share of [(x: number, y: number) => (x + y < 40 ? 1 : 0), (x: number, y: number) => (y < 20 && x >= 18 && x < 21 ? 1 : 0)]) {
      const { heights, view, sw } = flat(W, H, share);
      const shares = cornerShares(meshAll(W, H, heights, sw, view));
      for (let y = 0; y <= H; y++)
        for (let x = 0; x <= W; x++) {
          const c = shares.get(`${x},${y}`)!;
          if (x > 0) expect(Math.abs(c - shares.get(`${x - 1},${y}`)!)).toBeLessThan(0.3);
          if (y > 0) expect(Math.abs(c - shares.get(`${x},${y - 1}`)!)).toBeLessThan(0.3);
        }
    }
    // the tongue still reads as badwater along its middle, well away from its tip: its hue all the
    // way to badwater's and darkened over half way
    const { heights, view, sw } = flat(W, H, (x, y) => (y < 20 && x >= 18 && x < 21 ? 1 : 0));
    const shares = cornerShares(meshAll(W, H, heights, sw, view));
    const mid = waterBlend((shares.get("19,5")! + shares.get("20,5")!) / 2);
    expect(mid.hue).toBeGreaterThan(0.95);
    expect(mid.darken).toBeGreaterThan(0.5);
  });

  it("leaves clean water exactly as it was", () => {
    // no badwater anywhere: every share 0, and clean water's colour is the clean body itself
    const W = 20;
    const H = 6;
    const { heights, view, sw } = flat(W, H, () => 0);
    for (const m of meshAll(W, H, heights, sw, view)) for (let k = 0; k < m.quads * 4; k++) expect(m.data[k * 2 + 1]).toBe(0);
    expect(waterBlend(0)).toEqual({ darken: 0, hue: 0, opacity: 0, surface: 0 });
    for (const d of [0.05, 0.25, 1, 3]) for (const fromBank of [0, 1]) expect(waterBody(d, 0, fromBank)).toEqual(waterBody(d, false, fromBank));
    // clean water far from badwater is 0 too, exactly
    const front = flat(W, H, (x) => (x < 3 ? 1 : 0));
    const b = blendedBadwater(W, H, front.sw);
    for (let y = 0; y < H; y++) for (let x = 7; x < W; x++) expect(b[y * W + x]).toBe(0);
  });

  it("keeps a pool of pure badwater pure, and never blends across dry ground or a fall", () => {
    // a pond of badwater (x < 5) and one of clean water (x > 5), a dry tile between them
    const W = 11;
    const H = 5;
    const ponds = flat(W, H, (x) => (x < 5 ? 1 : 0), (x) => x !== 5);
    const b = blendedBadwater(W, H, ponds.sw);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < 5; x++) expect(b[y * W + x]).toBe(1);
      for (let x = 6; x < W; x++) expect(b[y * W + x]).toBe(0);
    }
    // a pool of badwater at 6 falls into a clean river at 3: neither blends into the other, and the
    // fall has the pool's share
    const heights = new Uint8Array([6, 6, 6, 3, 3, 3]);
    const view = waterFromDepth(heights, [0.5, 0.5, 0.5, 0.5, 0.5, 0.5], [1, 1, 1, 0, 0, 0]);
    const sw = surfaceWater(6, 1, view);
    expect([...blendedBadwater(6, 1, sw)]).toEqual([1, 1, 1, 0, 0, 0]);
    const m = meshWaterChunk(6, 1, heights, sw, view, lowerByTile(sw, view), 0, 0);
    for (let q = 0; q < m.quads; q++) {
      const top = m.normals[q * 12 + 1] > 0;
      const x = Math.min(m.positions[q * 12], m.positions[q * 12 + 3], m.positions[q * 12 + 6]);
      for (let v = 0; v < 4; v++) {
        const c = m.data[(q * 4 + v) * 2 + 1];
        if (top) expect(c).toBe(x < 2.5 ? 1 : 0);
      }
    }
    // (D148: the fall was a curtain; since D201 it pours from the lip, and carries its badwater
    // share at both corners)
    expect(m.fallCount).toBe(1);
    expect([m.falls[12], m.falls[13]]).toEqual([1, 1]);
  });

  it("remeshes every chunk the blend reaches when the badwater changes", () => {
    // two chunks side by side (32 tiles each); badwater arrives just west of their border
    const W = 64;
    const H = 8;
    const a = flat(W, H, () => 0);
    const b = flat(W, H, (x) => (x === 30 ? 1 : 0));
    expect([...changedWaterChunks(W, H, a.sw, b.sw, 0, 0)].sort()).toEqual(["0,0", "1,0"]);
    // far from the border, only its own chunk
    const c = flat(W, H, (x) => (x === 10 ? 1 : 0));
    expect([...changedWaterChunks(W, H, a.sw, c.sw, 0, 0)]).toEqual(["0,0"]);
    // the same state: nothing
    expect(changedWaterChunks(W, H, b.sw, flat(W, H, (x) => (x === 30 ? 1 : 0)).sw, 0, 0).size).toBe(0);
  });
});

describe("badwater's colour", () => {
  it("is #38's approved crimson: its body, troughs and streaks, matte and nearly opaque, and darker deeper (option A)", () => {
    // #38's check:colour targets at e63a3ff, on screen (tools/capture-badwater.ts --measure lands on
    // them); the view draws the body about as it is at 70°
    const target = WATER_CALIBRATION.targets.find((t) => t.share === 1)!;
    expect(target.bands).toEqual({ typical: [110, 52, 49], trough: [94, 46, 43], streak: [124, 69, 56] });
    for (let k = 0; k < 3; k++) expect(Math.abs(WATER.bad[k] - target.bands.typical[k] / 255)).toBeLessThan(0.03);
    // crimson: red well over green and blue; darker troughs, lighter streaks
    expect(WATER.bad[0]).toBeGreaterThan(2 * WATER.bad[1]);
    expect(WATER.bad[1]).toBeGreaterThan(WATER.bad[2]);
    expect(lightness(WATER.badTrough)).toBeLessThan(lightness(WATER.bad) - 2);
    expect(lightness(WATER.badStreak)).toBeGreaterThan(lightness(WATER.bad) + 2);
    // nearly opaque in open water, see-through at its shallow edges, opaque at a grazing angle
    for (const d of [0.25, 0.5, 1, 3]) expect(badwaterOpacity(d)).toBeGreaterThanOrEqual(0.975);
    expect(badwaterOpacity(0.1, 0)).toBeLessThan(0.5);
    expect(badwaterOpacity(0.1, 0, 0)).toBeGreaterThanOrEqual(0.85);
    // matte: a twelfth of clean water's glints and glint, and a trace of the sky
    expect(BADWATER.glints).toBeLessThan(0.1);
    expect(BADWATER.spec).toBeLessThan(0.1);
    expect(BADWATER.reflect).toBeLessThan(0.1);
    expect(badwaterBody(BADWATER.shallow)).toEqual(WATER.bad);
    // option A: darker with depth
    for (let d = 0.3; d < 5; d += 0.1) expect(lightness(badwaterBody(d))).toBeLessThan(lightness(badwaterBody(d - 0.1)) + 1e-9);
    expect(lightness(badwaterBody(4))).toBeLessThan(lightness(WATER.bad) - 15);
  });

  it("turns from clean water's by the badwater share: darker in proportion, its hue teal, teal-grey, warm brown, crimson, never purple", () => {
    const shares = Array.from({ length: 101 }, (_, k) => k / 100);
    // the curves: the darkening in proportion; the hue early along its path, always ahead of the
    // darkening; both rising at every step, never jumping
    for (let k = 1; k < shares.length; k++) {
      const a = waterBlend(shares[k - 1]);
      const b = waterBlend(shares[k]);
      expect(b.darken).toBeCloseTo(shares[k], 12);
      expect(b.hue).toBeGreaterThan(a.hue);
      expect(b.hue - a.hue).toBeLessThan(0.06);
      if (shares[k] < 1) expect(b.hue).toBeGreaterThan(b.darken);
    }
    const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const luma = (c: readonly number[]) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    for (const d of [0.1, 0.25, 0.5, 1, 2, 4]) {
      const clean = cleanWaterBody(d);
      const bad = badwaterBody(d);
      // the ends: exactly clean water and exactly badwater
      expect(waterBody(d, 0)).toEqual(clean);
      expect(waterBody(d, 1)).toEqual(bad);
      let prevL = lightness(clean);
      let prev = clean;
      for (const s of shares.slice(1)) {
        const c = waterBody(d, s);
        // its luminance goes from clean water's to badwater's in proportion to the share
        expect(luma(c)).toBeCloseTo(luma(clean) + (luma(bad) - luma(clean)) * s, 9);
        // darker at every step in greyscale too, and no jump in any channel (0.048 at the most for
        // 1% more bad, in bright shallows where the hue turns warm: Kyler asked for a steep turn)
        expect(lightness(c), `${d} deep, ${s} bad`).toBeLessThan(prevL);
        for (let k = 0; k < 3; k++) expect(Math.abs(c[k] - prev[k]), `${d} deep, ${s} bad`).toBeLessThan(0.06);
        prevL = lightness(c);
        prev = c;
      }
    }
  });

  it("never looks purple or magenta, and reads warm from a tenth bad (Kyler's review of #41)", () => {
    // HSV hue (degrees) and saturation of a display colour
    const hsv = (c: readonly number[]) => {
      const max = Math.max(...c);
      const d = max - Math.min(...c);
      let h = 0;
      if (d > 0) h = max === c[0] ? 60 * (((c[1] - c[2]) / d) % 6) : max === c[1] ? 60 * ((c[2] - c[0]) / d + 2) : 60 * ((c[0] - c[1]) / d + 4);
      return { h: h < 0 ? h + 360 : h, s: max > 0 ? d / max : 0 };
    };
    for (const d of [0.05, 0.1, 0.25, 0.5, 0.8, 1, 1.25, 2, 3, 4.25])
      for (const fromBank of [0, 0.2, 1]) {
        for (let k = 0; k <= 200; k++) {
          const c = waterBody(d, k / 200, fromBank);
          const { h, s } = hsv(c);
          // no hue from violet to magenta (250°–350°) with any visible colour in it
          if (s > 0.03) expect(h > 250 && h < 350, `${d} deep, ${fromBank} from a bank, ${k / 200} bad: hue ${Math.round(h)}°`).toBe(false);
        }
        // a tenth and a quarter bad read warm: red above blue by 10 codes or more, an orange-red hue
        for (const share of [0.1, 0.25]) {
          const c = waterBody(d, share, fromBank);
          const { h } = hsv(c);
          expect(c[0] - c[2], `${d} deep, ${share} bad`).toBeGreaterThan(10 / 255);
          expect(h < 45 || h > 355, `${d} deep, ${share} bad: hue ${Math.round(h)}°`).toBe(true);
        }
      }
    // on the way it passes the game's measured mixing zone's teal-grey (#2E444C)
    const hueOf = (c: readonly number[]) => {
      const l = luma(c);
      return c.map((v) => lin(v) / l);
    };
    const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const luma = (c: readonly number[]) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
    const atMixing = 1 - (1 - WATER_BLEND.mixing) ** (1 / WATER_BLEND.hue);
    for (const d of [0.25, 1, 3]) {
      const h = hueOf(waterBody(d, atMixing));
      const m = hueOf(WATER.mixing);
      for (let k = 0; k < 3; k++) expect(h[k]).toBeCloseTo(m[k], 2);
    }
    expect(WATER.mixing.map((v) => Math.round(v * 255))).toEqual([46, 68, 76]);
  });

  it("is drawn by the water shader from the shared palette, with no streaks", () => {
    const t = () => new DataTexture(new Uint8Array(4), 1, 1);
    for (const lite of [false, true]) {
      const shader = waterMaterial(sceneUniforms(1, 1, t(), t(), t(), t()), lite).fragmentShader;
      expect(shader).toContain(WATER_GLSL);
      expect(shader).toContain("float bad = waterDull(cont);");
      expect(shader).toContain("vec3 murky = badwaterBody(depth);");
      expect(shader).toContain("vec3 c = waterBlend(body, murky, cont);");
      expect(shader).toContain("alpha = mix(alpha, badwaterAlpha(depth, shore, waterGrazing(V, N)), waterMurk(cont));");
      // the old streaks of mixed water are gone; the bubbles grow denser with the share
      expect(shader).not.toContain("mixed");
      expect(shader).toContain("smoothstep(0.93 - 0.1 * bad, 1.03 - 0.1 * bad");
    }
  });
});
