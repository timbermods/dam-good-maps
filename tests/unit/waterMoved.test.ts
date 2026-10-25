// Moving water is drawn again only where it moved (renderer.updateWaterSoon, waterMesh.ts `waterMovedChunks`):
// against what each chunk was drawn with, a visible difference (wet or dry, or more than MOVED_WATER), reaching
// six tiles past it; with no tolerance, any difference at all (the water put in place is drawn exactly).

import { describe, expect, it } from "vitest";
import { CHUNK } from "../../src/render3d/mesh";
import { surfaceWater, waterFromDepth, type SurfaceWater } from "../../src/render3d/model";
import { changedWaterChunks, drawnWater, drewChunk, exactWaterChunks, meshWaterChunk, MOVED_WATER, waterMovedChunk, waterMovedChunks } from "../../src/render3d/waterMesh";
import { plainLayers } from "../../src/render3d/waterLayers";

const W = 96;
const H = 64;
/** A flat map with water `d` deep on the tiles `wet` says. */
function water(d: (x: number, y: number) => number) {
  const heights = new Uint8Array(W * H).fill(4);
  const depth = new Float64Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) depth[y * W + x] = d(x, y);
  return surfaceWater(W, H, waterFromDepth(heights, depth, new Float64Array(W * H)));
}
/** What is drawn when every chunk was drawn on `sw`. */
function drawnOn(sw: ReturnType<typeof water>) {
  const drawn = drawnWater(W * H);
  for (let cy = 0; cy < 2; cy++) for (let cx = 0; cx < 3; cx++) drewChunk(W, H, drawn, sw, cx, cy);
  return drawn;
}

describe("moving water drawn again where it moved", () => {
  it("nothing when it is what was drawn; a change under the tolerance only when none is allowed", () => {
    const a = water((x) => (x < 40 ? 0.5 : 0));
    expect(waterMovedChunks(W, H, drawnOn(a), a, MOVED_WATER).size).toBe(0);
    const b = water((x) => (x < 40 ? 0.5 + MOVED_WATER.level / 2 : 0));
    expect(waterMovedChunks(W, H, drawnOn(a), b, MOVED_WATER).size).toBe(0);
    expect([...waterMovedChunks(W, H, drawnOn(a), b, { level: 0, share: 0 })].sort()).toEqual(["0,0", "0,1", "1,0", "1,1"]);
  });

  it("a tile turning wet counts however thin, and so do the chunks within six tiles of it", () => {
    const a = water(() => 0);
    const b = water((x, y) => (x === 30 && y === 10 ? 0.002 : 0));
    // (tile 30 is two from chunk 1's edge at 32: both chunks; row 10 is far from row 32)
    expect([...waterMovedChunks(W, H, drawnOn(a), b, MOVED_WATER)].sort()).toEqual(["0,0", "1,0"]);
  });

  it("small changes that each stay under the tolerance still add up against what is drawn", () => {
    const a = water((x) => (x < 20 ? 0.5 : 0));
    const drawn = drawnOn(a);
    // three updates of a little each: the drawn chunk is compared with what it shows, not the last update
    const later = water((x) => (x < 20 ? 0.5 + 3 * (MOVED_WATER.level * 0.6) : 0));
    expect(waterMovedChunks(W, H, drawn, later, MOVED_WATER).has("0,0")).toBe(true);
  });
});

// The page's thread looks at less of the map for the same answers (a water update leaves the page's thread free): the
// chunks waiting to be drawn checked one by one (`waterMovedChunk`), the chunks water put in place draws again found
// in one pass (`exactWaterChunks`), each part of a chunk's row marked once. Each against the whole map's answer, as it
// was, after random changes.

/** waterMovedChunks as it was before each part of a row was marked once: every tile marks its chunks. */
function movedChunksBefore(W: number, H: number, drawn: ReturnType<typeof drawnWater>, sw: SurfaceWater, tol: { level: number; share: number }): Set<string> {
  const nx = Math.ceil(W / CHUNK);
  const ny = Math.ceil(H / CHUNK);
  const dirty = new Uint8Array(nx * ny);
  const R = 6;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const sa = drawn.surface[i];
      const sb = sw.surface[i];
      const wa = sa === sa;
      if (!wa && !(sb === sb)) continue;
      if (wa === (sb === sb) && Math.abs(sa - sb) <= tol.level && Math.abs(drawn.depth[i] - sw.depth[i]) <= tol.level && Math.abs(drawn.contamination[i] - sw.contamination[i]) <= tol.share) continue;
      const cx0 = Math.floor(Math.max(0, x - R) / CHUNK);
      const cx1 = Math.floor(Math.min(W - 1, x + R) / CHUNK);
      const cy0 = Math.floor(Math.max(0, y - R) / CHUNK);
      const cy1 = Math.floor(Math.min(H - 1, y + R) / CHUNK);
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) dirty[cy * nx + cx] = 1;
    }
  const out = new Set<string>();
  for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) if (dirty[cy * nx + cx]) out.add(`${cx},${cy}`);
  return out;
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Wet = { depth: Float64Array; cont: Float64Array };

/** Rolling land, and water on about half of it with some badwater. */
function scene(W: number, H: number, r: () => number): Wet & { heights: Uint8Array } {
  const heights = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) heights[y * W + x] = 3 + Math.floor(2 * Math.sin(x / 7) + 2 * Math.cos(y / 9) + 2);
  const depth = new Float64Array(W * H);
  const cont = new Float64Array(W * H);
  for (let i = 0; i < W * H; i++) {
    depth[i] = r() < 0.45 ? 0 : 0.05 + r() * 1.5;
    cont[i] = r() < 0.2 ? r() : 0;
  }
  return { heights, depth, cont };
}

/** The water after a random change: a patch moved a little (some of it under the tolerance), a few tiles turned wet or dry. */
function changed(W: number, H: number, s: Wet, r: () => number): Wet {
  const depth = s.depth.slice();
  const cont = s.cont.slice();
  const x0 = Math.floor(r() * W);
  const y0 = Math.floor(r() * H);
  const size = 1 + Math.floor(r() * 12);
  const step = [0.0005, 0.002, 0.004, 0.02, 0.3][Math.floor(r() * 5)];
  for (let y = y0; y < Math.min(H, y0 + size); y++)
    for (let x = x0; x < Math.min(W, x0 + size); x++) {
      const i = y * W + x;
      if (depth[i] > 0) depth[i] += step;
      if (r() < 0.3) cont[i] = Math.min(1, cont[i] + step);
    }
  for (let k = 0; k < 3; k++) {
    const i = Math.floor(r() * W * H);
    depth[i] = depth[i] > 0 ? 0 : 0.4;
  }
  return { depth, cont };
}

describe("the moved chunks, found looking at less of the map", () => {
  // (97 by 70: chunks cut short at the east and north edges, one a single tile wide)
  for (const [MW, MH] of [[97, 70], [64, 64]] as const)
    it(`${MW}x${MH}: the same chunks as the whole map's answer, after random changes`, () => {
      const nx = Math.ceil(MW / CHUNK);
      const ny = Math.ceil(MH / CHUNK);
      const r = rng(MW * 1000 + MH);
      for (let trial = 0; trial < 40; trial++) {
        const base = scene(MW, MH, r);
        const sw = (d: Wet) => surfaceWater(MW, MH, waterFromDepth(base.heights, d.depth, d.cont));
        // chunks drawn at different moments: some on the first water, some on later ones, a few never
        const states = [base, changed(MW, MH, base, r)];
        states.push(changed(MW, MH, states[1], r));
        const drawn = drawnWater(MW * MH);
        for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) if (r() < 0.9) drewChunk(MW, MH, drawn, sw(states[Math.floor(r() * 3)]), cx, cy);
        const before = sw(states[2]);
        const after = sw(changed(MW, MH, states[2], r));
        for (const tol of [MOVED_WATER, { level: 0, share: 0 }]) {
          const whole = movedChunksBefore(MW, MH, drawn, after, tol);
          expect([...waterMovedChunks(MW, MH, drawn, after, tol)].sort()).toEqual([...whole].sort());
          for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) expect(waterMovedChunk(MW, MH, drawn, after, tol, cx, cy), `${trial}: chunk ${cx},${cy}`).toBe(whole.has(`${cx},${cy}`));
        }
        const union = new Set([...movedChunksBefore(MW, MH, drawn, after, { level: 0, share: 0 }), ...changedWaterChunks(MW, MH, before, after, 0, 0, true)]);
        expect([...exactWaterChunks(MW, MH, drawn, before, after)].sort()).toEqual([...union].sort());
      }
    });

  it("water put in place over water drawn whole: the chunks drawn again leave every chunk the mesh a whole rebuild makes", () => {
    const MW = 97;
    const MH = 70;
    const nx = Math.ceil(MW / CHUNK);
    const ny = Math.ceil(MH / CHUNK);
    const r = rng(7);
    for (let trial = 0; trial < 12; trial++) {
      const base = scene(MW, MH, r);
      const next = changed(MW, MH, base, r);
      const a = surfaceWater(MW, MH, waterFromDepth(base.heights, base.depth, base.cont));
      const b = surfaceWater(MW, MH, waterFromDepth(base.heights, next.depth, next.cont));
      const drawn = drawnWater(MW * MH);
      const meshes = new Map<string, ReturnType<typeof meshWaterChunk>>();
      for (let cy = 0; cy < ny; cy++)
        for (let cx = 0; cx < nx; cx++) {
          drewChunk(MW, MH, drawn, a, cx, cy);
          meshes.set(`${cx},${cy}`, meshWaterChunk(MW, MH, plainLayers(base.heights, a), cx, cy));
        }
      for (const key of exactWaterChunks(MW, MH, drawn, a, b)) {
        const [cx, cy] = key.split(",").map(Number);
        meshes.set(key, meshWaterChunk(MW, MH, plainLayers(base.heights, b), cx, cy));
      }
      for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) expect(meshes.get(`${cx},${cy}`), `${trial}: chunk ${cx},${cy}`).toEqual(meshWaterChunk(MW, MH, plainLayers(base.heights, b), cx, cy));
    }
  });
});
