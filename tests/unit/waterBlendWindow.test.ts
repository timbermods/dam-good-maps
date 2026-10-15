// The badwater blend of a window of the map (waterMesh.ts `blendInto`): a chunk's mesh blends only the tiles it reads,
// so a 512² map's moving water never walks the whole map for each chunk (D357, the renderer at every size). The window
// holds the whole map's numbers, and a chunk's mesh is the same whatever the scratch held before it (it reads nothing
// outside the window it blended).

import { describe, expect, it, vi } from "vitest";
import { CHUNK } from "../../src/render3d/mesh";
import { surfaceWater, waterFromDepth } from "../../src/render3d/model";
import { blendedBadwater, blendInto, type WaterMeshData } from "../../src/render3d/waterMesh";

/** A map of rolling ground with ponds at different levels, some of their water bad, from a seed. */
function map(W: number, H: number, seed: number) {
  let s = seed;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  const heights = new Uint8Array(W * H);
  const depth = new Float64Array(W * H);
  const cont = new Float64Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const hill = Math.sin(x / 7 + seed) * 2 + Math.cos(y / 5) * 2;
      heights[i] = Math.max(1, Math.round(5 + hill));
      if (heights[i] <= 5 || rnd() < 0.05 || Math.abs(x - 32) < 5 || Math.abs(y - 32) < 5) {
        depth[i] = 0.4 + rnd() * 1.2;
        cont[i] = Math.sin(x / 9 + y / 13) > 0.2 ? rnd() : rnd() < 0.1 ? 1 : 0;
      }
    }
  const view = waterFromDepth(heights, depth, cont);
  return { W, H, heights, view, sw: surfaceWater(W, H, view) };
}

describe("the blend of a window", () => {
  const { W, H, sw } = map(70, 45, 3);
  const whole = blendedBadwater(W, H, sw);

  it("holds the whole map's numbers in any window, clipped or not", () => {
    let s = 7;
    const rnd = (n: number) => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) % n;
    for (let k = 0; k < 40; k++) {
      const x0 = rnd(W + 20) - 10;
      const y0 = rnd(H + 20) - 10;
      const x1 = x0 + rnd(40);
      const y1 = y0 + rnd(40);
      const out = new Float32Array(W * H).fill(-5);
      blendInto(out, W, H, sw, x0, y0, x1, y1);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const inside = x >= x0 && x <= x1 && y >= y0 && y <= y1;
          expect(out[y * W + x]).toBe(inside ? whole[y * W + x] : -5);
        }
    }
  });

  it("a chunk's mesh is the same whatever the scratch held before (it reads only its window), at sizes that are not a multiple of a chunk", async () => {
    const meshes = async (poison: boolean) => {
      vi.resetModules();
      const wm = await import("../../src/render3d/waterMesh");
      const md = await import("../../src/render3d/model");
      if (poison) {
        // a different map, contaminated everywhere, meshed first: its blend is what the scratch holds
        const other = map(70, 45, 11);
        const sw2 = md.surfaceWater(other.W, other.H, other.view);
        sw2.contamination.fill(0.9);
        for (let cy = 0; cy * CHUNK < other.H; cy++) for (let cx = 0; cx * CHUNK < other.W; cx++) wm.meshWaterChunk(other.W, other.H, other.heights, sw2, other.view, null, cx, cy);
      }
      const m = map(70, 45, 3);
      const sw3 = md.surfaceWater(m.W, m.H, m.view);
      const out: WaterMeshData[] = [];
      for (let cy = 0; cy * CHUNK < m.H; cy++) for (let cx = 0; cx * CHUNK < m.W; cx++) out.push(wm.meshWaterChunk(m.W, m.H, m.heights, sw3, m.view, wm.lowerByTile(sw3, m.view), cx, cy));
      return out;
    };
    const clean = await meshes(false);
    const dirty = await meshes(true);
    expect(dirty.length).toBe(clean.length);
    expect(clean.length).toBe(Math.ceil(70 / CHUNK) * Math.ceil(45 / CHUNK));
    clean.forEach((c, k) => {
      expect(c.quads).toBeGreaterThan(0);
      expect(Array.from(dirty[k].data)).toEqual(Array.from(c.data));
      expect(Array.from(dirty[k].positions)).toEqual(Array.from(c.positions));
      expect(Array.from(dirty[k].falls)).toEqual(Array.from(c.falls));
    });
  });
});
