// Map objects as instanced meshes (EDITOR_PLAN §8), with our own low-poly models (Map look, PLAN
// §20 D86, D110 and D114, shaped after Kyler's in-game reference screenshots; the game's assets are
// not ours to include, EDITOR_PLAN §2). One draw call per model, so tens of thousands of trees cost
// a few draw calls. Every model carries its own colours per vertex; the instance adds a slight tint
// so a grove is not one flat colour.
//
// - Trees by species: pine (tiers of dark cones), birch (a white trunk with dark marks and a light
//   crown), oak (a thick trunk and a broad crown), succulent (a fat brown pinecone-like trunk ringed by round sage paddles on its
//   upper half, and a young plant beside it). Dead trees are bare: a pale grey-brown trunk and bare branches at the tree's true size, far lighter
//   than the dark living crowns.
// - Berry bushes: dark green, dotted with blue flowers.
// - Ruins (Kyler's rounds, D178): ruined scaffold towers, one column per tile and one storey per
//   level of its height: a skeleton of thin orange corner posts, a beam round every storey and
//   diagonal braces on some faces (D334's bright orange); cream sacks hanging in some storeys and
//   faces, some askew, a few flat boards broken; the top storey often only partly there. The five variants (A to E, the
//   file's own) differ in bracing and panels, each in two layouts that alternate up the column.
//   Where the column stands on moist ground, ivy drapes about the lower half of its storeys, the
//   most at its foot, thinning upward: flat leaf clusters clinging beside the posts and spreading
//   over the faces' lower parts, bright leaves on their edges, strands with leaves hanging from
//   the beams, the sacks' middles showing through. A column is turned a quarter more than its
//   east neighbour and a half more than its north one, and no layout looks the same turned, so
//   neighbouring columns never look alike. From afar each storey is a solid block in the
//   scaffolding's orange, a cream panel set in where it has one, and a band of ivy low on the lower
//   storeys of a column on moist ground.
// - The start: a district center of our own, a lodge with pale walls, a dark roof and a yellow
//   banner on a pale deck, its door facing the entrance, and a lit post on the entrance tile.
// - Slopes: a stone ramp; with Markers, a level pale arrow rimmed dark floating just above it,
//   pointing uphill (it reads from any camera angle). Water sources: a stone basin with water welling up;
//   badwater sources: a dark stone basin, 3 × 3, with badwater boiling up (D324). Mine sites (D178): a rusty frame round the edge
//   of the 5 × 5 footprint and a square pit filling the rest (the terrain leaves the footprint's
//   tops out, as the game hides the terrain under the site), with dark earthen walls and floor,
//   roots, rubble, cracks, a ladder and a shaft; scaffold towers on the frame's corners, joined
//   into one structure, with beams across the pit and a bucket on a rope. With Markers, an outline
//   round its footprint (the terrain shader). Geothermal fields: dark rock with glowing
//   vents. Relics: broken stone columns on a plinth. Thorns: dark brambles. Blockages and natural
//   dams: heaps of stones. Timberborn 1.x objects, each shaped after the game's own render and in its game
//   footprint: seeps (a stepped square pit sunk into the ground, the terrain's tops over its 2 × 2
//   cut out like a mine site's, with rocks on its floor, grey under blue water or rust-crusted for
//   badwater), the aquifer (a dry, dark rubble cross with a hole), its drill (a tall, narrow
//   yellow-and-black auger tower on a stone footing, a dark housing and a pipe), the badtide drain (a
//   rusty grated box, its open end out over the drop), the unstable core (a small dark segmented dome
//   with a red eye, half sunk on a soft orange scorch mark), and the reserves (a pile: a log pen with a
//   sign; a warehouse: a low layer of small crates in a plank yard with rope posts; a tank: a wooden
//   barrel on legs with a pump).
// - Every other template: a box on each block its footprint occupies.
// With Markers on (the information layer), dead trees, the slopes' arrows and the start have a
// minimum size on screen: from afar they grow (the object shader: dead trees up to 2.5 times, the
// start 3, the arrows 6) so they stay readable in a view of the whole map. The clean view draws
// every object at its true size. A model's parts can belong to the view from close up or from afar
// only (`lod`); the object shader draws each instance's parts for its size on screen.
// Every model stays within its footprint. Jitter, turn and tint come from each object's tile, so a
// redraw looks the same.

import { EntityGeometryCache } from "./entityGeometry";
import { BoxGeometry, BufferGeometry, ConeGeometry, CylinderGeometry, Float32BufferAttribute, Group, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, OctahedronGeometry, PlaneGeometry, Quaternion, Vector3, type ShaderMaterial } from "three";
import { FOOTPRINTS, rotate, startEntranceTile, worldBlocks, type Orientation } from "../core/format/footprints";
import { DEAD, FLIPPED, NO_VARIANT, ORIENTATION_NAMES, RUIN_VARIANT_IDS, YOUNG, type EntityView, type SoilView } from "./model";
import { GEOTHERMAL, GEOTHERMAL_ROCK, MINE, RELIC_STONE, RUIN, SLOPE, START, THORNS, WATER } from "./palette";
import { objectSoilAt } from "./runSoil";

type Rgb = readonly [number, number, number];

// ------------------------------------------------------------------------------ model building

/** Which view a model's part is drawn in (the per-vertex `lod` the object shader reads): always,
 *  only close up, or only from afar (materials.ts `RUIN_NEAR_PX` sets where they meet), solid or as
 *  a lattice (`LOD_FAR_FRAME`, a far ruin block's frame: materials.ts `RUIN_LATTICE_SCALE`). */
export const LOD_ALL = 0;
export const LOD_NEAR = 1;
export const LOD_FAR = 2;
export const LOD_FAR_FRAME = 3;

/** A model under construction: flat-shaded triangles with a colour per vertex. */
class Model {
  pos: number[] = [];
  nrm: number[] = [];
  col: number[] = [];
  lod: number[] = [];
  /** The view the parts added now belong to (LOD_ALL, LOD_NEAR, LOD_FAR or LOD_FAR_FRAME). */
  level = LOD_ALL;

  /** Add a three.js geometry, transformed, in one colour or with a colour for each vertex (a function of
   *  the vertex's place in the geometry before it is moved; flat shaded). */
  add(g: BufferGeometry, color: Rgb | ((x: number, y: number, z: number) => Rgb), t: { x?: number; y?: number; z?: number; rx?: number; ry?: number; rz?: number; sx?: number; sy?: number; sz?: number; lift?: number } = {}): this {
    // a colour per vertex: `color` given the vertex's place in the geometry before it is moved
    let per: Rgb[] | null = null;
    if (typeof color === "function") {
      const src = g.index ? g.toNonIndexed() : g;
      const pp = src.getAttribute("position");
      per = [];
      for (let k = 0; k < pp.count; k++) per.push(color(pp.getX(k), pp.getY(k), pp.getZ(k)));
      if (src !== g) src.dispose();
    }
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
      const c = per ? per[k] : (color as Rgb);
      this.col.push(c[0], c[1], c[2]);
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

  /** Triangles drawn in one view: close up (LOD_NEAR) or from afar (LOD_FAR, its frame's included). */
  trianglesIn(view: typeof LOD_NEAR | typeof LOD_FAR): number {
    let n = 0;
    for (let v = 0; v < this.lod.length; v += 3) if (this.lod[v] === LOD_ALL || (view === LOD_FAR ? this.lod[v] >= LOD_FAR : this.lod[v] === view)) n++;
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

/** A sack hanging in a ruin's face (D334, the game's cream sacks; replaces a flat panel), `w` wide
 *  and `h` tall, centred on the origin with its rim in the plane z = 0 and its front a shallow
 *  pouch bulging `bulge` toward −Z (the outside): a few broad facets round a soft horizontal seam
 *  (the ridge between its two lumps), its upper edge pinched in the middle where it is tied, its
 *  corners gathered, its bottom sagging a little. `lump` (0 or 1) shifts which lump is fuller, so
 *  neighbouring sacks differ. Twelve triangles, as the slab it replaces: 8 facets in front, a nearly
 *  flat back of 4 seen from inside the scaffold. (Its far form stays a flat cream panel, `farBlock`.) */
function sack(w: number, h: number, bulge: number, lump: number): BufferGeometry {
  const s = lump ? -1 : 1;
  const tl = [-0.46 * w, 0.5 * h, 0];
  const t = [0.04 * s * w, 0.34 * h, -0.3 * bulge];
  const tr = [0.46 * w, 0.5 * h, 0];
  const br = [0.5 * w, -0.44 * h, 0];
  const b = [-0.03 * s * w, -0.5 * h, -0.25 * bulge];
  const bl = [-0.5 * w, -0.44 * h, 0];
  const cl = [-0.24 * w, 0.03 * s * h, -bulge * (s > 0 ? 1 : 0.86)];
  const cr = [0.25 * w, -0.03 * s * h, -bulge * (s > 0 ? 0.86 : 1)];
  const front = [[tl, bl, cl], [tl, cl, t], [t, cl, cr], [t, cr, tr], [tr, cr, br], [br, cr, b], [b, cr, cl], [b, cl, bl]];
  // (a fan from the tied middle of its upper edge, the outline's one inward corner)
  const back = [[t, tr, br], [t, br, b], [t, b, bl], [t, bl, tl]];
  const out: number[] = [];
  /** A triangle wound so its face points toward −Z (front) or +Z (back). */
  const put = ([p, q, r]: number[][], toward: number) => {
    const n = (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    out.push(...p, ...(n * toward > 0 ? q : r), ...(n * toward > 0 ? r : q));
  };
  for (const tri of front) put(tri, -1);
  for (const tri of back) put(tri, 1);
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(out, 3));
  return g;
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
  Succulent: () => succulent(false),
  "Succulent.dead": () => succulent(true),
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
  WaterSource: () => {
    // a stone basin with water welling up (D324, feedback item 28; a model of our own, in the game's
    // style): four blocks round a pool, corner stones, the water domed in the middle over a small
    // spout, and rings spreading from it
    const stone: Rgb = [0.5, 0.52, 0.52];
    const dark: Rgb = [0.34, 0.36, 0.37];
    const m = new Model().add(box(0.98, 0.1, 0.98), dark, { y: 0.05 });
    for (const s of [-1, 1]) {
      m.add(box(0.98, 0.18, 0.2), stone, { y: 0.19, z: s * 0.39 });
      m.add(box(0.2, 0.18, 0.58), stone, { y: 0.19, x: s * 0.39 });
      for (const c of [-1, 1]) m.add(box(0.27, 0.27, 0.27), [0.56, 0.58, 0.57], { x: c * 0.36, y: 0.235, z: s * 0.36, ry: 0.15 * c * s });
    }
    m.add(box(0.58, 0.04, 0.58), [0.2, 0.5, 0.58], { y: 0.16 });
    m.add(new CylinderGeometry(0.25, 0.25, 0.012, 12), [0.78, 0.9, 0.92], { y: 0.182 });
    m.add(new CylinderGeometry(0.2, 0.2, 0.012, 12), [0.24, 0.56, 0.64], { y: 0.19 });
    m.add(ico(0.17), [0.34, 0.68, 0.75], { y: 0.2, sy: 0.6 });
    return m.add(new CylinderGeometry(0.04, 0.05, 0.14, 6), [0.8, 0.92, 0.94], { y: 0.27 });
  },
  BadwaterSource: () => {
    // a stone basin of badwater over its 3 × 3 footprint (centred on it; D324, feedback item 28): a
    // dark, stained rim of blocks and boulders round a crimson pool, the badwater boiling up in a
    // low dome with slow orange-brown bubbles, darker and heavier than the clean source beside it
    const rim: Rgb = [0.25, 0.22, 0.2];
    const m = new Model().add(box(2.96, 0.1, 2.96), [0.13, 0.11, 0.1], { y: 0.05 });
    for (const s of [-1, 1]) {
      m.add(box(2.96, 0.26, 0.42), rim, { y: 0.23, z: s * 1.27 });
      m.add(box(0.42, 0.26, 2.12), rim, { y: 0.23, x: s * 1.27 });
      for (const c of [-1, 1]) m.add(ico(0.38), [0.3, 0.26, 0.23], { x: c * 1.28, y: 0.3, z: s * 1.28, sy: 0.75, ry: 0.4 * c * s });
    }
    m.add(box(2.14, 0.05, 2.14), [0.22, 0.085, 0.07], { y: 0.155 });
    m.add(ico(0.8), [0.31, 0.11, 0.09], { y: 0.17, sy: 0.3 });
    const bubbles: [number, number, number][] = [[0.3, 0.25, 0.26], [-0.5, -0.1, 0.2], [0.1, -0.55, 0.18], [-0.25, 0.6, 0.22], [0.65, -0.45, 0.16], [-0.75, 0.45, 0.15], [0.6, 0.65, 0.19]];
    // (orange-brown, and no lighter than the mine test allows: a badwater source stays far darker than a mine's pale wood)
    for (const [x, z, r] of bubbles) m.add(ico(r), [0.62, 0.3, 0.1], { x, y: 0.25, z, sy: 0.9 });
    return m;
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
  WaterSeep: () => seep(false),
  BadwaterSeep: () => seep(true),
  Aquifer: aquifer,
  AncientAquiferDrill: aquiferDrill,
  BadtideDrain: badtideDrain,
  UnstableCore: unstableCore,
  ReservePile: reservePile,
  ReserveWarehouse: reserveWarehouse,
  ReserveTank: reserveTank,
};

// ------------------------------------------------------------------------------ the 1.x objects

// Models of our own for the objects Timberborn 1.x added (the succulent, the seeps, the aquifer and its
// drill, the badtide drain, the unstable core and the reserves), each shaped after the game's own
// object, within its footprint (a model's x is east and z south; a footprint's local y runs north, so
// −z) and centred on it (`CENTRED`). Flat vertex colours and low triangle counts, like the others;
// both looks draw them. A seep's pit is a terrain cut-out (`mineCutout`), like a mine site's.

/** A square-sectioned bar of half-width r from a to b in space (8 triangles). */
function beam(m: Model, a: readonly number[], b: readonly number[], r: number, color: Rgb): void {
  const A = new Vector3(a[0], a[1], a[2]);
  const B = new Vector3(b[0], b[1], b[2]);
  const d = B.clone().sub(A);
  const g = new CylinderGeometry(r * Math.SQRT2, r * Math.SQRT2, d.length(), 4, 1, true).rotateY(Math.PI / 4).applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.clone().normalize()));
  const c = A.add(B).multiplyScalar(0.5);
  m.add(g, color, { x: c.x, y: c.y, z: c.z });
}

/** A pad: a lens of 12 triangles, a round rim of six vertices in the xz plane (radius 1) with an apex over and
 *  under its middle (y = ±1); scale it to about 0.15 × 0.04 × 0.15. */
function lens(): BufferGeometry {
  // (eight rim points, an edge across each end and each side: stretched, it reads as a rounded oval)
  const rim = (k: number): number[] => [Math.cos(((2 * k + 1) * Math.PI) / 8), 0, Math.sin(((2 * k + 1) * Math.PI) / 8)];
  const out: number[] = [];
  for (let k = 0; k < 8; k++) {
    out.push(0, 1, 0, ...rim(k + 1), ...rim(k));
    out.push(0, -1, 0, ...rim(k), ...rim(k + 1));
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(out, 3));
  return g;
}

const SAGE: Rgb = [0.37, 0.53, 0.29];
/** A pad's outer tip: the sage blushed about halfway to pink-red, so the pad stays green with a warm edge. */
const PAD_TIP: Rgb = [0.64, 0.47, 0.34];

/** The desert plant (the game's succulent): a tall egg of a trunk, widest a third of the way up, tapering to
 *  the crown, in four rings of two close browns like scales; seven big round sage paddles on its upper half,
 *  near level, reaching past the tile like a tree's crown, each blushing pink-red at its outer tip; and a young
 *  plant beside it, a rosette of five pads. Dead: a grey-tan trunk and three limp tan pads. At most 240 triangles. */
function succulent(dead: boolean): Model {
  const mid: Rgb = dead ? [0.55, 0.47, 0.36] : [0.5, 0.36, 0.22];
  const dark: Rgb = dead ? [0.5, 0.43, 0.33] : [0.43, 0.3, 0.18];
  const cx = 0;
  const m = new Model();
  const rings: [number, number][] = [[0.1, 0.17], [0.17, 0.19], [0.19, 0.15], [0.15, 0.08]];
  rings.forEach(([r0, r1], k) => m.add(cyl(r0, r1, 0.17, 6), k % 2 ? dark : mid, { x: cx, y: 0.085 + 0.17 * k, ry: 0.3 * k }));
  const green: Rgb = dead ? [0.62, 0.54, 0.4] : SAGE;
  // (a pad as an oval lens, `len` long and `wid` wide: its inner end at (x, y, z), leaning out along `turn` at `tilt` above
  // the horizontal, so the crown's pads fan up and out past the trunk; its outer tip blushes. A dead plant's droop.)
  const pad = (x: number, y: number, z: number, turn: number, tilt: number, len: number, wid: number) => {
    const t = dead ? -tilt : tilt;
    const r = len * Math.cos(t);
    m.add(lens(), (px, py, pz) => (!dead && px > 0.8 ? PAD_TIP : py !== 0 ? shade(green, 1.06) : pz > 0.5 ? shade(green, 0.94) : green), {
      sx: len,
      sy: 0.075,
      sz: wid,
      rz: t,
      ry: turn,
      x: x + Math.cos(turn) * r,
      y: y + len * Math.sin(t),
      z: z - Math.sin(turn) * r,
    });
  };
  if (dead) {
    for (const [a, t] of [[0.4, 0.9], [2.6, 0.8], [4.6, 1.0]]) pad(cx + Math.cos(a) * 0.1, 0.74, -Math.sin(a) * 0.1, a, t, 0.15, 0.1);
    return m;
  }
  // big round paddles on the upper half of the trunk, each about as long as the trunk is wide: four round its middle
  // near level, three higher up and steeper, so from the side a pinecone ringed by paddles and from above a green
  // rosette; like a tree's crown they reach past the tile
  for (let k = 0; k < 4; k++) {
    const a = k * (Math.PI / 2) + 0.4;
    pad(Math.cos(a) * 0.16, 0.42, -Math.sin(a) * 0.16, a, 0.35, 0.21, 0.15);
  }
  for (let k = 0; k < 3; k++) {
    const a = k * ((2 * Math.PI) / 3) + 1.2;
    pad(Math.cos(a) * 0.07, 0.66, -Math.sin(a) * 0.07, a, 0.75, 0.19, 0.14);
  }
  // the young plant beside it: a rosette of five pads from the ground
  for (let k = 0; k < 5; k++) {
    const a = k * ((2 * Math.PI) / 5) + 0.3;
    pad(-0.36 + Math.cos(a) * 0.02, 0.02, 0.34 - Math.sin(a) * 0.02, a, 0.75, 0.1, 0.085);
  }
  return m;
}

/** The light look's succulent: a trunk and two pads. */
function liteSucculent(): Model {
  const m = new Model().add(cone(0.22, 0.7, 4), [0.5, 0.36, 0.22], { y: 0.35 });
  for (const a of [0.5, 3.6]) m.add(lens(), SAGE, { sx: 0.2, sy: 0.05, sz: 0.12, rz: 0.85, ry: a, x: Math.cos(a) * 0.23, y: 0.86, z: -Math.sin(a) * 0.23 });
  return m;
}

/** A seep (2 × 2): the game's square pit, stepped, sunk into the ground (the terrain's tops over the
 *  footprint are cut out, `mineCutout`), with grey rocks heaped on its floor under the water: water-blue
 *  and grey, or, for badwater, rust-crusted rocks in the renderer's badwater reds. */
function seep(bad: boolean): Model {
  const wall: Rgb = bad ? [0.27, 0.13, 0.1] : [0.19, 0.3, 0.33];
  const ledge: Rgb = bad ? [0.38, 0.2, 0.12] : [0.27, 0.41, 0.44];
  const floor: Rgb = bad ? WATER.badDeep : [0.14, 0.26, 0.3];
  const rock: Rgb = bad ? [0.5, 0.3, 0.17] : [0.48, 0.55, 0.57];
  const d1 = 0.28;
  const d2 = 0.62;
  const m = new Model();
  for (let f = 0; f < 4; f++)
    onFace(m, f, () => {
      m.add(plane(2, d1), wall, { y: -d1 / 2, z: -1 });
      m.add(plane(2, 0.22), ledge, { rx: -Math.PI / 2, y: -d1, z: -0.89 });
      m.add(plane(1.56, d2 - d1), shade(wall, 0.8), { y: -d1 - (d2 - d1) / 2, z: -0.78 });
    });
  m.add(plane(1.56, 1.56), floor, { rx: -Math.PI / 2, y: -d2 });
  const rocks: [number, number, number, number][] = [
    // x, z, radius, height of the middle over the floor
    [0, 0, 0.24, 0.3],
    [0.3, 0.12, 0.19, 0.2],
    [-0.28, 0.2, 0.2, 0.18],
    [0.1, -0.3, 0.19, 0.2],
    [-0.2, -0.28, 0.17, 0.14],
    [0.5, -0.32, 0.15, 0.1],
    [-0.5, -0.05, 0.15, 0.1],
    [0.15, 0.5, 0.15, 0.1],
    [-0.1, 0.52, 0.14, 0.09],
  ];
  rocks.forEach(([x, z, r, h], k) => m.add(ico(r), shade(rock, 0.85 + 0.1 * (k % 3)), { x, y: -d2 + h, z, sy: 0.8, ry: k }));
  if (bad) for (const [x, z] of [[0.05, 0.05], [0.3, 0.12], [-0.28, 0.2]]) m.add(oct(0.06), [0.78, 0.4, 0.12], { x: x + 0.05, y: -d2 + 0.42, z });
  return m;
}

/** The aquifer (3 × 3, a plus of five tiles, its corners empty): dry, dark rubble over a cross, a dark
 *  hole in the middle and a few stones strewn past its arms. It gives no water until a drill runs. */
function aquifer(): Model {
  const dark: Rgb = [0.23, 0.22, 0.21];
  const m = new Model();
  // (a flat, ragged patch: a blob over each tile of the cross)
  const blobs: [number, number, number, number][] = [[0, 0, 0.7, 0.7], [0, -0.85, 0.55, 0.5], [0, 0.85, 0.55, 0.5], [-0.85, 0, 0.5, 0.55], [0.85, 0, 0.5, 0.55]];
  blobs.forEach(([x, z, sx, sz], k) => m.add(ico(1), shade(dark, 0.8 + 0.1 * (k % 3)), { x, y: 0.0, z, sx, sy: 0.07, sz, ry: k }));
  // rubble heaped over the cross and its edges
  const stones: [number, number, number][] = [
    [0.38, 0.38, 0.2], [-0.4, 0.34, 0.19], [0.36, -0.4, 0.18], [-0.38, -0.4, 0.2], [0.05, 0.62, 0.16], [0.02, -0.64, 0.17], [0.62, 0.02, 0.16], [-0.64, 0.05, 0.17],
    [0.3, 0.95, 0.2], [-0.25, 1.05, 0.19], [0.1, 1.3, 0.14], [0.35, -1.02, 0.19], [-0.2, -1.12, 0.2], [-0.05, -1.3, 0.14],
    [1.0, 0.3, 0.2], [1.1, -0.25, 0.19], [1.3, 0.05, 0.14], [-1.02, 0.28, 0.2], [-1.12, -0.25, 0.19], [-1.3, -0.05, 0.14],
    [0.6, 0.62, 0.1], [-0.6, -0.6, 0.1], [0.6, -0.62, 0.1], [-0.6, 0.6, 0.1],
  ];
  stones.forEach(([x, z, r], k) => m.add(oct(r * 1.3), shade([0.36, 0.34, 0.32], 0.8 + 0.12 * (k % 4)), { x, y: 0.04 + r * 0.3, z, sy: 0.5, ry: k }));
  // the hole: a ring of rubble round a dark mouth
  for (let k = 0; k < 7; k++) {
    const a = (k * Math.PI * 2) / 7;
    m.add(oct(0.1), shade([0.3, 0.28, 0.26], 0.8 + 0.15 * (k % 3)), { x: Math.cos(a) * 0.27, y: 0.09, z: Math.sin(a) * 0.27, sy: 0.6, ry: k });
  }
  m.add(post(0.2, 0.2, 0.02, 7), [0.08, 0.06, 0.05], { y: 0.07 });
  return m;
}

/** The ancient aquifer drill (3 × 3 × 5, over an aquifer): a tall, narrow yellow-and-black auger tower: a
 *  stone footing over the aquifer's rubble, a screw auger climbing to a black pole, a yellow frame leaning
 *  on it, a tall dark housing beside it and a pipe running off on black trestles. */
function aquiferDrill(): Model {
  const yellow: Rgb = [0.95, 0.76, 0.1];
  const black: Rgb = [0.12, 0.12, 0.13];
  const steel: Rgb = [0.6, 0.62, 0.65];
  const stone: Rgb = [0.34, 0.33, 0.32];
  // (the footing covers the rubble under it)
  const m = new Model().add(box(1.1, 0.3, 3.0), stone, { y: 0.15 }).add(box(3.0, 0.3, 1.1), shade(stone, 0.92), { y: 0.15 });
  for (let k = 0; k < 3; k++) {
    const a = (k * Math.PI * 2) / 3 + 0.5;
    beam(m, [Math.cos(a) * 0.22, 2.4, Math.sin(a) * 0.22], [Math.cos(a) * 0.85, 0.3, Math.sin(a) * 0.85], 0.075, yellow);
    m.add(box(0.28, 0.1, 0.28), black, { x: Math.cos(a) * 0.88, y: 0.35, z: Math.sin(a) * 0.88, ry: a });
  }
  // the auger: a steel shaft with flights climbing it, a yellow collar and a black pole on top
  m.add(cyl(0.17, 0.17, 4.2, 6), steel, { y: 2.4 });
  for (let k = 0; k < 11; k++) m.add(oct(0.4), shade(steel, 0.85 + 0.1 * (k % 2)), { y: 0.6 + k * 0.33, sy: 0.2, ry: k * 0.7 });
  m.add(cyl(0.24, 0.24, 0.18, 6), yellow, { y: 4.3 });
  m.add(cyl(0.07, 0.07, 0.7, 4), black, { y: 4.65 });
  // the housing: tall, dark panels in a yellow frame
  m.add(box(0.7, 2.6, 0.3), [0.28, 0.29, 0.33], { x: -0.5, y: 1.6, z: 0.35 });
  for (const s of [-1, 1]) m.add(box(0.07, 2.64, 0.34), yellow, { x: -0.5 + s * 0.32, y: 1.6, z: 0.35 });
  m.add(box(0.74, 0.07, 0.34), yellow, { x: -0.5, y: 2.92, z: 0.35 });
  m.level = LOD_NEAR;
  m.add(box(0.5, 0.9, 0.04), [0.2, 0.21, 0.25], { x: -0.5, y: 1.5, z: 0.52 });
  m.level = LOD_ALL;
  // the pipe, off to the west, on two black trestles
  m.add(cyl(0.12, 0.12, 0.9, 6), [0.85, 0.82, 0.7], { x: -1.05, y: 0.95, z: 0.35, rz: Math.PI / 2 });
  for (const x of [-0.95, -1.3]) m.add(box(0.1, 0.5, 0.2), black, { x, y: 0.55, z: 0.35 });
  return m;
}

/** The badtide drain (1 × 3, its back against a wall on the −y side): a rusty, grated metal box, its
 *  open end out over the drop. The model's north (−z) is the footprint's local +y. */
function badtideDrain(): Model {
  const rust: Rgb = [0.5, 0.29, 0.14];
  const metal: Rgb = [0.2, 0.22, 0.22];
  const m = new Model().add(box(0.9, 0.7, 2.7), metal, { y: 0.4, z: 0.1 });
  // the grate: slats across the top
  for (let k = 0; k < 7; k++) m.add(box(0.8, 0.05, 0.1), rust, { y: 0.77, z: 1.25 - 0.34 * k });
  // the frame: rails along the top and posts at the corners
  for (const s of [-1, 1]) {
    m.add(box(0.07, 0.07, 2.7), shade(rust, 0.85), { x: s * 0.43, y: 0.78, z: 0.1 });
    for (const z of [1.4, -1.2]) m.add(box(0.09, 0.7, 0.09), shade(rust, 0.9), { x: s * 0.43, y: 0.4, z });
  }
  m.add(box(0.9, 0.07, 0.07), shade(rust, 0.85), { y: 0.78, z: 1.4 });
  // the open end: a dark mouth, its frame, and a lip of slats over the drop
  m.add(box(0.7, 0.45, 0.04), [0.04, 0.04, 0.05], { y: 0.4, z: -1.255 });
  for (const y of [0.18, 0.62]) m.add(box(0.9, 0.07, 0.07), rust, { y, z: -1.25 });
  m.add(box(0.7, 0.05, 0.4), shade(rust, 1.1), { y: 0.14, z: -1.3 });
  // two pipes bent along the side
  for (const s of [-1, 1]) beam(m, [s * 0.47, 0.3, 0.9], [s * 0.47, 0.5, 0.3], 0.04, [0.38, 0.22, 0.12]);
  return m;
}

/** The unstable core (2 × 2): a small dark metal dome in segmented panels with one red glowing eye, half
 *  sunk into the ground, on a soft scorch mark of orange, darker toward its edge. Its glow is above the lit
 *  range, so it shines. */
function unstableCore(): Model {
  const R = 0.56;
  const m = new Model().add(post(0.92, 0.92, 0.01, 10), [0.3, 0.19, 0.1], { y: 0.01 });
  m.add(post(0.76, 0.76, 0.012, 10), [0.45, 0.25, 0.1], { y: 0.016 });
  m.add(post(0.62, 0.62, 0.014, 10), [0.68, 0.34, 0.1], { y: 0.022 });
  m.add(post(0.58, 0.58, 0.05, 8), [0.1, 0.09, 0.08], { y: 0.03 });
  m.add(new IcosahedronGeometry(0.5, 1), [0.34, 0.34, 0.38], { y: 0.03, sy: 0.8 });
  // six ribs over the dome, from the eye to its foot (two bars each, hugging its curve)
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 3 + 0.3;
    const at = (polar: number): number[] => [Math.sin(polar) * Math.cos(a) * R, 0.03 + Math.cos(polar) * R * 0.8, Math.sin(polar) * Math.sin(a) * R];
    beam(m, at(0.35), at(0.85), 0.022, [0.52, 0.49, 0.46]);
    beam(m, at(0.85), at(1.45), 0.022, [0.52, 0.49, 0.46]);
  }
  m.add(post(0.17, 0.17, 0.05, 8), [0.62, 0.57, 0.52], { y: 0.45 });
  m.add(ico(0.11), [1.3, 0.4, 0.35], { y: 0.5, sy: 0.7 });
  return m;
}

const PEN_WALL: Rgb = [0.44, 0.56, 0.54];
const PEN_POST: Rgb = [0.38, 0.24, 0.2];
const PEN_SIGN: Rgb = [0.62, 0.46, 0.3];

/** A reserve pile (2 × 2 × 2): a low fenced pen of grey-green planks with brown corner posts, logs and
 *  pale stones inside, and a sign on posts at its south side. */
function reservePile(): Model {
  const m = new Model();
  for (const s of [-1, 1]) {
    m.add(box(1.8, 0.24, 0.08), PEN_WALL, { y: 0.14, z: s * 0.86 });
    m.add(box(0.08, 0.24, 1.64), PEN_WALL, { y: 0.14, x: s * 0.86 });
    for (const t of [-1, 1]) m.add(box(0.14, 0.4, 0.14), PEN_POST, { x: s * 0.88, y: 0.2, z: t * 0.88 });
  }
  const log: Rgb = [0.34, 0.2, 0.14];
  const lay = (x: number, y: number, k: number) => m.add(post(0.17, 0.17, 1.25, 5), shade(log, 0.85 + 0.1 * (k % 3)), { rx: Math.PI / 2, x, y, z: -0.2 });
  lay(-0.62, 0.18, 0);
  lay(-0.26, 0.18, 1);
  lay(-0.44, 0.4, 2);
  lay(0.18, 0.18, 3);
  lay(0.54, 0.18, 4);
  lay(0.36, 0.4, 5);
  const stones: [number, number, number][] = [[-0.55, 0.62, 0.15], [-0.2, 0.68, 0.14], [0.15, 0.6, 0.15], [0.5, 0.66, 0.14], [-0.35, 0.5, 0.11], [0.3, 0.5, 0.11]];
  stones.forEach(([x, z, r], k) => m.add(oct(r), shade([0.8, 0.7, 0.54], 0.9 + 0.1 * (k % 3)), { x, y: 0.1, z, sy: 0.8, ry: k }));
  for (const s of [-1, 1]) m.add(box(0.07, 0.5, 0.07), PEN_POST, { x: s * 0.26, y: 0.3, z: 0.95 });
  m.add(box(0.64, 0.3, 0.05), PEN_SIGN, { y: 0.6, z: 0.95 });
  return m;
}

/** A reserve warehouse (2 × 2 × 1): an open pallet yard: a low packed layer of small blue-grey crates inside
 *  low plank walls, corner posts joined by rope, and a sign on posts at its south side. */
function reserveWarehouse(): Model {
  const crate: Rgb = [0.4, 0.5, 0.66];
  const plank: Rgb = [0.55, 0.4, 0.26];
  const m = new Model().add(box(1.9, 0.08, 1.9), [0.38, 0.26, 0.18], { y: 0.04 });
  for (const s of [-1, 1]) {
    m.add(box(1.8, 0.28, 0.07), plank, { y: 0.22, z: s * 0.88 });
    m.add(box(0.07, 0.28, 1.7), plank, { y: 0.22, x: s * 0.88 });
  }
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) m.add(box(0.34, 0.28 + 0.06 * ((i + j) % 2), 0.34), shade(crate, 0.9 + 0.1 * ((i * 3 + j * 2) % 3)), { x: (i - 1.5) * 0.43, y: 0.22 + 0.03 * ((i + j) % 2), z: (j - 1.5) * 0.43 - 0.03, ry: 0.05 * (i - j) });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) m.add(box(0.1, 0.8, 0.1), PEN_POST, { x: sx * 0.88, y: 0.4, z: sz * 0.88 });
  const rope: Rgb = [0.86, 0.78, 0.6];
  for (const s of [-1, 1]) {
    beam(m, [s * 0.88, 0.72, -0.88], [s * 0.88, 0.72, 0.88], 0.018, rope);
    beam(m, [-0.88, 0.72, s * 0.88], [0.88, 0.72, s * 0.88], 0.018, rope);
  }
  for (const s of [-1, 1]) m.add(box(0.07, 0.5, 0.07), PEN_POST, { x: s * 0.22, y: 0.3, z: 0.93 });
  m.add(box(0.6, 0.28, 0.05), PEN_SIGN, { y: 0.55, z: 0.93 });
  return m;
}

/** A reserve tank (2 × 2 × 3): a wooden-stave barrel on four splayed legs, green-grey staves in brown
 *  bands under a domed lid, with a pump housing and its wheel at the side. */
function reserveTank(): Model {
  const stave: Rgb = [0.5, 0.62, 0.53];
  const wood: Rgb = [0.38, 0.24, 0.19];
  const m = new Model().add(post(0.72, 0.72, 1.5, 10), stave, { y: 1.75 });
  for (const y of [1.2, 2.3]) m.add(cyl(0.745, 0.745, 0.1, 10), wood, { y });
  m.add(post(0.72, 0.5, 0.16, 10), shade(stave, 0.9), { y: 2.58 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam(m, [sx * 0.45, 1.05, sz * 0.45], [sx * 0.8, 0.05, sz * 0.8], 0.05, wood);
  m.add(box(0.4, 0.6, 0.5), [0.45, 0.28, 0.2], { x: 0.78, y: 0.4 });
  m.add(post(0.17, 0.17, 0.05, 8), [0.6, 0.45, 0.3], { x: 0.78, y: 0.45, z: 0.28, rx: Math.PI / 2 });
  return m;
}

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

/** Where the terrain leaves its tops out for mine sites' and seeps' pits (mesh.ts `cutout`): tile
 *  index → the object's level, for every tile of each mine site's 5 × 5 footprint (the model covers
 *  them all: its frame the edge, its pit the rest) and of each seep's 2 × 2 (its pit, whole). */
export function mineCutout(v: EntityView, W: number, H: number): Map<number, number> {
  const out = new Map<number, number>();
  for (let k = 0; k < v.count; k++) {
    const template = v.templates[v.template[k]];
    const size = template === "UndergroundRuins" ? 5 : template === "WaterSeep" || template === "BadwaterSeep" ? 2 : 0;
    if (!size) continue;
    const o = ORIENTATION_NAMES[v.orientation[k]] as Orientation;
    for (let ly = 0; ly < size; ly++)
      for (let lx = 0; lx < size; lx++) {
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
  Succulent: liteSucculent,
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
const CENTRED: Record<string, [number, number]> = {
  BadwaterSource: [1, 1],
  UndergroundRuins: [2, 2],
  GeothermalField: [1, 1],
  SmallRelic: [0.5, 0],
  MediumRelic: [1, 0.5],
  LargeRelic: [1, 1],
  // the 1.x objects (footprint size / 2 - 0.5 in tiles, from the origin tile's middle)
  WaterSeep: [0.5, 0.5],
  BadwaterSeep: [0.5, 0.5],
  Aquifer: [1, 1],
  AncientAquiferDrill: [1, 1],
  BadtideDrain: [0, 1],
  UnstableCore: [0.5, 0.5],
  ReservePile: [0.5, 0.5],
  ReserveWarehouse: [0.5, 0.5],
  ReserveTank: [0.5, 0.5],
};

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
 *  `ivy` (IVY_NONE to IVY_DENSE). Close up: the orange skeleton, its braces and cream sacks, and
 *  ivy draped over it (`drape`); from afar: a solid block in orange with its cream panels set in, and a
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
        // cream sacks (D334, as the game's ruins have them): a big one resting on the storey's floor,
        // a smaller one low or hanging high, one hanging askew; broken panels stay flat boards
        const lump = (f + k + variant) % 2;
        if (p === "full" && hi > 0.35) {
          const h = Math.min(0.5, hi - 0.08);
          m.add(sack(0.72, h, 0.075, lump), col, { y: 0.06 + h / 2, z });
        } else if (p === "low") m.add(sack(0.7, 0.36, 0.065, lump), col, { y: 0.25, z });
        else if (p === "high" && top >= 0.95) m.add(sack(0.66, 0.38, 0.06, lump), col, { y: 0.7, z });
        else if (p === "tilt" && top >= 0.7) m.add(sack(0.66, 0.46, 0.07, lump), col, { rz: 0.17, rx: -0.08, x: 0.03, y: 0.44, z: z - 0.01 });
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
  // from afar: a block, its frame a lattice
  m.level = LOD_FAR;
  farBlock(m, layout, partial ? 0.72 : 1, ivy, variant, LOD_FAR_FRAME);
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

/** A storey from afar (D305, D334): a block over its tile in the near skeleton's own orange
 *  (`RUIN.far`, drawn at `frame`: as LOD_FAR_FRAME the object shader's lattice pattern tells it apart
 *  from a solid box), a cream panel where each face's sack or boards are, a band of ivy low on the
 *  faces (all four at a column's foot, two above it, none on the highest ivy; `variant` picks the
 *  two), and the same colour on top. The panels and ivy are solid, at the model's level. */
function farBlock(m: Model, layout: Layout, height: number, ivy = IVY_NONE, variant = 0, frame = m.level): void {
  const w = 0.86;
  const solid = m.level;
  const framed = (add: () => void) => {
    m.level = frame;
    add();
    m.level = solid;
  };
  for (let f = 0; f < 4; f++) {
    const panels = layout.panels.filter(([g]) => g === f).map(([, p]) => p);
    onFace(m, f, () => {
      framed(() => m.add(plane(w, height), RUIN.far, { ry: Math.PI, y: height / 2, z: -w / 2 }));
      if (panels.length) {
        // (where the near sack or boards are: a big sack low, a small one low or high, one askew
        // across the middle, broken boards over most of the face)
        const p = panels[0];
        const [ph, py] = p === "full" ? [0.5, 0.31] : p === "low" ? [0.4, 0.3] : p === "high" ? [0.4, 0.7] : p === "tilt" ? [0.46, 0.44] : [0.66, 0.5];
        const pw = p === "broken" ? 0.36 : 0.6;
        m.add(plane(pw, ph * height), RUIN.panel, { ry: Math.PI, x: p === "broken" ? 0.12 : 0, y: py * height, z: -w / 2 - 0.004 });
      }
      if (ivy === IVY_DENSE) m.add(plane(0.74, 0.42 * height), RUIN.leaf, { ry: Math.PI, y: 0.21 * height, z: -w / 2 - 0.008 });
      else if (ivy === IVY_MEDIUM && (f + variant) % 4 >= 2) m.add(plane(0.6, 0.3 * height), RUIN.leaf, { ry: Math.PI, y: 0.15 * height, z: -w / 2 - 0.008 });
    });
  }
  framed(() => m.add(plane(w, w), RUIN.far, { rx: -Math.PI / 2, y: height }));
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
  [/UnstableCore/, [0.58, 0.44, 0.4]],
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
 *  width), ruins on moist ground are overgrown (a ruin under a roof by its own run top's soil). `lite`: the light look's models (software
 *  rendering). */
export function buildEntities(v: EntityView, material: ShaderMaterial, soil: SoilView | null = null, W = 0, lite = false, models?: EntityGeometryCache, reuse?: { group: Group; entities: EntityView }): { group: Group; instances: number } {
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
      // ground (the soil the ground's colour shows: under a roof, its own run top's, `objectSoilAt`), ivy
      // over about half its storeys (`ruinIvy`)
      const n = Number(template.slice(-1));
      const moist = (objectSoilAt(soil, W, x, y, z)?.moisture ?? 0) > 0;
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
      // every tree upright on its tile, as in the game (D321, item 7: a knocked-down one is dead)
      const dead = !!(flags & DEAD);
      const s = (flags & YOUNG ? 0.5 : 0.85 + 0.3 * jitter(x, y, 1)) * (dead ? 0.95 : 1);
      const tint = dead ? 0.94 + 0.08 * jitter(x, y, 5) : 0.9 + 0.2 * jitter(x, y, 5);
      put(b, x + 0.5 + (jitter(x, y, 2) - 0.5) * 0.3, z, -(y + 0.5) + (jitter(x, y, 3) - 0.5) * 0.3, jitter(x, y, 4) * Math.PI * 2, s, tint, s, dead && TREES.has(template) ? GROW_DEAD : NO_GROW);
    } else put(b, x + 0.5, z, -(y + 0.5), turn, 1);
    // a slope's arrow, level, just above the slope's top
    if (template === "Slope") put(batch("Slope.mark", MODELS["Slope.mark"]), x + 0.5, z + SLOPE_ARROW_HEIGHT, -(y + 0.5), turn, 1, 1, 1, GROW_SLOPE_MARK);
  }
  const group = new Group();
  // (the batches drawn already, by name: one that would be built exactly as it stands moves into the new group as it is,
  // nothing made or sent to the GPU again; placing a source rebuilds the sources' batch, not the forest's)
  const drawn = new Map<string, InstancedMesh>();
  if (reuse)
    for (const c of reuse.group.children) {
      const mesh = c as InstancedMesh;
      if (mesh.isInstancedMesh && mesh.userData.objects && !mesh.name.startsWith("high.")) drawn.set(mesh.name, mesh);
    }
  for (const [key, b] of batches) {
    const n = b.tints.length / 3;
    if (!n) continue;
    const old = drawn.get(key);
    if (old && old.material === material && sameBatch(old, b, v, reuse!.entities, lite)) {
      // (renumbered, and standing where the map has them now: ground a stroke painted may have moved them to these
      // heights already, and settling puts them back to `ty0`, so it is the new build's, as a fresh batch's is)
      old.userData.objects = Int32Array.from(b.objects);
      if (lite) {
        // (the light look's batch is baked: nothing follows the ground in it)
      } else if (b.follows.some((k) => k >= 0)) {
        old.userData.follows = Int32Array.from(b.follows);
        old.userData.ty0 = Float32Array.from({ length: n }, (_, i) => b.matrices[i * 16 + 13]);
      } else {
        delete old.userData.follows;
        delete old.userData.ty0;
      }
      group.add(old);
      continue;
    }
    // the light look bakes every instance into one mesh drawn once: software rendering pays for
    // each instance it draws, not for each triangle
    const mesh = lite ? new InstancedMesh(baked(b.model(), b.matrices, b.tints), material, 1) : new InstancedMesh(models ? models.geometry(key, () => b.model().geometry()) : b.model().geometry(), material, n);
    mesh.name = key;
    if (lite) {
      mesh.instanceMatrix.array.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
      mesh.instanceColor = new InstancedBufferAttribute(new Float32Array([1, 1, 1]), 3);
      mesh.geometry.setAttribute("grow", new InstancedBufferAttribute(new Float32Array([0, 0, 1]), 3));
      // (what it was baked from, so a build that would bake it the same keeps it: `sameBatch`)
      mesh.userData.objects = Int32Array.from(b.objects);
      mesh.userData.baked = { matrices: Float32Array.from(b.matrices), tints: Float32Array.from(b.tints) };
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

/** Whether a batch drawn (`mesh`, of the objects `was`) is exactly what `b` (of the objects `v`) would build: as many
 *  instances, each of the same object's kind, with the same matrix, tint and growth as drawn now (a highlight, a
 *  wiggle or ground followed shows as a difference, and the batch is built anew). The light look's baked batch is
 *  compared with the matrices and tints it was baked from. */
function sameBatch(mesh: InstancedMesh, b: Batch, v: EntityView, was: EntityView, lite = false): boolean {
  const n = b.tints.length / 3;
  const own = mesh.userData.objects as Int32Array;
  const baked = mesh.userData.baked as { matrices: Float32Array; tints: Float32Array } | undefined;
  if (lite !== !!baked) return false;
  if ((!lite && mesh.count !== n) || own.length !== n || !mesh.instanceColor) return false;
  for (let i = 0; i < n; i++) {
    const k = own[i];
    const j = b.objects[i];
    if (k < 0 || j < 0 || k >= was.count || was.templates[was.template[k]] !== v.templates[v.template[j]]) return false;
  }
  const same = (a: ArrayLike<number>, f: readonly number[]) => {
    if (a.length !== f.length) return false;
    for (let i = 0; i < f.length; i++) if (a[i] !== Math.fround(f[i])) return false;
    return true;
  };
  if (baked) return same(baked.matrices, b.matrices) && same(baked.tints, b.tints);
  const grow = mesh.geometry.getAttribute("grow");
  return !!grow && same(mesh.instanceMatrix.array, b.matrices) && same(mesh.instanceColor.array, b.tints) && same(grow.array, b.grows);
}

/** Every instance of a model in one geometry: positions and normals through each instance's
 *  matrix, colours times its tint (the light look, which draws a model's parts for close up: it
 *  never draws the parts for afar). */
function baked(full: Model, matrices: number[], tints: number[]): BufferGeometry {
  const model = new Model();
  for (let v = 0; v < full.lod.length; v++) {
    if (full.lod[v] >= LOD_FAR) continue;
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

/** The models the map's objects may yet be drawn with as the water and soil change, not made yet: a ruin's storeys
 *  with and without their ivy (moist ground grows it), a plant's dead model (water drowns it). Each as its batch's key
 *  and how to make it (`EntityGeometryCache.model`), for the page to make ahead when idle: made in the frame that
 *  first drew them, they cost an edit's answer tens of milliseconds. */
export function modelsAhead(v: EntityView, models: EntityGeometryCache): { key: string; build: () => BufferGeometry }[] {
  const out = new Map<string, () => BufferGeometry>();
  const want = (key: string, model: () => Model) => {
    if (!models.has(key) && !out.has(key)) out.set(key, () => model().geometry());
  };
  for (let k = 0; k < v.count; k++) {
    const template = v.templates[v.template[k]];
    const key = modelKeyOf(template, v.flags[k]);
    if (key === "ruin") {
      const x = v.x[k];
      const y = v.y[k];
      const n = Number(template.slice(-1));
      ruinStoreys(x, y, n, v.variant?.[k] ?? NO_VARIANT).forEach(({ variant, kind }, lv) => {
        for (const green of [IVY_NONE, ruinIvy(x, y, n, lv)]) want(`scaffold.${RUIN_VARIANT_IDS[variant]}${kind}${["", ".ivy.light", ".ivy.medium", ".ivy"][green]}`, () => storey(variant, kind, green));
      });
    } else if (PLANTS.has(template) && `${template}.dead` in MODELS) want(`${template}.dead`, MODELS[`${template}.dead`]);
  }
  return [...out].map(([key, build]) => ({ key, build }));
}

export function disposeGroup(g: Group): void {
  for (const c of g.children) disposeBatch(c as InstancedMesh);
  g.clear();
}

/** Let go of a batch's GPU buffers (its model's arrays are shared, `EntityGeometryCache`). */
export function disposeBatch(mesh: InstancedMesh): void {
  mesh.geometry.dispose();
  mesh.dispose();
}
