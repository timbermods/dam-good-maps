// The level-slice cutaway (3D view, part 6; D207): under a layer cut the terrain draws the clipped columns
// (every voxel at or above the cut gone, a cap only where rock crosses it), and picking, the hover, the
// Wand's `hasTopAt` and Select's ring agree with what is drawn. What is drawn is worked out here as the GPU
// does it: the mesher's quads, folded onto the cut (the vertex shader's `min(y, slice)`), less the faces the
// fragment shader drops (cutaway.ts `cutFace`). On every map without terrain above terrain the folded mesh is
// exactly the clipped columns' surface and the shader's branch is not compiled (`cutawayOn`); on hand-made
// caves, overhangs and bridges it is too, and every ray lands on the first drawn face along it.

import { describe, expect, it } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
import { CaveLight } from "../../src/render3d/caveLight";
import { cutawayOn, cutFace } from "../../src/render3d/cutaway";
import { chunkCount, columnMask, meshChunk, type TerrainSource } from "../../src/render3d/mesh";
import { LAYERS } from "../../src/render3d/model";
import { cutKeep, groundNear, hasTopAt, pickTerrain, type Ray, type TileHit } from "../../src/render3d/pick";

type V = [number, number, number];
const norm = (v: V): V => {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
};

/** A unit face: what the picker names it (kind, tile, voxel level; the map's floor is level −1). */
type Face = { key: string; axis: 0 | 1 | 2; at: number; lo: [number, number] };

/** The faces drawn under a cut, unit by unit (tile space: x east, y north, z up): every quad of the mesher
 *  folded onto the cut; walls folded flat draw nothing; a horizontal face at the cut is dropped where
 *  `cutFace` says "gone", and one facing down into the rock just below the cut is never seen. */
function drawn(src: TerrainSource, cut: number): Map<string, Face> {
  const { W } = src;
  const out = new Map<string, Face>();
  const add = (f: Face) => out.set(f.key, f);
  const { nx, ny } = chunkCount(src.W, src.H);
  for (let cy = 0; cy < ny; cy++)
    for (let cx = 0; cx < nx; cx++) {
      const d = meshChunk(src, cx, cy);
      for (let q = 0; q < d.quads; q++) {
        const p = d.positions.subarray(q * 12, q * 12 + 12);
        const [nX, nY, nZ] = [d.normals[q * 12], d.normals[q * 12 + 1], d.normals[q * 12 + 2]];
        const xs = [p[0], p[3], p[6], p[9]];
        const ys = [p[1], p[4], p[7], p[10]].map((v) => Math.min(v, cut));
        const ts = [p[2], p[5], p[8], p[11]].map((v) => -v); // tile y
        const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
        const [z0, z1] = [Math.min(...ys), Math.max(...ys)];
        const [y0, y1] = [Math.min(...ts), Math.max(...ts)];
        if (nY !== 0) {
          const z = z0;
          for (let y = y0; y < y1; y++)
            for (let x = x0; x < x1; x++) {
              const mask = columnMask(src, y * W + x);
              if (z === cut) {
                if (cutFace(mask, cut) === "gone") continue;
                if (nY < 0 && (cut === 0 || (mask >>> (cut - 1)) & 1)) continue;
              }
              if (nY > 0) add({ key: `top ${x} ${y} ${z - 1}`, axis: 2, at: z, lo: [x, y] });
              else add({ key: `bottom ${x} ${y} ${z}`, axis: 2, at: z, lo: [x, y] });
            }
        } else if (nX !== 0) {
          const col = nX > 0 ? x0 - 1 : x0;
          for (let y = y0; y < y1; y++) for (let z = z0; z < z1; z++) add({ key: `${nX > 0 ? "east" : "west"} ${col} ${y} ${z}`, axis: 0, at: x0, lo: [y, z] });
        } else {
          const row = nZ < 0 ? y0 - 1 : y0;
          for (let x = x0; x < x1; x++) for (let z = z0; z < z1; z++) add({ key: `${nZ < 0 ? "north" : "south"} ${x} ${row} ${z}`, axis: 1, at: y0, lo: [x, z] });
        }
      }
    }
  return out;
}

/** Every exposed face of the columns `mask` gives (the map's floor under air at the bottom). */
function exposed(W: number, H: number, mask: (i: number) => number): Map<string, Face> {
  const solid = (x: number, y: number, z: number) => x >= 0 && y >= 0 && x < W && y < H && z >= 0 && z < LAYERS && ((mask(y * W + x) >>> z) & 1) === 1;
  const out = new Map<string, Face>();
  const add = (key: string, axis: 0 | 1 | 2, at: number, a: number, b: number) => out.set(key, { key, axis, at, lo: [a, b] });
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (!solid(x, y, 0)) add(`top ${x} ${y} -1`, 2, 0, x, y);
      for (let z = 0; z < LAYERS; z++) {
        if (!solid(x, y, z)) continue;
        if (!solid(x, y, z + 1)) add(`top ${x} ${y} ${z}`, 2, z + 1, x, y);
        if (z > 0 && !solid(x, y, z - 1)) add(`bottom ${x} ${y} ${z}`, 2, z, x, y);
        if (!solid(x + 1, y, z)) add(`east ${x} ${y} ${z}`, 0, x + 1, y, z);
        if (!solid(x - 1, y, z)) add(`west ${x} ${y} ${z}`, 0, x, y, z);
        if (!solid(x, y + 1, z)) add(`north ${x} ${y} ${z}`, 1, y + 1, x, z);
        if (!solid(x, y - 1, z)) add(`south ${x} ${y} ${z}`, 1, y, x, z);
      }
    }
  return out;
}

const sameKeys = (a: Map<string, Face>, b: Map<string, Face>) => {
  const missing = [...b.keys()].filter((k) => !a.has(k));
  const extra = [...a.keys()].filter((k) => !b.has(k));
  return { missing: missing.slice(0, 5), extra: extra.slice(0, 5), n: missing.length + extra.length };
};

describe("the cutaway on maps without terrain above terrain", () => {
  const maps: [ThemeId, number, number][] = [
    ["any", 96, 1],
    ["riverValley", 128, 2],
    ["canyon", 128, 1],
    ["highlands", 96, 4],
    ["lakeBasin", 128, 5],
    ["islands", 96, 2],
    ["delta", 128, 7],
  ];
  it.each(maps)("%s %i² seed %i: the shader's branch is off, and folding onto the cut draws the clipped columns", (theme, size, seed) => {
    const { W, H, heights } = generate(makeSpec({ seed, theme, size: { x: size, y: size } })).built;
    const src: TerrainSource = { W, H, heights, columns: new Map() };
    expect(cutawayOn(src)).toBe(false);
    expect(CaveLight.build(src)).toBeNull();
    let top = 0;
    for (const h of heights) top = Math.max(top, h);
    for (const cut of [0, 3, Math.floor(top / 2), top - 1]) {
      const keep = cutKeep(cut);
      const d = drawn(src, cut);
      const diff = sameKeys(d, exposed(W, H, (i) => columnMask(src, i) & keep));
      expect(diff, `cut ${cut}`).toEqual({ missing: [], extra: [], n: 0 });
      // the cap: the old rule (a top on a column taller than the cut) and cutFace's agree on every tile
      for (let i = 0; i < W * H; i++) if (heights[i] >= cut) expect(cutFace(columnMask(src, i), cut) === "cap", `tile ${i}`).toBe(heights[i] > cut);
    }
  });
});

// ---- terrains with undersides ----

function terrain(W: number, H: number, solid: (x: number, y: number, z: number) => boolean): TerrainSource {
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
  return { W, H, heights, columns };
}

/** The nearest drawn face a ray meets, found by intersecting every face. */
function nearestFace(ray: Ray, list: Iterable<Face>): { key: string; t: number } | null {
  const o = [ray.origin[0], -ray.origin[2], ray.origin[1]];
  const d = [ray.direction[0], -ray.direction[2], ray.direction[1]];
  let best: { key: string; t: number } | null = null;
  for (const f of list) {
    if (Math.abs(d[f.axis]) < 1e-12) continue;
    const t = (f.at - o[f.axis]) / d[f.axis];
    if (t < 0 || (best && t >= best.t)) continue;
    const [a, b] = f.axis === 0 ? [1, 2] : f.axis === 1 ? [0, 2] : [0, 1];
    const pa = o[a] + d[a] * t;
    const pb = o[b] + d[b] * t;
    if (pa >= f.lo[0] && pa <= f.lo[0] + 1 && pb >= f.lo[1] && pb <= f.lo[1] + 1) best = { key: f.key, t };
  }
  return best;
}

function keyOf(h: TileHit): string {
  if (h.face === "top") return `top ${h.x} ${h.y} ${h.level! - 1}`;
  if (h.face === "bottom") return `bottom ${h.x} ${h.y} ${h.run!.bottom}`;
  return `${h.side} ${h.x} ${h.y} ${Math.floor(h.point[1])}`;
}

describe("the cutaway on runs with undersides", () => {
  const W = 12;
  const H = 10;
  const ground = (z: number) => z < 3;
  // random caves across chunk edges (W 70: three chunks along x)
  let s = 5;
  const r = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
  const holes = new Set<string>();
  for (let k = 0; k < 60; k++) {
    const x = Math.floor(r() * 66);
    const y = Math.floor(r() * 36);
    const z = 2 + Math.floor(r() * 9);
    for (let a = 0; a < 4; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 2; c++) holes.add(`${x + a},${y + b},${z + c}`);
  }
  const terrains: [string, TerrainSource][] = [
    ["an overhang", terrain(W, H, (x, y, z) => ground(z) || (x >= 6 && z < 8) || (x >= 3 && x < 6 && y >= 2 && y < 8 && z >= 6 && z < 8))],
    ["a cave open at one side", terrain(W, H, (x, y, z) => ground(z) || (x >= 2 && x < 10 && y >= 2 && y < 8 && z < 9 && !(x >= 3 && y >= 4 && y < 6 && z >= 3 && z < 6)))],
    ["a bridge over a gorge", terrain(W, H, (x, y, z) => z < 1 || ((x < 4 || x >= 8) && z < 7) || (y >= 4 && y < 6 && z >= 5 && z < 7))],
    ["a floating run and a column with air at its bottom", terrain(W, H, (x, y, z) => (x === 4 && y === 4 ? z >= 2 && z < 5 : ground(z) || (x === 8 && y === 7 && z >= 7 && z < 9)))],
    ["random caves across chunk edges", terrain(70, 40, (x, y, z) => z < 6 + ((x * 7 + y * 3) % 7) && !holes.has(`${x},${y},${z}`))],
  ];

  it.each(terrains)("%s: at every cut, the faces drawn are the clipped columns' surface", (_name, src) => {
    expect(cutawayOn(src)).toBe(true);
    for (let cut = 0; cut <= 14; cut++) {
      const keep = cutKeep(cut);
      const diff = sameKeys(drawn(src, cut), exposed(src.W, src.H, (i) => columnMask(src, i) & keep));
      expect(diff, `cut ${cut}`).toEqual({ missing: [], extra: [], n: 0 });
    }
  });

  it.each(terrains.slice(0, 4))("%s: at every cut, rays, the hover, the Wand and Select's ring agree with what is drawn", (_name, src) => {
    const mask = (i: number) => columnMask(src, i);
    for (const cut of [2, 4, 5, 6, 7, 8]) {
      const faces = drawn(src, cut);
      const list = [...faces.values()];
      let s2 = 11 + cut;
      const rr = () => (s2 = (Math.imul(s2, 1103515245) + 12345) >>> 0) / 4294967296;
      let hits = 0;
      for (let k = 0; k < 1500; k++) {
        // from above (the layer view's camera), any way down into the map
        const origin: V = [rr() * (W + 8) - 4, 12 + rr() * 10, -(rr() * (H + 8) - 4)];
        const to: V = [rr() * W, rr() * cut, -(rr() * H)];
        const ray: Ray = { origin, direction: norm([to[0] - origin[0], to[1] - origin[1], to[2] - origin[2]]) };
        const want = nearestFace(ray, list);
        const got = pickTerrain(ray, W, H, mask, { cut });
        if (!want) {
          expect(got, "a miss").toBeNull();
          continue;
        }
        expect(got, "a hit").not.toBeNull();
        hits++;
        expect(keyOf(got!), `cut ${cut}: the first face drawn`).toBe(want.key);
        expect(Math.abs(got!.t - want.t), "t").toBeLessThan(1e-7);
        // the hover lights the top at the hit's level (materials.ts: |y − hover.w| < 0.02)
        if (got!.face === "top") expect(got!.point[1]).toBeCloseTo(got!.level!, 6);
      }
      expect(hits).toBeGreaterThan(500);
      // the Wand (`hasTopAt`) and Select's ring (`groundNear` on the clipped mask) name only tops that are drawn
      for (let i = 0; i < W * H; i++) {
        const x = i % W;
        const y = (i - x) / W;
        const m = src.columns.has(i) ? mask(i) : undefined;
        for (let level = 0; level <= LAYERS; level++)
          expect(hasTopAt(src.heights[i], m, level, cut), `tile ${x},${y} level ${level} cut ${cut}`).toBe(faces.has(`top ${x} ${y} ${level - 1}`));
        for (let aim = 0; aim <= cut; aim++) expect(faces.has(`top ${x} ${y} ${groundNear(mask(i) & cutKeep(cut), aim) - 1}`)).toBe(true);
      }
    }
  });

  it("a cave sliced through its roof shows its floor, unhatched; a cut through the roof is a cap", () => {
    // the cave: air at 3…5 under a roof at 6…8 (x 3…9, y 4…5)
    const mask = 0b111 | (0b111 << 6);
    expect(cutFace(mask, 4)).toBe("gone"); // the roof folded onto the cut over the cave: not drawn
    expect(cutFace(mask, 7)).toBe("cap"); // the cut through the roof: the hatched lid
    expect(cutFace(mask, 3)).toBe("top"); // the cave's floor at the cut: ground, not a lid
    expect(cutFace(mask, 6)).toBe("gone"); // the roof's underside at the cut: gone with the roof
    expect(cutFace(0b1111, 2)).toBe("cap");
    expect(cutFace(0b1111, 0)).toBe("cap");
    const src = terrains[1][1];
    const d = drawn(src, 4);
    // looking straight down through the cut over the cave: its floor (level 3), not a lid at 4
    const hit = pickTerrain({ origin: [5.5, 20, -4.5], direction: [0, -1, 0] }, W, H, (i) => columnMask(src, i), { cut: 4 })!;
    expect([hit.face, hit.level]).toEqual(["top", 3]);
    expect(nearestFace({ origin: [5.5, 20, -4.5], direction: [0, -1, 0] }, d.values())!.key).toBe("top 5 4 2");
  });
});
