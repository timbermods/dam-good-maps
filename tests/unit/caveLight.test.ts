// Light under roofs (3D view, part 2; ROADMAP "Terrain above terrain", step 2): on every map without
// terrain above terrain the terrain shader keeps the baked per-tile light exactly (no face of the mesh
// looks into roofed air, so `caveAt` hands every point back to the unchanged code), and such a map has
// no volume at all; on terrains with roofs, cave floors, walls and ceilings take their own air's light,
// dimmer deeper in; and relighting the box round an edit gives the same bytes as building it again.

import { describe, expect, it } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
import { CaveLight, caveSample, LIGHT_LEVELS, openSky } from "../../src/render3d/caveLight";
import { skyVisibility } from "../../src/render3d/light";
import { chunkCount, meshChunk, type MeshData, type TerrainSource } from "../../src/render3d/mesh";
import { LAYERS } from "../../src/render3d/model";

/** Points on every quad (its middle and its corners a quarter of the way in), with its normal. */
function* facePoints(m: MeshData): Generator<{ p: [number, number, number]; n: [number, number, number] }> {
  for (let q = 0; q < m.quads; q++) {
    const c = (v: number, a: number) => m.positions[q * 12 + v * 3 + a];
    const n: [number, number, number] = [m.normals[q * 12] / 127, m.normals[q * 12 + 1] / 127, m.normals[q * 12 + 2] / 127];
    const mid = [0, 1, 2].map((a) => (c(0, a) + c(1, a) + c(2, a) + c(3, a)) / 4);
    yield { p: mid as [number, number, number], n };
    for (let v = 0; v < 4; v++) yield { p: [0, 1, 2].map((a) => c(v, a) * 0.75 + mid[a] * 0.25) as [number, number, number], n };
  }
}

describe("light under roofs on maps without terrain above terrain", () => {
  const maps: [ThemeId, number, number][] = [
    ["any", 96, 1],
    ["riverValley", 128, 2],
    ["canyon", 128, 1],
    ["highlands", 96, 4],
    ["lakeBasin", 128, 5],
    ["islands", 96, 2],
    ["delta", 256, 7],
  ];
  it.each(maps)("%s %i² seed %i: no volume, and every face keeps the baked light", (theme, size, seed) => {
    const { W, H, heights } = generate(makeSpec({ seed, theme, size: { x: size, y: size } })).built;
    const src: TerrainSource = { W, H, heights, columns: new Map() };
    const sky = skyVisibility(W, H, heights);
    expect(CaveLight.build(src, sky), "the renderer builds no volume").toBeNull();
    // and even with one built, the shader's rule hands every point of every face to the baked light
    const v = CaveLight.build(src, sky, true)!;
    const { nx, ny } = chunkCount(W, H);
    let points = 0;
    for (let cy = 0; cy < ny; cy++)
      for (let cx = 0; cx < nx; cx++)
        for (const { p, n } of facePoints(meshChunk(src, cx, cy))) {
          points++;
          if (caveSample(v, p, n) !== null) throw new Error(`chunk ${cx},${cy}: a face at ${p} (normal ${n}) would take the volume's light`);
        }
    expect(points).toBeGreaterThan(1000);
  });
});

/** A terrain from a solid(x, y, z) rule, as the worker sends it (see meshEquivalence.test.ts). */
function terrain(W: number, H: number, solid: (x: number, y: number, z: number) => boolean): TerrainSource {
  const heights = new Uint8Array(W * H);
  const columns = new Map<number, Uint8Array>();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const c = new Uint8Array(LAYERS);
      let top = 0;
      for (let z = 0; z < LAYERS; z++) if (solid(x, y, z)) (c[z] = 1), (top = z + 1);
      heights[y * W + x] = top;
      if (c.subarray(0, top).some((k) => !k)) columns.set(y * W + x, c);
    }
  return { W, H, heights, columns };
}

describe("light under roofs on terrains with roofs", () => {
  // a hill 12 high over ground 2 high, with a tunnel at levels 2–4 running west from its east face
  // (x 10…19 at y 9…11), and a sealed chamber at levels 6–7 inside it
  const W = 32;
  const H = 24;
  const hill = (x: number, y: number) => x >= 6 && x < 20 && y >= 4 && y < 18;
  const src = terrain(W, H, (x, y, z) => {
    if (z < 2) return true;
    if (!hill(x, y) || z >= 12) return false;
    if (x >= 10 && y >= 9 && y <= 11 && z <= 4) return false;
    if (x >= 8 && x <= 9 && y >= 6 && y <= 7 && z >= 6 && z <= 7) return false;
    return true;
  });
  const sky = skyVisibility(W, H, src.heights);
  const v = CaveLight.build(src, sky)!;

  it("builds a volume, 2 bytes a cell", () => {
    expect(v).not.toBeNull();
    expect(v.data.length).toBe(W * H * LIGHT_LEVELS * 2);
  });

  it("the tunnel's floor, walls and ceiling take their own light, dimmer deeper in", () => {
    const floor = (x: number) => caveSample(v, [x + 0.5, 2, -10.5], [0, 1, 0]);
    const ceiling = (x: number) => caveSample(v, [x + 0.5, 5, -10.5], [0, -1, 0]);
    const wall = (x: number) => caveSample(v, [x + 0.5, 3.5, -9], [0, 0, -1]); // the tunnel's south wall, facing north
    for (const f of [floor, ceiling, wall]) {
      const mouth = f(19)!;
      const deep = f(11)!;
      expect(mouth).not.toBeNull();
      expect(deep).not.toBeNull();
      expect(deep[0]).toBeLessThan(mouth[0]);
    }
    // the deepest floor dims to the volume's least (the shader holds it at 0.30)
    expect(floor(10)![0]).toBeLessThanOrEqual(0.3);
  });

  it("a cave's mouth is never brighter than the open ground before it", () => {
    // the tunnel opens east onto the ground at x = 20: its floor just inside, and at the roof line
    const open = openSky(sky[10 * W + 20]) / 255;
    for (const x of [19.7, 19.95]) expect(caveSample(v, [x, 2, -10.5], [0, 1, 0])![0]).toBeLessThanOrEqual(open);
    expect(caveSample(v, [18.5, 2, -10.5], [0, 1, 0])![0]).toBeLessThan(open);
  });

  it("a sealed chamber takes the least sky and no sun", () => {
    const s = caveSample(v, [8.5, 6, -6.5], [0, 1, 0])!;
    expect(s[0]).toBeLessThanOrEqual(64 / 255 + 1e-9);
    expect(s[1]).toBe(0);
  });

  it("open ground beside the hill, the hill's top and its outer walls keep the baked light", () => {
    expect(caveSample(v, [3.5, 2, -10.5], [0, 1, 0])).toBeNull();
    expect(caveSample(v, [12.5, 12, -12.5], [0, 1, 0])).toBeNull();
    expect(caveSample(v, [6, 7, -12.5], [-1, 0, 0])).toBeNull();
    // the map's own border, and a top folded into the slice's cut (its air is rock)
    expect(caveSample(v, [0, 1, -5.5], [-1, 0, 0])).toBeNull();
    expect(caveSample(v, [12.5, 8, -5.5], [0, 1, 0])).toBeNull();
  });
});

describe("relighting after an edit", () => {
  it("rock raised above the map's old highest ground on a cave's sun path shades its floor", () => {
    // ground 2 high, a low hill (6) with an overhang (two levels high) at its north-west corner open to the sun, and a plain
    // tile two tiles up the sun's way to raise
    const W = 24;
    const H = 24;
    const hill = (x: number, y: number) => x >= 10 && x < 16 && y >= 8 && y < 12;
    let src = terrain(W, H, (x, y, z) => z < 2 || (hill(x, y) && z < 6 && !(x === 10 && y === 11 && z < 4)));
    const sky = () => skyVisibility(W, H, src.heights);
    const v = CaveLight.build(src, sky())!;
    const floor = () => caveSample(v, [10.5, 2, -11.5], [0, 1, 0])!;
    expect(v.highest).toBe(6);
    expect(floor()[1], "the mouth's floor in sun").toBeGreaterThan(0.5);
    const heights = src.heights.slice();
    heights[13 * W + 8] = 20;
    src = { ...src, heights };
    v.relight(src, sky(), { x0: 8, y0: 13, x1: 8, y1: 13 });
    expect(v.highest).toBe(20);
    expect(floor()[1], "in the new rock's shadow").toBeLessThan(0.5);
  });

  it("redoes only the box round the change, with the same bytes as building the volume again", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 2 ** 32);
    const W = 64;
    const H = 48;
    // random caves under rolling ground
    const ground = new Uint8Array(W * H).map(() => 6 + Math.floor(rnd() * 8));
    const holes = Array.from({ length: 14 }, () => ({ x: rnd() * W, y: rnd() * H, z: 2 + rnd() * 6, r: 1.5 + rnd() * 3 }));
    const solid = (x: number, y: number, z: number, g: Uint8Array) => z < g[y * W + x] && (z < 1 || !holes.some((h) => (x - h.x) ** 2 + (y - h.y) ** 2 + (z - h.z) ** 2 * 3 < h.r * h.r));
    let src = terrain(W, H, (x, y, z) => solid(x, y, z, ground));
    expect(src.columns.size).toBeGreaterThan(50);
    const v = CaveLight.build(src, skyVisibility(W, H, src.heights))!;
    for (let k = 0; k < 60; k++) {
      // a dab on plain tiles (the brushes leave the columns alone): raise or lower a small square
      const x0 = Math.floor(rnd() * (W - 4));
      const y0 = Math.floor(rnd() * (H - 4));
      const r = 1 + Math.floor(rnd() * 3);
      const heights = src.heights.slice();
      const rect = { x0, y0, x1: x0 + r, y1: y0 + r };
      for (let y = y0; y <= rect.y1; y++)
        for (let x = x0; x <= rect.x1; x++) {
          const i = y * W + x;
          if (src.columns.has(i)) continue;
          heights[i] = Math.max(1, Math.min(LAYERS - 1, heights[i] + (rnd() < 0.5 ? -3 : 4)));
        }
      src = { ...src, heights };
      const sky = skyVisibility(W, H, heights);
      const box = v.relight(src, sky, rect);
      expect(box.x1 - box.x0).toBeLessThan(W);
      const full = CaveLight.build(src, sky)!;
      expect(Buffer.from(v.data).equals(Buffer.from(full.data)), `edit ${k}`).toBe(true);
    }
  });
});
