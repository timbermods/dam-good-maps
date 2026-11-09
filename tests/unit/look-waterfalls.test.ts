// Waterfalls as the game draws them (PLAN §20 D201, amended 2026-10-29; D154 as amended 2026-11-08; D148: this file's
// tests of the arcing ribbon, its lip foam, crown, landing whitewater and template went with them, and its tests of the
// vertical curtain went with D154's amendment). Timberborn 1.1.2.8 draws a fall as the lower tile's own surface
// (decompiled WaterMesh's grid of sixteen vertices a tile, its compute shader's CalculateHeights; fallSlope.ts): the
// tile below the step rises to meet the water above it, its edge at the upper surface, its vertices a third in 0.3
// lower, from two thirds in its own surface; lit with the up normal, its flow textures sampled at the world's xz, so
// they stretch down the slope and pour; the same PhysicalWaterURP material as the surface and no whitewater (its
// `_Waterfall*` properties are unused); FindBestProperties hands the slope the fall's badwater share and outflow. So
// here: no curtain between two waters, a slope on the water below every step, following every water update, and a
// curtain only toward lower dry ground and at the map's edge, drawn as the water's side. Rendering only: the map's
// bytes are pinned by tests/contract/look-mine-ruins.test.ts.

import { describe, expect, it } from "vitest";
import { DataTexture } from "three";
import { sceneUniforms, waterMaterial } from "../../src/render3d/materials";
import { waterHooks } from "../../src/render3d/high/shaders";
import { surfaceWater, waterFromDepth, type SurfaceWater, type WaterView } from "../../src/render3d/model";
import { changedWaterChunks, EDGE_CURTAIN, FALL, meshWaterChunk, SHORE_BITS, type WaterMeshData } from "../../src/render3d/waterMesh";
import { gameFlowOf } from "../../src/render3d/current";
import { handedWater, SLOPE_DROP } from "../../src/render3d/fallSlope";
import { plainLayers } from "../../src/render3d/waterLayers";
import { badwaterBody, cleanWaterBody, GAME_BADWATER, WATER_GLSL, WATER_SURFACE } from "../../src/render3d/waterPalette";

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

interface Vertex {
  x: number;
  y: number;
  /** Map y (south is +). */
  z: number;
  depth: number;
  bad: number;
}

/** Every top vertex (a quad facing up) of a mesh. */
function topVertices(meshes: WaterMeshData[]): Vertex[] {
  const out: Vertex[] = [];
  for (const m of meshes)
    for (let q = 0; q < m.quads; q++) {
      if (m.normals[q * 12 + 1] <= 0) continue;
      for (let v = q * 4; v < q * 4 + 4; v++) out.push({ x: m.positions[v * 3], y: m.positions[v * 3 + 1], z: -m.positions[v * 3 + 2], depth: m.data[v * 2], bad: m.data[v * 2 + 1] });
    }
  return out;
}

/** The highest top vertex at each x (in thirds) on the line at map y `z`. */
function profile(meshes: WaterMeshData[], z: number): (x: number) => number | undefined {
  const out = new Map<number, number>();
  for (const v of topVertices(meshes)) {
    if (Math.abs(v.z - z) > 1e-4) continue;
    const k = Math.round(v.x * 3);
    out.set(k, Math.max(out.get(k) ?? -Infinity, v.y));
  }
  return (x) => out.get(Math.round(x * 3));
}

describe("a fall is the lower tile's slope, as the game's CalculateHeights", () => {
  // west to east: a pool at 6 (0.5 deep) pours over its lip into a river at 3, three tiles wide,
  // between dry ground at 9 to the south and north
  const pool = (bad: (x: number) => number = () => 0) =>
    scene(
      [
        [9, 9, 9, 9, 9],
        [6, 6, 3, 3, 3],
        [6, 6, 3, 3, 3],
        [6, 6, 3, 3, 3],
        [9, 9, 9, 9, 9],
      ],
      (x, y) => (y >= 1 && y <= 3 ? 0.5 : 0),
      (x) => bad(x),
    );

  it("rises from the water below to the lip: its edge at the upper surface, a third in 0.3 lower, from two thirds in its own surface", () => {
    const meshes = meshAll(pool());
    for (const row of [1, 2, 3])
      for (const z of [row, row + 1 / 3, row + 2 / 3]) {
        const p = profile(meshes, z);
        // (the pool flat at 6.5 right to the lip, x = 2; the river's tile x = 2 rising to it; a flat tile has its
        // vertices at its corners only)
        if (z === row) expect(p(0), `row ${z}`).toBeCloseTo(6.5, 5);
        expect(p(2), `row ${z}`).toBeCloseTo(6.5, 5);
        expect(p(2 + 1 / 3), `row ${z}`).toBeCloseTo(6.5 - SLOPE_DROP, 5);
        expect(p(2 + 2 / 3), `row ${z}`).toBeCloseTo(3.5, 5);
        expect(p(3), `row ${z}`).toBeCloseTo(3.5, 5);
        if (z === row) expect(p(5), `row ${z}`).toBeCloseTo(3.5, 5);
      }
    // no vertex of the water stands under its own surface
    for (const v of topVertices(meshes)) expect(v.y).toBeGreaterThanOrEqual(v.x < 2 ? 6.5 - 1e-5 : 3.5 - 1e-5);
  });

  it("hangs no face from the lip: water meets water by the slope, a curtain only toward lower dry ground and the map's edge", () => {
    const s = pool();
    expect(curtains(meshAll(s)).filter((c) => c.flags !== EDGE_CURTAIN && c.normal[0] !== 0)).toEqual([]);
    expect(curtains(meshAll(s)).filter((c) => c.normal[0] === -1).every((c) => c.flags === EDGE_CURTAIN)).toBe(true);
  });

  it("is lit as any water's top, by the up normal, and is drawn by the water's own mesh alone, with no foam flags", () => {
    const shore = SHORE_BITS.reduce((a, b) => a | b, 0);
    let sloping = 0;
    for (const m of meshAll(pool())) {
      // (and a still film's shift back from the shore, Q9 V3: shoreFilm.ts)
      expect(Object.keys(m).sort()).toEqual(["cut", "data", "flags", "indices", "normals", "positions", "quads", "shore"]);
      for (let q = 0; q < m.quads; q++) {
        if (m.normals[q * 12 + 1] <= 0) continue;
        expect(m.flags[q * 4] & ~shore).toBe(0);
        const ys = [0, 1, 2, 3].map((k) => m.positions[(q * 4 + k) * 3 + 1]);
        if (Math.max(...ys) - Math.min(...ys) < 0.1) continue;
        sloping++;
        for (let k = 0; k < 4; k++) expect([0, 1, 2].map((a) => m.normals[(q * 4 + k) * 3 + a])).toEqual([0, 127, 0]);
      }
    }
    // (three tiles below the lip, each with two columns of three quads sloping)
    expect(sloping).toBe(3 * 6);
  });

  it("splits its quads along the game's diagonal, from (i + 1, j) to (i, j + 1) in thirds", () => {
    let seen = 0;
    for (const m of meshAll(pool()))
      for (let q = 0; q < m.quads; q++) {
        if (m.normals[q * 12 + 1] <= 0) continue;
        const ys = [0, 1, 2, 3].map((k) => m.positions[(q * 4 + k) * 3 + 1]);
        if (ys.every((y) => y === ys[0])) continue;
        seen++;
        // (the triangles share the quad's first and third vertices, a third east and a third north of each other)
        const p = (k: number) => [m.positions[(q * 4 + k) * 3], -m.positions[(q * 4 + k) * 3 + 2]];
        expect(p(0)[0] - p(2)[0]).toBeCloseTo(1 / 3, 5);
        expect(p(2)[1] - p(0)[1]).toBeCloseTo(1 / 3, 5);
        expect([...m.indices.slice(q * 6, q * 6 + 6)]).toEqual([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3]);
      }
    expect(seen).toBeGreaterThan(0);
  });

  it("is a slope at every step of a cascade, small steps between two waters too", () => {
    // west to east: surfaces at 8.5, 6.5, 5.8 and 3.5, every tile wet
    const s = scene([[12, 12, 12, 12, 12], [8, 6, 5, 3, 3], [12, 12, 12, 12, 12]], (x, y) => (y !== 1 ? 0 : x === 2 ? 0.8 : 0.5));
    expect(curtains(meshAll(s)).filter((c) => c.normal[0] !== 0 && c.flags !== EDGE_CURTAIN)).toEqual([]);
    // (along the middle of the river: each lower tile's edge at the surface above it, a third in 0.3 lower or its own,
    // two thirds in its own)
    const at = profile(meshAll(s), 1 + 1 / 3);
    const want: [number, number][] = [
      [1, 8.5],
      [1 + 1 / 3, 8.2],
      [1 + 2 / 3, 6.5],
      [2, 6.5],
      [2 + 1 / 3, 6.2],
      [2 + 2 / 3, 5.8],
      [3, 5.8],
      [3 + 1 / 3, 5.5],
      [3 + 2 / 3, 3.5],
    ];
    for (const [x, y] of want) expect(at(x), `x ${x}`).toBeCloseTo(y, 5);
  });

  it("takes the depth seen there: the upper pool's at the lip, the cliff's a third in, its own from two thirds in", () => {
    const v = topVertices(meshAll(pool())).filter((t) => Math.abs(t.z - 2 - 1 / 3) < 1e-4);
    const at = (x: number) => v.filter((t) => Math.abs(t.x - x) < 1e-4 && t.y < 6.5 - 1e-3 + (x === 2 ? 1 : 0) && t.y > 3.6).map((t) => t.depth);
    // (from the game's pitch, 60°, toward the step: at the lip the view goes on into the pool, 0.5 deep; a third in it
    // meets the cliff a third × tan 60° down; from two thirds in the river's own depth)
    expect(at(2).length).toBeGreaterThan(0);
    for (const d of at(2)) expect(d).toBeCloseTo(0.5, 5);
    expect(at(2 + 1 / 3).length).toBeGreaterThan(0);
    for (const d of at(2 + 1 / 3)) expect(d).toBeCloseTo(Math.tan(Math.PI / 3) / 3, 5);
    for (const t of v) if (Math.abs(t.x - 2 - 2 / 3) < 1e-4) expect(t.depth).toBeCloseTo(0.5, 5);
  });

  it("keeps the water's side at the map's edge apart from a fall", () => {
    const edge = curtains(meshAll(scene([[5, 5, 5], [5, 5, 5], [5, 5, 5]], () => 0.5)));
    expect(edge.length).toBeGreaterThan(0);
    for (const c of edge) expect(c.flags).toBe(EDGE_CURTAIN);
  });

  it("closes the slope's side toward lower dry ground, its top along the slope", () => {
    // a pool at 6 pours east into a river at 3 one tile wide (y = 1), dry ground at 2 south of it (y = 2)
    const s = scene(
      [
        [9, 9, 9, 9],
        [6, 3, 3, 3],
        [9, 2, 2, 2],
      ],
      (x, y) => (y === 1 ? 0.5 : 0),
    );
    // (the river's first tile's south side: three pieces, under the lip, a third in and two thirds in)
    const south = curtains(meshAll(s)).filter((c) => c.normal[1] === -1 && c.flags !== EDGE_CURTAIN && c.from > 1 - 1e-6 && c.from < 2 - 1e-6);
    expect(south.map((c) => Math.round(c.top * 100) / 100).sort()).toEqual([3.5, 6.2, 6.5]);
    for (const c of south) expect(c.bottom).toBeCloseTo(3, 5);
  });

  it("takes the fall's badwater share, handed over to the water below as the game's FindBestProperties does", () => {
    // a badwater pool (x < 2) falling into clean water
    const s = pool((x) => (x < 2 ? 1 : 0));
    const handed = handedWater(s.W, s.H, s.sw);
    for (const y of [1, 2, 3]) {
      expect(handed.contamination[y * s.W + 2], "the slope's tile: the fall's share (a rise of 1 or more: all of it)").toBe(1);
      expect(handed.contamination[y * s.W + 3], "a tile on from it: its own").toBe(0);
    }
    const v = topVertices(meshAll(s));
    for (const t of v) if (t.x < 2 - 1e-6) expect(t.bad).toBeCloseTo(1, 5);
    for (const t of v) if (t.x > 2 - 1e-6 && t.x < 2 + 1 / 3 + 1e-6 && t.y > 3.6) expect(t.bad).toBeGreaterThan(0.3);
    for (const t of topVertices(meshAll(pool()))) expect(t.bad).toBe(0);
  });

  it("runs with the fall's current: the slope takes the fall's outflow, as the game hands it on", () => {
    // a pool (x 0, 1) at 6.5 pouring east into a still river (x 2, 3) at 3.5
    const s = scene([[6, 6, 3, 3]], () => 0.5);
    const out = new Float32Array(4 * 4);
    out[1 * 4 + 3] = 7; // the lip's outflow east
    const plain = gameFlowOf(4, 1, out, s.sw.depth, 14);
    const falls = gameFlowOf(4, 1, out, s.sw.depth, 14, s.sw);
    // (the river's first tile takes the lip's 0.5 east before the vertex averaging; the pool's far tile, which averages
    // only the pool's, as it was)
    expect(falls[2 * 2]).toBeGreaterThan(plain[2 * 2] + 0.1);
    expect(falls[0]).toBeCloseTo(plain[0], 6);
  });

  it("follows the water: remeshing the changed chunks draws the same slopes as meshing everything", () => {
    // a lip 40 tiles wide across the border of two chunks (x = 32), pouring north (+y); the lip's
    // water sinks on the tile two east of the border (x = 33)
    const W = 64;
    const H = 6;
    const rows = Array.from({ length: H }, (_, y) => Array.from({ length: W }, (_, x) => (y === 0 || y === 5 || x < 12 || x >= 52 ? 20 : y <= 2 ? 8 : 4)));
    const a = scene(rows, (x, y) => (y >= 1 && y <= 4 && x >= 12 && x < 52 ? 0.3 : 0));
    const b = scene(rows, (x, y) => (y >= 1 && y <= 4 && x >= 12 && x < 52 ? (x === 33 && y === 2 ? 0.1 : 0.3) : 0));
    const changed = changedWaterChunks(W, H, a.sw, b.sw, 0, 0);
    expect([...changed].sort()).toEqual(["0,0", "1,0"]);
    const key = (v: Vertex) => JSON.stringify(v);
    const fresh = topVertices(meshAll(b)).map(key).sort();
    const kept = meshAll(a).map((m, cx) => (changed.has(`${cx},0`) ? meshWaterChunk(W, H, plainLayers(b.heights, b.sw), cx, 0) : m));
    expect(topVertices(kept).map(key).sort()).toEqual(fresh);
    // (the lip's slope: the tiles below it, y = 3, rising to the pool's 8.3 at their edge, y = 3, the middle of each
    // tile's edge counted, as its corners are its neighbours' too)
    const lip = (s: ReturnType<typeof scene>) => new Set(topVertices(meshAll(s)).filter((v) => Math.abs(v.z - 3) < 1e-4 && v.y > 8 && Math.abs(v.x - Math.round(v.x)) > 0.2).map((v) => Math.floor(v.x))).size;
    expect(lip(a)).toBe(40);
    // a lip gone dry leaves no slope below it there
    expect(lip(scene(rows, (x, y) => (y >= 1 && y <= 4 && x >= 12 && x < 52 && !(x === 20 && y === 2) ? 0.3 : 0)))).toBe(39);
  });
});

describe("the water's side (a skirt between two tops, a fall's slope's side over lower dry ground; the section at the map's edge)", () => {
  const t = () => new DataTexture(new Uint8Array(4), 1, 1);
  const shaders = () => [
    { look: "Standard", m: waterMaterial(sceneUniforms(1, 1, t(), t(), t(), t()), false) },
    { look: "Light", m: waterMaterial(sceneUniforms(1, 1, t(), t(), t(), t()), true) },
    { look: "High", m: waterMaterial(sceneUniforms(1, 1, t(), t(), t(), t()), false, waterHooks()) },
  ];

  it("is the surface going on, seen through by the depth seen behind it, as the game's skirt (its top's mesh, the same program)", () => {
    // _TransparencyWaterfallDepth 0.2 × _TransparencyDepthModifier 0.5 where a fall lands, by the depth, as the top's
    // (water-refraction.test.ts); D148: until 2026-11-09 a fall's side was 0.9 opaque in its shallowest colour
    expect(WATER_SURFACE.fallSeeThrough).toBe(0.1);
    expect(WATER_GLSL).not.toContain("WATER_FALL_SEE_THROUGH");
    for (const { look, m } of shaders()) {
      expect(m.fragmentShader, look).toContain("float d = n.y < 0.5 && vFlags > 254.5 ? depth : waterViewDepth(n.y > 0.5 ? g : g - vec2(n.x, -n.z) * 0.002, vWorld.y, vFloor);");
      expect(m.fragmentShader, look).toContain("alpha = mix(alpha, badwaterAlpha(depth, d), bad);");
      expect(m.fragmentShader, look).toContain("alpha = edge ? mix(WATER_EDGE, BADWATER_SIDE, bad) : alpha * smoothstep(0.02, 0.06, drop);");
      expect(m.fragmentShader, look).not.toContain("WATER_FALL_SEE_THROUGH");
      expect(m.fragmentShader, look).not.toContain("WATER_FALL_FLAGS");
      // (under a layer cut, a side as tall as a fall stops at the cut: the vertex shader's test, the drop in thirtieths)
      expect(m.vertexShader, look).toContain(`wflags > ${FALL * 30 - 0.5}`);
    }
  });

  it("carries its detail by the current over its lip, in two phases, and faces up with the surface's normal, as the game's", () => {
    const [standard, light, high] = shaders();
    // (one sample for both looks: a side's flow is its water's over its lip, half a tile back; Q9 P5)
    for (const { m } of [standard, high]) {
      expect(m.fragmentShader).toContain("vec2 flow = waterFlow(n.y > 0.5 ? g : g - vec2(n.x, -n.z) * 0.5);");
      expect(m.fragmentShader).toContain("surf = waterSurfaceAt(pa, pb, pw);");
      expect(m.fragmentShader).toContain("N = waterFlowNormal(surf, cont, 1.0);");
      expect(m.fragmentShader).not.toContain("vWorld.y * 1.3 + t * 2.4");
      expect(m.fragmentShader).not.toContain("vWorld.y * 1.4 + hlT * 3.6");
    }
    // (the light look's water is still: its surface flat at the textures' mean, as the game's Low quality, and shows no
    // ground behind it)
    expect(light.m.defines.LITE).toBe(1);
    expect(light.m.fragmentShader).toMatch(/vec4 surf = vec4\([\d.]+, [\d.]+, 0\.50196, 0\.50196\);/);
    // (High: its own surface, with the Standard side's normal, albedo and patterns, at the depth seen behind it)
    expect(high.m.fragmentShader).toContain("vec4 stepSurface = measuredSurfaceWater(g, max(0.0, d), 1.0, cont, N, Nh, V, lit, albedo, bpat, stepSmooth);");
  });

  it("is lit as the surface is, by URP's environment reflection and sun glint, its highlight taken off by the game's waterfall mask", () => {
    const [standard, , high] = shaders();
    for (const line of ["c += WATER_SKY * waterSkyReflect(dot(N, V), smoothness);", "c += waterEnvironment(N, V, smoothness, float(WATER_HELD));", "float spec = waterSunGlint(N, V, sunDir, smoothness) * lit;", "vec3 highlight = sunColor * waterCameraHighlight(Nh, V, bad) * step(0.5, Nh.y) * (1.0 - waterFall);", "vec3 highlight = GAME_SUN_COLOUR * waterCameraHighlight(Nh, V, bad) * step(0.5, Nh.y) * (1.0 - waterFall);"]) expect(standard.m.fragmentShader).toContain(line);
    // (High's side is its surface: measuredSurfaceWater's light, the mask's highlight too; no light by its own facing)
    expect(high.m.fragmentShader).toContain("vec3 highlight = GAME_SUN_COLOUR * waterCameraHighlight(Nh, V, tint) * (1.0 - waterFall);");
    expect(high.m.fragmentShader).not.toContain("c = face * faceLight;");
  });

  it("has no whitewater or foam; the section at the map's edge keeps the water's shallowest colour", () => {
    const [standard, light, high] = shaders();
    for (const { m } of [standard, light]) {
      expect(m.fragmentShader).toContain("body = cleanWaterBody(0.05, waterAbsorb(0.05));");
      expect(m.fragmentShader).toContain("murky = badwaterGlow(badwaterBody(0.05), BADWATER_BODY, 0.05, cont);");
    }
    // (High's section: its own palette, and what the clear water's veil keeps of its badwater by the formula High's
    // surface takes, GAME_BADWATER.use.high)
    expect(GAME_BADWATER.use.high).toBe(true);
    expect(high.m.fragmentShader).toContain("vec3 faceBad = gameBadwaterColour(0.05, hlBad, bpat.x) * gameWaterLight(n, lit) / max(faceLight, vec3(0.01));");
    expect(high.m.fragmentShader).not.toContain("waterBlend(faceClean, faceBad, hlBad)");
    for (const { look, m } of shaders()) for (const gone of ["FALL_FOAM", "FALL_WHITEWATER", "FALL_TEAL", "fallIn", "hlCrown", "hlLanding", "hlBubbles", "lip = min("]) expect(m.fragmentShader, `${look}: ${gone}`).not.toContain(gone);
  });

  it("tells a badwater fall from a clean one by the game's cues: teal against crimson", () => {
    const clean = cleanWaterBody(0.05);
    const bad = badwaterBody(0.05);
    expect(Math.min(clean[1], clean[2])).toBeGreaterThan(clean[0]);
    expect(bad[0] > bad[1] && bad[1] > bad[2]).toBe(true);
  });
});
