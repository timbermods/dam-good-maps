// Kyler's mine site and ruins rounds (PLAN §20 D178): our own models, true to the game's
// footprints. A mine site is a rusty frame round the edge of its 5 × 5 footprint and a pit with
// real depth filling the rest (the terrain leaves the footprint's tops out and the model closes the
// hole), rusty posts down into it round its lip and pale ground in its corners, as the game's (no
// scaffolding: D178 amended, D496's rule); with Markers on, an outline round the footprint. Ruins are the game's ruined
// concrete frames (D178 as amended 2026-11-10, D496's rule), a storey per level in the file's five variants: rebar posts
// at the corners, bands of slab or rails on the faces storey by storey from the top, floors in three variants, the
// game's ivy on wet and dry ground, turned as the file turns them and one model at every distance, in the game's colours.

import { describe, expect, it } from "vitest";
import { ShaderMaterial } from "three";
import { FOOTPRINTS, footprintTiles, ORIENTATIONS, type Orientation } from "../../src/core/format/footprints";
import { buildEntities, cutoutUnder, IVY_DENSE, IVY_LIGHT, IVY_MEDIUM, IVY_NONE, LOD_ALL, MINE_PIT, mineCutout, mineOutline, modelOf, modelTriangles, RUIN_BAND_LO, RUIN_FACES, RUIN_POST, RUIN_POST_TOPS, ruinIvy, ruinOvergrown, ruinsOvergrown, ruinStoreys, ruinTriangles } from "../../src/render3d/entities3d";
import { LOD_NEAR_PX, objectMaterial, sceneUniforms, terrainMaterial, overlayTexture } from "../../src/render3d/materials";
import { chunkCount, meshChunk, type TerrainSource } from "../../src/render3d/mesh";
import { LAND_GROW } from "../../src/render3d/objectFade";
import { entityView, variantIndex, type EntityInput, type EntityView } from "../../src/render3d/model";
import { CONTAMINATED_GROUND, CONTAMINATION, cssColor, GROUND, LIGHT, MINE, objectLegend, objectTop, ownAlbedo, RUIN, sunlitTop, type Rgb } from "../../src/render3d/palette";
import { badwaterLit } from "./waterShown";
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
    // (the game's pit reaches 1.35 down, UndergroundRuins.Model; D178 amended to the game by D496's rule, re-based, D148)
    expect(d).toBeCloseTo(1.35, 2);
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

  // (the game's layers: a pit's model cut away over the cut, its hole showed the sky round what was left of it)
  it("under a layer cut at their level or below take their tiles' tops again, never a hole; a geothermal field's middle too", () => {
    const W = 24;
    const H = 24;
    const heights = new Uint8Array(W * H).fill(4);
    const e = entityView([site("Cw0", 2, 2), { template: "GeothermalField", x: 12, y: 12, z: 4, orientation: "Cw0", owner: "g" }]);
    const all = mineCutout(e, W, H);
    expect(all.size).toBe(26);
    // (no cut, or a cut over them: the tops stay left out, the objects whole over their pits)
    for (const slice of [null, 5, 9]) expect(cutoutUnder(all, slice)).toEqual(all);
    // (cut at their level or below: every tile has its top, folded down to the cut as every top there is)
    for (const slice of [4, 3, 0]) {
      const cut = cutoutUnder(all, slice);
      expect(cut.size).toBe(0);
      expect(faces({ W, H, heights, columns: new Map(), cutout: cut }).top).toBe(W * H);
    }
    // (each object by its own level: one cut over the lower, the higher's tops come back)
    const two = mineCutout(entityView([site("Cw0", 2, 2), { template: "GeothermalField", x: 12, y: 12, z: 6, orientation: "Cw0", owner: "g" }]), W, H);
    expect([...cutoutUnder(two, 6).values()]).toEqual(Array(25).fill(4));
  });

  it("have Kyler's colours: the pit's earth shows about #2F312C (D324's option (a): #373A34 darkened a little to keep its margin under the darker badwater), a dull rusty frame, pale wood", () => {
    expect(cssColor(MINE.frame)).toBe("#844d2f");
    expect(cssColor(MINE.wood)).toBe("#a78e65");
    expect(cssColor(MINE.pit)).toBe("#2f312c");
    // the frame is no longer bright orange
    expect(Math.max(...MINE.frame)).toBeLessThan(0.6);
    // down in the pit only the sky lights it (the object shader: sky × 1.15, the foot's shade 0.72,
    // the warm grade): the floor and the earth show within a few steps of #2F312C
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

  it("read in greyscale from above: a dark pit, lighter than badwater as the game draws it by day, a rusty frame, pale wood, and apart from badwater sources", () => {
    expect(lum(MINE.frame) - lum(MINE.pit)).toBeGreaterThan(0.1);
    expect(lum(MINE.wood) - lum(MINE.frame)).toBeGreaterThan(0.2);
    // (the pit is a colour on screen, dry ground an albedo since D497: against it as a sunlit top shows it in the game's
    // light, D324's 0.15)
    expect(lum(MINE.pit)).toBeLessThan(lum(sunlitTop(GROUND.dry)) - 0.15);
    // a badwater source is a dark round pit with a brown swirl, no pale wood: the mine's corners
    // are far lighter than anything on it
    const badwater = modelOf("BadwaterSource").col;
    let lightest = 0;
    for (let k = 0; k < badwater.length; k += 3) lightest = Math.max(lightest, lum([badwater[k], badwater[k + 1], badwater[k + 2]]));
    expect(lum(MINE.wood)).toBeGreaterThan(lightest + 0.2);
    // the pit is lighter than badwater, as the game draws it by day (D496 amended 2026-11-07: the pixel judge's
    // `--water pit` on the probe's sixteen day-lit start shots reads the game's pits at L* 43.4, 114 samples, against
    // its pure badwater's 32.3, 172 tiles; ours 40.8 against 29.5 in Standard, 48.9 against 30.7 in High). D148: this
    // held the pit at least 5 L* under #38's crimson (Kyler's review of D177 and D178, 2026-09-26; D324's option (a)),
    // which the game's own frames do not show; the order is held against each look's badwater as it ships
    // (waterShown.ts), over the depths a pit's neighbouring badwater has
    const lightness = (c: readonly number[]) => {
      const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      const y = 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
      return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
    };
    for (const look of ["standard", "high"] as const)
      for (const d of [0.5, 1, 1.35, 2]) expect(lightness(MINE.pit), `${look}, ${d} deep`).toBeGreaterThan(lightness(badwaterLit(d, look)));
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
    const legend = objectLegend().find((l) => l.label === "Mine site outline")!;
    expect(legend.markers).toBe(true);
    // no longer the bright orange frame of the clean view: the outline is the information layer's
    expect(objectLegend().find((l) => l.label === "Mine site")!.markers).toBeFalsy();
  });

  it("are a modest model, not grown from afar (their 5 × 5 footprint reads in a view of the whole map)", () => {
    // (a few sites a map: about a thousand triangles each)
    expect(modelTriangles("UndergroundRuins")).toBeLessThanOrEqual(1400);
    const mesh = meshesOf([site("Cw0")]).find((c) => c.name === "UndergroundRuins")!;
    // (no minimum size on screen: its grow is the land's own shape's mark, negative, never faded or hidden, objectFade.ts)
    expect(Array.from(mesh.geometry.getAttribute("grow")!.array)[0]).toBe(LAND_GROW[0]);
    // every part is drawn at every distance
    expect(new Set(modelOf("UndergroundRuins").lod)).toEqual(new Set([LOD_ALL]));
  });
});

describe("ruins", () => {
  const column = (x: number, y: number, h: number, variant?: string, orientation: Orientation = "Cw0"): EntityInput => ({ template: `RuinColumnH${h}`, x, y, z: 2, orientation, owner: "f", variant });
  const colourAt = (m: { col: readonly number[] }, t: number) => cssColor([m.col[t * 9], m.col[t * 9 + 1], m.col[t * 9 + 2]]);
  const corners = (m: { pos: readonly number[] }, t: number) => [0, 1, 2].map((j) => [m.pos[t * 9 + j * 3], m.pos[t * 9 + j * 3 + 1], m.pos[t * 9 + j * 3 + 2]]);
  /** A triangle's area and its normal. */
  const facet = (p: number[][]) => {
    const u = p[1].map((q, i) => q - p[0][i]);
    const w = p[2].map((q, i) => q - p[0][i]);
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    const a = Math.hypot(n[0], n[1], n[2]);
    return { area: a / 2, n: n.map((q) => q / (a || 1)) };
  };
  const slabs = [0.97, 1, 1.02].map((k) => cssColor([RUIN.slab[0] * k, RUIN.slab[1] * k, RUIN.slab[2] * k]));
  const rusts = [cssColor(RUIN.rust), cssColor([RUIN.rust[0] * 0.95, RUIN.rust[1] * 0.95, RUIN.rust[2] * 0.95])];
  const greens = [cssColor(RUIN.ivy), cssColor(RUIN.leaf)];

  it("stay within their tile and their storey, in every variant and place, with and without ivy", () => {
    for (const v of ["A", "B", "C", "D", "E"])
      for (let k = 0; k < RUIN_FACES[0].length; k++)
        for (const ivy of [IVY_NONE, IVY_LIGHT, IVY_MEDIUM, IVY_DENSE]) {
          const m = modelOf(`scaffold.${v}`, k, ivy);
          for (let i = 0; i < m.pos.length; i += 3) {
            expect(Math.abs(m.pos[i]), `${v}${k}`).toBeLessThanOrEqual(0.5 + 1e-6);
            expect(Math.abs(m.pos[i + 2]), `${v}${k}`).toBeLessThanOrEqual(0.5 + 1e-6);
            expect(m.pos[i + 1]).toBeGreaterThanOrEqual(-1e-6);
            expect(m.pos[i + 1]).toBeLessThanOrEqual(1.0 + 1e-6);
          }
        }
    expect(FOOTPRINTS.RuinColumnH3.size).toEqual([1, 1, 3]);
  });

  it("are the game's (D178 as amended 2026-11-10): rebar posts at the corners, on each face a band of slab or rails storey by storey from the top, floors in B, C and D", () => {
    // the game's colours, the means of the texels its cut-out keeps in each part of its atlas (D496's rule): the rebar's
    // rust, the slabs' tan, its ivy. (Until 2026-11-10 the means of five clusters over the whole texture: #6c3519,
    // #816e45, a far block #553921, the ivy #282816.)
    expect(cssColor(RUIN.rust)).toBe("#5d2f17");
    expect(cssColor(RUIN.slab)).toBe("#6c5a39");
    expect(cssColor(RUIN.ivy)).toBe("#2a2f1a");
    const floorFrom = [Infinity, 1, 2, 1, Infinity];
    for (let v = 0; v < 5; v++)
      for (let k = 0; k < RUIN_FACES[v].length; k++) {
        const id = "ABCDE"[v];
        const m = modelOf(`scaffold.${id}`, k);
        const tops = k === 0 ? RUIN_POST_TOPS[v] : [1, 1, 1, 1];
        // one model at every distance, as the game's: no part only close up or only from afar
        expect(new Set(m.lod), `${id}${k}`).toEqual(new Set([LOD_ALL]));
        // every triangle the rebar's rust or the slabs' tan
        for (let t = 0; t < m.pos.length / 9; t++) expect([...rusts, ...slabs], `${id}${k}`).toContain(colourAt(m, t));
        // the posts at the tile's corners, 0.08 square, to the storey's top (the top storey's broken off at the
        // variant's heights)
        const sw = [[RUIN_POST, -RUIN_POST], [RUIN_POST, RUIN_POST], [-RUIN_POST, RUIN_POST], [-RUIN_POST, -RUIN_POST]];
        sw.forEach(([cx, cz], c) => {
          let hi = 0;
          for (let t = 0; t < m.pos.length / 9; t++)
            if (rusts.includes(colourAt(m, t))) for (const [x, y, z] of corners(m, t)) if (Math.abs(x - cx) <= 0.04 + 1e-6 && Math.abs(z - cz) <= 0.04 + 1e-6) hi = Math.max(hi, y);
          expect(hi, `${id}${k} post ${c}`).toBeLessThanOrEqual(tops[c] + 1e-6);
          expect(hi, `${id}${k} post ${c}`).toBeGreaterThan(tops[c] - 0.4);
        });
        // each face's band of slab where the game's has one, over the storey's upper part, whole or broken; rails where
        // it has rails
        // (a corner, where two faces' bands end, belongs to neither)
        const faceOf = (x: number, z: number) => (Math.abs(x) > 0.44 && Math.abs(z) > 0.44 ? -1 : z < -0.44 ? 0 : x > 0.44 ? 1 : z > 0.44 ? 2 : x < -0.44 ? 3 : -1);
        for (let f = 0; f < 4; f++) {
          const want = RUIN_FACES[v][k][f];
          let band = 0;
          let rail = 0;
          let lo = Infinity;
          for (let t = 0; t < m.pos.length / 9; t++) {
            const p = corners(m, t);
            const mid = [0, 1, 2].map((i) => (p[0][i] + p[1][i] + p[2][i]) / 3);
            if (faceOf(mid[0], mid[2]) !== f) continue;
            const { area, n } = facet(p);
            const out = [[0, 0, -1], [1, 0, 0], [0, 0, 1], [-1, 0, 0]][f];
            if (slabs.includes(colourAt(m, t)) && n[0] * out[0] + n[2] * out[2] > 0.9 && mid[1] >= RUIN_BAND_LO) {
              band += area;
              lo = Math.min(lo, ...p.map((q) => q[1]));
            }
            if (colourAt(m, t) === rusts[1] && Math.abs(mid[0]) < 0.4 !== Math.abs(mid[2]) < 0.4) rail++;
          }
          const whole = 1 - RUIN_BAND_LO;
          if (want === "S" && k > 0) expect(band, `${id}${k} face ${f}`).toBeGreaterThan(0.99 * whole);
          else if (want === "S" || want === "s") {
            if (band > 0) expect(band, `${id}${k} face ${f}`).toBeLessThan(0.7 * whole);
          } else expect(band, `${id}${k} face ${f}`).toBe(0);
          if (band > 0) expect(lo, `${id}${k} face ${f}`).toBeCloseTo(RUIN_BAND_LO, 5);
          if (want === "R" && k > 0) expect(rail, `${id}${k} face ${f}`).toBeGreaterThan(0);
          if (want !== "R") expect(rail, `${id}${k} face ${f}`).toBe(0);
        }
        // a floor slab at the storey's foot in B, C and D, from the game's storey down
        let floor = 0;
        for (let t = 0; t < m.pos.length / 9; t++) {
          const p = corners(m, t);
          if (slabs.includes(colourAt(m, t)) && p.every((q) => q[1] < 0.06) && facet(p).n[1] > 0.9) floor += facet(p).area;
        }
        if (k >= floorFrom[v]) expect(floor, `${id}${k}`).toBeGreaterThan(v === 1 && k === 1 ? 0.35 : 0.55);
        else expect(floor, `${id}${k}`).toBe(0);
      }
    // modest: a storey with the most ivy a few hundred triangles
    expect(ruinTriangles()).toBeLessThanOrEqual(330);
    expect(modelTriangles("ruin")).toBeLessThanOrEqual(330);
  });

  it("stand apart from contaminated ground as the game's do: the slabs lighter, the rebar by its hue", () => {
    // (D135 as amended 2026-11-09: the ruins and the ground are both the game's albedo in the same light, so they compare
    // as they are, with the readability the game has; the margins its own colours give since 2026-11-10, D148: the
    // slabs 0.1 over every contaminated ground and the rust 0.08 over the veins when the ruins' colours were the means of
    // the whole texture)
    for (const ground of [CONTAMINATED_GROUND.dry, CONTAMINATED_GROUND.grass, CONTAMINATION.vein]) {
      expect(lum(RUIN.slab) - lum(ground)).toBeGreaterThan(0.03);
      expect(lum(RUIN.slab)).toBeGreaterThan(lum(RUIN.rust));
    }
    expect(lum(RUIN.rust) - lum(CONTAMINATION.vein)).toBeGreaterThan(0.05);
    // the rebar is orange, the veins a dark rust: more yellow in it (D154 as amended 2026-11-07: from afar the
    // contaminated ground is its soil a little toward the rust, no rust fill, so the hue rule is the veins')
    expect(RUIN.rust[1] / RUIN.rust[0]).toBeGreaterThan(CONTAMINATION.vein[1] / CONTAMINATION.vein[0] + 0.03);
  });

  it("the object shader draws a model's parts for close up or from afar by its size on screen", () => {
    const u = sceneUniforms(1, 1, overlayTexture(1, 1), overlayTexture(1, 1), overlayTexture(1, 1), overlayTexture(1, 1));
    const mat = objectMaterial(u);
    expect(mat.vertexShader).toContain("attribute float lod");
    expect(mat.vertexShader).toContain(`perUnit >= ${LOD_NEAR_PX}`);
    // (the far ruin block's lattice is gone with the block, 2026-11-10: the game draws its ruins as one model)
    expect(mat.fragmentShader).not.toContain("vLod");
    expect(mat.alphaToCoverage).toBe(true);
    expect(objectMaterial(u, true).alphaToCoverage).toBe(false);
    // every model carries the attribute; the light look (software rendering) draws a column per ruin
    for (const m of meshesOf([column(1, 1, 3, "B"), { template: "Pine", x: 3, y: 3, z: 2, orientation: "Cw0", owner: "f" }])) expect(m.geometry.getAttribute("lod")).toBeDefined();
    const lite = meshesOf([column(1, 1, 3, "B")], null, 0, true);
    expect(lite.map((m) => m.name)).toEqual(["ruin.lite"]);
    expect(Array.from(lite[0].geometry.getAttribute("lod")!.array).every((v) => v === 0)).toBe(true);
  });

  it("draw the file's variant (A to E), or one from the tile where the file has none, each storey by its place from the top", () => {
    expect(variantOf({ RuinModels: { VariantId: "C" } })).toEqual({ variant: "C" });
    expect(variantOf({})).toEqual({});
    expect(variantIndex("E")).toBe(4);
    expect(variantIndex("Q")).toBe(255);
    const names = (list: EntityInput[]) => [...new Set(meshesOf(list).map((m) => m.name))].sort();
    // (each storey's frame by its variant and place, its ivy in a batch of its own, as the game's ivy is its own model)
    expect(names([column(1, 1, 2, "D")])).toEqual(["scaffold.D0", "scaffold.D1", "scaffold.ivy.medium"]);
    expect(names([column(1, 1, 2, "A"), column(5, 1, 1, "E")]).every((n) => /^scaffold\.([AE]\d|ivy\.([AE]0\.)?[a-z]+)$/.test(n))).toBe(true);
    // none given: the same tile always gets the same variant
    const none = names([column(7, 9, 3)]);
    expect(none.length).toBeGreaterThan(0);
    expect(names([column(7, 9, 3)])).toEqual(none);
    // a storey per level, counted from the top as the game's atlas is: its top storey always the broken one
    for (const h of [1, 4, 8]) expect(ruinStoreys(3, 3, h, 0).map((s) => s.kind)).toEqual(Array.from({ length: h }, (_, lv) => h - 1 - lv));
  });

  it("stand as the file turns them, as the game places them, untinted", () => {
    const list: EntityInput[] = [];
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) list.push(column(x, y, 2, "A"));
    list.push(column(6, 6, 2, "A", "Cw90"));
    for (const m of meshesOf(list))
      for (let i = 0; i < m.count; i++) {
        const e = Array.from(m.instanceMatrix.array).slice(i * 16, i * 16 + 16);
        const q = ((Math.round(Math.atan2(-e[2], e[0]) / (Math.PI / 2)) % 4) + 4) % 4;
        expect(q, `${e[12]},${e[14]}`).toBe(Math.floor(e[12]) === 6 ? 3 : 0);
        // and in the game's colours, untinted
        expect(Array.from((m as unknown as { instanceColor: { array: Float32Array } }).instanceColor.array).slice(i * 3, i * 3 + 3)).toEqual([1, 1, 1]);
      }
  });

  it("carry the game's ivy: wet, the foot clad, the second storey clearly green, every higher one a little; dry, the foot clearly green", () => {
    const W = 8;
    const moisture = new Uint8Array(W * 4);
    moisture[1 * W + 1] = 120;
    const soil = { moisture, contamination: new Uint8Array(W * 4) };
    const m = meshesOf([column(1, 1, 4, "C"), column(4, 1, 3, "C")], soil, W);
    const count = (re: RegExp) => m.filter((c) => re.test(c.name)).reduce((s, c) => s + c.count, 0);
    // the wet column 4 high: its foot clad, the second storey clearly green, the two above a little; the dry one 3 high
    // its foot clearly green, nothing above
    expect(count(/^scaffold\.ivy\..*dense$/)).toBe(1);
    expect(count(/^scaffold\.ivy\..*medium$/)).toBe(2);
    expect(count(/^scaffold\.ivy\..*light$/)).toBe(2);
    expect(count(/^scaffold\.[A-E]\d$/)).toBe(7);
    expect([0, 1, 2, 3].map((lv) => ruinIvy(4, lv, true))).toEqual([IVY_DENSE, IVY_MEDIUM, IVY_LIGHT, IVY_LIGHT]);
    expect([0, 1, 2].map((lv) => ruinIvy(3, lv, false))).toEqual([IVY_MEDIUM, IVY_NONE, IVY_NONE]);
    expect([0, 1, 2].map((lv) => ruinIvy(6, lv, false))).toEqual([IVY_MEDIUM, IVY_LIGHT, IVY_NONE]);
    expect(ruinIvy(1, 0, true)).toBe(IVY_DENSE);
    // the game's dry model on contaminated ground too, moist or not (RuinModelUpdater: IsDry || IsContaminated)
    const poisoned = { moisture, contamination: new Uint8Array(W * 4) };
    poisoned.contamination[1 * W + 1] = 1;
    expect(meshesOf([column(1, 1, 4, "C")], poisoned, W).filter((c) => /\.ivy/.test(c.name)).map((c) => c.name)).toEqual(["scaffold.ivy.medium"]);
    expect(ruinOvergrown(soil, W, 1, 1, 0)).toBe(true);
    expect(ruinOvergrown(poisoned, W, 1, 1, 0)).toBe(false);
    expect(ruinOvergrown(soil, W, 4, 1, 0)).toBe(false);
    expect(Array.from(ruinsOvergrown({ count: 2, templates: ["RuinColumnH4", "Pine"], template: Uint16Array.of(0, 1), x: Int16Array.of(1, 1), y: Int16Array.of(1, 1), z: Int16Array.of(0, 0) } as unknown as EntityView, soil, W))).toEqual([1, 0]);
    // the game's ivy (its leaves' texels), a third the brighter green; flat leaves on the outside of the faces, more of
    // them the more ivy, as much of a column seen from a side as the game's covers
    expect(cssColor(RUIN.leaf)).toBe("#3c461f");
    for (const v of ["A", "B", "C", "D", "E"]) {
      const green = (ivy: number) => {
        const md = modelOf(`scaffold.${v}`, 3, ivy);
        let dark = 0;
        let bright = 0;
        for (let t = 0; t < md.pos.length / 9; t++) {
          const c = colourAt(md, t);
          if (!greens.includes(c)) continue;
          if (c === cssColor(RUIN.ivy)) dark++;
          else bright++;
          for (const [x, , z] of corners(md, t)) expect(Math.max(Math.abs(x), Math.abs(z)), `${v} ${ivy}`).toBeGreaterThan(0.45);
        }
        return { dark, bright, leaves: (dark + bright) / 2, all: dark + bright };
      };
      const [dense, medium, light, none] = [green(IVY_DENSE), green(IVY_MEDIUM), green(IVY_LIGHT), green(IVY_NONE)];
      expect(none.leaves).toBe(0);
      expect(light.leaves).toBeGreaterThan(0);
      expect(medium.leaves).toBeGreaterThan(2 * light.leaves);
      expect(dense.leaves).toBeGreaterThan(medium.leaves);
      expect(dense.bright).toBeGreaterThan(dense.all * 0.15);
      expect(dense.bright).toBeLessThan(dense.all * 0.6);
    }
  });

  it("cover as much of each storey seen from a side as the game's ivy does", () => {
    // (the share of each storey's side view, its whole tile across and its level high, that the ivy's leaves cover, the
    // face behind seen through the frame: averaged over looking along x and along z, as the game's ivy models, numbers
    // only: wet 4 high 0.74, 0.63, 0.38, 0.28 from the foot up; dry 0.66 at the foot, none above)
    const cover = (v: string, h: number, wet: boolean): number[] => {
      const tris: number[][][] = [];
      for (let lv = 0; lv < h; lv++) {
        const m = modelOf(`scaffold.${v}`, h - 1 - lv, ruinIvy(h, lv, wet));
        for (let t = 0; t < m.pos.length / 9; t++) if (greens.includes(colourAt(m, t))) tris.push(corners(m, t).map(([x, y, z]) => [x, y + lv, z]));
      }
      const N = 40;
      return Array.from({ length: h }, (_, lv) => {
        let hit = 0;
        for (const axis of [0, 2])
          for (let j = 0; j < N; j++)
            for (let i = 0; i < N; i++) {
              const [s, y] = [-0.5 + (i + 0.5) / N, lv + (j + 0.5) / N];
              const inside = tris.some((q) => {
                const [a, b, c] = q.map((p) => [p[axis], p[1]]);
                const d = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
                if (Math.abs(d) < 1e-12) return false;
                const w1 = ((b[0] - s) * (c[1] - y) - (b[1] - y) * (c[0] - s)) / d;
                const w2 = ((c[0] - s) * (a[1] - y) - (c[1] - y) * (a[0] - s)) / d;
                return w1 >= 0 && w2 >= 0 && w1 + w2 <= 1;
              });
              if (inside) hit++;
            }
        return hit / (2 * N * N);
      });
    };
    const game = { wet: [0.74, 0.63, 0.38, 0.28], dry: [0.66, 0, 0, 0] };
    for (const v of ["A", "B", "C", "D", "E"])
      for (const wet of [true, false]) {
        const ours = cover(v, 4, wet);
        ours.forEach((c, lv) => expect(Math.abs(c - game[wet ? "wet" : "dry"][lv]), `${v} ${wet ? "wet" : "dry"} storey ${lv}: ${c.toFixed(2)}`).toBeLessThan(0.07));
      }
  });

  it("the legend shows both as small pictures that differ in greyscale", () => {
    const swatch = (re: RegExp) => decodeURIComponent(/url\("data:image\/svg\+xml,([^"]*)"\)/.exec(objectLegend().find((l) => re.test(l.label))!.swatch)![1]);
    // (each as its top shows in the game's light, D135 as amended 2026-11-09: the ruins' colours the game's, the mine's
    // our own at `ownAlbedo`)
    const ruins = swatch(/^Ruins/);
    expect(ruins).toContain(cssColor(objectTop(RUIN.rust)));
    expect(ruins).toContain(cssColor(objectTop(RUIN.slab)));
    const mine = swatch(/^Mine site$/);
    for (const c of [MINE.pit, MINE.frame, MINE.wood]) expect(mine).toContain(cssColor(objectTop(ownAlbedo(c))));
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
