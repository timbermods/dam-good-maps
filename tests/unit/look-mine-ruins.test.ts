// Kyler's mine site and ruins rounds (PLAN §20 D178): our own models, true to the game's
// footprints. A mine site is a rusty frame round the edge of its 5 × 5 footprint and a pit with
// real depth filling the rest (the terrain leaves the footprint's tops out and the model closes the
// hole), with scaffold towers on the frame's corners and beams across; with Markers on, an outline
// round the footprint. Ruins are ruined scaffold towers, a storey per level, in the file's five
// variants, with ivy draped over the lower half of their storeys on moist ground; neighbouring columns
// never look alike, and from afar each storey is a block in the scaffolding's rust. Kyler's
// colours, measured in the game, hold.

import { describe, expect, it } from "vitest";
import { ShaderMaterial } from "three";
import { FOOTPRINTS, footprintTiles, ORIENTATIONS, type Orientation } from "../../src/core/format/footprints";
import { buildEntities, IVY_DENSE, IVY_LIGHT, IVY_MEDIUM, IVY_NONE, LOD_ALL, LOD_FAR, LOD_NEAR, MINE_PIT, mineCutout, mineOutline, modelOf, modelTriangles, RUIN_LAYOUTS, ruinIvy, ruinStoreys, ruinTriangles, ruinTurn } from "../../src/render3d/entities3d";
import { objectMaterial, RUIN_LATTICE_SCALE, RUIN_NEAR_PX, sceneUniforms, terrainMaterial, overlayTexture } from "../../src/render3d/materials";
import { chunkCount, meshChunk, type TerrainSource } from "../../src/render3d/mesh";
import { entityView, variantIndex, type EntityInput } from "../../src/render3d/model";
import { cssColor, GROUND, LIGHT, MINE, objectLegend, RUIN, WATER, type Rgb } from "../../src/render3d/palette";
import { variantOf } from "../../src/worker/api";

const lum = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

type Mesh = { name: string; count: number; instanceMatrix: { array: ArrayLike<number> }; geometry: { getAttribute(n: string): { array: ArrayLike<number>; count: number } | undefined } };
const meshesOf = (list: EntityInput[], soil: { moisture: Uint8Array; contamination: Uint8Array } | null = null, W = 0, lite = false) =>
  buildEntities(entityView(list), new ShaderMaterial(), soil, W, lite).group.children as unknown as Mesh[];

/** An instance's vertices in the world: the model's through the instance's matrix. */
function worldVertices(mesh: Mesh, instance: number): [number, number, number][] {
  const e = Array.from(mesh.instanceMatrix.array).slice(instance * 16, instance * 16 + 16);
  const p = mesh.geometry.getAttribute("position")!.array;
  const out: [number, number, number][] = [];
  for (let k = 0; k < p.length; k += 3) {
    const [x, y, z] = [p[k], p[k + 1], p[k + 2]];
    out.push([e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]]);
  }
  return out;
}

describe("mine sites", () => {
  const site = (o: Orientation, x = 10, y = 10): EntityInput => ({ template: "UndergroundRuins", x, y, z: 4, orientation: o, owner: "f" });

  it("stay within the game's 5 × 5 footprint in every orientation, centred on it", () => {
    const m = modelOf("UndergroundRuins");
    for (let k = 0; k < m.pos.length; k += 3) {
      expect(Math.abs(m.pos[k])).toBeLessThanOrEqual(2.5 + 1e-9);
      expect(Math.abs(m.pos[k + 2])).toBeLessThanOrEqual(2.5 + 1e-9);
    }
    expect(FOOTPRINTS.UndergroundRuins.size).toEqual([5, 5, 1]);
    for (const o of ORIENTATIONS) {
      const tiles = footprintTiles("UndergroundRuins", { template: "UndergroundRuins", x: 10, y: 10, z: 4, orientation: o, flipped: false });
      const xs = tiles.map(([x]) => x);
      const ys = tiles.map(([, y]) => y);
      const mesh = meshesOf([site(o)]).find((c) => c.name === "UndergroundRuins")!;
      for (const [X, , Z] of worldVertices(mesh, 0)) {
        // world X = x, Z = −y: every vertex over one of the footprint's tiles
        expect(X).toBeGreaterThanOrEqual(Math.min(...xs) - 1e-6);
        expect(X).toBeLessThanOrEqual(Math.max(...xs) + 1 + 1e-6);
        expect(-Z).toBeGreaterThanOrEqual(Math.min(...ys) - 1e-6);
        expect(-Z).toBeLessThanOrEqual(Math.max(...ys) + 1 + 1e-6);
      }
    }
  });

  it("fill the footprint with a pit of real depth inside a frame: the terrain leaves the footprint's tops out, and nothing else", () => {
    // every orientation's cutout is its whole footprint (as the game's), at the site's level
    for (const o of ORIENTATIONS) {
      const cut = mineCutout(entityView([site(o)]), 32, 32);
      const tiles = footprintTiles("UndergroundRuins", { template: "UndergroundRuins", x: 10, y: 10, z: 4, orientation: o, flipped: false });
      expect(new Set(cut.keys())).toEqual(new Set(tiles.map(([x, y]) => y * 32 + x)));
      for (const z of cut.values()) expect(z).toBe(4);
    }
    // the mesh: every other top stays, and every wall; a top at another level is not cut
    const W = 40;
    const H = 36;
    const heights = new Uint8Array(W * H).fill(4);
    for (let x = 0; x < W; x++) heights[20 * W + x] = 6; // a ridge, walls on both sides
    heights[3 * W + 3] = 5; // a tile under a site whose level differs: its top stays
    // two sites, the second reaching past the map's west edge (10 of its tiles are on the map)
    const cutout = mineCutout(entityView([site("Cw0", 29, 8), site("Cw90", -3, 5)]), W, H);
    expect(cutout.size).toBe(35);
    cutout.set(3 * W + 3, 4);
    const with_ = faces({ W, H, heights, columns: new Map(), cutout });
    const without = faces({ W, H, heights, columns: new Map() });
    expect(without.top).toBe(W * H);
    expect(with_.top).toBe(W * H - 35);
    for (const side of ["east", "west", "north", "south", "bottom"]) expect(with_[side], side).toBe(without[side]);
    // the model closes the hole: a floor over the whole pit, and four walls facing in, from the
    // ground down to the floor
    const { half: p, depth: d } = MINE_PIT;
    expect(d).toBeGreaterThanOrEqual(1.5);
    const m = modelOf("UndergroundRuins");
    const tri = (k: number) => [0, 1, 2].map((j) => [m.pos[k * 9 + j * 3], m.pos[k * 9 + j * 3 + 1], m.pos[k * 9 + j * 3 + 2]]);
    let floor = 0;
    const walls = [0, 0, 0, 0];
    for (let k = 0; k < m.pos.length / 9; k++) {
      const [a, b, c] = tri(k);
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const area = Math.hypot(n[0], n[1], n[2]) / 2;
      const all = (f: (q: number[]) => boolean) => [a, b, c].every(f);
      if (n[1] > 0 && all((q) => Math.abs(q[1] + d) < 1e-6)) floor += area;
      // a wall facing in: on the plane |x| = p or |z| = p, its normal toward the middle
      if (all((q) => Math.abs(q[2] + p) < 1e-6) && n[2] > 0) walls[0] += area;
      if (all((q) => Math.abs(q[0] - p) < 1e-6) && n[0] < 0) walls[1] += area;
      if (all((q) => Math.abs(q[2] - p) < 1e-6) && n[2] < 0) walls[2] += area;
      if (all((q) => Math.abs(q[0] + p) < 1e-6) && n[0] > 0) walls[3] += area;
    }
    expect(floor).toBeGreaterThanOrEqual(4 * p * p - 1e-6);
    for (const w of walls) expect(w).toBeGreaterThanOrEqual(2 * p * d - 1e-6);
    // the pit fills most of the footprint; the frame covers the rest, to its edge, above the ground
    expect(2 * p).toBeGreaterThanOrEqual(4.3);
    let frameTop = 0;
    for (let k = 0; k < m.lod.length; k++) {
      const [x, y, z] = [m.pos[k * 3], m.pos[k * 3 + 1], m.pos[k * 3 + 2]];
      if (Math.max(Math.abs(x), Math.abs(z)) > 2.5 - 1e-6 && y > 0) frameTop = Math.max(frameTop, y);
    }
    expect(frameTop).toBeGreaterThan(0.1);
  });

  it("have Kyler's colours: the pit's earth shows about #373A34 in its shade, a dull rusty frame, pale wood", () => {
    expect(cssColor(MINE.frame)).toBe("#844d2f");
    expect(cssColor(MINE.wood)).toBe("#a78e65");
    expect(cssColor(MINE.pit)).toBe("#373a34");
    // the frame is no longer bright orange
    expect(Math.max(...MINE.frame)).toBeLessThan(0.6);
    // down in the pit only the sky lights it (the object shader: sky × 1.15, the foot's shade 0.72,
    // the warm grade): the floor and the earth show within a few steps of #373A34
    const seen = (c: readonly number[], up: number) => c.map((v, k) => v * LIGHT.sky[k] * 1.15 * (0.8 + 0.2 * up) * 0.72 * [1.01, 1, 0.98][k]);
    const floor = seen(MINE.floor, 1);
    const earth = seen(MINE.earth, 0);
    for (let k = 0; k < 3; k++) {
      expect(Math.abs(floor[k] - MINE.pit[k])).toBeLessThan(0.03);
      expect(Math.abs(earth[k] - MINE.pit[k])).toBeLessThan(0.03);
    }
    // the walls darken toward the floor, and the topsoil is browner: the pit reads as deep
    expect(lum(MINE.earthTop)).toBeGreaterThan(lum(MINE.earth));
    expect(lum(MINE.earth)).toBeGreaterThan(lum(MINE.earthLow));
    expect(MINE.earthTop[0] - MINE.earthTop[2]).toBeGreaterThan(MINE.earth[0] - MINE.earth[2]);
  });

  it("read in greyscale from above: a dark pit, darker than badwater, a rusty frame, pale wood, and apart from badwater sources", () => {
    expect(lum(MINE.frame) - lum(MINE.pit)).toBeGreaterThan(0.1);
    expect(lum(MINE.wood) - lum(MINE.frame)).toBeGreaterThan(0.2);
    expect(lum(MINE.pit)).toBeLessThan(lum(GROUND.dry) - 0.15);
    // a badwater source is a dark round pit with a brown swirl, no pale wood: the mine's corners
    // are far lighter than anything on it
    const badwater = modelOf("BadwaterSource").col;
    let lightest = 0;
    for (let k = 0; k < badwater.length; k += 3) lightest = Math.max(lightest, lum([badwater[k], badwater[k + 1], badwater[k + 2]]));
    expect(lum(MINE.wood)).toBeGreaterThan(lightest + 0.2);
    // the pit's earth is darker than badwater by about 5 L* or more, as in the game (Kyler's review
    // of D177 and D178, 2026-09-26: both colours stay, #373A34 and #38's crimson; it was lighter than
    // the red-black badwater before)
    const lightness = (c: readonly number[]) => {
      const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      const y = 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
      return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
    };
    expect(lightness(WATER.bad) - lightness(MINE.pit)).toBeGreaterThanOrEqual(5);
  });

  it("are outlined with Markers on: an orange line between dark edges round the footprint, a few pixels from any distance", () => {
    // the footprint's own tops are the pit's: the outline runs on the tiles just outside it, and
    // turns round its corners
    const W = 12;
    const e = mineOutline(entityView([site("Cw0", 2, 3)]), W, 10);
    const at = (x: number, y: number) => e[(y * W + x) * 4];
    const corner = (x: number, y: number) => e[(y * W + x) * 4 + 1];
    const [E, Wst, N, S] = [1, 2, 4, 8];
    // the footprint is (2..6, 3..7)
    expect(at(1, 3)).toBe(E);
    expect(at(1, 7)).toBe(E);
    expect(at(7, 5)).toBe(Wst);
    expect(at(4, 2)).toBe(N);
    expect(at(4, 8)).toBe(S);
    for (const [x, y] of [[4, 5], [2, 3], [6, 7], [0, 5], [9, 5]]) expect(at(x, y) + corner(x, y), `${x},${y}`).toBe(0);
    // the four corners outside: north-east of (1, 2) is the footprint's south-west corner, and so on
    expect(corner(1, 2)).toBe(1);
    expect(corner(7, 2)).toBe(2);
    expect(corner(1, 8)).toBe(4);
    expect(corner(7, 8)).toBe(8);
    expect(at(1, 2) + at(7, 8)).toBe(0);
    // a site at the map's edge keeps its outline on the sides in the map
    const edge = mineOutline(entityView([site("Cw0", 0, 0)]), W, 10);
    expect(edge[(0 * W + 5) * 4]).toBe(Wst);
    expect(edge[(5 * W + 2) * 4]).toBe(S);
    // the terrain shader draws it only with Markers on, in the outline's colours, and its width
    // is set in pixels (never below a pixel, up to a quarter of a tile from afar)
    const t = () => overlayTexture(1, 1);
    const shader = terrainMaterial(sceneUniforms(1, 1, t(), t(), t(), t()), 0, 1).fragmentShader;
    const block = shader.slice(shader.indexOf("if (markers > 0.5 && n.y > 0.5"), shader.indexOf("if (hover.z"));
    expect(block).toContain("siteEdges");
    expect(block).toContain("0.25)");
    expect(block).toContain("length(fo)");
    expect(lum(MINE.outline) - lum(MINE.outlineDark)).toBeGreaterThan(0.4);
    const legend = objectLegend().find((l) => /Mine sites: an orange outline/.test(l.label))!;
    expect(legend.markers).toBe(true);
    // no longer the bright orange frame of the clean view: the outline is the information layer's
    expect(objectLegend().find((l) => /^Mine site:/.test(l.label))!.markers).toBeFalsy();
  });

  it("are a modest model, not grown from afar (their 5 × 5 footprint reads in a view of the whole map)", () => {
    // (a few sites a map: about a thousand triangles each)
    expect(modelTriangles("UndergroundRuins")).toBeLessThanOrEqual(1400);
    const mesh = meshesOf([site("Cw0")]).find((c) => c.name === "UndergroundRuins")!;
    expect(Array.from(mesh.geometry.getAttribute("grow")!.array)[0]).toBe(0);
    // every part is drawn at every distance
    expect(new Set(modelOf("UndergroundRuins").lod)).toEqual(new Set([LOD_ALL]));
  });
});

describe("ruins", () => {
  const column = (x: number, y: number, h: number, variant?: string): EntityInput => ({ template: `RuinColumnH${h}`, x, y, z: 2, orientation: "Cw0", owner: "f", variant });

  it("stay within their tile and their storey, in every variant and kind, with and without ivy", () => {
    for (const v of ["A", "B", "C", "D", "E"])
      for (let kind = 0; kind < 4; kind++)
        for (const ivy of [IVY_NONE, IVY_LIGHT, IVY_MEDIUM, IVY_DENSE]) {
          const m = modelOf(`scaffold.${v}`, kind, ivy);
          for (let k = 0; k < m.pos.length; k += 3) {
            expect(Math.abs(m.pos[k]), `${v}${kind}`).toBeLessThanOrEqual(0.5);
            expect(Math.abs(m.pos[k + 2]), `${v}${kind}`).toBeLessThanOrEqual(0.5);
            expect(m.pos[k + 1]).toBeGreaterThanOrEqual(-1e-6);
            expect(m.pos[k + 1]).toBeLessThanOrEqual(1.0 + 1e-6);
          }
        }
    expect(FOOTPRINTS.RuinColumnH3.size).toEqual([1, 1, 3]);
  });

  it("are a rusty skeleton with beige panels close up (Kyler's colours), and from afar a lattice block in the skeleton's own muted rust (D305)", () => {
    expect(cssColor(RUIN.rust)).toBe("#8d5631");
    expect(cssColor(RUIN.panel)).toBe("#b8a775");
    expect(cssColor(RUIN.ivy)).toBe("#405634");
    for (const v of ["A", "B", "C", "D", "E"])
      for (let kind = 0; kind < 4; kind++) {
        const m = modelOf(`scaffold.${v}`, kind);
        const near: string[] = [];
        let farTris = 0;
        let farTop = 0;
        let rustArea = 0;
        let farArea = 0;
        for (let t = 0; t < m.lod.length / 3; t++) {
          const lod = m.lod[t * 3];
          expect([LOD_NEAR, LOD_FAR]).toContain(lod);
          const c = cssColor([m.col[t * 9], m.col[t * 9 + 1], m.col[t * 9 + 2]]);
          if (lod === LOD_NEAR) near.push(c);
          else {
            farTris++;
            let y = 0;
            for (let j = 0; j < 3; j++) y = Math.max(y, m.pos[t * 9 + j * 3 + 1]);
            farTop = Math.max(farTop, y);
            const v = [0, 1, 2].map((j) => [m.pos[t * 9 + j * 3], m.pos[t * 9 + j * 3 + 1], m.pos[t * 9 + j * 3 + 2]]);
            const u = v[1].map((q, i) => q - v[0][i]);
            const w = v[2].map((q, i) => q - v[0][i]);
            const area = Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2;
            farArea += area;
            if (c === cssColor(RUIN.far)) rustArea += area;
          }
        }
        expect(near).toContain(cssColor(RUIN.rust));
        // panels on every layout (shaded a little one from another)
        expect(near.some((c) => c !== cssColor(RUIN.rust) && /^#[a-c]/.test(c))).toBe(true);
        // from afar: four sides and a top, the storey's height (a partial top storey lower), with
        // a panel set into each face that has one; mostly RUIN.far (D305: the near skeleton's own
        // muted look, not the old brighter top), the panels under two fifths of it. The lattice that
        // tells it apart from a solid box is the object shader's own (materials.ts), not this CPU
        // geometry, which the object shader's own test below checks for.
        expect(farTris).toBeGreaterThanOrEqual(10);
        expect(farTris).toBeLessThanOrEqual(20);
        expect(farTop).toBeCloseTo(kind < 2 ? 1 : 0.72, 5);
        expect(rustArea / farArea, `${v}${kind}`).toBeGreaterThan(0.6);
      }
    // modest: tens of thousands of storeys on a big map
    const t = ruinTriangles();
    expect(t.near).toBeLessThanOrEqual(310);
    expect(t.far).toBeLessThanOrEqual(24);
    expect(modelTriangles("ruin")).toBeLessThanOrEqual(360);
  });

  it("from afar stand apart from rusty contaminated ground, in greyscale too", () => {
    for (const c of [RUIN.panel, RUIN.far, RUIN.rust]) expect(lum(c) - lum(GROUND.contaminated), cssColor(c)).toBeGreaterThan(0.12);
    // the rust is orange, the contaminated ground's red-brown: more yellow in it
    expect(RUIN.rust[1] / RUIN.rust[0]).toBeGreaterThan(GROUND.contaminated[1] / GROUND.contaminated[0] + 0.05);
    expect(lum(RUIN.panel) - lum(GROUND.contaminated)).toBeGreaterThan(0.35);
  });

  it("the object shader draws a model's parts for close up or from afar by its size on screen", () => {
    const u = sceneUniforms(1, 1, overlayTexture(1, 1), overlayTexture(1, 1), overlayTexture(1, 1), overlayTexture(1, 1));
    const mat = objectMaterial(u);
    const shader = mat.vertexShader;
    expect(shader).toContain("attribute float lod");
    expect(shader).toContain(`perUnit >= ${RUIN_NEAR_PX}`);
    expect(RUIN_NEAR_PX).toBeGreaterThanOrEqual(6);
    // the far ruin block's lattice (D305): a cheap discard pattern in the fragment shader, gated on
    // the far lod alone (so it never touches any other object), the same in Standard and High since
    // it lives in the shared shader, not behind a hook
    expect(mat.vertexShader).toContain("vLod = lod;");
    expect(mat.fragmentShader).toContain("if (vLod > 1.5)");
    expect(mat.fragmentShader).toContain(`${RUIN_LATTICE_SCALE}`);
    expect(RUIN_LATTICE_SCALE).toBeGreaterThan(1);
    // every model carries the attribute; the light look (software rendering) draws a block per ruin
    for (const m of meshesOf([column(1, 1, 3, "B"), { template: "Pine", x: 3, y: 3, z: 2, orientation: "Cw0", owner: "f" }])) expect(m.geometry.getAttribute("lod")).toBeDefined();
    const lite = meshesOf([column(1, 1, 3, "B")], null, 0, true);
    expect(lite.map((m) => m.name)).toEqual(["ruin.lite"]);
    expect(Array.from(lite[0].geometry.getAttribute("lod")!.array).every((v) => v === 0)).toBe(true);
  });

  it("draw the file's variant (A to E), or one from the tile where the file has none", () => {
    expect(variantOf({ RuinModels: { VariantId: "C" } })).toEqual({ variant: "C" });
    expect(variantOf({})).toEqual({});
    expect(variantIndex("E")).toBe(4);
    expect(variantIndex("Q")).toBe(255);
    const names = (list: EntityInput[]) => [...new Set(meshesOf(list).map((m) => m.name))].sort();
    expect(names([column(1, 1, 2, "D")]).every((n) => n.startsWith("scaffold.D"))).toBe(true);
    expect(names([column(1, 1, 2, "A"), column(5, 1, 1, "E")]).every((n) => /^scaffold\.[AE]/.test(n))).toBe(true);
    // none given: the same tile always gets the same variant
    const none = names([column(7, 9, 3)]);
    expect(none.length).toBeGreaterThan(0);
    expect(names([column(7, 9, 3)])).toEqual(none);
    // a storey per level, the top one often only partly there
    let partial = 0;
    for (let x = 0; x < 50; x++) {
      const s = ruinStoreys(x, 3, 4, 0);
      expect(s).toHaveLength(4);
      expect(s.slice(0, 3).every((q) => q.kind < 2)).toBe(true);
      if (s[3].kind >= 2) partial++;
    }
    expect(partial).toBeGreaterThan(15);
    expect(partial).toBeLessThan(45);
  });

  it("never look alike beside each other: neighbours are turned differently, and no layout looks the same turned", () => {
    // turns: every column differs from all eight round it
    for (let y = 0; y < 20; y++)
      for (let x = 0; x < 20; x++)
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) if (dx || dy) expect(ruinTurn(x + dx, y + dy), `${x},${y} ${dx},${dy}`).not.toBe(ruinTurn(x, y));
    // no storey of a variant, turned a quarter, a half or three quarters, is any storey of the
    // same variant (the shapes: braces, panels, broken posts)
    const shape = (pos: readonly number[], lod: readonly number[], q: number): string => {
      const c = Math.round(Math.cos((q * Math.PI) / 2));
      const s = Math.round(Math.sin((q * Math.PI) / 2));
      const tris: string[] = [];
      for (let t = 0; t < pos.length / 9; t++) {
        if (lod[t * 3] !== LOD_NEAR) continue;
        const v: string[] = [];
        for (let j = 0; j < 3; j++) {
          const [x, y, z] = [pos[t * 9 + j * 3], pos[t * 9 + j * 3 + 1], pos[t * 9 + j * 3 + 2]];
          v.push([c * x + s * z, y, -s * x + c * z].map((n) => (Math.round(n * 1000) / 1000 + 0).toFixed(3)).join(","));
        }
        tris.push(v.sort().join(" "));
      }
      return tris.sort().join("|");
    };
    for (let variant = 0; variant < RUIN_LAYOUTS.length; variant++) {
      const id = "ABCDE"[variant];
      const kinds = [0, 1, 2, 3].map((k) => modelOf(`scaffold.${id}`, k));
      for (let a = 0; a < 4; a++)
        for (let b = 0; b < 4; b++)
          for (let q = 1; q < 4; q++) expect(shape(kinds[a].pos, kinds[a].lod, q) === shape(kinds[b].pos, kinds[b].lod, 0), `${id}${a} turned ${q} = ${id}${b}`).toBe(false);
    }
    // as drawn: in a field of one variant and height, each column's storeys are turned its own way
    const list: EntityInput[] = [];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) list.push(column(x, y, 2, "A"));
    const turnAt = new Map<string, number>();
    for (const m of meshesOf(list))
      for (let i = 0; i < m.count; i++) {
        const e = Array.from(m.instanceMatrix.array).slice(i * 16, i * 16 + 16);
        const key = `${Math.floor(e[12])},${Math.floor(-e[14])}`;
        const q = ((Math.round(Math.atan2(-e[2], e[0]) / (Math.PI / 2)) % 4) + 4) % 4;
        if (turnAt.has(key)) expect(turnAt.get(key)).toBe(q);
        turnAt.set(key, q);
      }
    for (const [key, q] of turnAt) {
      const [x, y] = key.split(",").map(Number);
      expect(q).toBe(ruinTurn(x, y));
    }
  });

  it("drape ivy over the lower half of a column's storeys on moist ground, the most at its foot, thinning upward, as flat leaves that leave the panels' middles showing", () => {
    const W = 8;
    const moisture = new Uint8Array(W * 4);
    moisture[1 * W + 1] = 120;
    const soil = { moisture, contamination: new Uint8Array(W * 4) };
    const m = meshesOf([column(1, 1, 4, "C"), column(4, 1, 3, "C")], soil, W);
    const count = (re: RegExp) => m.filter((c) => re.test(c.name)).reduce((s, c) => s + c.count, 0);
    // on moist ground only: a column 4 high has its foot clad, the second storey clearly green, the
    // third a little, the fourth bare
    expect(count(/\.ivy$/)).toBe(1);
    expect(count(/\.ivy\.medium$/)).toBe(1);
    expect(count(/\.ivy\.light$/)).toBe(1);
    expect(count(/^scaffold\./)).toBe(7);
    expect([0, 1, 2, 3].map((lv) => ruinIvy(1, 1, 4, lv))).toEqual([IVY_DENSE, IVY_MEDIUM, IVY_LIGHT, IVY_NONE]);
    expect([0, 1].map((lv) => ruinIvy(1, 1, 2, lv))).toEqual([IVY_DENSE, IVY_LIGHT]);
    expect(ruinIvy(1, 1, 1, 0)).toBe(IVY_DENSE);
    // about the lower half, from the foot up, thinning upward, the same every time
    for (let x = 0; x < 30; x++)
      for (const h of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const levels = Array.from({ length: h }, (_, lv) => ruinIvy(x, 7, h, lv));
        expect(levels[0]).toBe(IVY_DENSE);
        const reach = levels.filter((l) => l !== IVY_NONE).length;
        expect(Math.abs(reach - h / 2), `${x} ${h}`).toBeLessThanOrEqual(1);
        for (let lv = 1; lv < h; lv++) expect(levels[lv], `${x} ${h} ${lv}`).toBeLessThanOrEqual(levels[lv - 1]);
        expect(Array.from({ length: h }, (_, lv) => ruinIvy(x, 7, h, lv))).toEqual(levels);
      }
    // Kyler's green, the brighter green on the clusters' edges; flat leaves clinging to the faces
    // (no clumps inside the storey); the foot clearly clad, thinning upward; the middle of each
    // face clear above its lower part, so the panel shows; a band of ivy from afar low on the lower
    // storeys, the rust still most of each block
    expect(cssColor(RUIN.ivy)).toBe("#405634");
    expect(cssColor(RUIN.leaf)).toBe("#5c803d");
    for (const v of ["A", "B", "C", "D", "E"]) {
      const green = (ivy: number) => {
        const md = modelOf(`scaffold.${v}`, 0, ivy);
        let dark = 0;
        let bright = 0;
        let area = 0;
        let farIvy = 0;
        let farRust = 0;
        let farArea = 0;
        for (let t = 0; t < md.lod.length / 3; t++) {
          const c = cssColor([md.col[t * 9], md.col[t * 9 + 1], md.col[t * 9 + 2]]);
          const pts = [0, 1, 2].map((j) => [md.pos[t * 9 + j * 3], md.pos[t * 9 + j * 3 + 1], md.pos[t * 9 + j * 3 + 2]]);
          const u = pts[1].map((q, i) => q - pts[0][i]);
          const w = pts[2].map((q, i) => q - pts[0][i]);
          const a = Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2;
          const isIvy = c === cssColor(RUIN.ivy) || c === cssColor(RUIN.leaf);
          if (md.lod[t * 3] === LOD_FAR) {
            farArea += a;
            if (isIvy) farIvy += a;
            if (c === cssColor(RUIN.far)) farRust += a;
            continue;
          }
          if (!isIvy) continue;
          if (c === cssColor(RUIN.ivy)) dark++;
          else bright++;
          area += a;
          for (const [x, y, z] of pts) {
            // on the outside of a face
            expect(Math.max(Math.abs(x), Math.abs(z)), `${v} ${ivy}`).toBeGreaterThan(0.38);
            // never over the middle of a face above its lower part, where its panel shows
            const along = Math.abs(x) > Math.abs(z) ? z : x;
            expect(Math.abs(along) < 0.12 && y > 0.45 && y < 0.8, `${v} ${ivy} ${x} ${y} ${z}`).toBe(false);
          }
        }
        return { dark, bright, area, farIvy, farRust, farArea };
      };
      const [dense, medium, light] = [green(IVY_DENSE), green(IVY_MEDIUM), green(IVY_LIGHT)];
      const sides = 4 * 0.86;
      // the foot clearly clad (its leaves adding up to over a sixth of its sides and under three
      // fifths: overlapping, they cover less),
      // thinning upward
      expect(dense.area, v).toBeGreaterThan(sides / 6);
      expect(dense.area, v).toBeLessThan(sides * 0.6);
      expect(medium.area, v).toBeGreaterThan(sides / 12);
      expect(medium.area, v).toBeLessThan(dense.area);
      expect(light.area, v).toBeGreaterThan(0);
      expect(light.area, v).toBeLessThan(medium.area);
      // the dark green most of it, the brighter a good share on the edges
      expect(dense.bright, v).toBeGreaterThan(dense.dark * 0.15);
      expect(dense.bright, v).toBeLessThan(dense.dark * 0.7);
      // from afar: a band of ivy on the foot and the storey above, the rust still most of the block
      expect(dense.farIvy / dense.farArea, v).toBeGreaterThan(0.12);
      expect(dense.farRust / dense.farArea, v).toBeGreaterThan(0.5);
      expect(medium.farIvy, v).toBeGreaterThan(0);
      expect(medium.farIvy, v).toBeLessThan(dense.farIvy);
      expect(light.farIvy, v).toBe(0);
    }
  });

  it("the legend shows both as small pictures that differ in greyscale", () => {
    const swatch = (re: RegExp) => decodeURIComponent(/url\("data:image\/svg\+xml,([^"]*)"\)/.exec(objectLegend().find((l) => re.test(l.label))!.swatch)![1]);
    const ruins = swatch(/^Ruins/);
    expect(ruins).toContain(cssColor(RUIN.rust));
    expect(ruins).toContain(cssColor(RUIN.panel));
    const mine = swatch(/^Mine site:/);
    for (const c of [MINE.pit, MINE.frame, MINE.wood]) expect(mine).toContain(cssColor(c));
  });
});

/** Areas of a terrain's faces, by the way they face. */
function faces(src: TerrainSource): Record<string, number> {
  const { nx, ny } = chunkCount(src.W, src.H);
  const out: Record<string, number> = { top: 0, bottom: 0, east: 0, west: 0, north: 0, south: 0 };
  for (let cy = 0; cy < ny; cy++)
    for (let cx = 0; cx < nx; cx++) {
      const m = meshChunk(src, cx, cy);
      for (let q = 0; q < m.quads; q++) {
        const p = m.positions.subarray(q * 12, q * 12 + 12);
        const n = m.normals.subarray(q * 12, q * 12 + 3);
        const span = (k: number) => Math.max(p[k], p[k + 3], p[k + 6], p[k + 9]) - Math.min(p[k], p[k + 3], p[k + 6], p[k + 9]);
        const key = n[1] > 0 ? "top" : n[1] < 0 ? "bottom" : n[0] > 0 ? "east" : n[0] < 0 ? "west" : n[2] < 0 ? "north" : "south";
        out[key] += n[1] !== 0 ? span(0) * span(2) : n[0] !== 0 ? span(1) * span(2) : span(0) * span(1);
      }
    }
  return out;
}
