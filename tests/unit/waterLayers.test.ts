// Water per column (3D view, part 4): every water column is drawn on its own floor, seeing the water and ground
// at its own level round it (render3d/waterLayers.ts), so a cave's pool is drawn on the cave's floor with its own
// shores, curtains and falls, and the lake on its roof on the roof, and no water is drawn through rock. On a map
// without terrain above terrain the water's mesh is the heightfield mesher's (kept as
// tests/fixtures/heightfieldWaterMesher.ts) byte for byte, chunk by chunk, and so is the per-column path forced
// on it (every tile given as a column). The official cave maps run only where they were copied locally.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
import { outflowsOf } from "../../src/render3d/current";
import { FALL_STRIDE, fallPoint } from "../../src/render3d/falls";
import { chunkCount } from "../../src/render3d/mesh";
import { columnMap, LAYERS, surfaceWater, waterFromDepth, type WaterView } from "../../src/render3d/model";
import { meshWaterChunk, type WaterMeshData } from "../../src/render3d/waterMesh";
import { plainLayers, waterLayers } from "../../src/render3d/waterLayers";
import { openTimber } from "../../src/worker/session";
import { heightfieldWaterChunk } from "../fixtures/heightfieldWaterMesher";

const bytes = (a: ArrayBufferView) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);

function same(a: WaterMeshData, b: WaterMeshData, at: string): void {
  expect(b.quads, `quads, ${at}`).toBe(a.quads);
  expect(b.fallCount, `falls, ${at}`).toBe(a.fallCount);
  for (const k of ["positions", "data", "flags", "normals", "indices", "falls"] as const) expect(bytes(b[k]).equals(bytes(a[k])), `${k}, ${at}`).toBe(true);
}

describe("water on maps without terrain above terrain", () => {
  const maps: [ThemeId, number, number][] = [
    ["any", 96, 1],
    ["riverValley", 128, 2],
    ["canyon", 128, 7],
    ["highlands", 96, 4],
    ["lakeBasin", 128, 5],
    ["islands", 96, 2],
    ["delta", 256, 7],
  ];
  it.each(maps)("%s %i² seed %i: the same mesh as the heightfield water mesher, and through the per-column path", (theme, size, seed) => {
    const b = generate(makeSpec({ seed, theme, size: { x: size, y: size } })).built;
    const { W, H, heights } = b;
    const view = waterFromDepth(heights, b.water, b.contamination);
    const out = outflowsOf(view, W, H, b.settle.out);
    if (out) view.outflow = out;
    const sw = surfaceWater(W, H, view);
    // every tile as a column of its own, one plain run: the per-column path, dealing every column into layers
    const all = new Map<number, Uint8Array>();
    for (let i = 0; i < W * H; i++) all.set(i, Uint8Array.from({ length: LAYERS }, (_, z) => (z < heights[i] ? 1 : 0)));
    const layered = waterLayers(W, H, heights, all, view, sw);
    expect(layered.length, "one layer: the open sky's").toBe(1);
    expect(waterLayers(W, H, heights, new Map(), view, sw)).toEqual(plainLayers(heights, sw));
    const { nx, ny } = chunkCount(W, H);
    let falls = 0;
    for (let cy = 0; cy < ny; cy++)
      for (let cx = 0; cx < nx; cx++) {
        const a = heightfieldWaterChunk(W, H, heights, sw, cx, cy);
        falls += a.fallCount;
        same(a, meshWaterChunk(W, H, plainLayers(heights, sw), cx, cy), `chunk ${cx},${cy}`);
        same(a, meshWaterChunk(W, H, layered, cx, cy), `chunk ${cx},${cy}, per column`);
      }
    if (theme === "canyon") expect(falls, "falls are in the comparison").toBeGreaterThan(0);
  });
});

// ---- water at several levels ----

interface Scene {
  W: number;
  H: number;
  heights: Uint8Array;
  columns: Map<number, Uint8Array>;
  solid: (x: number, y: number, z: number) => boolean;
  view: WaterView;
}

/** A terrain from a solid(x, y, z) rule, and its water columns (tile, floor, depth, badwater share). */
function scene(W: number, H: number, solid: (x: number, y: number, z: number) => boolean, water: [number, number, number, number, number][]): Scene {
  const heights = new Uint8Array(W * H);
  const columns = new Map<number, Uint8Array>();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = new Uint8Array(LAYERS);
      let top = 0;
      for (let z = 0; z < LAYERS; z++) if (solid(x, y, z)) (c[z] = 1), (top = z + 1);
      heights[y * W + x] = top;
      if (c.subarray(0, top).some((v) => !v)) columns.set(y * W + x, c);
    }
  const n = water.length;
  const view: WaterView = { count: n, tile: new Int32Array(n), floor: new Float32Array(n), depth: new Float32Array(n), contamination: new Float32Array(n) };
  water.forEach(([x, y, f, d, c], k) => {
    view.tile[k] = y * W + x;
    view.floor[k] = f;
    view.depth[k] = d;
    view.contamination[k] = c;
  });
  const inMap = (x: number, y: number, z: number) => x >= 0 && y >= 0 && x < W && y < H && z >= 0 && z < LAYERS;
  return { W, H, heights, columns, solid: (x, y, z) => inMap(x, y, z) && solid(x, y, z), view };
}

/** The ceiling over a floor: the first rock above it (Infinity: the sky). */
function ceilingOf(s: Scene, x: number, y: number, f: number): number {
  for (let z = Math.round(f); z < LAYERS; z++) if (s.solid(x, y, z)) return z;
  return Infinity;
}

/** Whether a world point (X, Y, Z = −y) is in rock. */
const rockAt = (s: Scene, X: number, Y: number, Z: number) => s.solid(Math.floor(X), Math.floor(-Z), Math.floor(Y));

/** A chunk's quads and falls, each as its numbers, sorted (the layers' order aside). */
function pieces(m: WaterMeshData): string[] {
  const out: string[] = [];
  for (let q = 0; q < m.quads; q++) out.push([...m.positions.subarray(q * 12, q * 12 + 12), ...m.data.subarray(q * 8, q * 8 + 8), ...m.flags.subarray(q * 4, q * 4 + 4)].join(","));
  for (let k = 0; k < m.fallCount; k++) out.push("fall " + [...m.falls.subarray(k * FALL_STRIDE, (k + 1) * FALL_STRIDE)].join(","));
  return out.sort();
}

/** Every chunk of the scene's water, with what was checked: each column's top drawn once at its own surface, under
 *  its ceiling; no quad and no fall through rock (points across each face just off it on both sides, a top's
 *  below it). */
function checkScene(s: Scene) {
  const { W, H } = s;
  const sw = surfaceWater(W, H, s.view);
  const layers = waterLayers(W, H, s.heights, s.columns, s.view, sw);
  // what a column sees beyond LAYER_REACH is never read: dealt with a far wider reach (more layers), every chunk
  // draws the same quads and falls
  const wide = waterLayers(W, H, s.heights, s.columns, s.view, sw, 12);
  const { nx, ny } = chunkCount(W, H);
  for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) expect(pieces(meshWaterChunk(W, H, wide, cx, cy)), `chunk ${cx},${cy} with a wider reach`).toEqual(pieces(meshWaterChunk(W, H, layers, cx, cy)));
  const tops = new Map<string, number>();
  let quads = 0;
  let falls = 0;
  for (let cy = 0; cy < ny; cy++)
    for (let cx = 0; cx < nx; cx++) {
      const m = meshWaterChunk(W, H, layers, cx, cy);
      quads += m.quads;
      for (let q = 0; q < m.quads; q++) {
        const p = m.positions.subarray(q * 12, q * 12 + 12);
        const n = [m.normals[q * 12], m.normals[q * 12 + 1], m.normals[q * 12 + 2]].map((v) => Math.sign(v));
        const top = n[1] > 0;
        if (top) {
          const key = `${Math.floor(p[0])},${Math.floor(-p[2])},${p[1].toFixed(4)}`;
          tops.set(key, (tops.get(key) ?? 0) + 1);
        }
        // points across the face (its corners blended), just off it
        for (const u of [0.1, 0.5, 0.9])
          for (const v of [0.1, 0.5, 0.9]) {
            const pt = [0, 1, 2].map((a) => (1 - u) * (1 - v) * p[a] + u * (1 - v) * p[3 + a] + u * v * p[6 + a] + (1 - u) * v * p[9 + a]);
            for (const side of top ? [-1] : [-1, 1]) {
              const e = 0.004 * side;
              expect(rockAt(s, pt[0] + n[0] * e, pt[1] + n[1] * e, pt[2] + n[2] * e), `quad ${q} at ${pt.map((c) => c.toFixed(2))} (${top ? "top" : "side"}) in rock`).toBe(false);
            }
          }
      }
      for (let k = 0; k < m.fallCount; k++) {
        falls++;
        const f = m.falls.subarray(k * FALL_STRIDE, (k + 1) * FALL_STRIDE);
        for (const u of [0, 1] as const)
          for (const w of [0, 0.25, 0.5, 0.75, 1]) {
            const [X, Y, Z] = fallPoint(f, u, w);
            expect(rockAt(s, X, Y - 0.004, Z), `fall ${k} at ${[X, Y, Z].map((c) => c.toFixed(2))} in rock`).toBe(false);
          }
      }
    }
  // every column's top, once, at its own surface, never above its ceiling
  const { view } = s;
  for (let k = 0; k < view.count; k++) {
    const i = view.tile[k];
    const x = i % W;
    const y = (i - x) / W;
    const surface = Math.fround(view.floor[k] + view.depth[k]);
    expect(surface, `column ${k} under its ceiling`).toBeLessThanOrEqual(ceilingOf(s, x, y, view.floor[k]) + 1e-6);
    expect(tops.get(`${x},${y},${surface.toFixed(4)}`), `column ${k} (${x},${y}) drawn once at ${surface}`).toBe(1);
  }
  expect([...tops.values()].reduce((a, b) => a + b, 0), "no other tops").toBe(view.count);
  return { layers: layers.length, quads, falls };
}

describe("water at several levels", () => {
  // a hill (rock to 12) over ground at 3, hollowed by a cave (air 4–7, floor 4) open on its west side; on the hill's
  // top a lake behind a rim; in the cave a pool at 5.5 that runs out through the mouth to a pool outside, a ledge at
  // 6 holding water at 6.4 that falls into it, and a chamber full to its ceiling at 6; along the south edge an arch
  // with water under it at the map's floor
  const W = 44;
  const H = 40;
  const hill = (x: number, y: number) => x >= 10 && x <= 30 && y >= 8 && y <= 30;
  const cave = (x: number, y: number) => x >= 12 && x <= 28 && y >= 10 && y <= 28;
  const mouth = (x: number, y: number) => x >= 10 && x < 12 && y >= 15 && y <= 20;
  const ledge = (x: number, y: number) => x >= 24 && x <= 28 && y >= 10 && y <= 28;
  const chamber = (x: number, y: number) => x >= 14 && x <= 16 && y >= 24 && y <= 28;
  const rim = (x: number, y: number) => hill(x, y) && (x <= 11 || x >= 29 || y <= 9 || y >= 29);
  const arch = (x: number, y: number) => y <= 2 && x >= 30 && x <= 40;
  const solid = (x: number, y: number, z: number) => {
    if (arch(x, y)) return z >= 4 && z < 6;
    if (!hill(x, y)) return z < 3;
    if (cave(x, y) || mouth(x, y)) {
      const floor = ledge(x, y) ? 6 : 4;
      const ceiling = chamber(x, y) ? 6 : 8;
      if (z >= floor && z < ceiling) return false;
    }
    return z < (rim(x, y) ? 13 : 12);
  };
  const water: [number, number, number, number, number][] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (hill(x, y) && !rim(x, y)) water.push([x, y, 12, 0.6, 0]);
      if ((cave(x, y) || mouth(x, y)) && !ledge(x, y)) water.push([x, y, 4, chamber(x, y) ? 2 : 1.5, chamber(x, y) ? 0.8 : x < 16 ? 0 : 0.4]);
      if (ledge(x, y)) water.push([x, y, 6, 0.4, 0]);
      if (x >= 4 && x < 10 && y >= 14 && y <= 21) water.push([x, y, 3, 2.5, 0]);
      if (arch(x, y) || (y <= 2 && (x === 29 || x === 41))) water.push([x, y, 0, 1.2, 0]);
    }
  // (the arch's water stands at the map's floor: the ground under it is air from 0)
  const s = scene(W, H, (x, y, z) => (arch(x, y) ? z >= 4 && z < 6 : y <= 2 && (x === 29 || x === 41) ? false : solid(x, y, z)), water);

  it("each column on its own floor and surface, under its ceiling, and nothing drawn through rock", () => {
    const r = checkScene(s);
    expect(r.layers, "the cave's water in a layer of its own").toBeGreaterThanOrEqual(2);
    // the ledge's water falls into the pool below it, inside the cave
    expect(r.falls).toBeGreaterThan(0);
  });

  it("the cave's pool sees the cave: its shores at the cave's walls, the pool outside through the mouth, never the lake on the roof", () => {
    const sw = surfaceWater(W, H, s.view);
    const layers = waterLayers(W, H, s.heights, s.columns, s.view, sw);
    const at = (x: number, y: number, f: number) => layers.find((l) => (l.own ? l.own[y * W + x] : true) && Math.abs(l.sw.floor[y * W + x] - f) < 1e-6 && l.sw.surface[y * W + x] === l.sw.surface[y * W + x]);
    // a pool tile beside the cave's north wall (y 28 → 29 is rock at its level): rock, a shore
    const pool = at(18, 28, 4)!;
    expect(pool).toBeDefined();
    expect(pool.ground[29 * W + 18]).toBe(255);
    // its neighbour in the cave is the same pool, not the lake on the roof above it
    expect(pool.sw.surface[27 * W + 18]).toBeCloseTo(5.5, 5);
    // at the mouth, the pool outside
    const m = at(10, 17, 4)!;
    expect(m.sw.surface[17 * W + 9]).toBeCloseTo(5.5, 5);
    // the lake sees the roof round it, not the cave's water
    const lake = at(18, 18, 12)!;
    expect(lake.sw.surface[17 * W + 18]).toBeCloseTo(12.6, 5);
    expect(lake.ground[29 * W + 18]).toBe(13);
  });
});

// ---- the official maps with caves (local only) ----

const DIRS = [process.env.DGM_OFFICIAL_MAPS ?? "", ".scratch/official", resolve("../../../.scratch/official"), "investigation/raw/builtin"];
const DIR = DIRS.find((d) => d && existsSync(d)) ?? null;
const mapPath = (name: string) => (DIR ? readdirSync(DIR).filter((f) => f.endsWith(".timber") && f.includes(name)).map((f) => join(DIR, f))[0] : undefined);

describe("the official maps with caves' water (local only)", () => {
  for (const name of ["Hollows", "Pressure", "Pillars", "Nomads"]) {
    const path = mapPath(name);
    it.skipIf(!path)(`${name}: every column on its own floor and surface, nothing through rock`, () => {
      const { view: v } = openTimber(new Uint8Array(readFileSync(path!)), `${name}.timber`);
      const columns = columnMap(v.columns);
      const s: Scene = {
        W: v.W,
        H: v.H,
        heights: v.heights,
        columns,
        view: v.water,
        solid: (x, y, z) => {
          if (x < 0 || y < 0 || x >= v.W || y >= v.H || z < 0 || z >= LAYERS) return false;
          const c = columns.get(y * v.W + x);
          return c ? c[z] === 1 : z < v.heights[y * v.W + x];
        },
      };
      const t0 = performance.now();
      waterLayers(v.W, v.H, v.heights, columns, v.water, surfaceWater(v.W, v.H, v.water));
      const ms = performance.now() - t0;
      const r = checkScene(s);
      console.log(`${name}: ${v.water.count} columns, ${r.layers} layers (${ms.toFixed(1)} ms), ${r.quads} quads, ${r.falls} falls`);
    });
  }
});
