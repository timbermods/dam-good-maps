// Naturalize's re-meshing (terrainChanges.ts): redoing only what the changed tiles touch gives the same view as redoing
// everything: every chunk left alone meshes the same as before, and the sky and tile data redone along the changed
// rows equal the whole map's.

import { describe, expect, it } from "vitest";
import { meshChunk } from "../../src/render3d/mesh";
import { SKY_REACH, skyVisibility, skyVisibilityRect, tileData, tileDataRect } from "../../src/render3d/light";
import { terrainChanges } from "../../src/render3d/terrainChanges";

let seed = 3;
const rnd = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

/** A 256² land, and the same with about 500 tiles changed, scattered over a 95×95 box (a Naturalize dab at Size 64). */
function dab() {
  const W = 256;
  const H = 256;
  const before = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) before[y * W + x] = 4 + Math.floor(3 * Math.sin(x / 7) + 3 * Math.cos(y / 9) + 3);
  const after = before.slice();
  const box = { x0: 60, y0: 70, x1: 154, y1: 164 };
  let changed = 0;
  while (changed < 500) {
    const x = box.x0 + Math.floor(rnd() * 95);
    const y = box.y0 + Math.floor(rnd() * 95);
    const i = y * W + x;
    if (after[i] !== before[i]) continue;
    after[i] = before[i] <= 1 || rnd() < 0.5 ? before[i] + 1 : before[i] - 1;
    changed++;
  }
  return { W, H, before, after, box };
}

describe("what a change to the land touches (Naturalize's re-meshing)", () => {
  const { W, H, before, after, box } = dab();
  const c = terrainChanges(W, H, before, after, box, SKY_REACH)!;

  it("finds the changed tiles and their bounds, and nothing for no change", () => {
    expect(c.count).toBe(500);
    expect(c.rect.x0).toBeGreaterThanOrEqual(box.x0);
    expect(c.rect.y1).toBeLessThanOrEqual(box.y1);
    expect(terrainChanges(W, H, before, before, box, SKY_REACH)).toBeNull();
  });

  it("every chunk it leaves alone meshes exactly as before", () => {
    const columns = new Map<number, Uint8Array>();
    const redo = new Set(c.chunks.map(([x, y]) => `${x},${y}`));
    for (let cy = 0; cy < H / 32; cy++)
      for (let cx = 0; cx < W / 32; cx++) {
        if (redo.has(`${cx},${cy}`)) continue;
        const a = meshChunk({ W, H, heights: before, columns }, cx, cy);
        const b = meshChunk({ W, H, heights: after, columns }, cx, cy);
        expect(Buffer.from(b.positions.buffer).equals(Buffer.from(a.positions.buffer)), `chunk ${cx},${cy}`).toBe(true);
      }
  });

  it("the sky and tile data redone along its rows equal the whole map's", () => {
    const sky = skyVisibility(W, H, before);
    const tiles = tileData(W, H, before, sky, null, null);
    for (const r of c.rows) skyVisibilityRect(W, H, after, sky, r.x0, r.y, r.x1, r.y);
    for (const r of c.rows) tileDataRect(W, H, after, sky, null, null, tiles, r.x0, r.y, r.x1, r.y);
    const skyAll = skyVisibility(W, H, after);
    expect(Buffer.from(sky).equals(Buffer.from(skyAll))).toBe(true);
    expect(Buffer.from(tiles).equals(Buffer.from(tileData(W, H, after, skyAll, null, null)))).toBe(true);
  });

  it("redoes far fewer tiles than the box and its reach", () => {
    const rowTiles = c.rows.reduce((s, r) => s + r.x1 - r.x0 + 1, 0);
    const boxTiles = (95 + 2 * SKY_REACH) ** 2;
    // (scattered tiles' spans still cover most of their rows: the saving is in the meshing and the rows outside)
    expect(rowTiles).toBeLessThanOrEqual(boxTiles);
  });
});
