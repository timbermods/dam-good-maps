// Map look, badwater blends into clean water (PLAN §20 D177): each water tile is coloured by its
// badwater share, blended over the connected water a few tiles round and shared at the tops'
// corners, so where badwater meets clean water the colour turns in a soft gradient over several
// tiles, never in streaks or patches; clean water stays exactly as it was; water partly bad turns by
// the game's own tint (Timberborn 1.1.2.8's water shader: smoothstep(0.01, 1, share) ^ 0.25), its
// colour mixed straight on display values as the game (in Gamma colour space) mixes it, through the game's teal-grey and a muted
// warm grey-brown to crimson, never purple (Kyler's reviews of #41); badwater is #38's approved
// crimson, matte and murky, and darkens with depth (option A).

import { describe, expect, it } from "vitest";
import { DataTexture } from "three";
import { sceneUniforms, waterMaterial } from "../../src/render3d/materials";
import { GROUND } from "../../src/render3d/palette";
import { CHUNK } from "../../src/render3d/mesh";
import { surfaceWater, waterFromDepth, type SurfaceWater } from "../../src/render3d/model";
import { BADWATER, WATER_SURFACE, badwaterBody, badwaterOpacity, cleanWaterBody, WATER, WATER_CALIBRATION, WATER_GLSL, waterBody, waterGroundBehind, waterTint } from "../../src/render3d/waterPalette";
import { blendedBadwater, changedWaterChunks, meshWaterChunk, type WaterMeshData } from "../../src/render3d/waterMesh";
import { plainLayers } from "../../src/render3d/waterLayers";

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
  for (let cy = 0; cy * CHUNK < H; cy++) for (let cx = 0; cx * CHUNK < W; cx++) out.push(meshWaterChunk(W, H, plainLayers(heights, sw), cx, cy));
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
      // the colour follows the same way, a level deep: no step above 6 L* between corners. D304
      // raised clean water's own lightness well above badwater's and this bound was loosened to 12;
      // D310 darkened clean water and badwater's floor together, closing the range back down, and
      // restored this to its strictness before D304 (never loosened)
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
    // the tongue still reads as badwater along its middle, well away from its tip: over half of it
    // bad, so over four fifths of the way to badwater's look
    const { heights, view, sw } = flat(W, H, (x, y) => (y < 20 && x >= 18 && x < 21 ? 1 : 0));
    const shares = cornerShares(meshAll(W, H, heights, sw, view));
    const mid = (shares.get("19,5")! + shares.get("20,5")!) / 2;
    expect(mid).toBeGreaterThan(0.5);
    expect(waterTint(mid)).toBeGreaterThan(0.8);
  });

  it("leaves clean water exactly as it was", () => {
    // no badwater anywhere: every share 0, and clean water's colour is the clean body itself
    const W = 20;
    const H = 6;
    const { heights, view, sw } = flat(W, H, () => 0);
    for (const m of meshAll(W, H, heights, sw, view)) for (let k = 0; k < m.quads * 4; k++) expect(m.data[k * 2 + 1]).toBe(0);
    // (as the game: under a hundredth bad, water is clean)
    for (const s of [0, 0.005, 0.01]) expect(waterTint(s)).toBe(0);
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
    const m = meshWaterChunk(6, 1, plainLayers(heights, sw), 0, 0);
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

  it("a stroke's quick comparison finds every chunk the blend's comparison finds", () => {
    // random badwater and dry patches on a 96 × 80 map, then one tile's share or water changed
    let r = 7;
    const rnd = () => ((r = (Math.imul(r, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    const W = 96;
    const H = 80;
    const tile = () => Math.floor(rnd() * W * H);
    const of = (bad: Map<number, number>, dry: Set<number>) => flat(W, H, (x, y) => bad.get(y * W + x) ?? 0, (x, y) => !dry.has(y * W + x)).sw;
    for (let k = 0; k < 40; k++) {
      const bad = new Map<number, number>();
      const dry = new Set<number>();
      for (let n = 0; n < 12; n++) bad.set(tile(), rnd());
      for (let n = 0; n < 6; n++) dry.add(tile());
      const a = of(bad, dry);
      const t = tile();
      if (k % 2) bad.set(t, rnd());
      else if (dry.has(t)) dry.delete(t);
      else dry.add(t);
      const b = of(bad, dry);
      const quick = changedWaterChunks(W, H, a, b, 0, 0, true);
      for (const key of changedWaterChunks(W, H, a, b, 0, 0)) expect(quick.has(key), key).toBe(true);
    }
  });
});

describe("badwater's colour", () => {
  it("is #38's approved crimson, darkened a little by D324: its body, troughs and streaks, matte and murky, and darker deeper (option A)", () => {
    // #38's check:colour targets at e63a3ff were [110, 52, 49], [94, 46, 43] and [124, 69, 56]; D324
    // (option (a) of D310) darkened badwater about a tenth and the targets were re-measured once
    // on screen (tools/capture-badwater.ts --measure lands on them), and again after #692 let the
    // ground behind show by the game's share, and again once that ground showed as the game shows it: the
    // view draws the body about as it is at 70°, over the grey underwater bed (GROUND.underwater) overlaid
    // with the water's colour and desaturated (waterGroundBehind), showing through by 1 - badwaterOpacity(0.25)
    const target = WATER_CALIBRATION.targets.find((t) => t.share === 1)!;
    expect(target.bands).toEqual({ typical: [91, 47, 43], trough: [79, 42, 39], streak: [101, 59, 49] });
    const behind = 1 - badwaterOpacity(0.25);
    const bed = waterGroundBehind(GROUND.underwater, WATER.bad);
    for (let k = 0; k < 3; k++) expect(Math.abs(WATER.bad[k] + (bed[k] - WATER.bad[k]) * behind - target.bands.typical[k] / 255)).toBeLessThan(0.03);
    // crimson: red well over green and blue; darker troughs, lighter streaks
    expect(WATER.bad[0]).toBeGreaterThan(2 * WATER.bad[1]);
    expect(WATER.bad[1]).toBeGreaterThan(WATER.bad[2]);
    expect(lightness(WATER.badTrough)).toBeLessThan(lightness(WATER.bad) - 2);
    expect(lightness(WATER.badStreak)).toBeGreaterThan(lightness(WATER.bad) + 2);
    // as see-through as clean water, as the game's High quality draws it (Q8: the ground behind by 0.175 at
    // the floor, none 5 levels deep; #38's murkier badwater gave way to the game's rule), a crimson
    // tint on a sliver
    for (const d of [0.25, 0.5, 1, 3]) expect(badwaterOpacity(d)).toBeCloseTo(1 - 0.175 * (1 - d / 5), 9);
    expect(badwaterOpacity(0.1, 0)).toBeLessThan(badwaterOpacity(0.1, 1));
    expect(badwaterOpacity(0.005)).toBeLessThan(badwaterOpacity(0.05));
    // matte: a twelfth of clean water's glints and glint, and a trace of the sky
    expect(BADWATER.glints).toBeLessThan(0.1);
    // matte by the game's own smoothness (_Contamination_Smoothness 0.15 against clean water's about 0.25, the soft-lit
    // gloss map's median): its sky reflection and sun glint from the same lighting, weaker (D148: these were #38's own
    // reflect 0.03 and spec 0.04)
    expect(BADWATER.smoothness).toBe(0.15);
    expect(WATER_SURFACE.smoothness).toBe(0.25);
    expect(badwaterBody(BADWATER.shallow)).toEqual(WATER.bad);
    // darker with depth (option A's depth darkening, now the game's ramp, checked against it below; option A's
    // own "15 L* darker at 4 levels" went with its curve, D148)
    for (let d = 0.3; d < 5; d += 0.1) expect(lightness(badwaterBody(d))).toBeLessThan(lightness(badwaterBody(d - 0.1)) + 1e-9);
    // as the game's (D496): its colour follows the G ramp of Timberborn 1.1.2.8's _DepthGradients texture
    // (PhysicalWaterURP multiplies the contaminated colour by it, raw, on display values: the game renders in
    // Gamma colour space), within 5% at these depths, relative to a quarter level deep, but for the share with
    // no depth in it (its reflection and emission, BADWATER.floor); lighter on a film
    for (const [d, game] of [[0.5, 0.802], [1, 0.681], [2, 0.46], [3, 0.305]] as const)
      for (let k = 0; k < 3; k++) expect(Math.abs(badwaterBody(d)[k] / WATER.bad[k] / (BADWATER.floor + (1 - BADWATER.floor) * game) - 1), `${d} deep`).toBeLessThan(0.05);
    expect(lightness(badwaterBody(0.05))).toBeGreaterThan(lightness(WATER.bad));
  });

  it("turns from clean water's by the game's tint, as the game mixes its colours, darker at every step", () => {
    // the tint (Timberborn 1.1.2.8's PhysicalWaterURP and its material: smoothstep(0.01, 1, s) ^ 0.25):
    // a twentieth bad a quarter of the way, a tenth two fifths, a fifth over half, half over four
    // fifths; rising at every step past a hundredth
    const near = (s: number, v: number) => expect(waterTint(s)).toBeCloseTo(v, 2);
    near(0.05, 0.263);
    near(0.1, 0.391);
    near(0.2, 0.557);
    near(0.5, 0.838);
    expect(waterTint(1)).toBe(1);
    const shares = Array.from({ length: 101 }, (_, k) => k / 100);
    for (let k = 2; k < shares.length; k++) expect(waterTint(shares[k])).toBeGreaterThan(waterTint(shares[k - 1]));
    const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    for (const d of [0.1, 0.25, 0.5, 1, 2, 4]) {
      const clean = cleanWaterBody(d);
      const bad = badwaterBody(d);
      // the ends: exactly clean water and exactly badwater
      expect(waterBody(d, 0)).toEqual(clean);
      expect(waterBody(d, 1)).toEqual(bad);
      let prevL = lightness(clean);
      let prev = clean;
      for (const s of shares.slice(2)) {
        const c = waterBody(d, s);
        const k = waterTint(s);
        // straight between clean water's and badwater's on display values, by the tint (the game's mix, in
        // Gamma colour space); blue the same or under it where it is kept from leaning purple
        for (const i of [0, 1]) expect(c[i]).toBeCloseTo(clean[i] + (bad[i] - clean[i]) * k, 9);
        expect(c[2]).toBeLessThanOrEqual(clean[2] + (bad[2] - clean[2]) * k + 1e-9);
        // darker at every step in greyscale too, and no jump in any channel (the game's tint is steep
        // just past a hundredth: 0.06 at the most for 1% more bad)
        expect(lightness(c), `${d} deep, ${s} bad`).toBeLessThan(prevL);
        for (let i = 0; i < 3; i++) expect(Math.abs(c[i] - prev[i]), `${d} deep, ${s} bad`).toBeLessThan(0.06);
        prevL = lightness(c);
        prev = c;
      }
    }
  });

  it("never looks purple or magenta, passes the game's teal-grey and reads warm from three fifths bad (Kyler's review of #41)", () => {
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
          // no hue from violet to magenta (250°–350°) with any visible colour in it (the game's own
          // straight mix crosses a faint mauve-grey; ours keeps blue under green once red is over it)
          if (s > 0.03) expect(h > 250 && h < 350, `${d} deep, ${fromBank} from a bank, ${k / 200} bad: hue ${Math.round(h)}°`).toBe(false);
        }
        // three fifths bad reads warm: red above blue, an orange-red hue (red above blue by 8.5 codes
        // or more from seven tenths). D154 asked for a tenth to a quarter; the game greys first: at a tenth
        // its water is a darker teal-grey, its measured mixing zone, and it warms past a quarter, later
        // in our lighter shallows and darker deeps.
        const c = waterBody(d, 0.6, fromBank);
        const { h } = hsv(c);
        expect(c[0] - c[2], `${d} deep, 0.6 bad`).toBeGreaterThan(3 / 255);
        expect(waterBody(d, 0.7, fromBank)[0] - waterBody(d, 0.7, fromBank)[2], `${d} deep, 0.7 bad`).toBeGreaterThan(8.5 / 255);
        expect(h < 45 || h > 355, `${d} deep, 0.6 bad: hue ${Math.round(h)}°`).toBe(true);
      }
    // on the way, a little bad, it passes near the game's measured mixing zone's teal-grey (#2E444C), its
    // colour with its lightness taken out
    const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    const chroma = (c: readonly number[]) => {
      const l = c.map(lin);
      const y = 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2];
      return l.map((v) => v / y);
    };
    const mixingZone = chroma([46 / 255, 68 / 255, 76 / 255]);
    for (const d of [0.25, 1, 3]) {
      let closest = Infinity;
      for (let k = 1; k <= 25; k++) {
        const h = chroma(waterBody(d, k / 100));
        closest = Math.min(closest, Math.max(...h.map((v, i) => Math.abs(v - mixingZone[i]))));
      }
      // (0.08 when the mix ran in linear light; on display values, as the game, it passes a little further off)
      expect(closest, `${d} deep`).toBeLessThan(0.12);
    }
  });

  it("is drawn by the water shader from the shared palette, with no streaks", () => {
    const t = () => new DataTexture(new Uint8Array(4), 1, 1);
    for (const lite of [false, true]) {
      const shader = waterMaterial(sceneUniforms(1, 1, t(), t(), t(), t()), lite).fragmentShader;
      expect(shader).toContain(WATER_GLSL);
      expect(shader).toContain("float bad = waterTint(cont);");
      expect(shader).toContain("vec3 murky = badwaterBody(depth);");
      expect(shader).toContain("vec3 c = waterBlend(body, murky, cont);");
      expect(shader).toContain("alpha = mix(alpha, badwaterAlpha(depth, shore), bad);");
      // the old streaks of mixed water are gone; the bubbles grow denser with the share
      expect(shader).not.toContain("mixed");
      expect(shader).toContain("smoothstep(0.93 - 0.1 * bad, 1.03 - 0.1 * bad");
    }
  });
});
