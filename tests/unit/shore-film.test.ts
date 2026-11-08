// A still film drawn back from the shore as the game's water vertex shader draws it (Q9 V3, shoreFilm.ts): a shore
// vertex of a still film moves toward its tile's middle, 0.15 tile across an open side and along its diagonal with
// both sides open, × saturate(2 − 20 d) × max(0, 1 − 100 |f|); the mesh carries each corner's shift × the depth's share,
// the vertex shader the flow's share, and the terrain draws the ground it leaves as dry ground on the same outline.

import { describe, expect, it } from "vitest";
import type { SurfaceWater } from "../../src/render3d/model";
import { meshWaterChunk } from "../../src/render3d/waterMesh";
import { plainLayers } from "../../src/render3d/waterLayers";
import { byteDepth, cornerShift, filmDepthShare, filmFlowShare, SHORE_FILM, SHORE_FILM_TERRAIN_GLSL, SHORE_FILM_VERTEX_GLSL } from "../../src/render3d/shoreFilm";
import { terrainMaterial, waterMaterial, sceneUniforms } from "../../src/render3d/materials";
import { terrainHooks, waterHooks } from "../../src/render3d/high/shaders";
import { DataTexture } from "three";

const tex = () => new DataTexture(new Uint8Array(4), 1, 1);

/** A W × H map of ground at level 2, with water `depth` deep on the tiles `wet` gives. */
function pond(W: number, H: number, wet: (x: number, y: number) => number) {
  const N = W * H;
  const heights = new Uint8Array(N).fill(2);
  const sw: SurfaceWater = { surface: new Float32Array(N).fill(NaN), floor: new Float32Array(N).fill(NaN), depth: new Float32Array(N), contamination: new Float32Array(N), top: new Int32Array(N).fill(-1), outflow: null, lower: [] };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d = wet(x, y);
      if (!(d > 0)) continue;
      const i = y * W + x;
      sw.floor[i] = 2;
      sw.depth[i] = d;
      sw.surface[i] = 2 + d;
      sw.top[i] = i;
    }
  return { heights, sw, mesh: meshWaterChunk(W, H, plainLayers(heights, sw), 0, 0) };
}

/** The tops' corners with their shifts: [x, y (map), shift x, shift y]. */
function topCorners(m: ReturnType<typeof pond>["mesh"]): number[][] {
  const out: number[][] = [];
  for (let q = 0; q < m.quads; q++) {
    if (m.normals[q * 12 + 1] !== 127) continue;
    for (let v = 0; v < 4; v++) {
      const k = q * 4 + v;
      out.push([m.positions[k * 3], -m.positions[k * 3 + 2], m.shore[k * 2], m.shore[k * 2 + 1]]);
    }
  }
  return out;
}

describe("a still film drawn back from the shore (Q9 V3)", () => {
  it("is the game's term: 0.15 across an open side, twice that along the diagonal, none between linked sides", () => {
    expect(SHORE_FILM.shift).toBe(0.15);
    expect(cornerShift(1, 1, true, false)).toEqual([-0.15, 0]);
    expect(cornerShift(-1, 1, false, true)).toEqual([0, -0.15]);
    const [dx, dy] = cornerShift(1, -1, true, true);
    expect(Math.hypot(dx, dy)).toBeCloseTo(0.3, 6);
    expect([Math.sign(dx), Math.sign(dy)]).toEqual([-1, 1]);
    expect(cornerShift(1, 1, false, false)).toEqual([0, 0]);
    // whole to 0.05 deep and gone from 0.1, as the terrain's water byte reads the depth (a sixtieth, rounded up)
    expect(filmDepthShare(0.04)).toBe(1);
    expect(filmDepthShare(0.05)).toBe(1);
    expect(filmDepthShare(0.07)).toBeCloseTo(2 - 20 * byteDepth(0.07), 6);
    expect(filmDepthShare(0.1)).toBe(0);
    expect(filmDepthShare(0.3)).toBe(0);
    // whole in still water, gone from a flow of 0.01 (an outflow of 0.14)
    expect(filmFlowShare(0)).toBe(1);
    expect(filmFlowShare(0.005)).toBeCloseTo(0.5, 6);
    expect(filmFlowShare(0.01)).toBe(0);
    expect(filmFlowShare(-0.2)).toBe(0);
  });

  it("the mesh moves a lone film's corners toward its middle, along their diagonals", () => {
    const { mesh } = pond(5, 5, (x, y) => (x === 2 && y === 2 ? 0.04 : 0));
    const c = topCorners(mesh);
    expect(c).toHaveLength(4);
    const d = SHORE_FILM.shift * Math.SQRT2;
    for (const [x, y, sx, sy] of c) {
      expect(sx).toBeCloseTo(x === 2 ? d : -d, 6);
      expect(sy).toBeCloseTo(y === 2 ? d : -d, 6);
    }
  });

  it("a film's straight shore draws back across it, its corners on linked sides staying, and a deep pool not at all", () => {
    // a strip of film three tiles wide along y = 1..3, dry above and below, the map's edge at its ends
    const { mesh } = pond(3, 5, (_x, y) => (y >= 1 && y <= 3 ? 0.03 : 0));
    for (const [x, y, sx, sy] of topCorners(mesh)) {
      // (the map's edge counts as linked: no shift along x)
      expect(sx, `${x},${y}`).toBe(0);
      if (y === 1) expect(sy).toBeCloseTo(0.15, 6);
      else if (y === 4) expect(sy).toBeCloseTo(-0.15, 6);
      else expect(sy).toBe(0);
    }
    const deep = pond(5, 5, (x, y) => (x === 2 && y === 2 ? 0.4 : 0)).mesh;
    expect(Array.from(deep.shore).every((v) => v === 0)).toBe(true);
  });

  it("the curtains hanging from a film's edges move with its corners", () => {
    // a film 0.08 deep on a ledge: its dry neighbour to the east lower, a curtain down to its floor there
    const N = 15;
    const heights = new Uint8Array(N).fill(2);
    heights[3 + 5 * 1] = 1;
    const { sw } = pond(5, 3, (x, y) => (x === 2 && y === 1 ? 0.08 : 0));
    const mesh = meshWaterChunk(5, 3, plainLayers(heights.map((h, i) => (i === 8 ? 1 : h)), sw), 0, 0);
    const share = filmDepthShare(0.08);
    expect(share).toBeGreaterThan(0);
    let sides = 0;
    for (let q = 0; q < mesh.quads; q++) {
      if (mesh.normals[q * 12] !== 127) continue;
      sides++;
      for (let v = 0; v < 4; v++) {
        const k = q * 4 + v;
        const y = -mesh.positions[k * 3 + 2];
        expect(mesh.shore[k * 2]).toBeCloseTo(-SHORE_FILM.shift * Math.SQRT2 * share, 6);
        expect(mesh.shore[k * 2 + 1]).toBeCloseTo((y === 1 ? 1 : -1) * SHORE_FILM.shift * Math.SQRT2 * share, 6);
      }
    }
    expect(sides).toBe(1);
  });

  it("both looks' water moves its vertices by the flow's share, and both looks' terrain draws the same outline dry", () => {
    expect(SHORE_FILM_VERTEX_GLSL).toContain(`1.0 - ${SHORE_FILM.flow.toFixed(1)} * length`);
    expect(SHORE_FILM_TERRAIN_GLSL).toContain(SHORE_FILM.shift.toFixed(2));
    const u = sceneUniforms(1, 1, tex(), tex(), tex(), tex());
    for (const m of [waterMaterial(u), waterMaterial(u, false, waterHooks()), waterMaterial(u, true)]) {
      expect(m.vertexShader).toContain("attribute vec2 wshore;");
      expect(m.vertexShader).toMatch(/w\.x \+= shift\.x;\s*w\.z -= shift\.y;/);
    }
    for (const m of [terrainMaterial(u, 0, 4), terrainMaterial(u, 0, 4, false, terrainHooks()), terrainMaterial(u, 0, 4, true)]) {
      expect(m.fragmentShader).toContain("soil.w *= shoreFilmOwn(tile, d0, fr, filmPx);");
    }
    expect(terrainMaterial(u, 0, 4, false, terrainHooks()).fragmentShader).toContain("texture2D(hlFlow, P / hlFlowSize).rg");
  });
});
