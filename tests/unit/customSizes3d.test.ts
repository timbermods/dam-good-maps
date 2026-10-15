// The renderer's pure logic at every custom map size (D357): the chunks cover a map whose sides are not a multiple of a
// chunk, exactly once; the opening turn, the zoom limits and the framing of small maps; the minimap's size.

import { describe, expect, it } from "vitest";
import { minimapSize, MINIMAP_LEAST, MINIMAP_SIZE } from "../../src/editor/minimapSize";
import { DEFAULT_YAW, FRAME_OBJECTS_BELOW, objectOutline, openingYaw, zoomLimits } from "../../src/render3d/framing";
import { CHUNK, chunkCount, dirtyChunks, meshChunk } from "../../src/render3d/mesh";
import { entityView } from "../../src/render3d/model";
import { pickHeightfield } from "../../src/render3d/pick";

const SIZES: [number, number][] = [[4, 4], [7, 300], [300, 7], [33, 65], [96, 512], [512, 96], [512, 512]];

describe("chunks at every size", () => {
  it("cover every tile's top exactly once, whatever the sides (not a multiple of a chunk, or less than one)", () => {
    for (const [W, H] of SIZES) {
      if (W * H > 70_000) continue; // (the big ones are checked by their counts below)
      const heights = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) heights[i] = 3 + (i % 3 === 0 ? 1 : 0) + (Math.floor(i / W) % 5 === 0 ? 1 : 0);
      const { nx, ny } = chunkCount(W, H);
      const area = new Float64Array(1);
      let tiles = 0;
      for (let cy = 0; cy < ny; cy++)
        for (let cx = 0; cx < nx; cx++) {
          const m = meshChunk({ W, H, heights, columns: new Map() }, cx, cy);
          for (let q = 0; q < m.quads; q++) {
            if (m.normals[q * 12 + 1] <= 0) continue; // tops only
            const p = m.positions;
            const o = q * 12;
            const w = Math.abs(p[o + 3] - p[o]);
            const d = Math.abs(p[o + 2] - p[o + 8]);
            // inside the map and inside its own chunk
            const x0 = Math.min(p[o], p[o + 3]);
            const y0 = Math.min(-p[o + 2], -p[o + 8]);
            expect(x0).toBeGreaterThanOrEqual(cx * CHUNK);
            expect(x0 + w).toBeLessThanOrEqual(Math.min(W, (cx + 1) * CHUNK));
            expect(y0).toBeGreaterThanOrEqual(cy * CHUNK);
            expect(y0 + d).toBeLessThanOrEqual(Math.min(H, (cy + 1) * CHUNK));
            area[0] += w * d;
            tiles += w * d;
          }
        }
      expect(tiles, `${W}x${H}`).toBe(W * H);
    }
  });

  it("count and remesh the right chunks at the edges, at 512 and at a side of 4 or 7", () => {
    expect(chunkCount(512, 512)).toEqual({ nx: 16, ny: 16 });
    expect(chunkCount(7, 300)).toEqual({ nx: 1, ny: 10 });
    expect(chunkCount(4, 4)).toEqual({ nx: 1, ny: 1 });
    // a change at the last tile reaches only the chunks that exist
    expect(dirtyChunks(512, 512, { x0: 511, y0: 511, x1: 511, y1: 511 })).toEqual([[15, 15]]);
    expect(dirtyChunks(512, 512, { x0: 32, y0: 0, x1: 32, y1: 0 })).toEqual([[0, 0], [1, 0]]);
    expect(dirtyChunks(7, 300, { x0: 6, y0: 299, x1: 6, y1: 299 })).toEqual([[0, 9]]);
    expect(dirtyChunks(4, 4, { x0: 0, y0: 0, x1: 3, y1: 3 })).toEqual([[0, 0]]);
  });
});

describe("the opening view of any shape", () => {
  it("keeps the default turn for the standard shapes and the 2:1 valley, and lies a long map along the view", () => {
    for (const [W, H] of [[48, 48], [256, 256], [512, 512], [512, 256], [256, 512], [96, 128]]) expect(openingYaw(W, H, 1.78)).toBe(DEFAULT_YAW);
    // east-west long on a wide view: near square-on; north-south long: a quarter turn
    expect(Math.abs(openingYaw(512, 96, 1.78))).toBeLessThan(0.4);
    expect(openingYaw(96, 512, 1.78)).toBeLessThan(-Math.PI / 2 - 0.1);
    expect(openingYaw(96, 512, 1.78)).toBeGreaterThan(-Math.PI / 2 - 0.3);
    // on a tall view the long axis goes up it
    expect(Math.abs(openingYaw(96, 512, 0.6))).toBeLessThan(0.4);
    expect(openingYaw(512, 96, 0.6)).toBeLessThan(-Math.PI / 2 - 0.1);
    expect(Math.abs(openingYaw(7, 300, 1.78) + Math.PI / 2)).toBeLessThan(0.3);
  });

  it("zooms out at least to a view that holds the smallest maps, and to three map lengths on the largest", () => {
    expect(zoomLimits(4, 4)).toEqual({ min: 6, max: 48 });
    expect(zoomLimits(512, 512).max).toBe(1536);
    expect(zoomLimits(7, 300).max).toBe(900);
  });

  it("frames a small map with its objects, a large one by its ground alone", () => {
    const e = entityView([{ template: "StartingLocation", x: 1, y: 2, z: 5, orientation: "Cw0", owner: "" }, { template: "Pine", x: 0, y: 0, z: 4, orientation: "Cw0", owner: "" }]);
    const pts = objectOutline(4, 4, e);
    expect(pts).toEqual([1.5, 12, -2.5, 0.5, 6.5, -0.5]);
    expect(objectOutline(FRAME_OBJECTS_BELOW, 10, e)).toEqual([]);
    expect(objectOutline(4, 4, null)).toEqual([]);
  });
});

describe("the minimap at every shape", () => {
  it("keeps the map's proportions with its longer side at 168, and a strip never thinner than 14 pixels", () => {
    expect(minimapSize(256, 256)).toEqual({ w: MINIMAP_SIZE, h: MINIMAP_SIZE });
    expect(minimapSize(4, 4)).toEqual({ w: MINIMAP_SIZE, h: MINIMAP_SIZE });
    expect(minimapSize(512, 96)).toEqual({ w: 168, h: 32 });
    expect(minimapSize(96, 512)).toEqual({ w: 32, h: 168 });
    expect(minimapSize(7, 300)).toEqual({ w: MINIMAP_LEAST, h: 168 });
  });
});

describe("picking at the edges of a map that is not square", () => {
  it("finds the last tile of a thin map from above and from the side, and nothing beyond it", () => {
    const W = 7;
    const H = 300;
    const heights = new Uint8Array(W * H).fill(4);
    const down = pickHeightfield({ origin: [6.5, 20, -299.5], direction: [0, -1, 0] }, W, H, heights);
    expect(down && [down.x, down.y, down.face]).toEqual([6, 299, "top"]);
    const beyond = pickHeightfield({ origin: [7.5, 20, -299.5], direction: [0, -1, 0] }, W, H, heights);
    expect(beyond).toBeNull();
    const along = pickHeightfield({ origin: [3.5, 10, 20], direction: [0, -0.3, -1] }, W, H, heights);
    expect(along && along.y).toBeLessThan(H);
    expect(along).not.toBeNull();
  });
});
