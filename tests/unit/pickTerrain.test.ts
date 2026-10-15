// 3D picking (3D view, part 5; ROADMAP "Terrain above terrain", step 2): a ray through the voxels of the
// column masks. On every map without terrain above terrain it returns exactly what the heightfield picker
// returned (tile, height, face, where it hit), over a grid of screen points and camera angles; on
// hand-made terrains with overhangs, caves and bridges it lands on the first solid voxel face along the
// ray (checked against every exposed face of the terrain, intersected one by one), never a face behind a wall.

import { describe, expect, it } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
import { columnMask, type TerrainSource } from "../../src/render3d/mesh";
import { LAYERS } from "../../src/render3d/model";
import { groundNear, pickHeightfield, pickTerrain, runTops, type Ray, type TileHit } from "../../src/render3d/pick";

type V = [number, number, number];
const norm = (v: V): V => {
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** The ray through screen point (u, v) ∈ [−1, 1]² of the editor's orbit camera (placeCamera: 40° field of view). */
function cameraRay(target: V, yaw: number, pitch: number, distance: number, u: number, v: number, aspect = 16 / 9): Ray {
  const cp = Math.cos(pitch);
  const origin: V = [target[0] + Math.sin(yaw) * cp * distance, target[1] + Math.sin(pitch) * distance, target[2] + Math.cos(yaw) * cp * distance];
  const fwd = norm([target[0] - origin[0], target[1] - origin[1], target[2] - origin[2]]);
  const right = norm(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);
  const k = Math.tan((40 * Math.PI) / 360);
  const d = norm([0, 1, 2].map((i) => fwd[i] + u * k * aspect * right[i] + v * k * up[i]) as V);
  return { origin, direction: d };
}

describe("picking on maps without terrain above terrain", () => {
  const maps: [ThemeId, number, number][] = [
    ["any", 96, 1],
    ["riverValley", 128, 2],
    ["canyon", 128, 1],
    ["highlands", 96, 4],
    ["lakeBasin", 128, 5],
    ["islands", 96, 2],
    ["delta", 128, 7],
  ];
  it.each(maps)("%s %i² seed %i: the same hit as the heightfield picker, ray by ray", (theme, size, seed) => {
    const { W, H, heights } = generate(makeSpec({ seed, theme, size: { x: size, y: size } })).built;
    const src: TerrainSource = { W, H, heights, columns: new Map() };
    const mask = (i: number) => columnMask(src, i);
    let rays = 0;
    let hits = 0;
    let lostToRounding = 0;
    const check =(ray: Ray, cut?: number) => {
      const h = cut === undefined ? heights : heights.map((v) => Math.min(v, cut));
      const old = pickHeightfield(ray, W, H, h);
      const now = pickTerrain(ray, W, H, mask, cut === undefined ? {} : { cut });
      rays++;
      if (!old) {
        // (the one difference: a ray that reaches the map's floor over a tile of height 0 exactly at the bottom of the
        // box, which the old picker lost to rounding, lands on the floor)
        if (now) {
          expect([now.level, now.point[1], now.face], "only the floor is found where the old picker missed").toEqual([0, 0, "top"]);
          expect(h[now.y * W + now.x]).toBe(0);
          lostToRounding++;
        }
        return;
      }
      expect(now, "a hit").not.toBeNull();
      hits++;
      const n = now as TileHit;
      expect([n.x, n.y], "the tile").toEqual([old.x, old.y]);
      expect(n.level, "the height").toBe(h[old.y * W + old.x]);
      expect(n.run, "the run is the whole column").toEqual({ bottom: 0, top: h[old.y * W + old.x] });
      // (a ray that comes in through the top of a column as high as the map is "side" to the old picker)
      if (old.point[1] < 23) expect(n.face, "the face").toBe(old.face);
      expect(Math.abs(n.t - old.t), "t").toBeLessThan(1e-9);
      for (let k = 0; k < 3; k++) expect(Math.abs(n.point[k] - old.point[k]), "where").toBeLessThan(1e-9);
    };
    const mid = [W / 2, 0, -H / 2] as V;
    for (const yaw of [0, 0.7, 1.9, 3.3, 4.6, 5.9])
      for (const pitch of [0.25, 0.6, 1.0, 1.4, 1.5]) {
        for (const distance of [0.18 * W, 0.5 * W])
          for (let a = -1; a <= 1; a += 0.125)
            for (let b = -1; b <= 1; b += 0.125) {
              const ray = cameraRay([mid[0] + 7 * Math.cos(yaw) + 0.37, 8.13, mid[2] + 5 * Math.sin(yaw) + 0.21], yaw, pitch, distance, a * 0.97, b * 0.97);
              check(ray);
              if (a === 0.25 && b === 0.25) for (const cut of [0, 3, 8, 15]) check(ray, cut);
            }
      }
    // straight down at odd fractions, and low rays across the map from outside
    for (let y = 0.137; y < H; y += 3.31) for (let x = 0.211; x < W; x += 3.17) check({ origin: [x, 60, -y], direction: [0, -1, 0] });
    for (let k = 0; k < 400; k++) {
      const a = (k * 2.399963) % (2 * Math.PI);
      check({ origin: [W / 2 + Math.cos(a) * W, 2.37 + (k % 17), -(H / 2 + Math.sin(a) * H)], direction: norm([-Math.cos(a), -0.02 * (k % 5), Math.sin(a) + 0.013 * k]) });
    }
    expect(rays).toBeGreaterThan(5000);
    expect(lostToRounding, "the floor case is rare").toBeLessThan(rays / 50);
    expect(hits, "most rays land on the map").toBeGreaterThan(rays / 3);
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

/** Every exposed face of a terrain as a unit square: the plane it lies in and its extent, keyed by what the
 *  picker names it (kind, tile, voxel level; the map's floor is level −1). Tile space: x east, y north, z up. */
function faces(src: TerrainSource): { key: string; axis: 0 | 1 | 2; at: number; lo: [number, number]; solid: boolean }[] {
  const { W, H } = src;
  const solid = (x: number, y: number, z: number) => x >= 0 && y >= 0 && x < W && y < H && z >= 0 && z < LAYERS && ((columnMask(src, y * W + x) >>> z) & 1) === 1;
  const out: ReturnType<typeof faces> = [];
  const add = (key: string, axis: 0 | 1 | 2, at: number, a: number, b: number) => out.push({ key, axis, at, lo: [a, b], solid: true });
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

/** The nearest exposed face a ray meets, found by intersecting every face. */
function nearestFace(ray: Ray, list: ReturnType<typeof faces>): { key: string; t: number } | null {
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

/** What the picker names the face it hit (a wall's level from where it hit). */
function keyOf(h: TileHit): string {
  if (h.face === "top") return `top ${h.x} ${h.y} ${h.level! - 1}`;
  if (h.face === "bottom") return `bottom ${h.x} ${h.y} ${h.run!.bottom}`;
  return `${h.side} ${h.x} ${h.y} ${Math.floor(h.point[1])}`;
}

describe("picking on runs with undersides", () => {
  const W = 12;
  const H = 10;
  const ground = (z: number) => z < 3;
  const terrains: [string, TerrainSource][] = [
    ["an overhang", terrain(W, H, (x, y, z) => ground(z) || (x >= 6 && z < 8) || (x >= 3 && x < 6 && y >= 2 && y < 8 && z >= 6 && z < 8))],
    ["a cave open at one side", terrain(W, H, (x, y, z) => ground(z) || (x >= 2 && x < 10 && y >= 2 && y < 8 && z < 9 && !(x >= 3 && y >= 4 && y < 6 && z >= 3 && z < 6)))],
    ["a bridge over a gorge", terrain(W, H, (x, y, z) => z < 1 || ((x < 4 || x >= 8) && z < 7) || (y >= 4 && y < 6 && z >= 5 && z < 7))],
    ["a floating run and a column with air at its bottom", terrain(W, H, (x, y, z) => (x === 4 && y === 4 ? z >= 2 && z < 5 : ground(z) || (x === 8 && y === 7 && z >= 7 && z < 9)))],
  ];

  it.each(terrains)("%s: every ray lands on the first face along it, never behind a wall", (_name, src) => {
    expect(src.columns.size).toBeGreaterThan(0);
    const list = faces(src);
    const mask = (i: number) => columnMask(src, i);
    let s = 11;
    const r = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
    let hits = 0;
    for (let k = 0; k < 6000; k++) {
      // from above, from the side, or from inside a void, any way
      const origin: V = [r() * (W + 8) - 4, 0.3 + r() * 20, -(r() * (H + 8) - 4)];
      const inside = origin[0] >= 0 && origin[0] < W && -origin[2] >= 0 && -origin[2] < H;
      if (inside && (mask(Math.floor(-origin[2]) * W + Math.floor(origin[0])) >>> Math.floor(origin[1])) & 1) continue;
      const to: V = [r() * W, r() * 10, -(r() * H)];
      const ray: Ray = { origin, direction: norm([to[0] - origin[0], to[1] - origin[1], to[2] - origin[2]]) };
      const want = nearestFace(ray, list);
      const got = pickTerrain(ray, W, H, mask);
      if (!want) {
        expect(got, "a miss").toBeNull();
        continue;
      }
      expect(got, "a hit").not.toBeNull();
      hits++;
      expect(keyOf(got!), "the first face").toBe(want.key);
      expect(Math.abs(got!.t - want.t), "t").toBeLessThan(1e-7);
    }
    expect(hits).toBeGreaterThan(2000);
  });

  it("an overhang: a ray under the shelf sees the shelf's underside and the ledge below it", () => {
    const src = terrains[0][1];
    const mask = (i: number) => columnMask(src, i);
    // looking along the ground from the west, under the shelf (levels 3…6 are air at x 3…5, y 2…7): the
    // ray passes beneath it and lands on the wall of the rock behind (the shelf's roof is not in the way)
    const under = pickTerrain({ origin: [-2, 4.5, -4.5], direction: [1, -0.1, 0] }, W, H, mask)!;
    expect([under.x, under.face, under.side, under.run]).toEqual([6, "side", "west", { bottom: 0, top: 8 }]);
    // from the north-west, high, the shelf's roof first
    const roof = pickTerrain({ origin: [4.5, 20, -4.5], direction: [0, -1, 0] }, W, H, mask)!;
    expect([roof.x, roof.y, roof.face, roof.level, roof.run]).toEqual([4, 4, "top", 8, { bottom: 6, top: 8 }]);
    // up from below the shelf, the underside
    const ceiling = pickTerrain({ origin: [4.5, 3.5, -4.5], direction: [0.001, 1, 0] }, W, H, mask)!;
    expect([ceiling.face, ceiling.run, ceiling.level]).toEqual(["bottom", { bottom: 6, top: 8 }, 8]);
    // a ray that slips under the shelf's edge lands on the ground beneath it, not on the roof above
    const ledge = pickTerrain({ origin: [0.5, 5, -4.5], direction: norm([1, -0.45, 0]) }, W, H, mask)!;
    expect([ledge.x, ledge.face, ledge.level, ledge.run]).toEqual([4, "top", 3, { bottom: 0, top: 3 }]);
  });

  it("a cave's floor is picked through its mouth, and the map's floor under a column with air at its bottom", () => {
    const cave = terrains[1][1];
    const mask = (i: number) => columnMask(cave, i);
    // the mouth is open to the east (x ≥ 10 is open ground); looking in along the tunnel at y = 4.5
    const floor = pickTerrain({ origin: [14, 6, -4.5], direction: norm([-1, -0.7, 0]) }, W, H, mask)!;
    expect(floor.face).toBe("top");
    expect(floor.level).toBe(3);
    expect(floor.run).toEqual({ bottom: 0, top: 3 });
    expect(floor.x).toBeGreaterThanOrEqual(3);
    expect(floor.x).toBeLessThan(10);
    // beneath a floating run the map's floor is the ground
    const air = terrains[3][1];
    const f = pickTerrain({ origin: [4.5, 1.5, -4.5 + 0.2], direction: [0.01, -1, 0] }, W, H, (i) => columnMask(air, i))!;
    expect([f.x, f.y, f.face, f.level, f.run]).toEqual([4, 4, "top", 0, { bottom: 0, top: 0 }]);
  });
});

describe("the tops of a column", () => {
  it("lists the map's floor and every run's top, and names the one nearest a level", () => {
    // solid at 0…2 and 6…7 (air between), plus a floating one at 10
    const mask = 0b111 | (0b11 << 6) | (1 << 10);
    expect(runTops(mask)).toEqual([3, 8, 11]);
    expect(runTops(0b1100)).toEqual([0, 4]);
    expect(groundNear(mask, 7)).toBe(8);
    expect(groundNear(mask, 4)).toBe(3);
    expect(groundNear(mask, 5)).toBe(3);
    expect(groundNear(0b111 | (0b111 << 4), 5)).toBe(3); // tops 3 and 7: as near, the lower
    expect(groundNear(0b1100, 1)).toBe(0);
    expect(groundNear(0, 9)).toBe(0);
  });
});
