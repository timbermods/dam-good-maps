// Water under a layer cut (D207; render3d/cutWater.ts): a column standing over the cut with its floor below it is drawn
// sliced, its top on the cut and shallower by what the cut took off, its sides stopping at the cut; one whose floor is at
// the cut or above it is gone; a fall, the water's own side where it steps down, stops at the cut as any side. What is drawn is worked out
// here as the GPU does it (the water's vertex shader, materials.ts `waterMaterial`, mirrored by `fold`; its fragment
// shader drops what stands over the cut), on generated maps with rivers, lakes and falls and on a hand-made cave, at
// every cut through their water. The terrain counts a top as a bed under water exactly where a top is drawn over it
// (materials.ts `soilOf`, mirrored by `soilUnderWater` from the tile data's water byte), and with no cut nothing moves.

import { describe, expect, it } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
import { bedAtCut, CUT_SLACK, cutCornerDepth, ringLevelAt, surfaceAtCut, waterLevelAt } from "../../src/render3d/cutWater";
import { WATER_BYTE_FINE, WATER_BYTE_STEPS, waterByte } from "../../src/render3d/light";
import { chunkCount } from "../../src/render3d/mesh";
import { LAYERS, surfaceWater, waterFromDepth, type SurfaceWater, type WaterView } from "../../src/render3d/model";
import { FALL, meshWaterChunk, type WaterMeshData } from "../../src/render3d/waterMesh";
import { plainLayers, waterLayers, type WaterLayer } from "../../src/render3d/waterLayers";

describe("the rule", () => {
  it("draws a column whole at or just over the cut, sliced to the cut where its floor is below it, and not at all where its floor is at the cut or above", () => {
    expect(surfaceAtCut(2, 6.5, null), "no cut").toBe(6.5);
    expect(surfaceAtCut(2, 6.5, 7), "under the cut").toBe(6.5);
    expect(surfaceAtCut(2, 7.05, 7), "a hair over it").toBe(7.05);
    expect(surfaceAtCut(2, 8, 7), "sliced").toBe(7);
    expect(surfaceAtCut(6, 8, 7), "sliced a level over its floor").toBe(7);
    expect(surfaceAtCut(7, 8, 7), "its floor at the cut").toBeNull();
    expect(surfaceAtCut(9, 9.5, 7), "over the cut").toBeNull();
    expect(surfaceAtCut(7, 7.04, 7), "a film on ground at the cut").toBe(7.04);
  });

  it("counts a top as a bed under water exactly where water is drawn over it", () => {
    expect(bedAtCut(2, NaN, 7), "dry").toBe(false);
    expect(bedAtCut(2, 8, 7), "under a sliced lake").toBe(true);
    expect(bedAtCut(7, 8, 7), "a shelf at the cut").toBe(false);
    expect(bedAtCut(6, 6.6, 7), "a pond under the cut").toBe(true);
    expect(bedAtCut(7, 8, null), "no cut").toBe(true);
  });

  it("takes off a top corner's depth what the cut took off its water's share, never below none", () => {
    expect(cutCornerDepth(5, 1, 8, 6)).toBe(3);
    expect(cutCornerDepth(2.5, 0.5, 8, 6), "half the tiles round the corner dry").toBe(1.5);
    expect(cutCornerDepth(0.4, 0.25, 8, 6), "a shore's corner").toBe(0);
  });
});

// ---- as the GPU draws it ----

/** A water vertex under a cut (null: none), as the water's vertex shader moves it: its height, depth and flags. */
function fold(
  y: number,
  ny: number,
  depth: number,
  flags: number,
  floor: number,
  share: number,
  cut: number | null,
): { y: number; depth: number; flags: number } {
  const slice = cut ?? 99;
  const surface = ny > 0 ? y : floor + depth;
  // (a gone column's side folds flat: nothing drawn; but a fall's face keeps its part below the cut)
  if (surface > slice + CUT_SLACK && floor >= slice && ny <= 0) return { y: flags < 254.5 && flags >= FALL * 30 ? Math.min(y, slice) : surface, depth, flags };
  if (!(surface > slice + CUT_SLACK && floor < slice)) return { y, depth, flags };
  const over = surface - slice;
  if (ny > 0)
    return {
      y: Math.min(y, slice),
      depth: Math.max(0, depth - over * share),
      flags: flags % 16,
    };
  return {
    y: Math.min(y, slice),
    depth: slice - floor,
    flags: flags < 254.5 ? Math.max(0, flags - over * 30) : flags,
  };
}

/** The terrain's rule (materials.ts `soilOf`): ground under the tile data's water byte `byte` on a top at `height` is a
 *  bed under water. */
function soilUnderWater(byte: number, height: number, cut: number | null): boolean {
  if (byte === 0) return false;
  const slice = cut ?? 99;
  const surface = height + (byte <= WATER_BYTE_FINE ? (byte - 1) / WATER_BYTE_STEPS : byte - (WATER_BYTE_FINE - 3));
  return surface <= slice + CUT_SLACK || height < slice;
}

interface Drawn {
  /** Each tile's tops drawn, by the surface they were meshed at: the height drawn. */
  tops: Map<number, Map<number, number>>;
  /** Corner points of drawn tops of one surface: their depths. */
  corners: Map<string, number[]>;
  /** Vertices that moved with no cut. */
  movedUncut: number;
  /** Side vertices of a sliced column over the cut. */
  sidesOver: number;
  /** Sides of a column the cut removed that still have height under the cut (a sliver in front of the cut face). */
  goneSides: number;
  /** Sides of a column the cut removed hanging below the cut before the fold (the case the fold is for). */
  goneSidesBelow: number;
  /** Falls' faces of a column the cut removed that keep their part below the cut. */
  fallsKept: number;
  /** Tops not lying flat. */
  tilted: number;
}

/** What the water's mesh draws under `cut`, every chunk of `layers`. */
function draw(W: number, H: number, layers: readonly WaterLayer[], cut: number | null): Drawn {
  const out: Drawn = {
    tops: new Map(),
    corners: new Map(),
    movedUncut: 0,
    sidesOver: 0,
    goneSides: 0,
    goneSidesBelow: 0,
    fallsKept: 0,
    tilted: 0,
  };
  const { nx, ny } = chunkCount(W, H);
  for (let cy = 0; cy < ny; cy++)
    for (let cx = 0; cx < nx; cx++) {
      const m: WaterMeshData = meshWaterChunk(W, H, layers, cx, cy);
      for (let q = 0; q < m.quads; q++) {
        const ny = m.normals[q * 12 + 1];
        const vs = [0, 1, 2, 3].map((v) => {
          const k = q * 4 + v;
          const y = m.positions[k * 3 + 1];
          const f = fold(y, ny, m.data[k * 2], m.flags[k], m.cut[k * 2], m.cut[k * 2 + 1], cut);
          if (cut === null && (f.y !== y || f.depth !== m.data[k * 2] || f.flags !== m.flags[k])) out.movedUncut++;
          return {
            x: m.positions[k * 3],
            z: m.positions[k * 3 + 2],
            s: y,
            floor: m.cut[k * 2],
            ...f,
          };
        });
        if (ny > 0) {
          // (a top: flat, all four corners alike; drawn where the fragment shader keeps it)
          const { y, s } = vs[0];
          if (!vs.every((v) => v.y === y)) out.tilted++;
          if (cut !== null && y > cut + CUT_SLACK) continue;
          const tile = -Math.max(...vs.map((v) => v.z)) * W + Math.min(...vs.map((v) => v.x));
          const t = out.tops.get(tile) ?? new Map<number, number>();
          t.set(s, y);
          out.tops.set(tile, t);
          for (const v of vs) {
            const key = `${v.x},${v.z},${s}`;
            out.corners.set(key, [...(out.corners.get(key) ?? []), v.depth]);
          }
        } else if (cut !== null) {
          const surface = vs[0].floor + m.data[q * 4 * 2];
          if (surface > cut + CUT_SLACK && vs[0].floor < cut) out.sidesOver += vs.filter((v) => v.y > cut).length;
          if (surface > cut + CUT_SLACK && vs[0].floor >= cut) {
            // (drawn: what the fragment shader keeps, under the cut's slack, with some height)
            const ys = vs.map((v) => v.y);
            if (vs[0].flags < 254.5 && vs[0].flags >= FALL * 30) {
              // a fall's face: its part below the cut, nothing over it
              out.sidesOver += ys.filter((y) => y > cut).length;
              if (Math.max(...ys) > Math.min(...ys)) out.fallsKept++;
            } else {
              if (Math.min(...vs.map((v) => v.s)) < cut + CUT_SLACK) out.goneSidesBelow++;
              if (Math.min(...ys) < cut + CUT_SLACK && Math.max(...ys) > Math.min(...ys)) out.goneSides++;
            }
          }
        }
      }
    }
  return out;
}

/** Every cut through the water of `sw`'s columns, and a few round it, and none. */
function cuts(view: WaterView): (number | null)[] {
  let lo = Infinity;
  let hi = -Infinity;
  for (let k = 0; k < view.count; k++) {
    lo = Math.min(lo, view.floor[k]);
    hi = Math.max(hi, view.floor[k] + view.depth[k]);
  }
  const out: (number | null)[] = [null];
  for (let c = Math.max(0, Math.floor(lo) - 1); c <= Math.ceil(hi) + 1; c++) out.push(c);
  return out;
}

/** The checks at one cut: each column's tops where `surfaceAtCut` puts them, sides stopping at the cut, corners meeting,
 *  and (on the open sky's water on its tile's top) the terrain's bed exactly under drawn water. */
function check(
  W: number,
  H: number,
  heights: Uint8Array,
  sw: SurfaceWater,
  view: WaterView,
  layers: readonly WaterLayer[],
  cut: number | null,
  at: string,
): void {
  const d = draw(W, H, layers, cut);
  if (cut === null) expect(d.movedUncut, `${at}: nothing moves with no cut`).toBe(0);
  expect(d.sidesOver, `${at}: a sliced column's sides stop at the cut`).toBe(0);
  expect(d.goneSides, `${at}: a removed column's sides draw nothing`).toBe(0);
  expect(d.tilted, `${at}: every top flat`).toBe(0);
  // every column drawn where the rule says, once
  for (let k = 0; k < view.count; k++) {
    if (!(view.depth[k] > 0)) continue;
    const i = view.tile[k];
    // (the surface it was meshed at, as the mesh holds it)
    const s = Math.fround(view.floor[k] + view.depth[k]);
    const want = surfaceAtCut(view.floor[k], s, cut);
    const got = d.tops.get(i)?.get(s);
    if (want === null) expect(got, `${at}: column ${k} at (${i % W}, ${Math.floor(i / W)}) gone`).toBeUndefined();
    else expect(got, `${at}: column ${k} at (${i % W}, ${Math.floor(i / W)}) drawn at ${want}`).toBeCloseTo(want, 5);
  }
  // tops of one water meet at their corners
  for (const [key, depths] of d.corners) expect(Math.max(...depths) - Math.min(...depths), `${at}: corner ${key}`).toBeLessThan(1e-5);
  // the terrain's bed: under water exactly where a top is drawn over the tile's own top
  for (let i = 0; i < W * H; i++) {
    const byte = waterByte(sw, heights, i);
    if (!byte) continue;
    const drawn = d.tops.get(i)?.has(sw.surface[i]) === true;
    expect(soilUnderWater(byte, heights[i], cut), `${at}: the bed at (${i % W}, ${Math.floor(i / W)})`).toBe(drawn);
  }
}

describe("water as drawn under a cut, on generated maps", () => {
  const maps: [ThemeId, number, number][] = [
    ["canyon", 128, 7],
    ["lakeBasin", 128, 5],
  ];
  it.each(maps)("%s %i² seed %i: at every cut through its water", (theme, size, seed) => {
    const b = generate(makeSpec({ seed, theme, size: { x: size, y: size } })).built;
    const { W, H, heights } = b;
    const view = waterFromDepth(heights, b.water, b.contamination);
    const sw = surfaceWater(W, H, view);
    const layers = plainLayers(heights, sw);
    let sliced = 0;
    for (const cut of cuts(view)) {
      check(W, H, heights, sw, view, layers, cut, `cut ${cut}`);
      if (cut !== null) for (let k = 0; k < view.count; k++) if (surfaceAtCut(view.floor[k], view.floor[k] + view.depth[k], cut) === cut) sliced++;
    }
    expect(sliced, "columns sliced by some cut").toBeGreaterThan(50);
  });
});

describe("water as drawn under a cut, in a cave", () => {
  it("a cave's pool under a roof with a lake on it: each sliced or gone by its own floor", () => {
    // 10 × 6 of ground at 3; a 4 × 4 block (x 3–6, y 1–4) of rock at 0–1, a cave at 2–5, a roof at 6–8 (its top 9);
    // a pool on the cave's floor at 2, three levels deep, and a lake a level and a half deep on the roof
    const W = 10;
    const H = 6;
    const heights = new Uint8Array(W * H).fill(3);
    const columns = new Map<number, Uint8Array>();
    const block: number[] = [];
    for (let y = 1; y < 5; y++)
      for (let x = 3; x < 7; x++) {
        const i = y * W + x;
        block.push(i);
        heights[i] = 9;
        columns.set(
          i,
          Uint8Array.from({ length: LAYERS }, (_, z) => (z < 2 || (z >= 6 && z < 9) ? 1 : 0)),
        );
      }
    const tiles = [...block, ...block];
    const view: WaterView = {
      count: tiles.length,
      tile: Int32Array.from(tiles),
      floor: Float32Array.from([...block.map(() => 2), ...block.map(() => 9)]),
      depth: Float32Array.from([...block.map(() => 3), ...block.map(() => 1.5)]),
      contamination: new Float32Array(tiles.length),
    };
    const sw = surfaceWater(W, H, view);
    const layers = waterLayers(W, H, heights, columns, view, sw);
    expect(layers.length, "the pool in a layer of its own").toBe(2);
    for (const cut of cuts(view)) check(W, H, heights, sw, view, layers, cut, `cut ${cut}`);
    // at 4 the pool lies on the cut, two levels deep at its middle, and the lake is gone
    const d = draw(W, H, layers, 4);
    const middle = 2 * W + 4;
    expect([...(d.tops.get(middle)?.values() ?? [])]).toEqual([4]);
    const depths = d.corners.get(`5,-3,5`);
    expect(depths?.[0], "the pool's depth where four of its tiles meet").toBeCloseTo(2, 5);
  });
});

describe("a side of water the cut removed", () => {
  it("a shallow step down to lower water in front of a cliff draws nothing under the cut, where it was clipped to a sliver", () => {
    // 6 × 3: a shelf at 4 (x 0–2) with water 0.2 deep on it, stepping down 0.25 to a pool on ground at 2 (x 3–5) standing
    // at 3.95: less than a fall, so the shelf's water has a side hanging in front of the cliff, below its own floor
    const W = 6;
    const H = 3;
    const heights = new Uint8Array(W * H);
    const depth = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const shelf = i % W < 3;
      heights[i] = shelf ? 4 : 2;
      depth[i] = shelf ? 0.2 : 1.95;
    }
    const view = waterFromDepth(heights, depth, new Float32Array(W * H));
    const sw = surfaceWater(W, H, view);
    const layers = plainLayers(heights, sw);
    for (const cut of cuts(view)) check(W, H, heights, sw, view, layers, cut, `cut ${cut}`);
    // at 4 the shelf's water is gone and its side hung from 4.2 to 3.95: the fragment shader alone kept 3.95–4.05
    const d = draw(W, H, layers, 4);
    expect(d.goneSidesBelow, "the shelf's side reaching under the cut").toBeGreaterThan(0);
    expect(d.goneSides, "drawn: nothing").toBe(0);
    expect([...(d.tops.get(W + 4)?.values() ?? [])], "the pool whole").toEqual([Math.fround(3.95)]);
  });

  it("keeps a fall's face below the cut when the water it pours from is gone, in front of the cliff, as before its amendment", () => {
    // 6 × 3: a shelf at 6 (x 0–2) with water 0.5 deep on it, falling 3 levels to a pool on ground at 2 (x 3–5) at 3.5
    const W = 6;
    const H = 3;
    const heights = new Uint8Array(W * H);
    const depth = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const shelf = i % W < 3;
      heights[i] = shelf ? 6 : 2;
      depth[i] = shelf ? 0.5 : 1.5;
    }
    const view = waterFromDepth(heights, depth, new Float32Array(W * H));
    const sw = surfaceWater(W, H, view);
    const layers = plainLayers(heights, sw);
    for (const cut of cuts(view)) check(W, H, heights, sw, view, layers, cut, `cut ${cut}`);
    // at 5 the shelf's water is gone: its fall keeps its face from the pool (3.5) up to the cut, and nothing over it
    const d = draw(W, H, layers, 5);
    expect(d.fallsKept, "the fall's face under the cut").toBe(H);
    expect(d.sidesOver).toBe(0);
    // and a cut under the pool's surface takes the fall with it
    expect(draw(W, H, layers, 3).fallsKept).toBe(0);
  });
});

describe("where a tool stands on the water (pickSurface, a force's ring)", () => {
  it("with no cut, the answer before the cut drew water, on land and on water, from the water view alone", () => {
    const b = generate(makeSpec({ seed: 7, theme: "canyon", size: { x: 128, y: 128 } })).built;
    const { W, H, heights } = b;
    const sw = surfaceWater(W, H, waterFromDepth(heights, b.water, b.contamination));
    let land = 0;
    let water = 0;
    for (let i = 0; i < W * H; i++) {
      // (before #642: pickSurface took the surface where the water is over 0.05 deep, else the ground's hit; the ring
      // the higher of the ground and that surface)
      const wet = sw.depth[i] > 0.05;
      if (wet) water++;
      else land++;
      expect(waterLevelAt(sw, i, null), `tile ${i}`).toBe(wet ? sw.surface[i] : null);
      expect(ringLevelAt(heights, sw, i, null), `tile ${i}`).toBe(wet ? Math.max(heights[i], sw.surface[i]) : heights[i]);
    }
    expect(land).toBeGreaterThan(1000);
    expect(water).toBeGreaterThan(100);
    // (the same numbers whether or not a water chunk is meshed: neither reads a mesh, and meshing changes nothing they read)
    const copy = { surface: sw.surface.slice(), floor: sw.floor.slice(), depth: sw.depth.slice() };
    for (let cy = 0; cy * 32 < H; cy++) for (let cx = 0; cx * 32 < W; cx++) meshWaterChunk(W, H, plainLayers(heights, sw), cx, cy);
    for (let i = 0; i < W * H; i++) {
      expect(waterLevelAt(sw, i, null)).toBe(waterLevelAt(copy, i, null));
      expect(ringLevelAt(heights, sw, i, 4)).toBe(ringLevelAt(heights, copy, i, 4));
    }
  });

  it("under a cut, the water as drawn: on the cut over sliced water, none where the cut took it, the ground at most the cut", () => {
    const heights = Uint8Array.from([2, 7, 9]);
    const sw = { surface: Float32Array.from([8, 8, NaN]), floor: Float32Array.from([2, 7, NaN]), depth: Float32Array.from([6, 1, 0]) };
    expect([0, 1, 2].map((i) => waterLevelAt(sw, i, 7))).toEqual([7, null, null]);
    expect([0, 1, 2].map((i) => ringLevelAt(heights, sw, i, 7))).toEqual([7, 7, 7]);
    expect([0, 1, 2].map((i) => ringLevelAt(heights, sw, i, 5))).toEqual([5, 5, 5]);
    expect([0, 1, 2].map((i) => ringLevelAt(heights, sw, i, null))).toEqual([8, 8, 9]);
  });
});
