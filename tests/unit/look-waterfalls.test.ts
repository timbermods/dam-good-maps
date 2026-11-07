// Waterfalls as the game draws them (PLAN §20 D201, amended 2026-10-29; D148: this file's tests of the arcing ribbon,
// its lip foam, crown, landing whitewater and template went with them). Timberborn 1.1.2.8 draws a fall as the water
// mesh's own vertical face where the water steps down (its FindWaterfalls compute pass marks the faces), with the
// same PhysicalWaterURP material as the surface: the water's own colour, its texture carried down the face by the
// flow map, the ground behind showing by `_TransparencyWaterfallDepth` 0.2 × `_TransparencyDepthModifier` 0.5, and
// no whitewater (its `_Waterfall*` properties are unused). So here: where water steps down to lower water, of any
// height, the mesh hangs a curtain from the surface down to it, carrying its drop, and follows every water update;
// both looks draw it in the water's colour at its shallowest, a tenth see-through, with no foam; a badwater fall
// keeps badwater's cues. Rendering only: the map's bytes are pinned by tests/contract/look-mine-ruins.test.ts.

import { describe, expect, it } from "vitest";
import { DataTexture } from "three";
import { sceneUniforms, waterMaterial } from "../../src/render3d/materials";
import { waterHooks } from "../../src/render3d/high/shaders";
import { surfaceWater, waterFromDepth, type SurfaceWater, type WaterView } from "../../src/render3d/model";
import { changedWaterChunks, dropFlags, EDGE_CURTAIN, FALL, meshWaterChunk, SHORE_BITS, type WaterMeshData } from "../../src/render3d/waterMesh";
import { plainLayers } from "../../src/render3d/waterLayers";
import { badwaterBody, cleanWaterBody, WATER_GLSL, WATER_SURFACE } from "../../src/render3d/waterPalette";

/** A map of heights (rows from y = 0) with water `depth` deep on every tile where `wet` says. */
function scene(rows: number[][], wet: (x: number, y: number) => number, bad: (x: number, y: number) => number = () => 0): { W: number; H: number; heights: Uint8Array; view: WaterView; sw: SurfaceWater } {
  const H = rows.length;
  const W = rows[0].length;
  const heights = new Uint8Array(W * H);
  const depth: number[] = [];
  const cont: number[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      heights[y * W + x] = rows[y][x];
      depth.push(wet(x, y));
      cont.push(bad(x, y));
    }
  const view = waterFromDepth(heights, depth, cont);
  return { W, H, heights, view, sw: surfaceWater(W, H, view) };
}

function meshAll(s: ReturnType<typeof scene>): WaterMeshData[] {
  const out: WaterMeshData[] = [];
  for (let cy = 0; cy * 32 < s.H; cy++) for (let cx = 0; cx * 32 < s.W; cx++) out.push(meshWaterChunk(s.W, s.H, plainLayers(s.heights, s.sw), cx, cy));
  return out;
}

interface Curtain {
  /** Its outward normal (x, z), its top and bottom, where it stands across and along, its flags and badwater share. */
  normal: [number, number];
  top: number;
  bottom: number;
  at: number;
  from: number;
  flags: number;
  bad: number;
}

/** Every curtain (a quad facing sideways) of a mesh. */
function curtains(meshes: WaterMeshData[]): Curtain[] {
  const out: Curtain[] = [];
  for (const m of meshes)
    for (let q = 0; q < m.quads; q++) {
      const v = q * 4;
      if (m.normals[v * 3 + 1] !== 0) continue;
      const nx = Math.sign(m.normals[v * 3]);
      const nz = Math.sign(m.normals[v * 3 + 2]);
      const ys = [0, 1, 2, 3].map((k) => m.positions[(v + k) * 3 + 1]);
      const across = [0, 1, 2, 3].map((k) => m.positions[(v + k) * 3 + (nx !== 0 ? 0 : 2)]);
      const along = [0, 1, 2, 3].map((k) => m.positions[(v + k) * 3 + (nx !== 0 ? 2 : 0)]);
      out.push({ normal: [nx, nz], top: Math.max(...ys), bottom: Math.min(...ys), at: across[0], from: Math.min(...along), flags: m.flags[v], bad: m.data[v * 2 + 1] });
    }
  return out;
}

describe("a fall is the water's own face where it steps down", () => {
  // west to east: a pool at 6 (0.5 deep) pours over its lip into a river at 3, three tiles wide,
  // between dry ground at 9 to the south and north
  const pool = (bad = 0) =>
    scene(
      [
        [9, 9, 9, 9, 9],
        [6, 6, 3, 3, 3],
        [6, 6, 3, 3, 3],
        [6, 6, 3, 3, 3],
        [9, 9, 9, 9, 9],
      ],
      (x, y) => (y >= 1 && y <= 3 ? 0.5 : 0),
      () => bad,
    );

  it("hangs from the lip's surface down to the water below, along the whole lip, in front of the cliff, carrying its drop", () => {
    const s = pool();
    const fall = curtains(meshAll(s)).filter((c) => c.normal[0] === 1 && c.top - c.bottom > 1);
    expect(fall.length).toBe(3);
    for (const c of fall) {
      expect(c.top).toBeCloseTo(6.5, 5);
      expect(c.bottom).toBeCloseTo(3.5, 5);
      // just off the cliff's face, so the face never fights the rock's
      expect(c.at).toBeGreaterThan(2);
      expect(c.at).toBeLessThan(2.05);
      expect(c.flags).toBe(dropFlags(6.5, 3.5, false));
      expect(c.flags).toBe(90);
    }
    expect(fall.map((c) => -c.from).sort()).toEqual([2, 3, 4]);
  });

  it("is drawn by the water's own mesh alone: no instances, no foam flags on the tops round it", () => {
    const shore = SHORE_BITS.reduce((a, b) => a | b, 0);
    for (const m of meshAll(pool())) {
      expect(Object.keys(m).sort()).toEqual(["cut", "data", "flags", "indices", "normals", "positions", "quads"]);
      for (let q = 0; q < m.quads; q++) if (m.normals[q * 12 + 1] > 0) expect(m.flags[q * 4] & ~shore).toBe(0);
    }
  });

  it("is a curtain at every step of a cascade, small steps between two waters too, each with its own drop", () => {
    // west to east: surfaces at 8.5, 6.5, 5.8 and 3.5, every tile wet
    const s = scene([[12, 12, 12, 12, 12], [8, 6, 5, 3, 3], [12, 12, 12, 12, 12]], (x, y) => (y !== 1 ? 0 : x === 2 ? 0.8 : 0.5));
    const east = curtains(meshAll(s)).filter((c) => c.normal[0] === 1 && c.flags !== EDGE_CURTAIN);
    const drops = east.map((c) => Math.round((c.top - c.bottom) * 100) / 100).sort((a, b) => a - b);
    expect(drops).toEqual([0.7, 2, 2.3]);
    for (const c of east) expect(c.flags).toBe(dropFlags(c.top, c.bottom, false));
  });

  it("keeps the water's side at the map's edge apart from a fall", () => {
    const edge = curtains(meshAll(scene([[5, 5, 5], [5, 5, 5], [5, 5, 5]], () => 0.5)));
    expect(edge.length).toBeGreaterThan(0);
    for (const c of edge) expect(c.flags).toBe(EDGE_CURTAIN);
  });

  it("takes the badwater share of the edge it hangs from", () => {
    for (const c of curtains(meshAll(pool(1))).filter((c) => c.top - c.bottom > 1)) expect(c.bad).toBeCloseTo(1, 5);
    for (const c of curtains(meshAll(pool(0))).filter((c) => c.top - c.bottom > 1)) expect(c.bad).toBe(0);
  });

  it("follows the water: remeshing the changed chunks draws the same faces as meshing everything", () => {
    // a lip 40 tiles wide across the border of two chunks (x = 32), pouring north (+y); the lip's
    // water sinks on the tile two east of the border (x = 33)
    const W = 64;
    const H = 6;
    const rows = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (y === 0 || y === 5 || x < 12 || x >= 52 ? 20 : y <= 2 ? 8 : 4)));
    const a = scene(rows, (x, y) => (y >= 1 && y <= 4 && x >= 12 && x < 52 ? 0.3 : 0));
    const b = scene(rows, (x, y) => (y >= 1 && y <= 4 && x >= 12 && x < 52 ? (x === 33 && y === 2 ? 0.1 : 0.3) : 0));
    const changed = changedWaterChunks(W, H, a.sw, b.sw, 0, 0);
    expect([...changed].sort()).toEqual(["0,0", "1,0"]);
    const key = (c: Curtain) => JSON.stringify(c);
    const fresh = curtains(meshAll(b)).map(key).sort();
    const kept = meshAll(a).map((m, cx) => (changed.has(`${cx},0`) ? meshWaterChunk(W, H, plainLayers(b.heights, b.sw), cx, 0) : m));
    expect(curtains(kept).map(key).sort()).toEqual(fresh);
    const lip = (s: ReturnType<typeof scene>) => curtains(meshAll(s)).filter((c) => c.normal[1] === -1 && c.top - c.bottom > 3).length;
    expect(lip(a)).toBe(40);
    // a lip gone dry leaves no fall behind
    expect(lip(scene(rows, (x, y) => (y >= 1 && y <= 4 && x >= 12 && x < 52 && !(x === 20 && y === 2) ? 0.3 : 0)))).toBe(39);
  });
});

describe("a fall's look, as the game's", () => {
  const t = () => new DataTexture(new Uint8Array(4), 1, 1);
  const shaders = () => [
    { look: "Standard", m: waterMaterial(sceneUniforms(1, 1, t(), t(), t(), t()), false) },
    { look: "Light", m: waterMaterial(sceneUniforms(1, 1, t(), t(), t(), t()), true) },
    { look: "High", m: waterMaterial(sceneUniforms(1, 1, t(), t(), t(), t()), false, waterHooks()) },
  ];

  it("shows the ground behind by the game's waterfall share, a tenth, from the shared palette", () => {
    // _TransparencyWaterfallDepth 0.2 × _TransparencyDepthModifier 0.5
    expect(WATER_SURFACE.fallSeeThrough).toBe(0.1);
    expect(WATER_GLSL).toContain(`#define WATER_FALL_SEE_THROUGH ${WATER_SURFACE.fallSeeThrough}`);
    for (const { look, m } of shaders()) {
      expect(m.fragmentShader, look).toContain("(1.0 - WATER_FALL_SEE_THROUGH)");
      // a step of FALL or more is a fall; a smaller one between two waters is the surface going on
      // (one threshold on the flags, the drop in thirtieths, in the fragment and the vertex shader alike)
      expect(m.fragmentShader, look).toContain(`#define WATER_FALL_FLAGS ${FALL * 30 - 0.5}`);
      expect(m.fragmentShader, look).toContain("vFlags < WATER_FALL_FLAGS");
      expect(m.vertexShader, look).toContain(`wflags > ${FALL * 30 - 0.5}`);
    }
  });

  it("carries its detail by the current over its lip, in two phases, as the game carries its albedo by the flow", () => {
    const [standard, light, high] = shaders();
    expect(standard.m.fragmentShader).toContain("vec2 faceDrift = waterCurrent(g - vec2(n.x, -n.z) * 0.5) * 0.65;");
    expect(standard.m.fragmentShader).not.toContain("vWorld.y * 1.3 + t * 2.4");
    // (the light look's water is still)
    expect(light.m.fragmentShader).toContain("float s = 0.5;");
    expect(high.m.fragmentShader).toContain("texture2D(hlFlow, (g - vec2(n.x, -n.z) * 0.5) / hlFlowSize)");
    expect(high.m.fragmentShader).not.toContain("vWorld.y * 1.4 + hlT * 3.6");
  });

  it("is lit as the surface is, by URP's sky reflection and sun glint, but takes none of the game's own highlight (its waterfall mask)", () => {
    const [standard, , high] = shaders();
    for (const line of ["float fres = waterSkyReflect(dot(N, V), smoothness);", "float spec = waterSunGlint(N, V, sunDir, smoothness) * lit;", "vec3 highlight = sunColor * waterCameraHighlight(N, V, bad) * step(0.5, N.y);"]) expect(standard.m.fragmentShader).toContain(line);
    expect(high.m.fragmentShader).toContain("c = face * (skyColor * 1.05 + sunColor * 0.42 * max(dot(n, sunDir), 0.0) * lit);");
  });

  it("is the water's own colour where it sees the cliff right behind (its shallowest), with no whitewater or foam", () => {
    const [standard, light, high] = shaders();
    for (const { m } of [standard, light]) {
      expect(m.fragmentShader).toContain("body = cleanWaterBody(0.05, waterAbsorb(0.05));");
    }
    // (High's surface colour at its shallowest)
    expect(high.m.fragmentShader).toContain("waterBlend(HW_SHALLOW * (0.92 + 0.16 * strands), badwaterGlow(HW_BAD * badwaterLight(0.05), HW_BAD, 0.05, hlBad), hlBad)");
    // (partly bad, the game's glow of its shallowest, as the surface's)
    for (const { m } of [standard, light]) expect(m.fragmentShader).toContain("murky = badwaterGlow(badwaterBody(0.05), BADWATER_BODY, 0.05, cont);");
    for (const { look, m } of shaders()) for (const gone of ["FALL_FOAM", "FALL_WHITEWATER", "FALL_TEAL", "fallIn", "hlCrown", "hlLanding", "hlBubbles", "lip = min("]) expect(m.fragmentShader, `${look}: ${gone}`).not.toContain(gone);
  });

  it("tells a badwater fall from a clean one by the game's cues: teal against crimson", () => {
    const clean = cleanWaterBody(0.05);
    const bad = badwaterBody(0.05);
    expect(Math.min(clean[1], clean[2])).toBeGreaterThan(clean[0]);
    expect(bad[0] > bad[1] && bad[1] > bad[2]).toBe(true);
  });
});
