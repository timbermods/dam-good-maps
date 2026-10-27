// The masks from the worker (3D view, item 1): the worker sends each listed column's mask (`ColumnTerrain`'s,
// bit z: voxel z solid) with its voxels in the view's `columns`, and the renderer looks a column up in them
// (`mesh.ts` `columnMask` over `model.ts` `columnMasks`) instead of rebuilding it from 23 bytes at each look.
// The masks are the columns' own, opened and after every kind of edit; a lookup gives exactly what the voxels
// gave, so the meshes, the light volume and the picks are the same bytes; and on the page's own stroke, which
// changes the heights in place before the worker answers, the lookup reshapes each roof's top run to its new
// height (`reshapeTop`), which is what the worker's columns then hold.

import { describe, expect, it } from "vitest";
import { writeTimber } from "../../src/core/format/timber";
import { CaveLight } from "../../src/render3d/caveLight";
import { skyVisibility } from "../../src/render3d/light";
import { columnMask, meshChunk, CHUNK, type TerrainSource } from "../../src/render3d/mesh";
import { columnMap, columnMasks, LAYERS, type MapView } from "../../src/render3d/model";
import { pickTerrain, type Ray } from "../../src/render3d/pick";
import { apply, openTimber } from "../../src/worker/session";
import { CAVE, CAVE_H as H, CAVE_W as W, caveFile, dig, LEDGE } from "./caveMap";

/** The source as the renderer builds it (the masks looked up) and as it was (the voxels read at each look). */
function sources(heights: Uint8Array, columns: MapView["columns"], w = W, h = H): { looked: TerrainSource; read: TerrainSource } {
  const read: TerrainSource = { W: w, H: h, heights, columns: columnMap(columns) };
  return { read, looked: { ...read, masks: columnMasks(w * h, columns) } };
}

/** The worker's masks are its columns' own, and the lookup is the voxels' mask on every tile. */
function checkMasks(heights: Uint8Array, columns: MapView["columns"]): void {
  expect(columns.masks, "the worker sends the masks").toBeDefined();
  expect(columns.masks!.length).toBe(columns.tiles.length);
  const { read, looked } = sources(heights, columns);
  for (let k = 0; k < columns.tiles.length; k++) expect(columns.masks![k], `tile ${columns.tiles[k]}`).toBe(columnMask(read, columns.tiles[k]));
  for (let i = 0; i < W * H; i++) if (columnMask(looked, i) !== columnMask(read, i)) expect.fail(`tile ${i}: the lookup differs`);
}

const tile = (x: number, y: number) => [4 * x + 2, 4 * y + 2];

describe("the masks from the worker (3D view, item 1)", () => {
  it("are the columns' own masks, opened and after edits on a roof, a lowering to the roof's floor and a Block dig", () => {
    const { view } = openTimber(writeTimber(caveFile()), "cave.timber");
    expect(view.columns.tiles.length, "the cave, the ledge and nothing else").toBe(36 + 15);
    checkMasks(view.heights, view.columns);
    let heights = view.heights;
    let columns = view.columns;
    const edits = [
      // raise the cave's roof, then cut it down as far as a brush may (the roof keeps its lowest layer)
      { op: "brush", params: { tool: "raise", size: 2, strength: 5, shape: "area", target: 10, dabs: [...tile(16, 16), ...tile(19, 19)] } },
      { op: "brush", params: { tool: "lower", size: 2, strength: 9, shape: "area", target: 0, dabs: [...tile(17, 17), ...tile(18, 18)] } },
      // the ledge's top
      { op: "brush", params: { tool: "raise", size: 1, strength: 5, shape: "area", target: 10, dabs: [...tile(31, 11), ...tile(32, 13)] } },
      // a hollow dug into the cliff's foot (a plain tile gains air under a roof)
      dig(29, 30, 2, "+x"),
    ];
    let reshaped = 0;
    for (const op of edits) {
      const u = apply(op as Parameters<typeof apply>[0]);
      expect(u.errors, JSON.stringify(op.params).slice(0, 60)).toEqual([]);
      expect(u.view.columns, "the columns go with an edit that reshaped them").toBeDefined();
      const now = u.view.heights ?? heights;
      checkMasks(now, u.view.columns!);
      // the page's stroke: the new heights painted in place over the columns it had; every column follows its
      // height as the worker's columns now have it (a plain column its height, a roof its top run)
      if (op.op === "brush") {
        const before = sources(now, columns).looked;
        const after = sources(now, u.view.columns!).read;
        const listed = new Set(columns.tiles);
        for (let i = 0; i < W * H; i++) {
          if (columnMask(before, i) !== columnMask(after, i)) expect.fail(`tile ${i}: the stroke's lookup ${columnMask(before, i)}, the worker's ${columnMask(after, i)}`);
          if (listed.has(i) && heights[i] !== now[i]) reshaped++;
        }
      }
      heights = now;
      columns = u.view.columns!;
    }
    expect(reshaped, "roofs and the ledge reshaped by the strokes").toBeGreaterThan(10);
    expect(columns.tiles.includes(30 * W + 29), "the dug tile is a column now").toBe(true);
    // the lowered roof stands on its floor: one layer over the cave's air
    expect(heights[17 * W + 17]).toBe(CAVE.air[1] + 1);
    expect(heights[12 * W + 31]).toBeGreaterThan(LEDGE.solid[1]);
  });

  it("a lookup gives the same meshes, light volume and picks as the voxels, on caves and on random caves", () => {
    const { view } = openTimber(writeTimber(caveFile()), "cave.timber");
    const maps: { w: number; h: number; heights: Uint8Array; columns: MapView["columns"] }[] = [{ w: W, h: H, heights: view.heights, columns: view.columns }, { w: 96, h: 80, ...randomCaves(96, 80, 7) }];
    for (const m of maps) {
      const { read, looked } = sources(m.heights, m.columns, m.w, m.h);
      const { W: w, H: h } = read;
      for (let cy = 0; cy * CHUNK < h; cy++)
        for (let cx = 0; cx * CHUNK < w; cx++) {
          const a = meshChunk(read, cx, cy);
          const b = meshChunk(looked, cx, cy);
          expect(b.quads).toBe(a.quads);
          expect(Buffer.from(b.positions.buffer).equals(Buffer.from(a.positions.buffer)), `chunk ${cx},${cy} positions`).toBe(true);
          expect(Buffer.from(b.normals.buffer).equals(Buffer.from(a.normals.buffer))).toBe(true);
          expect(Buffer.from(b.indices.buffer).equals(Buffer.from(a.indices.buffer))).toBe(true);
        }
      const sky = skyVisibility(w, h, m.heights);
      const la = CaveLight.build(read, sky)!;
      const lb = CaveLight.build(looked, sky)!;
      expect(Buffer.from(lb.data.buffer).equals(Buffer.from(la.data.buffer)), "the light volume").toBe(true);
      let hits = 0;
      for (const ray of rays(w, h, 3000)) {
        const pa = pickTerrain(ray, w, h, (i) => columnMask(read, i));
        const pb = pickTerrain(ray, w, h, (i) => columnMask(looked, i));
        expect(pb).toEqual(pa);
        if (pa) hits++;
      }
      expect(hits).toBeGreaterThan(1000);
    }
  });
});

/** Random caves, overhangs and floating runs across chunk edges, as the worker would send them (each listed
 *  column's mask with its voxels; a tile's height the top of its column). */
function randomCaves(w: number, h: number, seed: number): { heights: Uint8Array; columns: MapView["columns"] } {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  const heights = new Uint8Array(w * h);
  const tiles: number[] = [];
  const voxels: number[] = [];
  const masks: number[] = [];
  for (let i = 0; i < w * h; i++) {
    const top = 2 + Math.floor(rnd() * 16);
    let m = (1 << top) - 1;
    if (rnd() < 0.4) {
      const a = Math.floor(rnd() * (top - 1));
      const b = a + 1 + Math.floor(rnd() * (top - 1 - a));
      for (let z = a; z < b; z++) m &= ~(1 << z);
    }
    heights[i] = 32 - Math.clz32(m);
    if ((m & (m + 1)) === 0) continue;
    tiles.push(i);
    masks.push(m);
    for (let z = 0; z < LAYERS; z++) voxels.push((m >>> z) & 1);
  }
  return { heights, columns: { tiles: Int32Array.from(tiles), voxels: Uint8Array.from(voxels), masks: Uint32Array.from(masks) } };
}

/** Rays from above, low across the map and from inside the land, at odd fractions. */
function* rays(w: number, h: number, n: number): Generator<Ray> {
  let s = 99;
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  for (let k = 0; k < n; k++) {
    const origin: [number, number, number] = [rnd() * w, k % 3 === 0 ? 30 : rnd() * 20, -rnd() * h];
    const d: [number, number, number] = [rnd() - 0.5, k % 3 === 0 ? -0.5 - rnd() : rnd() - 0.6, rnd() - 0.5];
    const l = Math.hypot(...d);
    yield { origin, direction: [d[0] / l, d[1] / l, d[2] / l] };
  }
}
