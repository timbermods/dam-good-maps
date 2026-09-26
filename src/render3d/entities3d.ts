// Map objects as instanced meshes (EDITOR_PLAN §8), with our own low-poly models (Map look, PLAN
// §20 D86, D110 and D114, shaped after Kyler's in-game reference screenshots; the game's assets are
// not ours to include, EDITOR_PLAN §2). One draw call per model, so tens of thousands of trees cost
// a few draw calls. Every model carries its own colours per vertex; the instance adds a slight tint
// so a grove is not one flat colour.
//
// - Trees by species: pine (tiers of dark cones), birch (a white trunk with dark marks and a light
//   crown), oak (a thick trunk and a broad crown), succulent (a rosette of fleshy leaves). Dead
//   trees are bare: a pale grey-brown trunk and bare branches at the tree's true size, far lighter
//   than the dark living crowns.
// - Berry bushes: dark green, dotted with blue flowers.
// - Ruins (Kyler's rounds, D178): ruined scaffold towers, one column per tile and one storey per
//   level of its height: a skeleton of thin rusty corner posts, a beam round every storey and
//   diagonal braces on some faces; beige slab panels on some storeys and faces, some missing, a few
//   tilted or broken; the top storey often only partly there. The five variants (A to E, the
//   file's own) differ in bracing and panels, each in two layouts that alternate up the column.
//   Where the column stands on moist ground, ivy drapes about the lower half of its storeys, the
//   most at its foot, thinning upward: flat leaf clusters clinging beside the posts and spreading
//   over the faces' lower parts, bright leaves on their edges, strands with leaves hanging from
//   the beams, the panels' middles showing through. A column is turned a quarter more than its
//   east neighbour and a half more than its north one, and no layout looks the same turned, so
//   neighbouring columns never look alike. From afar each storey is a solid block in the
//   scaffolding's rust, a pale panel set in where it has one, and a band of ivy low on the lower
//   storeys of a column on moist ground.
// - The start: a district center of our own, a lodge with pale walls, a dark roof and a yellow
//   banner on a pale deck, its door facing the entrance, and a lit post on the entrance tile.
// - Slopes: a stone ramp; with Markers, a level pale arrow rimmed dark floating just above it,
//   pointing uphill (it reads from any camera angle). Water sources: a stone ring round a spring;
//   badwater sources: a brown swirl in a dark pit. Mine sites (D178): a rusty frame round the edge
//   of the 5 × 5 footprint and a square pit filling the rest (the terrain leaves the footprint's
//   tops out, as the game hides the terrain under the site), with dark earthen walls and floor,
//   roots, rubble, cracks, a ladder and a shaft; scaffold towers on the frame's corners, joined
//   into one structure, with beams across the pit and a bucket on a rope. With Markers, an outline
//   round its footprint (the terrain shader). Geothermal fields: dark rock with glowing
//   vents. Relics: broken stone columns on a plinth. Thorns: dark brambles. Blockages and natural
//   dams: heaps of stones.
// - Every other template: a box on each block its footprint occupies.
// With Markers on (the information layer), dead trees, the slopes' arrows and the start have a
// minimum size on screen: from afar they grow (the object shader: dead trees up to 2.5 times, the
// start 3, the arrows 6) so they stay readable in a view of the whole map. The clean view draws
// every object at its true size. A model's parts can belong to the view from close up or from afar
// only (`lod`); the object shader draws each instance's parts for its size on screen.
// Every model stays within its footprint. Jitter, turn and tint come from each object's tile, so a
// redraw looks the same.

import { BoxGeometry, BufferGeometry, ConeGeometry, CylinderGeometry, Float32BufferAttribute, Group, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, OctahedronGeometry, PlaneGeometry, type ShaderMaterial } from "three";
import { FOOTPRINTS, rotate, startEntranceTile, worldBlocks, type Orientation } from "../core/format/footprints";
import { DEAD, FLIPPED, NO_VARIANT, ORIENTATION_NAMES, RUIN_VARIANT_IDS, YOUNG, type EntityView, type SoilView } from "./model";
import { GEOTHERMAL, GEOTHERMAL_ROCK, MINE, RELIC_STONE, RUIN, SLOPE, START, THORNS } from "./palette";

type Rgb = readonly [number, number, number];

// ------------------------------------------------------------------------------ model building

/** Which view a model's part is drawn in (the per-vertex `lod` the object shader reads): always,
 *  only close up, or only from afar (materials.ts `RUIN_NEAR_PX` sets where they meet). */
export const LOD_ALL = 0;
export const LOD_NEAR = 1;
export const LOD_FAR = 2;

/** A model under construction: flat-shaded triangles with a colour per vertex. */
class Model {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  lod: number[] = [];
  /** The view the parts added now belong to (LOD_ALL, LOD_NEAR or LOD_FAR). */
  level = LOD_ALL;

  /** Add a three.js geometry, transformed, in one colour (flat shaded). */
  add(g: BufferGeometry, color: Rgb, t: { x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number; sx?: number; sy?: number; sz?: number; lift?: number } = {}): this {
    // `lift` moves the part up before it turns (a leaf or branch turning about its base)
    if (t.lift) g.translate(0, t.lift, 0);
    if (t.sx !== undefined || t.sy !== undefined || t.sz !== undefined) g.scale(t.sx ?? 1, t.sy ?? 1, t.sz ?? 1);
    if (t.rx) g.rotateX(t.rx);
    if (t.rz) g.rotateZ(t.rz);
    if (t.ry) g.rotateY(t.ry);
    g.translate(t.x ?? 0, t.y ?? 0, t.z ?? 0);
    const flat = g.index ? g.toNonIndexed() : g;
    flat.computeVertexNormals();
    const p = flat.getAttribute("position");
    const n = flat.getAttribute("normal");
    for (let k = 0; k < p.count; k++) {
      this.pos.push(p.getX(k), p.getY(k), p.getZ(k));
      this.nrm.push(n.getX(k), n.getY(k), n.getZ(k));
      this.col.push(color[0], color[1], color[2]);
      this.lod.push(this.level);
    }
    if (flat !== g) flat.dispose();
    g.dispose();
    return this;
  }

  /** Triangles given directly (counter-clockwise seen from outside), in one colour. */
  tris(points: number[], color: Rgb): this {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(points, 3));
    return this.add(g, color);
  }

  geometry(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(this.pos, 3));
    g.setAttribute("normal", new Float32BufferAttribute(this.nrm, 3));
    g.setAttribute("pcolor", new Float32BufferAttribute(this.col, 3));
    g.setAttribute("lod", new Float32BufferAttribute(this.lod, 1));
    g.computeBoundingSphere();
    return g;
  }

  get triangles(): number {
    return this.pos.length / 9;
  }

  /** Triangles drawn in one view: close up (LOD_NEAR) or from afar (LOD_FAR). */
  trianglesIn(view: typeof LOD_NEAR | typeof LOD_FAR): number {
    let n = 0;
    for (let v = 0; v < this.lod.length; v += 3) if (this.lod[v] === LOD_ALL || this.lod[v] === view) n++;
    return n;
  }
}

const cone = (r: number, h: number, sides: number) => new ConeGeometry(r, h, sides, 1, true);
const cyl = (r0: number, r1: number, h: number, sides: number) => new CylinderGeometry(r1, r0, h, sides, 1, true);
/** A cylinder with its ends closed (a trunk seen from above). */
const post = (r0: number, r1: number, h: number, sides: number) => new CylinderGeometry(r1, r0, h, sides, 1, false);
const box = (x: number, y: number, z: number) => new BoxGeometry(x, y, z);
const ico = (r: number) => new IcosahedronGeometry(r, 0);
const oct = (r: number) => new OctahedronGeometry(r, 0);
/** A flat rectangle facing +Z (one side). */
const plane = (w: number, h: number) => new PlaneGeometry(w, h);
/** A thin bar along Y with a square section of half-width r, its sides facing the axes (open ends:
 *  8 triangles). */
const bar = (r: number, h: number) => new CylinderGeometry(r * Math.SQRT2, r * Math.SQRT2, h, 4, 1, true).rotateY(Math.PI / 4);

/** A bar from (x0, y0) to (x1, y1) in the plane z (a brace, a strut). */
function strut(m: Model, x0: number, y0: number, x1: number, y1: number, z: number, r: number, color: Rgb): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  m.add(bar(r, Math.hypot(dx, dy)), color, { rz: Math.atan2(-dx, dy), x: (x0 + x1) / 2, y: (y0 + y1) / 2, z });
}

/** Build parts on the north face (−Z) and turn them to face `f` (0 north, 1 east, 2 south,
 *  3 west). */
function onFace(m: Model, f: number, build: () => void): void {
  const before = m.pos.length / 3;
  build();
  if (f % 4) rotateTail(m, m.pos.length / 3 - before, (-f * Math.PI) / 2, 0);
}

const shade = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];

const BARK: Rgb = [0.36, 0.25, 0.16];
/** Bare dead wood: a pale grey-brown tan, far lighter than the living crowns; a dead birch stays
 *  white, a dead oak's thick trunk darker. */
const DEAD_WOOD: Rgb = [0.78, 0.69, 0.56];
const DEAD_DARK: Rgb = [0.7, 0.62, 0.5];
const DEAD_BIRCH: Rgb = [0.9, 0.88, 0.84];
const DEAD_BARK: Rgb = [0.6, 0.54, 0.45];

/** A bare branch from the trunk at height y, outward along `angle`, tilted up by `tilt`: a spike
 *  tapering to a point. */
function branch(m: Model, y: number, angle: number, tilt: number, length: number, r: number, color: Rgb): void {
  const before = m.pos.length / 3;
  m.add(cone(r, length, 4), color, { lift: length / 2, rz: -(Math.PI / 2 - tilt) });
  rotateTail(m, m.pos.length / 3 - before, angle, y);
}

/** Turn the last `vertices` vertices of a model about the Y axis by `angle`, then lift them by y. */
function rotateTail(m: Model, vertices: number, angle: number, y: number): void {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const from = m.pos.length - vertices * 3;
  for (let k = from; k < m.pos.length; k += 3) {
    const x = m.pos[k];
    const z = m.pos[k + 2];
    m.pos[k] = c * x + s * z;
    m.pos[k + 1] += y;
    m.pos[k + 2] = -s * x + c * z;
    const nx = m.nrm[k];
    const nz = m.nrm[k + 2];
    m.nrm[k] = c * nx + s * nz;
    m.nrm[k + 2] = -s * nx + c * nz;
  }
}

/** Move the last `vertices` vertices of a model by (x, z). */
function moveTail(m: Model, vertices: number, x: number, z: number): void {
  for (let k = m.pos.length - vertices * 3; k < m.pos.length; k += 3) {
    m.pos[k] += x;
    m.pos[k + 2] += z;
  }
}

const MODELS: Record<string, () => Model> = {
  Pine: () =>
    new Model()
      .add(cyl(0.07, 0.05, 0.45, 4), BARK, { y: 0.225 })
      .add(cone(0.38, 0.62, 6), [0.11, 0.28, 0.17], { y: 0.3 + 0.31 })
      .add(cone(0.3, 0.56, 6), [0.13, 0.32, 0.19], { y: 0.62 + 0.28, ry: 0.5 })
      .add(cone(0.2, 0.5, 6), [0.15, 0.36, 0.21], { y: 0.95 + 0.25, ry: 1.0 }),
  "Pine.dead": () => {
    // a tall bare pole, its top broken off askew, a few stubs of branches
    const m = new Model().add(post(0.075, 0.05, 1.25, 6), DEAD_WOOD, { y: 0.625 }).add(post(0.05, 0.03, 0.22, 5), DEAD_DARK, { x: 0.03, y: 1.33, rz: -0.35 });
    branch(m, 0.78, 1.0, 0.5, 0.13, 0.03, DEAD_DARK);
    branch(m, 1.02, 3.7, 0.55, 0.1, 0.025, DEAD_DARK);
    return m;
  },
  Birch: () =>
    new Model()
      .add(cyl(0.05, 0.04, 0.75, 4), [0.93, 0.91, 0.86], { y: 0.375 })
      .add(cyl(0.052, 0.05, 0.07, 4), [0.18, 0.16, 0.15], { y: 0.36 })
      .add(ico(0.31), [0.34, 0.52, 0.19], { y: 0.96, sy: 1.4 }),
  "Birch.dead": () => {
    // a white trunk forking into two bare arms, and a twig
    const m = new Model().add(post(0.06, 0.045, 0.5, 5), DEAD_BIRCH, { y: 0.25 });
    branch(m, 0.46, 0.3, 1.2, 0.55, 0.045, DEAD_BIRCH);
    branch(m, 0.46, 3.4, 1.15, 0.5, 0.04, DEAD_BIRCH);
    branch(m, 0.62, 1.9, 0.8, 0.2, 0.025, DEAD_WOOD);
    return m;
  },
  Oak: () =>
    new Model()
      .add(cyl(0.11, 0.08, 0.55, 4), [0.34, 0.23, 0.14], { y: 0.275 })
      .add(ico(0.44), [0.22, 0.42, 0.16], { y: 0.95, sy: 0.85 })
      .add(ico(0.28), [0.26, 0.47, 0.18], { x: 0.2, y: 0.8, z: 0.12 }),
  "Oak.dead": () => {
    // a thick bare trunk, its limbs broken off short, pale where they broke
    const m = new Model().add(post(0.15, 0.11, 0.62, 6), DEAD_BARK, { y: 0.31 }).add(new CylinderGeometry(0.1, 0.1, 0.02, 6), DEAD_WOOD, { y: 0.62 });
    for (let k = 0; k < 3; k++) branch(m, 0.56, 0.5 + (k * Math.PI * 2) / 3, 1.05, 0.26, 0.06, DEAD_WOOD);
    return m;
  },
  Succulent: () => {
    const m = new Model();
    for (let k = 0; k < 6; k++) m.add(cone(0.07, 0.42, 4), k % 2 ? [0.4, 0.6, 0.5] : [0.36, 0.55, 0.47], { lift: 0.21, rz: -0.6, ry: (k * Math.PI) / 3, y: 0.02 });
    m.add(cone(0.06, 0.5, 4), [0.44, 0.63, 0.52], { y: 0.25 });
    return m;
  },
  "Succulent.dead": () => {
    const m = new Model();
    for (let k = 0; k < 6; k++) m.add(cone(0.06, 0.36, 4), k % 2 ? [0.55, 0.48, 0.36] : [0.5, 0.43, 0.32], { lift: 0.18, rz: -1.15, ry: (k * Math.PI) / 3, y: 0.02 });
    return m;
  },
  BlueberryBush: () => {
    const m = new Model().add(ico(0.3), [0.14, 0.29, 0.14], { y: 0.2, sy: 0.72, sx: 1.1 });
    const flowers: [number, number, number][] = [[0.16, 0.3, 0.12], [-0.08, 0.36, 0.15], [0.05, 0.38, -0.15], [0.22, 0.18, -0.12]];
    for (const [x, y, z] of flowers) m.add(new OctahedronGeometry(0.065, 0), [0.46, 0.56, 1.0], { x, y, z });
    return m;
  },
  "BlueberryBush.dead": () => {
    // a pale clump of bare twigs
    const m = new Model();
    for (let k = 0; k < 5; k++) branch(m, 0.04, (k * Math.PI * 2) / 5, 0.7, 0.36, 0.04, k % 2 ? DEAD_DARK : DEAD_WOOD);
    return m;
  },
  Slope: () => {
    // a ramp over the tile, low on the north (−Z) edge and high on the south (+Z), as a Cw0
    // slope's high side is south (its arrows are "Slope.mark")
    const m = new Model();
    const h = 0.5;
    m.tris([-h, 0, -h, h, 1, h, h, 0, -h, -h, 0, -h, -h, 1, h, h, 1, h], SLOPE.ramp);
    m.tris([-h, 0, h, h, 0, h, h, 1, h, -h, 0, h, h, 1, h, -h, 1, h], SLOPE.side);
    m.tris([-h, 0, -h, -h, 0, h, -h, 1, h], SLOPE.side);
    m.tris([h, 0, -h, h, 1, h, h, 0, h], SLOPE.side);
    return m;
  },
  "Slope.mark": () => {
    // an arrow pointing uphill (+Z, the ramp's high side), flat and level so it reads from any
    // camera angle: pale, on a larger dark one (its rim); it floats just above the slope's top
    const m = new Model();
    const arrow = (tip: number, head: number, neck: number, shaft: number, tail: number, y: number, color: Rgb) => {
      const tris: [number, number][][] = [
        [[0, tip], [-head, neck], [head, neck]],
        [[-shaft, neck], [-shaft, tail], [shaft, tail]],
        [[-shaft, neck], [shaft, tail], [shaft, neck]],
      ];
      const pts: number[] = [];
      for (const [a, b, c] of tris) {
        // wound to face up
        const up = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]) > 0;
        for (const [x, z] of up ? [a, b, c] : [a, c, b]) pts.push(x, y, z);
      }
      m.tris(pts, color);
    };
    arrow(0.56, 0.44, -0.02, 0.2, -0.52, -0.02, SLOPE.rim);
    arrow(0.44, 0.33, 0.04, 0.11, -0.42, 0, SLOPE.arrow);
    return m;
  },
  WaterSource: () => new Model().add(cyl(0.38, 0.36, 0.14, 8), [0.47, 0.46, 0.44], { y: 0.07 }).add(new CylinderGeometry(0.3, 0.3, 0.16, 8), [0.32, 0.62, 0.95], { y: 0.08 }),
  BadwaterSource: () => {
    // a brown swirl in a dark pit, over its 3 × 3 footprint (centred on it)
    const m = new Model().add(cyl(1.3, 1.25, 0.12, 12), [0.2, 0.15, 0.13], { y: 0.06 }).add(new CylinderGeometry(1.15, 1.15, 0.05, 12), [0.26, 0.13, 0.1], { y: 0.03 });
    for (let k = 0; k < 4; k++) {
      // curved arms: short tilted slabs turning toward the middle
      for (let j = 0; j < 3; j++) {
        const a = (k * Math.PI) / 2 + j * 0.5;
        const r = 0.95 - j * 0.3;
        m.add(box(0.42 - j * 0.08, 0.04, 0.12), j % 2 ? [0.5, 0.3, 0.18] : [0.44, 0.24, 0.15], { x: Math.cos(a) * r, y: 0.08 + j * 0.01, z: -Math.sin(a) * r, ry: a + Math.PI / 2 + 0.5 });
      }
    }
    return m.add(cone(0.18, 0.12, 6), [0.16, 0.08, 0.06], { y: 0.12, rx: Math.PI });
  },
  UndergroundRuins: () => mineSite(),
  GeothermalField: () => {
    // a low mound of dark rock over its 3 × 3 footprint, cracked by vents glowing orange
    const m = new Model().add(cyl(1.45, 1.2, 0.22, 7), GEOTHERMAL_ROCK, { y: 0.11 }).add(new CylinderGeometry(1.2, 1.2, 0.02, 7), [0.22, 0.21, 0.2], { y: 0.22 });
    const rocks: [number, number, number, number][] = [[0.9, 0.5, 0.34, 0.2], [-0.8, 0.7, 0.3, 0.25], [-0.4, -0.95, 0.36, 0.2], [0.75, -0.8, 0.26, 0.2], [0.1, 0.2, 0.3, 0.35]];
    for (const [x, z, r, sy] of rocks) m.add(ico(r), [0.3, 0.29, 0.28], { x, y: 0.2, z, sy: sy / r });
    const vents: [number, number, number][] = [[-0.35, 0.2, 0.2], [0.45, -0.25, 0.16], [-0.1, -0.6, 0.13], [0.35, 0.65, 0.12]];
    for (const [x, z, r] of vents) {
      m.add(cyl(r * 1.5, r, 0.12, 6), [0.2, 0.19, 0.18], { x, y: 0.28, z });
      m.add(new CylinderGeometry(r, r, 0.02, 6), GLOW, { x, y: 0.33, z });
    }
    return m;
  },
  SmallRelic: () => relic(2, 1, [[-0.5, 0, 0.9], [0.5, 0, 0.45]], [], false),
  MediumRelic: () => relic(3, 2, [[-1, -0.5, 1.2], [0, -0.5, 0.5], [1, -0.5, 0.95], [-1, 0.5, 0.35], [1, 0.5, 1.4]], [[0.1, 0.45, 1.0]], false),
  LargeRelic: () => relic(3, 3, [[-1, -1, 1.9], [1, -1, 1.5], [-1, 1, 1.2], [1, 1, 0.7], [0, -1, 0.4]], [[0.2, 0.6, 1.3]], true),
  Thorns: () => {
    // a low, dark bramble with thorny canes sticking out
    const m = new Model().add(ico(0.34), THORNS, { y: 0.2, sy: 0.6 }).add(ico(0.24), [0.28, 0.14, 0.12], { x: 0.18, y: 0.3, z: -0.1, sy: 0.8 });
    for (let k = 0; k < 6; k++) branch(m, 0.14 + 0.06 * (k % 2), (k * Math.PI) / 3 + 0.3, 0.5 + 0.25 * (k % 3), 0.34, 0.035, k % 2 ? [0.4, 0.2, 0.16] : [0.25, 0.12, 0.1]);
    return m;
  },
};

// ------------------------------------------------------------------------------ mine sites

/** A mine site's pit: sunk into its whole 5 × 5 footprint (whose tops the terrain leaves out,
 *  `mineCutout`, as the game hides the terrain under the site), `half` tiles either side of the
 *  footprint's middle, inside the rusty frame round the footprint's edge, and `depth` levels deep. */
export const MINE_PIT = { half: 2.18, depth: 1.6 } as const;

/** A mine site, centred on its 5 × 5 footprint (Kyler's rounds, D178; our own model, true to the
 *  game's footprint): a rusty frame round the footprint's edge; inside it the pit, filling most of
 *  the footprint, with its dark earthen walls and floor, roots hanging and running over the floor,
 *  rubble, cracks, a ladder and a shaft in the middle; scaffold towers on the frame's corners, their
 *  inner legs down in the pit, joined by rails into one structure, with beams across the pit and a
 *  bucket on a rope. Within ±2.5 of the middle: the footprint. */
function mineSite(): Model {
  const m = new Model();
  const p = MINE_PIT.half;
  const d = MINE_PIT.depth;
  // the pit's walls: a band of browner topsoil under a rusty lip, earth with a pale seam, darker
  // toward the floor; the floor darker toward its edges, a shaft in its middle
  const soil = 0.38;
  const low = 0.34;
  for (let f = 0; f < 4; f++)
    onFace(m, f, () => {
      m.add(plane(2 * p, soil), MINE.earthTop, { y: -soil / 2, z: -p });
      m.add(plane(2 * p, d - soil - low), MINE.earth, { y: -soil - (d - soil - low) / 2, z: -p });
      m.add(plane(2 * p, low), MINE.earthLow, { y: -d + low / 2, z: -p });
      m.add(plane(2 * p, 0.05), MINE.seam, { y: -0.78 - 0.06 * (f % 2), z: -p + 0.006 });
      m.add(plane(2 * p, 0.2), shade(MINE.frame, 0.8), { y: -0.1, z: -p + 0.012 });
    });
  const floor = (w: number, color: Rgb, y: number) => m.add(plane(w, w), color, { rx: -Math.PI / 2, y: -d + y });
  floor(2 * p, MINE.floorEdge, 0);
  floor(2 * p - 1.1, MINE.floor, 0.004);
  floor(0.9, MINE.shaft, 0.012);
  for (let f = 0; f < 4; f++) onFace(m, f, () => m.add(box(1.1, 0.1, 0.1), MINE.ladder, { y: -d + 0.05, z: -0.5 }));
  // cracks down the walls and over the floor: dark zigzags
  const cracks: [number, number, number, number, number][] = [
    // face, x, top, length, lean
    [0, -1.2, -0.25, 0.9, 0.25],
    [0, 1.4, -0.5, 0.8, -0.3],
    [1, -0.4, -0.3, 1.0, 0.2],
    [1, 1.3, -0.55, 0.7, -0.2],
    [2, 0.6, -0.2, 0.7, -0.2],
    [2, -1.5, -0.45, 0.8, 0.25],
    [3, -1.3, -0.4, 0.9, 0.3],
    [3, 0.9, -0.6, 0.7, -0.25],
  ];
  for (const [f, x, top, len, lean] of cracks)
    onFace(m, f, () => {
      m.add(plane(0.05, len * 0.5), MINE.crack, { rz: lean, x, y: top - len * 0.25, z: -p + 0.01 });
      m.add(plane(0.04, len * 0.5), MINE.crack, { rz: -lean, x: x - Math.sin(lean) * len * 0.22, y: top - len * 0.72, z: -p + 0.01 });
    });
  for (const [x, z, len, turn] of [[-1.1, 0.8, 0.9, 0.6], [0.9, 1.1, 0.7, -0.5], [1.2, -0.9, 0.8, -0.9], [-0.9, -1.2, 0.6, 0.4]] as const) m.add(plane(len, 0.022), MINE.floorCrack, { rx: -Math.PI / 2, ry: turn, x, y: -d + 0.008, z });
  // roots: hanging from the rim down the walls, dark and pale, and running over the floor toward
  // the shaft
  const hanging: [number, number, number][] = [
    // x, length, tilt
    [-1.75, 0.9, 0.15],
    [-1.2, 0.55, -0.2],
    [-0.55, 1.05, 0.1],
    [0.1, 0.6, -0.15],
    [0.75, 0.95, 0.2],
    [1.4, 0.5, -0.1],
    [1.85, 0.8, 0.12],
  ];
  for (let f = 0; f < 4; f++)
    hanging.forEach(([x, len, tilt], k) => {
      if ((k + f) % 4 === 3) return;
      const l = len * (0.8 + 0.1 * ((k * 3 + f) % 4));
      onFace(m, f, () => m.add(cone(0.05, l, 3), (k + f) % 3 ? MINE.root : MINE.rootPale, { rx: Math.PI, rz: tilt, x: x * (f % 2 ? -1 : 1), y: -0.05 - l / 2, z: -p + 0.06 }));
    });
  for (let k = 0; k < 8; k++) {
    // a root over the floor, from a wall toward the shaft
    const a = (k * Math.PI) / 4 + 0.35;
    const r0 = 0.75;
    const r1 = p - 0.15;
    const len = r1 - r0;
    m.add(cone(0.035, len, 3), k % 2 ? MINE.root : MINE.rootPale, { rz: Math.PI / 2, ry: a, x: Math.cos(a) * (r0 + len / 2), y: -d + 0.03, z: -Math.sin(a) * (r0 + len / 2) });
  }
  // rubble along the walls and heaps in two corners
  const rubble: [number, number, number, number][] = [
    // x, z, radius, shade
    [-1.8, -1.75, 0.34, 0],
    [-1.35, -1.9, 0.24, 1],
    [-1.9, -1.25, 0.26, 2],
    [-1.45, -1.4, 0.18, 1],
    [-0.8, -1.95, 0.15, 2],
    [1.85, 0.7, 0.26, 0],
    [1.9, 1.25, 0.2, 2],
    [1.4, 1.85, 0.17, 1],
    [0.5, 1.9, 0.22, 1],
    [-0.6, 1.95, 0.16, 0],
    [1.5, -1.85, 0.18, 2],
    [-1.95, 0.4, 0.2, 1],
    [0.7, -0.75, 0.12, 2],
    [-0.6, 0.65, 0.1, 0],
  ];
  rubble.forEach(([x, z, r, s], k) => m.add(k % 2 ? oct(r) : ico(r), MINE.rubble[s], { x, y: -d + r * 0.4, z, sy: 0.6, ry: k }));
  // a ladder down the north wall (the far wall from the game's camera)
  const lx = -0.5;
  const lz = -p + 0.07;
  for (const sx of [-0.17, 0.17]) m.add(bar(0.025, d + 0.45), MINE.ladder, { x: lx + sx, y: (0.45 - d) / 2, z: lz });
  for (let k = 0; k < 6; k++) m.add(box(0.36, 0.035, 0.04), MINE.ladder, { x: lx, y: -d + 0.2 + k * 0.28, z: lz });
  // the rusty frame round the footprint's edge: four beams, a lighter strip along each
  const fw = 2.5 - p;
  for (let f = 0; f < 4; f++)
    onFace(m, f, () => {
      m.add(box(5, 0.2, fw), MINE.frame, { y: 0.05, z: -p - fw / 2 });
      m.add(box(5 - 0.12, 0.03, 0.06), shade(MINE.frame, 1.12), { y: 0.16, z: -2.5 + 0.06 });
    });
  // scaffold towers on the frame's corners, joined at the top by rails along the west and east
  // sides, which carry two beams across the pit: one structure; a crossbar and a bucket on a rope
  const h = 1.3;
  for (let k = 0; k < 4; k++) tower(m, k, h);
  for (const f of [1, 3]) onFace(m, f, () => m.add(box(4.9, 0.07, 0.07), shade(MINE.frame, 0.92), { y: h - 0.04, z: -2.43 }));
  for (const z of [-0.42, 0.42]) m.add(box(4.9, 0.09, 0.09), MINE.frame, { y: h - 0.02, z });
  m.add(box(0.12, 0.08, 0.95), shade(MINE.frame, 0.85), { y: h + 0.06 });
  const drop = h + 0.95;
  m.add(bar(0.012, drop), MINE.rope, { y: h - drop / 2 });
  m.add(post(0.12, 0.15, 0.22, 6), shade(MINE.frame, 0.7), { y: h - drop - 0.1 });
  // planks lying on the frame
  m.add(box(1.4, 0.05, 0.16), MINE.wood, { x: 0.2, y: 0.18, z: 2.34, ry: 0.03 });
  m.add(box(1.1, 0.05, 0.15), shade(MINE.wood, 0.9), { x: -2.34, y: 0.18, z: -0.3, ry: Math.PI / 2 + 0.04 });
  return m;
}

/** A scaffold tower on a corner of a mine site's frame (corner k: 0 north-east, 1 south-east, 2
 *  south-west, 3 north-west), `h` high: four rusty posts, the inner one standing down in the pit;
 *  a platform of pale planks with crates, overhanging the pit's corner; a rail and a brace on its
 *  outer faces. */
function tower(m: Model, k: number, h: number): void {
  const sx = k === 0 || k === 1 ? 1 : -1;
  const sz = k === 1 || k === 2 ? 1 : -1;
  const c = 2.02;
  const cx = sx * c;
  const cz = sz * c;
  const e = 0.41;
  const p = MINE_PIT.half;
  for (const [ax, az] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
    const x = cx + ax * e;
    const z = cz + az * e;
    // on the frame, or down in the pit
    const foot = Math.abs(x) >= p || Math.abs(z) >= p ? 0.15 : -MINE_PIT.depth;
    m.add(bar(0.04, h - foot), MINE.frame, { x, y: (h + foot) / 2, z });
  }
  m.add(box(0.9, 0.06, 0.9), MINE.wood, { x: cx, y: 0.95, z: cz });
  m.add(box(0.86, 0.02, 0.1), shade(MINE.wood, 0.8), { x: cx, y: 0.99, z: cz - sz * 0.22 });
  // a lower rail on the outer faces, and a brace on each
  m.add(box(2 * e + 0.08, 0.05, 0.05), shade(MINE.frame, 0.9), { x: cx, y: 0.5, z: cz + sz * e });
  m.add(box(0.05, 0.05, 2 * e + 0.08), shade(MINE.frame, 0.9), { x: cx + sx * e, y: 0.5, z: cz });
  strut(m, cx - e, 0.18, cx + e, 0.92, cz + sz * e, 0.022, shade(MINE.frame, 0.85));
  // (the second brace is built across x, then turned to run along z on the tower's outer x side)
  const before = m.pos.length / 3;
  strut(m, -e, 0.18, e, 0.92, 0, 0.022, shade(MINE.frame, 0.85));
  rotateTail(m, m.pos.length / 3 - before, Math.PI / 2, 0);
  moveTail(m, m.pos.length / 3 - before, cx + sx * e, cz);
  // crates on the platform, and a plank
  m.add(box(0.3, 0.28, 0.3), MINE.wood, { x: cx + sx * 0.14, y: 1.12, z: cz + sz * 0.12, ry: 0.2 * k });
  if (k % 2 === 0) m.add(box(0.22, 0.2, 0.22), shade(MINE.wood, 0.85), { x: cx - sx * 0.16, y: 1.08, z: cz + sz * 0.16, ry: -0.3 });
  else m.add(box(0.6, 0.04, 0.14), shade(MINE.wood, 0.92), { x: cx - sx * 0.05, y: 1.0, z: cz - sz * 0.05, ry: 0.5 });
}

/** Where the terrain leaves its tops out for mine sites' pits (mesh.ts `cutout`): tile index →
 *  the site's level, for every tile of each site's 5 × 5 footprint (the model covers them all:
 *  its frame the edge, its pit the rest). */
export function mineCutout(v: EntityView, W: number, H: number): Map<number, number> {
  const out = new Map<number, number>();
  for (let k = 0; k < v.count; k++) {
    if (v.templates[v.template[k]] !== "UndergroundRuins") continue;
    const o = ORIENTATION_NAMES[v.orientation[k]] as Orientation;
    for (let ly = 0; ly < 5; ly++)
      for (let lx = 0; lx < 5; lx++) {
        const [dx, dy] = rotate(o, lx, ly);
        const x = v.x[k] + dx;
        const y = v.y[k] + dy;
        if (x >= 0 && y >= 0 && x < W && y < H) out.set(y * W + x, v.z[k]);
      }
  }
  return out;
}

/** Where the outline round mine sites runs (**Markers**; the terrain shader), RGBA bytes (W × H),
 *  on the tiles just outside each 5 × 5 footprint (the footprint's own tops are the pit's): R bits
 *  1, 2, 4, 8 the tile's east, west, north and south edge, where it meets the footprint; G bits 1,
 *  2, 4, 8 its north-east, north-west, south-east and south-west corner, where only that corner
 *  meets the footprint (the outline turns round it). */
export function mineOutline(v: EntityView, W: number, H: number, into?: Uint8Array): Uint8Array {
  const out = into ?? new Uint8Array(W * H * 4);
  out.fill(0);
  for (let k = 0; k < v.count; k++) {
    if (v.templates[v.template[k]] !== "UndergroundRuins") continue;
    const o = ORIENTATION_NAMES[v.orientation[k]] as Orientation;
    const inside = new Set<number>();
    let x0 = Infinity;
    let y0 = Infinity;
    for (let ly = 0; ly < 5; ly++)
      for (let lx = 0; lx < 5; lx++) {
        const [dx, dy] = rotate(o, lx, ly);
        inside.add((v.y[k] + dy) * 4096 + v.x[k] + dx);
        x0 = Math.min(x0, v.x[k] + dx);
        y0 = Math.min(y0, v.y[k] + dy);
      }
    const at = (x: number, y: number) => inside.has(y * 4096 + x);
    for (let y = y0 - 1; y <= y0 + 5; y++)
      for (let x = x0 - 1; x <= x0 + 5; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H || at(x, y)) continue;
        const edges = (at(x + 1, y) ? 1 : 0) | (at(x - 1, y) ? 2 : 0) | (at(x, y + 1) ? 4 : 0) | (at(x, y - 1) ? 8 : 0);
        const corners = edges ? 0 : (at(x + 1, y + 1) ? 1 : 0) | (at(x - 1, y + 1) ? 2 : 0) | (at(x + 1, y - 1) ? 4 : 0) | (at(x - 1, y - 1) ? 8 : 0);
        out[(y * W + x) * 4] |= edges;
        out[(y * W + x) * 4 + 1] |= corners;
      }
  }
  return out;
}

/** A vent's glow: brighter than any lit colour, so it shines in shade too. */
const GLOW: Rgb = [GEOTHERMAL[0] * 1.3, GEOTHERMAL[1] * 1.3, GEOTHERMAL[2] * 1.3];

/** A relic over its sx × sy footprint (centred on it): a worn plinth, broken columns [x, z,
 *  height] and fallen drums [x, z, turn]; a large relic stands on a second step. */
function relic(sx: number, sy: number, columns: [number, number, number][], fallen: [number, number, number][], step: boolean): Model {
  const m = new Model().add(box(sx - 0.1, 0.16, sy - 0.1), [RELIC_STONE[0] * 0.8, RELIC_STONE[1] * 0.8, RELIC_STONE[2] * 0.8], { y: 0.08 });
  let base = 0.16;
  if (step) {
    m.add(box(sx - 0.6, 0.18, sy - 0.6), [RELIC_STONE[0] * 0.9, RELIC_STONE[1] * 0.9, RELIC_STONE[2] * 0.9], { y: base + 0.09 });
    base += 0.18;
  }
  const inset = step ? 0.65 : 0.8;
  for (const [x, z, h] of columns) {
    const px = x * inset;
    const pz = z * inset;
    m.add(cyl(0.2, 0.17, h, 6), RELIC_STONE, { x: px, y: base + h / 2, z: pz });
    // a broken top, tilted
    m.add(cyl(0.18, 0.14, 0.12, 6), [RELIC_STONE[0] * 1.08, RELIC_STONE[1] * 1.08, RELIC_STONE[2] * 1.08], { x: px + 0.02, y: base + h + 0.04, z: pz, rz: 0.35 });
  }
  for (const [x, z, turn] of fallen) m.add(cyl(0.17, 0.17, 0.7, 6), [RELIC_STONE[0] * 0.92, RELIC_STONE[1] * 0.92, RELIC_STONE[2] * 0.92], { rz: Math.PI / 2, ry: turn, x, y: base + 0.17, z });
  return m;
}

/** A heap of stones on a block (blockages and natural dams), tinted by its template. */
function rubble(): Model {
  const m = new Model();
  const stones: [number, number, number, number, number][] = [[-0.18, 0.2, -0.15, 0.32, 1], [0.22, 0.17, 0.12, 0.28, 0.86], [-0.05, 0.14, 0.26, 0.24, 0.78], [0.16, 0.44, -0.1, 0.22, 0.94], [-0.2, 0.42, 0.14, 0.2, 0.9]];
  for (const [x, y, z, r, shade] of stones) m.add(ico(r), [shade, shade, shade], { x, y, z, sy: 0.8 });
  return m;
}
const RUBBLE = new Set(["Blockage", "NaturalDam"]);

/** The light look's models, for browsers that render in software (a few triangles each; D110). */
const LITE_MODELS: Record<string, () => Model> = {
  Pine: () => new Model().add(cone(0.36, 1.25, 4), [0.13, 0.32, 0.19], { y: 0.2 + 0.625 }),
  Birch: () => new Model().add(cone(0.06, 0.8, 3), [0.93, 0.91, 0.86], { y: 0.4 }).add(new OctahedronGeometry(0.32, 0), [0.34, 0.52, 0.19], { y: 0.95, sy: 1.3 }),
  Oak: () => new Model().add(cone(0.11, 0.7, 3), [0.34, 0.23, 0.14], { y: 0.35 }).add(new OctahedronGeometry(0.44, 0), [0.24, 0.45, 0.17], { y: 0.92, sy: 0.85 }),
  // dead trees: a pale trunk and two bare branches (a few triangles each)
  "Pine.dead": () => liteDead(0.08, 1.35, 0.12, DEAD_WOOD),
  "Birch.dead": () => liteDead(0.07, 0.95, 0.4, DEAD_BIRCH),
  "Oak.dead": () => liteDead(0.14, 0.7, 0.26, DEAD_BARK),
  Succulent: () => new Model().add(cone(0.2, 0.5, 4), [0.4, 0.6, 0.5], { y: 0.25 }),
  BlueberryBush: () => new Model().add(new OctahedronGeometry(0.28, 0), [0.14, 0.29, 0.14], { y: 0.2, sy: 0.75 }),
};
/** The light look's ruin: a column one block per ruin, as it looks from afar (scaled to its height). */
const LITE_RUIN = () => {
  const m = new Model();
  farBlock(m, RUIN_LAYOUTS[0][0], 1);
  return m;
};

/** The light look's dead tree: a trunk and two bare branches. */
function liteDead(r: number, h: number, length: number, color: Rgb): Model {
  const m = new Model().add(cone(r, h, 3), color, { y: h / 2 });
  branch(m, h * 0.55, 0.6, 0.9, length, r * 0.6, DEAD_DARK);
  branch(m, h * 0.7, 3.5, 0.9, length * 0.8, r * 0.5, color);
  return m;
}

/** Templates whose model stands in the middle of a footprint: the local point it is centred on. */
const CENTRED: Record<string, [number, number]> = { BadwaterSource: [1, 1], UndergroundRuins: [2, 2], GeothermalField: [1, 1], SmallRelic: [0.5, 0], MediumRelic: [1, 0.5], LargeRelic: [1, 1] };

/** The district center, its door toward +Z (south, a Cw0 start's entrance side), centred on its
 *  3 × 3 footprint: pale walls under a dark roof on a pale deck, so it stands out on any ground. */
function districtCenter(): Model {
  const m = new Model();
  const wood: Rgb = [...START.walls];
  const roof: Rgb = [...START.roof];
  m.add(box(2.9, 0.2, 2.9), START.deck, { y: 0.1 });
  m.add(box(3.0, 0.06, 3.0), [0.22, 0.15, 0.1], { y: 0.03 });
  m.add(box(1.7, 0.9, 1.3), wood, { y: 0.65 });
  // log courses: darker bands on the walls
  for (const y of [0.42, 0.68, 0.94]) m.add(box(1.74, 0.05, 1.34), [0.66, 0.55, 0.4], { y });
  // an A-frame roof along x, overhanging the walls
  const x = 1.02;
  const z = 0.82;
  const y0 = 1.1;
  const y1 = 1.92;
  m.tris([-x, y0, z, x, y0, z, x, y1, 0, -x, y0, z, x, y1, 0, -x, y1, 0], roof);
  m.tris([x, y0, -z, -x, y0, -z, -x, y1, 0, x, y0, -z, -x, y1, 0, x, y1, 0], [roof[0] * 0.85, roof[1] * 0.85, roof[2] * 0.85]);
  m.tris([x, y0, z, x, y0, -z, x, y1, 0], wood);
  m.tris([-x, y0, -z, -x, y0, z, -x, y1, 0], wood);
  m.tris([-x, y0, z, -x, y0, -z, x, y0, -z, -x, y0, z, x, y0, -z, x, y0, z], [0.3, 0.2, 0.13]);
  m.add(box(0.22, 0.55, 0.22), [0.52, 0.51, 0.49], { x: 0.5, y: 1.75, z: -0.3 });
  // the door and its awning, facing the entrance
  m.add(box(0.38, 0.56, 0.06), [0.22, 0.14, 0.08], { y: 0.48, z: 0.66 });
  m.add(box(0.64, 0.06, 0.32), roof, { y: 0.84, z: 0.8, rx: 0.25 });
  // a tall banner at the back corner, seen from afar
  m.add(cyl(0.05, 0.04, 2.7, 5), [0.22, 0.16, 0.11], { x: -1.15, y: 0.2 + 1.35, z: -1.1 });
  m.add(box(0.8, 0.5, 0.05), START.banner, { x: -0.73, y: 2.55, z: -1.1 });
  m.add(box(0.8, 0.1, 0.055), [0.2, 0.08, 0.05], { x: -0.73, y: 2.33, z: -1.1 });
  return m;
}

/** The entrance tile's marker: a flat stone and a lit post. */
function entrance(): Model {
  return new Model()
    .add(box(0.62, 0.06, 0.62), [0.84, 0.78, 0.64], { y: 0.03 })
    .add(cyl(0.03, 0.03, 0.55, 4), [0.3, 0.22, 0.15], { x: 0.24, y: 0.3, z: 0.18 })
    .add(box(0.12, 0.12, 0.12), [1.0, 0.85, 0.42], { x: 0.24, y: 0.6, z: 0.18 });
}

// ------------------------------------------------------------------------------ ruins

/** A storey's braces and panels, face by face (0 north, 1 east, 2 south, 3 west). A brace rises
 *  to the right ("/") or to the left ("\"), seen from outside, or crosses ("X"). A panel fills the
 *  face ("full"), its lower or upper half, hangs askew ("tilt") or is broken ("broken"). */
type Brace = "/" | "\\" | "X";
type Panel = "full" | "low" | "high" | "tilt" | "broken";
interface Layout {
  braces: [number, Brace][];
  panels: [number, Panel][];
}

/** The five variants (A to E), two layouts each, alternating up a column: they differ in bracing
 *  and panels (Kyler's round, D178). No layout looks the same turned a quarter, a half or three
 *  quarters, nor like another layout of its variant turned, so two columns turned differently
 *  never look alike. */
export const RUIN_LAYOUTS: readonly (readonly [Layout, Layout])[] = [
  // A: an X-brace at the back, panels on two sides
  [
    { braces: [[0, "X"], [1, "/"]], panels: [[2, "full"], [3, "low"]] },
    { braces: [[0, "X"], [3, "\\"]], panels: [[1, "full"], [2, "broken"]] },
  ],
  // B: single braces on three faces, one panel
  [
    { braces: [[1, "/"], [2, "\\"], [3, "/"]], panels: [[0, "full"]] },
    { braces: [[0, "\\"], [1, "/"], [2, "/"]], panels: [[3, "high"]] },
  ],
  // C: well panelled, one X-brace
  [
    { braces: [[2, "X"]], panels: [[0, "full"], [1, "full"], [3, "tilt"]] },
    { braces: [[3, "X"]], panels: [[0, "full"], [2, "low"]] },
  ],
  // D: low and broken panels, long braces
  [
    { braces: [[0, "/"], [2, "/"]], panels: [[1, "low"], [3, "broken"]] },
    { braces: [[1, "\\"]], panels: [[0, "full"], [2, "full"], [3, "broken"]] },
  ],
  // E: heavily braced, hardly panelled
  [
    { braces: [[0, "X"], [1, "X"], [2, "X"]], panels: [[3, "tilt"]] },
    { braces: [[1, "X"], [3, "X"]], panels: [[0, "broken"]] },
  ],
];

/** A column's top storey is only partly there this often: its posts broken off at these heights
 *  (corners north-east, south-east, south-west, north-west), in one of two forms. */
export const RUIN_PARTIAL_TOP = 0.6;
const BROKEN_POSTS: readonly (readonly [number, number, number, number])[] = [
  [1, 0.62, 0.34, 0.86],
  [0.46, 1, 0.9, 0.3],
];

/** The corner posts' distance from the tile's middle. */
const RUIN_E = 0.4;

/** How much ivy a storey carries: none, a little (the highest ivy on a column), clearly (the
 *  storeys above the foot), or the most (the column's foot). */
export const IVY_NONE = 0;
export const IVY_LIGHT = 1;
export const IVY_MEDIUM = 2;
export const IVY_DENSE = 3;

/** A storey of a ruin column (variant 0–4, A–E; kind 0 or 1 its layouts, 2 or 3 a top storey only
 *  partly there, in the first or second layout's form), one level high, within its tile, with
 *  `ivy` (IVY_NONE to IVY_DENSE). Close up: the rusty skeleton, its braces and beige panels, and
 *  ivy draped over it (`drape`); from afar: a solid block in rust with its panels set in, and a
 *  band of ivy low on a column's lower storeys (`farBlock`). */
function storey(variant: number, kind: number, ivy: number): Model {
  const m = new Model();
  const layout = RUIN_LAYOUTS[variant][kind % 2];
  const partial = kind >= 2;
  const posts = partial ? BROKEN_POSTS[kind - 2] : [1, 1, 1, 1];
  const e = RUIN_E;
  const rust = RUIN.rust;
  const corners: [number, number][] = [[e, -e], [e, e], [-e, e], [-e, -e]];
  /** How high face f's skeleton stands: its lower corner post. */
  const faceTop = (f: number) => Math.min(posts[(f + 3) % 4], posts[f]);
  m.level = LOD_NEAR;
  // the corner posts, one a little darker
  corners.forEach(([x, z], k) => m.add(bar(0.034, posts[k]), k === variant % 4 ? shade(rust, 0.84) : rust, { x, y: posts[k] / 2, z }));
  for (let f = 0; f < 4; f++) {
    const top = faceTop(f);
    const braces = layout.braces.filter(([g]) => g === f).map(([, b]) => b);
    const panels = layout.panels.filter(([g]) => g === f).map(([, p]) => p);
    onFace(m, f, () => {
      // a beam round the top of the storey; where the posts broke, a lower rail if they reach it
      if (top >= 0.97) m.add(bar(0.028, 2 * e + 0.06), shade(rust, 0.92), { rz: Math.PI / 2, y: 0.965, z: -e });
      else if (top >= 0.55) m.add(bar(0.026, 2 * e + 0.06), shade(rust, 0.92), { rz: Math.PI / 2, y: 0.5, z: -e });
      for (const b of braces) {
        if (top >= 0.95) {
          if (b !== "\\") strut(m, -e, 0.05, e, 0.93, -e, 0.02, shade(rust, 0.95));
          if (b !== "/") strut(m, e, 0.05, -e, 0.93, -e, 0.02, shade(rust, 1.05));
        } else if (top >= 0.5) strut(m, -e, 0.05, 0.02, 0.48, -e, 0.02, shade(rust, 0.95));
      }
      const z = -e + 0.045;
      for (const [k, p] of panels.entries()) {
        const col = shade(RUIN.panel, 0.95 + 0.07 * ((f + k + variant) % 3) * 0.5);
        const hi = Math.min(0.9, top - 0.06);
        if (p === "full" && hi > 0.35) m.add(box(0.74, hi - 0.06, 0.03), col, { y: (hi + 0.06) / 2, z });
        else if (p === "low") m.add(box(0.74, 0.4, 0.03), col, { y: 0.25, z });
        else if (p === "high" && top >= 0.95) m.add(box(0.74, 0.42, 0.03), col, { y: 0.69, z });
        else if (p === "tilt" && top >= 0.7) m.add(box(0.7, 0.62, 0.03), col, { rz: 0.17, rx: -0.08, x: 0.03, y: 0.44, z: z - 0.01 });
        else if (p === "broken") {
          m.add(box(0.36, Math.min(0.84, hi - 0.06), 0.03), col, { x: -0.19, y: (Math.min(0.9, hi) + 0.06) / 2, z });
          m.add(box(0.34, 0.36, 0.03), shade(col, 0.93), { rz: -0.14, x: 0.2, y: 0.25, z });
        } else if (partial) {
          // a panel that fell from where the posts broke, leaning on the column's foot
          m.add(box(0.6, 0.66, 0.03), col, { rx: 0.35, y: 0.32, z: -e + 0.035 });
        }
      }
      if (ivy) drape(m, f, variant, ivy, top);
    });
  }
  // from afar: a solid block
  m.level = LOD_FAR;
  farBlock(m, layout, partial ? 0.72 : 1, ivy, variant);
  m.level = LOD_ALL;
  return m;
}

/** Ivy draped over a storey's north face (−Z; `onFace` turns it), as the game's clings: flat leaf
 *  clusters lying against the face, climbing beside the corner posts and spreading from them over
 *  the face's lower part, fewer higher up, and strands hanging from the beam with leaves along
 *  them. Most leaves #405634, those on a cluster's edge often the brighter green, so the ivy reads
 *  against the dark rust. The middle of the face stays clear above its lower part, so its panel
 *  shows. A column's foot (IVY_DENSE) is clad on every face, with four strands; a storey above it
 *  (IVY_MEDIUM) on three faces, a little on the fourth, with three strands; the highest ivy
 *  (IVY_LIGHT) a few clusters on two faces and two strands. `top`: how high the face's skeleton
 *  stands. */
function drape(m: Model, f: number, variant: number, ivy: number, top: number): void {
  const turn = (f + variant) % 4;
  /** How clad this face is: 2 fully, 1 a little, 0 not at all. */
  const clad = ivy === IVY_DENSE ? 2 : ivy === IVY_MEDIUM ? (turn === 1 ? 1 : 2) : turn >= 2 ? 1 : 0;
  if (!clad) return;
  const side = (f + variant) % 2 ? 1 : -1;
  const z = -RUIN_E - 0.04;
  const roof = Math.min(top, 1) - 0.16;
  /** A cluster of `n` diamond leaves round (x, y), spread over `r` (`tall` times that upward); the
   *  outer leaves often the brighter green. */
  const cluster = (x: number, y: number, n: number, r: number, seed: number, tall = 1.3) => {
    for (let k = 0; k < n; k++) {
      const a = seed * 1.7 + k * 2.4;
      const t = (k + 0.5) / n;
      const d = r * Math.sqrt(t);
      const ly0 = Math.max(0.16, Math.min(roof, y + Math.sin(a) * d * tall));
      // (larger low down; a leaf is a diamond, its half-width 0.72 of its side, kept in the tile)
      const size = (0.185 - 0.065 * ly0) * (0.88 + 0.24 * ((k + seed) % 2));
      const half = size * 0.72;
      const lx = Math.max(-0.49 + half, Math.min(0.49 - half, x + Math.cos(a) * d));
      const ly = Math.max(half + 0.01, Math.min(1 - half - 0.01, ly0));
      const edge = t > 0.5 && (k + seed + variant) % 2 === 0;
      m.add(plane(size, size), edge ? RUIN.leaf : RUIN.ivy, { rz: Math.PI / 4 + 0.35 * Math.sin(a * 3), rx: -0.2 + 0.08 * Math.sin(a * 5), ry: Math.PI, x: lx, y: ly, z: z - 0.003 * (k % 3) });
    }
  };
  const band = (x: number, counts: readonly number[], seed: number) =>
    counts.forEach((n, j) => {
      const y = 0.15 + j * 0.19;
      if (y <= roof) cluster(x, y, n, 0.075, seed + j);
    });
  const foot = ivy === IVY_DENSE;
  if (clad === 2) {
    // beside both posts, most beside one, and spreading from them over the face's lower part
    band(side * 0.32, foot ? [3, 2, 2, 1] : [3, 2, 1], f * 3);
    band(-side * 0.32, foot ? [2, 2, 1] : [2, 1], f * 3 + 7);
    cluster(0, foot ? 0.2 : 0.16, 3, 0.2, f * 5 + 1, 0.5);
  } else band(side * 0.32, ivy === IVY_LIGHT ? [2, 1] : [2, 2], f * 3);
  // strands hanging from the beam, with leaves along them
  const strands = foot ? 4 : ivy === IVY_MEDIUM ? 3 : 2;
  if (turn >= 2 && top >= 0.55) {
    const y = top >= 0.97 ? 0.94 : 0.48;
    const mine = Math.ceil(strands / 2) - (turn === 3 && strands % 2 ? 1 : 0);
    const xs = [-0.3, 0.28, -0.2, 0.2].slice(0, mine);
    xs.forEach((x, k) => {
      const len = Math.min(0.3 + 0.12 * ((k + f + variant) % 3), y * 0.72);
      m.add(cone(0.022, len, 3), RUIN.ivy, { rx: Math.PI, x, y: y - len / 2, z });
      for (let j = 1; j * 0.13 <= len; j++) m.add(plane(0.12, 0.12), j % 3 === 2 ? RUIN.leaf : RUIN.ivy, { rz: Math.PI / 4 + 0.3 * (j % 2 ? 1 : -1), ry: Math.PI, x: x + 0.025 * (j % 2 ? 1 : -1), y: Math.max(0.13, y - j * 0.13), z: z - 0.004 });
    });
  }
}

/** A storey from afar: a block over its tile in the rust of its scaffolding (what makes ruins
 *  read from afar, Kyler), a pale panel set into each face that has one, a band of ivy low on the
 *  faces (all four at a column's foot, two above it, none on the highest ivy; `variant` picks the
 *  two), and a rusty top. */
function farBlock(m: Model, layout: Layout, height: number, ivy = IVY_NONE, variant = 0): void {
  const w = 0.86;
  for (let f = 0; f < 4; f++) {
    const panels = layout.panels.filter(([g]) => g === f).map(([, p]) => p);
    onFace(m, f, () => {
      m.add(plane(w, height), RUIN.rust, { ry: Math.PI, y: height / 2, z: -w / 2 });
      if (panels.length) {
        // (a half or broken panel is smaller)
        const p = panels[0];
        const ph = (p === "low" || p === "high" ? 0.4 : 0.66) * height;
        const pw = p === "broken" ? 0.36 : 0.6;
        const py = p === "high" ? height * 0.7 : p === "low" ? height * 0.3 : height * 0.5;
        m.add(plane(pw, ph), RUIN.panel, { ry: Math.PI, x: p === "broken" ? 0.12 : 0, y: py, z: -w / 2 - 0.004 });
      }
      if (ivy === IVY_DENSE) m.add(plane(0.74, 0.42 * height), RUIN.leaf, { ry: Math.PI, y: 0.21 * height, z: -w / 2 - 0.008 });
      else if (ivy === IVY_MEDIUM && (f + variant) % 4 >= 2) m.add(plane(0.6, 0.3 * height), RUIN.leaf, { ry: Math.PI, y: 0.15 * height, z: -w / 2 - 0.008 });
    });
  }
  m.add(plane(w, w), RUIN.top, { rx: -Math.PI / 2, y: height });
}

/** A column's quarter turns: one more than its west neighbour and two more than its south one, so
 *  no two neighbouring columns (the eight round one) are turned alike. */
export function ruinTurn(x: number, y: number): number {
  return (((x + 2 * y) % 4) + 4) % 4;
}

/** The ivy on a storey (level `lv`) of a column `height` high standing on moist ground, over about
 *  the lower half of its storeys: the most at its foot, clearly on the storeys above it, a few
 *  clusters on the highest, none higher. A column 2 high: its foot clad, a little on the second; 4
 *  high: the lower two clearly green, the third a little. From 5 up the reach varies by a storey
 *  with the tile (the same map always looks the same). */
export function ruinIvy(x: number, y: number, height: number, lv: number): number {
  const reach = Math.min(height, Math.floor(height / 2) + 1 - (height >= 5 && jitter(x, y, 44) < 0.35 ? 1 : 0));
  if (lv === 0) return IVY_DENSE;
  if (lv >= reach) return IVY_NONE;
  return lv === reach - 1 ? IVY_LIGHT : IVY_MEDIUM;
}

/** A column's storeys as drawn: for each level, its variant (0–4) and kind (0 or 1: its layouts,
 *  alternating up the column from a phase of the tile's; 2 or 3: a top storey only partly there).
 *  A column with no variant in its file gets one from its tile. */
export function ruinStoreys(x: number, y: number, height: number, variant: number): { variant: number; kind: number }[] {
  const v = variant < RUIN_VARIANT_IDS.length ? variant : Math.floor(jitter(x, y, 40) * RUIN_VARIANT_IDS.length);
  const phase = jitter(x, y, 41) < 0.5 ? 0 : 1;
  const partialTop = jitter(x, y, 42) < RUIN_PARTIAL_TOP;
  const form = jitter(x, y, 43) < 0.5 ? 0 : 1;
  const out: { variant: number; kind: number }[] = [];
  for (let lv = 0; lv < height; lv++) out.push({ variant: v, kind: lv === height - 1 && partialTop ? 2 + ((form + lv + phase) % 2) : (lv + phase) % 2 });
  return out;
}

// ------------------------------------------------------------------------------ selection

/** The model an object is drawn with: its species and whether it is dead (tests read this). */
export function modelKeyOf(template: string, flags: number): string {
  if (/^RuinColumnH\d$/.test(template)) return "ruin";
  if (template === "StartingLocation") return "start";
  if (!(template in MODELS)) return "block";
  const dead = !!(flags & DEAD) && `${template}.dead` in MODELS;
  return dead ? `${template}.dead` : template;
}

/** Triangles of a model (tests and the benchmark's budget). */
export function modelTriangles(key: string): number {
  if (key === "start") return districtCenter().triangles;
  if (key === "ruin") return storey(0, 0, IVY_DENSE).triangles;
  return MODELS[key] ? MODELS[key]().triangles : 12;
}

/** Triangles a ruin storey draws close up and from afar (the worst of its variants and kinds, with
 *  the most ivy). */
export function ruinTriangles(): { near: number; far: number } {
  let near = 0;
  let far = 0;
  for (let v = 0; v < RUIN_LAYOUTS.length; v++)
    for (let kind = 0; kind < 4; kind++) {
      const m = storey(v, kind, IVY_DENSE);
      near = Math.max(near, m.trianglesIn(LOD_NEAR));
      far = Math.max(far, m.trianglesIn(LOD_FAR));
    }
  return { near, far };
}

/** A model's vertices, colours and view levels (the tests read the models' shapes). */
export function modelOf(key: string, kind = 0, ivy: number | boolean = IVY_NONE): { pos: readonly number[]; col: readonly number[]; lod: readonly number[] } {
  const level = ivy === true ? IVY_DENSE : ivy === false ? IVY_NONE : ivy;
  const m = key === "start" ? districtCenter() : /^scaffold\.[A-E]$/.test(key) ? storey(RUIN_VARIANT_IDS.indexOf(key.slice(-1) as "A"), kind, level) : MODELS[key]();
  return { pos: m.pos, col: m.col, lod: m.lod };
}

const PLANTS = new Set(["Pine", "Birch", "Oak", "Succulent", "BlueberryBush"]);

const GENERIC_COLORS: [RegExp, Rgb][] = [
  [/Relic/, [0.79, 0.65, 0.29]],
  [/Blockage/, [0.52, 0.51, 0.49]],
  [/NaturalDam/, [0.54, 0.42, 0.27]],
  [/Thorns/, [0.48, 0.18, 0.18]],
  [/Geothermal/, [...GEOTHERMAL]],
  [/Overhang/, [0.62, 0.53, 0.42]],
  [/UnstableCore/, [0.69, 0.29, 0.75]],
  [/Badtide|Badwater/, [0.42, 0.29, 0.16]],
  [/Aquifer|Seep/, [0.23, 0.42, 0.69]],
  [/Reserve/, [0.63, 0.48, 0.29]],
];

function genericColor(template: string): Rgb {
  for (const [re, c] of GENERIC_COLORS) if (re.test(template)) return c;
  return [0.56, 0.56, 0.56];
}

/** Where a plant stands in its tile and its size (the captures' listing reads it): the offset
 *  from the tile's middle (x east, y north) and the scale. */
export function plantPlacement(x: number, y: number, flags: number): { dx: number; dy: number; scale: number } {
  const dead = !!(flags & DEAD);
  return { dx: (jitter(x, y, 2) - 0.5) * 0.3, dy: -(jitter(x, y, 3) - 0.5) * 0.3, scale: (flags & YOUNG ? 0.5 : 0.85 + 0.3 * jitter(x, y, 1)) * (dead ? 0.95 : 1) };
}

/** A per-tile hash in [0, 1): jitter that stays the same between redraws. */
function jitter(x: number, y: number, k: number): number {
  let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

interface Batch {
  model: () => Model;
  matrices: number[];
  tints: number[];
  /** Per instance: the object it draws, when it stands on its tile's ground and follows it as the
   *  ground is painted (plants and ruins), or -1. */
  follows: number[];
  /** Per instance: the object it draws (a placed object's pop and wiggle, D205). */
  objects: number[];
  /** Per instance: its minimum size (pixels a unit of the model takes at least, 0 for none), how
   *  far it rises for each time it grows, and the most it grows (the object shader's `grow`). */
  grows: number[];
}

type Grow = readonly [number, number, number];
/** Minimum sizes on screen: pixels per unit of the model, the rise per growth, the most growth. */
const NO_GROW: Grow = [0, 0, 1];
const GROW_DEAD: Grow = [14, 0, 2.5];
const GROW_SLOPE_MARK: Grow = [25, 0.7, 6];
/** How high a slope's arrow floats over the slope's foot: just above its top. */
export const SLOPE_ARROW_HEIGHT = 1.06;
const GROW_START: Grow = [14, 0, 3];
const TREES = new Set(["Pine", "Birch", "Oak"]);

/** Build the objects of a map view as a group of instanced meshes; with the soil (and the map's
 *  width), ruins on moist ground are overgrown. `lite`: the light look's models (software
 *  rendering). */
export function buildEntities(v: EntityView, material: ShaderMaterial, soil: SoilView | null = null, W = 0, lite = false): { group: Group; instances: number } {
  const batches = new Map<string, Batch>();
  const batch = (key: string, model: () => Model): Batch => {
    let b = batches.get(key);
    if (!b) {
      b = { model, matrices: [], tints: [], grows: [], follows: [], objects: [] };
      batches.set(key, b);
    }
    return b;
  };
  /** The object whose instances follow its ground (see Batch.follows), or -1. */
  let follow = -1;
  /** The object being drawn. */
  let object = -1;
  /** An instance: turned by `angle` about the vertical, scaled by s, at (px, py, pz). */
  const put = (b: Batch, px: number, py: number, pz: number, angle: number, s: number, tint: Rgb | number = 1, sy = s, grow: Grow = NO_GROW) => {
    b.follows.push(follow);
    b.objects.push(object);
    const c = Math.cos(angle);
    const n = Math.sin(angle);
    b.matrices.push(c * s, 0, -n * s, 0, 0, sy, 0, 0, n * s, 0, c * s, 0, px, py, pz, 1);
    if (typeof tint === "number") b.tints.push(tint, tint, tint);
    else b.tints.push(tint[0], tint[1], tint[2]);
    b.grows.push(grow[0], grow[1], grow[2]);
  };
  let instances = 0;
  for (let k = 0; k < v.count; k++) {
    const template = v.templates[v.template[k]];
    const x = v.x[k];
    const y = v.y[k];
    const z = v.z[k];
    const turn = (-Math.PI / 2) * v.orientation[k];
    const flags = v.flags[k];
    const key = modelKeyOf(template, flags);
    instances++;
    follow = key === "ruin" || PLANTS.has(template) ? k : -1;
    object = k;
    if (key === "ruin" && lite) {
      put(batch("ruin.lite", LITE_RUIN), x + 0.5, z, -(y + 0.5), 0, 1, 1, Number(template.slice(-1)));
      continue;
    }
    if (key === "ruin") {
      // a storey per level, turned as the column is (`ruinTurn`); where the column stands on moist
      // ground (the soil the ground's colour shows), ivy over about half its storeys (`ruinIvy`)
      const n = Number(template.slice(-1));
      const moist = !!soil && W > 0 && x >= 0 && y >= 0 && y * W + x < soil.moisture.length && soil.moisture[y * W + x] > 0;
      const angle = ruinTurn(x, y) * (Math.PI / 2);
      ruinStoreys(x, y, n, v.variant?.[k] ?? NO_VARIANT).forEach(({ variant, kind }, lv) => {
        const green = moist ? ruinIvy(x, y, n, lv) : IVY_NONE;
        const b = batch(`scaffold.${RUIN_VARIANT_IDS[variant]}${kind}${["", ".ivy.light", ".ivy.medium", ".ivy"][green]}`, () => storey(variant, kind, green));
        put(b, x + 0.5, z + lv, -(y + 0.5), angle, 1, 0.93 + 0.12 * jitter(x, y, 20 + lv));
      });
      continue;
    }
    if (key === "start") {
      const o = ORIENTATION_NAMES[v.orientation[k]] as Orientation;
      // the 3×3 footprint's centre: Coordinates plus the rotated local (1, 1)
      const [dx, dy] = rotate(o, 1, 1);
      put(batch("start", districtCenter), x + dx + 0.5, z, -(y + dy + 0.5), turn, 1, 1, 1, GROW_START);
      const [ex, ey] = startEntranceTile(x, y, o);
      put(batch("start.entrance", entrance), ex + 0.5, z, -(ey + 0.5), turn, 1);
      continue;
    }
    if (key === "block") {
      const fp = FOOTPRINTS[template];
      const color = genericColor(template);
      const b = RUBBLE.has(template) ? batch("block.rubble", rubble) : batch("block", () => new Model().add(box(0.92, 0.92, 0.92), [1, 1, 1], { y: 0.46 }));
      const o = ORIENTATION_NAMES[v.orientation[k]] as Orientation;
      if (fp) for (const bl of worldBlocks(fp, { template, x, y, z, orientation: o, flipped: !!(flags & FLIPPED) })) put(b, bl.x + 0.5, bl.z, -(bl.y + 0.5), 0, 1, color);
      else put(b, x + 0.5, z, -(y + 0.5), 0, 1, color);
      continue;
    }
    const b = lite && LITE_MODELS[key] ? batch(`${key}.lite`, LITE_MODELS[key]) : batch(key, MODELS[key]);
    const centre = CENTRED[template];
    if (centre) {
      const o = ORIENTATION_NAMES[v.orientation[k]] as Orientation;
      const [dx, dy] = rotate(o, centre[0], centre[1]);
      put(b, x + dx + 0.5, z, -(y + dy + 0.5), turn, 1);
      continue;
    }
    if (PLANTS.has(template)) {
      const dead = !!(flags & DEAD);
      const s = (flags & YOUNG ? 0.5 : 0.85 + 0.3 * jitter(x, y, 1)) * (dead ? 0.95 : 1);
      const tint = dead ? 0.94 + 0.08 * jitter(x, y, 5) : 0.9 + 0.2 * jitter(x, y, 5);
      put(b, x + 0.5 + (jitter(x, y, 2) - 0.5) * 0.3, z, -(y + 0.5) + (jitter(x, y, 3) - 0.5) * 0.3, jitter(x, y, 4) * Math.PI * 2, s, tint, s, dead && TREES.has(template) ? GROW_DEAD : NO_GROW);
    } else put(b, x + 0.5, z, -(y + 0.5), turn, 1);
    // a slope's arrow, level, just above the slope's top
    if (template === "Slope") put(batch("Slope.mark", MODELS["Slope.mark"]), x + 0.5, z + SLOPE_ARROW_HEIGHT, -(y + 0.5), turn, 1, 1, 1, GROW_SLOPE_MARK);
  }
  const group = new Group();
  for (const [key, b] of batches) {
    const n = b.tints.length / 3;
    if (!n) continue;
    // the light look bakes every instance into one mesh drawn once: software rendering pays for
    // each instance it draws, not for each triangle
    const mesh = lite ? new InstancedMesh(baked(b.model(), b.matrices, b.tints), material, 1) : new InstancedMesh(b.model().geometry(), material, n);
    mesh.name = key;
    if (lite) {
      mesh.instanceMatrix.array.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      mesh.instanceColor = new InstancedBufferAttribute(new Float32Array([1, 1, 1]), 3);
      mesh.geometry.setAttribute("grow", new InstancedBufferAttribute(new Float32Array([0, 0, 1]), 3));
    } else {
      mesh.instanceMatrix.array.set(b.matrices);
      mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(b.tints), 3);
      mesh.geometry.setAttribute("grow", new InstancedBufferAttribute(new Float32Array(b.grows), 3));
      mesh.userData.objects = Int32Array.from(b.objects);
      // what follows the ground as it is painted: each instance's object, and its height as built
      if (b.follows.some((k) => k >= 0)) {
        mesh.userData.follows = Int32Array.from(b.follows);
        mesh.userData.ty0 = Float32Array.from({ length: n }, (_, i) => b.matrices[i * 16 + 13]);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.computeBoundingSphere();
    group.add(mesh);
  }
  return { group, instances };
}

/** Every instance of a model in one geometry: positions and normals through each instance's
 *  matrix, colours times its tint (the light look, which draws a model's parts for close up: it
 *  never draws the parts for afar). */
function baked(full: Model, matrices: number[], tints: number[]): BufferGeometry {
  const model = new Model();
  for (let v = 0; v < full.lod.length; v++) {
    if (full.lod[v] === LOD_FAR) continue;
    model.pos.push(full.pos[v * 3], full.pos[v * 3 + 1], full.pos[v * 3 + 2]);
    model.nrm.push(full.nrm[v * 3], full.nrm[v * 3 + 1], full.nrm[v * 3 + 2]);
    model.col.push(full.col[v * 3], full.col[v * 3 + 1], full.col[v * 3 + 2]);
  }
  const n = tints.length / 3;
  const V = model.pos.length / 3;
  const pos = new Float32Array(n * V * 3);
  const nrm = new Float32Array(n * V * 3);
  const col = new Float32Array(n * V * 3);
  for (let k = 0; k < n; k++) {
    const e = matrices.slice(k * 16, k * 16 + 16);
    for (let v = 0; v < V; v++) {
      const x = model.pos[v * 3];
      const y = model.pos[v * 3 + 1];
      const z = model.pos[v * 3 + 2];
      const o = (k * V + v) * 3;
      pos[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
      pos[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      pos[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      const nx = model.nrm[v * 3];
      const ny = model.nrm[v * 3 + 1];
      const nz = model.nrm[v * 3 + 2];
      nrm[o] = e[0] * nx + e[4] * ny + e[8] * nz;
      nrm[o + 1] = e[1] * nx + e[5] * ny + e[9] * nz;
      nrm[o + 2] = e[2] * nx + e[6] * ny + e[10] * nz;
      for (let c = 0; c < 3; c++) col[o + c] = model.col[v * 3 + c] * tints[k * 3 + c];
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new Float32BufferAttribute(nrm, 3));
  g.setAttribute("pcolor", new Float32BufferAttribute(col, 3));
  g.setAttribute("lod", new Float32BufferAttribute(new Float32Array(n * V), 1));
  g.computeBoundingSphere();
  return g;
}

export function disposeGroup(g: Group): void {
  for (const c of g.children) {
    const mesh = c as InstancedMesh;
    mesh.geometry.dispose();
    mesh.dispose();
  }
  g.clear();
}
