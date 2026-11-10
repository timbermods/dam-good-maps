// A still film drawn back from the shore as the game's water vertex shader draws it (Q9 V3, shoreFilm.ts): a shore
// vertex of a still film moves toward its tile's middle, 0.15 tile across an open side and along its diagonal with
// both sides open, × saturate(2 − 20 d) × max(0, 1 − 100 |f|); the mesh carries each corner's shift × the depth's share,
// the vertex shader the flow's share, and the terrain draws the ground it leaves as dry ground on the same outline.

import { describe, expect, it } from "vitest";
import type { SurfaceWater } from "../../src/render3d/model";
import { meshWaterChunk } from "../../src/render3d/waterMesh";
import { plainLayers } from "../../src/render3d/waterLayers";
import { byteDepth, cornerShift, filmDepthShare, filmFlowShare, filmInside, SHORE_FILM, SHORE_FILM_TERRAIN_GLSL, SHORE_FILM_VERTEX_GLSL } from "../../src/render3d/shoreFilm";
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

  it("the terrain dries only the margin a film draws back from: never along a linked side, centred on the outline, none where it flows", () => {
    // a film open to the south only (sides east, west, north, south), still, 0.03 deep: its water goes on into its
    // neighbours west, east and north, so no strip along those edges is dry, close up or from the opening camera
    const open = [0, 0, 0, 1];
    const still = [1, 1, 1, 1];
    for (const px of [0.01, 0.17])
      for (const fr of [[0.002, 0.6], [0.05, 0.6], [0.998, 0.6], [0.5, 0.998], [0.5, 0.5]] as const) expect(filmInside(0.03, open, still, fr, px), `${fr} at ${px}`).toBe(1);
    // the open side: dry 0.15 in, half at the outline, wet past it
    expect(filmInside(0.03, open, still, [0.5, 0.1], 0.01)).toBe(0);
    expect(filmInside(0.03, open, still, [0.5, SHORE_FILM.shift], 0.01)).toBeCloseTo(0.5, 6);
    expect(filmInside(0.03, open, still, [0.5, 0.2], 0.01)).toBe(1);
    // (a lone film's corner along its diagonal; its sides' middles 0.15 in, as the mesh's quad between its corners)
    const lone = [1, 1, 1, 1];
    expect(filmInside(0.03, lone, still, [0.15, 0.15], 0.01)).toBe(0);
    expect(filmInside(0.03, lone, still, [0.5, 0.5], 0.01)).toBe(1);
    // flowing (the flow's share 0 at every corner) or deep: nothing drawn back, not even half a pixel at its edge
    expect(filmInside(0.03, lone, [0, 0, 0, 0], [0.5, 0.0], 0.01)).toBe(1);
    expect(filmInside(0.3, lone, still, [0.5, 0.0], 0.01)).toBe(1);
    // the GLSL the terrain draws is that twin: each edge of an open side only, where its corners move, centred
    for (const edge of ["open.w > 0.5 && flow.x + flow.y > 0.0 ? shoreFilmEdge(p0, p1, fr)", "open.x > 0.5 && flow.y + flow.z > 0.0 ? shoreFilmEdge(p1, p2, fr)", "open.z > 0.5 && flow.z + flow.w > 0.0 ? shoreFilmEdge(p2, p3, fr)", "open.y > 0.5 && flow.w + flow.x > 0.0 ? shoreFilmEdge(p3, p0, fr)"])
      expect(SHORE_FILM_TERRAIN_GLSL).toContain(edge);
    expect(SHORE_FILM_TERRAIN_GLSL).toContain("return smoothstep(-0.5 * px, 0.5 * px, min(min(dS, dE), min(dN, dW)));");
    // (a dry tile beside a film keeps its wet blend where the film's water flows: the flow's share at their corner)
    const u = sceneUniforms(1, 1, tex(), tex(), tex(), tex());
    expect(terrainMaterial(u, 0, 4).fragmentShader).toContain("soil.w = flags1.w * v10 * shoreFilmKeep(dx, fc) + flags2.w * v01 * shoreFilmKeep(dy, fc) + flags3.w * v11 * shoreFilmKeep(dd, fc);");
  });

  it("a film links to a neighbour whose water the open sky's layer leaves to a layer under a roof, as the terrain does", () => {
    // the film at (2, 1), its east neighbour wet on its top but drawn by another layer (under an overhang): the open
    // sky's layer has no water there, the terrain's water byte has
    const { heights, sw } = pond(5, 3, (x, y) => (y === 1 && (x === 2 || x === 3) ? 0.03 : 0));
    const first = { ...sw, surface: sw.surface.slice(), floor: sw.floor.slice(), depth: sw.depth.slice(), top: sw.top.slice() };
    first.surface[8] = NaN;
    first.floor[8] = NaN;
    first.depth[8] = 0;
    first.top[8] = -1;
    const mesh = meshWaterChunk(5, 3, [{ sw: first, ground: heights, own: null, chunks: null, wet: sw }], 0, 0);
    for (const [x, , sx] of topCorners(mesh)) if (x === 3) expect(sx).toBe(0);
    // (without it, the layer's own water, the east side reads open)
    const alone = meshWaterChunk(5, 3, [{ sw: first, ground: heights, own: null, chunks: null }], 0, 0);
    expect(topCorners(alone).some(([x, , sx]) => x === 3 && sx < 0)).toBe(true);
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
