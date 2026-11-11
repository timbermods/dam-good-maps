// Map objects as instanced meshes (EDITOR_PLAN §8), with our own low-poly models (Map look, PLAN
// §20 D86, D110 and D114, shaped after Kyler's in-game reference screenshots; the game's assets are
// not ours to include, EDITOR_PLAN §2). One draw call per model, so tens of thousands of trees cost
// a few draw calls. Every model carries its own colours per vertex; the instance adds a slight tint
// so a grove is not one flat colour.
//
// - Trees by species: pine (tiers of dark cones), birch (a warm grey trunk with dark marks and a light
//   crown), oak (a thick trunk and a broad crown), succulent (a fat brown pinecone-like trunk ringed by round sage paddles on its
//   upper half, and a young plant beside it). Dead trees are bare: a pale grey-brown trunk and bare branches at the tree's true size, far lighter
//   than the dark living crowns.
// - Berry bushes: dark green, dotted with blue flowers.
// - Ruins (D178 as amended 2026-11-10): the game's ruined concrete frames, one column per tile and one storey per
//   level of its height, at the game's measures and in its colours: four rebar posts 0.08 square at the tile's
//   corners, on each face a band of cracked slab over the storey's upper part (whole or broken) or two rebar rails,
//   floor slabs in three of the variants, the top storey its posts broken off at the variant's heights. The five
//   variants (A to E, the file's own) differ storey by storey counted from the top, as the game's do. Ivy, as the
//   game's: on moist uncontaminated ground the foot clad, the storey above clearly green, every higher one a little;
//   elsewhere the foot clearly green. Turned as the file turns the column, as the game places it; one model at every
//   distance.
// - The start: the game's district center at its measures (D496, D178 as amended 2026-11-10), what the game builds
//   where the start stands in play: dark plank walls between pale posts under a thatched roof, a dark round tower with
//   a platform and a lantern, 4.33 high on its 3 × 3, its door facing the entrance. With Markers, a lit post on the
//   entrance tile (an editing aid: the game draws nothing there).
// - Slopes: a stone ramp; with Markers, a level pale arrow rimmed dark floating just above it,
//   pointing uphill (it reads from any camera angle). Water sources: an outcrop of dark rock 1.0 high;
//   badwater sources: a flat dark crater 2.5 across with low stones round its rim. Mine sites (D178): a rusty
//   frame round the edge of the 5 × 5 footprint and a square pit 1.35 deep filling the rest (the terrain leaves
//   the footprint's tops out, as the game hides the terrain under the site), with dark earthen walls and floor,
//   roots, rubble, cracks; rusty posts down into the pit round its lip, joined by beams, and ground in the
//   pit's corners falling into it as an earthen bank; no scaffolding, as the game has none. With Markers, an outline
//   round its footprint (the terrain shader). Geothermal fields: the game's crust of sulphur round its vent,
//   rocks round it, and its steam (geothermal.ts, geothermalSteam.ts). Relics: the game's fallen telescope (small), crashed satellite (medium) and fallen dish antenna (large), at
//   their measures and in their colours (smallRelics.ts, largeRelic.ts). Thorns: the game's dark spikes paling to
//   their points among thin forked twigs (thorns.ts). Blockages: the game's heap
//   of grey rock with broken posts and pale plank shards (blockage.ts). Natural dams: the game's low heap of brown rock with
//   logs through it and flat stones over it (naturalDam.ts). Timberborn 1.x objects, each shaped after the game's own render and in its game
//   footprint: seeps (a stone slab at the ground round a pit, the terrain's tops over its 2 × 2
//   cut out like a mine site's, heaped with rounded rocks to 0.57, or 0.40 for badwater, the gaps dark teal or
//   rust), the aquifer (a dry, dark rubble cross with a hole), its drill (a tall, narrow
//   yellow-and-black auger tower on a stone footing, a dark housing and a pipe), the badtide drain (the
//   game's box of rusted plate, a black funnel in its mouth under a hood out over the drop, badtideDrain.ts), the
//   unstable core (the game's ball of metal panels sunk into the ground, pale ribs and a strap over it, its port a
//   grey lens in a pale ring, dark studs round paler gems, unstableCore.ts), and the reserves (a pile: a log pen with a
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
import { BoxGeometry, BufferGeometry, CircleGeometry, ConeGeometry, CylinderGeometry, Float32BufferAttribute, Group, IcosahedronGeometry, InstancedBufferAttribute, InstancedMesh, OctahedronGeometry, PlaneGeometry, Quaternion, Vector3, type ShaderMaterial } from "three";
import { FOOTPRINTS, rotate, startEntranceTile, worldBlocks, type Orientation } from "../core/format/footprints";
import { DEAD, DYING, FLIPPED, NO_VARIANT, ORIENTATION_NAMES, RUIN_VARIANT_IDS, YOUNG, type EntityView, type SoilView } from "./model";
import { plantScale, RANDOMIZER } from "./plantSize";
import { DEAD_FORM, DEAD_LIMBS, type DeadPart, deadLeaves, deadRatio, deadWood, DRYING, dryColour, isFoliage } from "./dying";
import { crownShade, LANDMARK, MINE, OWN_LIGHTNESS, ownAlbedo, RUIN, SLOPE, START, TREE_COLOURS, WATER } from "./palette";
import { objectSoilAt } from "./runSoil";
import { badtideDrainParts } from "./badtideDrain";
import { blockageParts } from "./blockage";
import { naturalDamParts } from "./naturalDam";
import { geothermalParts } from "./geothermal";
import { thornsParts } from "./thorns";
import { unstableCoreParts } from "./unstableCore";
import { largeRelicParts } from "./largeRelic";
import { mediumRelicParts, smallRelicParts } from "./smallRelics";
import { LAND, LAND_GROW } from "./objectFade";

type Rgb = readonly [number, number, number];

// ------------------------------------------------------------------------------ model building

/** Which view a model's part is drawn in (the per-vertex `lod` the object shader reads): always, only close up, or
 *  only from afar (materials.ts `LOD_NEAR_PX` sets where they meet). */
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

  /** Its foliage lighter higher up, as the game's `species` is (palette.ts `crownShade`, by each vertex's height). */
  graded(species: string): this {
    for (let k = 0; k < this.col.length; k += 3) {
      if (!isFoliage([this.col[k], this.col[k + 1], this.col[k + 2]])) continue;
      const s = crownShade(species, this.pos[k + 1]);
      for (let c = 0; c < 3; c++) this.col[k + c] *= s;
    }
    return this;
  }

  /** Its colours as albedos in the game's light, being colours of our own (palette.ts `ownAlbedo`). */
  own(): this {
    for (let k = 0; k < this.col.length; k++) this.col[k] /= OWN_LIGHTNESS;
    return this;
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
}

/** A plant's dying form (dying.ts): its foliage in the game's dry colour, drawn in toward the trunk and sunk as much as the
 *  game's is; each triangle's normal made again where it moved. */
function dyingOf(species: string, m: Model): Model {
  const d = DRYING[species];
  const out = new Model();
  out.lod = m.lod.slice();
  for (let v = 0; v < m.pos.length; v += 9) {
    const tri = m.pos.slice(v, v + 9);
    let moved = false;
    for (let k = 0; k < 3; k++) {
      const c: Rgb = [m.col[v + k * 3], m.col[v + k * 3 + 1], m.col[v + k * 3 + 2]];
      out.col.push(...dryColour(species, c));
      if (d.mode === "ratio" || isFoliage(c)) {
        tri[k * 3] *= d.reach;
        tri[k * 3 + 1] *= d.height;
        tri[k * 3 + 2] *= d.reach;
        moved = true;
      }
    }
    out.pos.push(...tri);
    if (!moved) {
      out.nrm.push(...m.nrm.slice(v, v + 9));
      continue;
    }
    const n = new Vector3(tri[3] - tri[0], tri[4] - tri[1], tri[5] - tri[2]).cross(new Vector3(tri[6] - tri[0], tri[7] - tri[1], tri[8] - tri[2])).normalize();
    for (let k = 0; k < 3; k++) out.nrm.push(n.x, n.y, n.z);
  }
  return out;
}

/** A model's height (its highest vertex). */
function heightOf(m: Model): number {
  let h = 0;
  for (let k = 1; k < m.pos.length; k += 3) h = Math.max(h, m.pos[k]);
  return h;
}

/** A model scaled upright to height `h` (a dead plant at the game's height for it), its normals made again. */
function heightTo(m: Model, h: number): Model {
  const k = h / heightOf(m);
  for (let v = 1; v < m.pos.length; v += 3) m.pos[v] *= k;
  for (let v = 0; v < m.pos.length; v += 9) {
    const p = m.pos;
    const n = new Vector3(p[v + 3] - p[v], p[v + 4] - p[v + 1], p[v + 5] - p[v + 2]).cross(new Vector3(p[v + 6] - p[v], p[v + 7] - p[v + 1], p[v + 8] - p[v + 2])).normalize();
    for (let c = 0; c < 3; c++) m.nrm.splice(v + c * 3, 3, n.x, n.y, n.z);
  }
  return m;
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

/** Build parts on the north face (−Z) and turn them to face `f` (0 north, 1 east, 2 south,
 *  3 west). */
function onFace(m: Model, f: number, build: () => void): void {
  const before = m.pos.length / 3;
  build();
  if (f % 4) rotateTail(m, m.pos.length / 3 - before, (-f * Math.PI) / 2, 0);
}

const shade = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];

const BARK: Rgb = TREE_COLOURS.pineBark;
export const BIRCH_BARK: Rgb = TREE_COLOURS.birchBark;
const OAK_BARK: Rgb = TREE_COLOURS.oakBark;
const BUSH_LEAVES: Rgb = TREE_COLOURS.bush;
/** The berries (palette.ts `BERRY`). */
const BERRY: Rgb = TREE_COLOURS.berry;
/** Bare dead wood as the game's (dying.ts `DEAD_FORM`): each tree's own bark weathered, the pine's and oak's lighter and
 *  greyer brown, still lighter than the living crowns; a dead birch keeps its warm grey, a fifth darker. Where a limb broke the
 *  wood is paler. */
const DEAD_WOOD: Rgb = deadWood("Pine", BARK);
const DEAD_DARK: Rgb = shade(DEAD_WOOD, 0.85);
const DEAD_BIRCH: Rgb = deadWood("Birch", BIRCH_BARK);
const DEAD_BARK: Rgb = deadWood("Oak", OAK_BARK);
const DEAD_BREAK: Rgb = shade(deadWood("Oak", OAK_BARK), 1.35);

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

const MODELS: Record<string, () => Model> = {
  // the game's grown pine (plantSize.ts): a bare trunk to 1.25, then three broad whorls of needles to 3.0, each about as
  // wide as the last, the top one narrower; 1.0 across, as much as the game's needles cover (its cards cut by their
  // texture's alpha: 1.05 across from above, its whole model 1.2; until 2026-11-09 ours were 1.24 across and covered 45 %
  // more than the game's, `tools/game-crowns.py`); lighter higher up, as the game's (`graded`)
  Pine: () =>
    new Model()
      .add(cyl(0.11, 0.06, 1.75, 5), BARK, { y: 0.875 })
      .add(cone(0.51, 0.8, 7), TREE_COLOURS.pine, { y: 1.22 + 0.4 })
      .add(cone(0.475, 0.72, 7), TREE_COLOURS.pine, { y: 1.84 + 0.36, ry: 0.45 })
      .add(cone(0.33, 0.6, 7), TREE_COLOURS.pine, { y: 2.4 + 0.3, ry: 0.9 })
      .graded("Pine"),
  // (each dead tree the game's at its size: dying.ts DEAD_LIMBS)
  "Pine.dead": () => deadTree("Pine", { wood: DEAD_WOOD, dark: DEAD_DARK }),
  // the game's grown birch: a warm grey trunk forking low into two stems, under a round crown from 0.95 to 1.92, 1.0 across
  Birch: () =>
    new Model()
      .add(cyl(0.075, 0.06, 0.45, 5), BIRCH_BARK, { y: 0.225 })
      .add(cyl(0.077, 0.075, 0.06, 5), ownAlbedo([0.18, 0.16, 0.15]), { y: 0.3 })
      .add(cyl(0.055, 0.035, 0.75, 4), BIRCH_BARK, { x: -0.07, y: 0.78, rz: 0.2 })
      .add(cyl(0.05, 0.035, 0.7, 4), BIRCH_BARK, { x: 0.07, y: 0.76, rz: -0.22, ry: 0.4 })
      .add(ico(0.5), TREE_COLOURS.birch, { y: 1.42, sy: 0.98 })
      .add(oct(0.3), shade(TREE_COLOURS.birch, 1.08), { x: 0.2, y: 1.58, z: -0.14 })
      .graded("Birch"),
  "Birch.dead": () => deadTree("Birch", { wood: DEAD_BIRCH }),
  // the game's grown oak: a thick trunk to 1.2, flared at the root, under one broad, flat-layered crown from 1.13 to 2.26,
  // 1.7 across
  Oak: () =>
    new Model()
      .add(cyl(0.2, 0.13, 1.3, 6), OAK_BARK, { y: 0.65 })
      .add(ico(0.86), TREE_COLOURS.oak, { y: 1.62, sy: 0.54 })
      .add(oct(0.42), shade(TREE_COLOURS.oak, 1.08), { x: 0.48, y: 1.42, z: 0.3, sy: 0.6, ry: 0.4 })
      .add(oct(0.4), shade(TREE_COLOURS.oak, 0.92), { x: -0.45, y: 1.48, z: -0.28, sy: 0.6, ry: 1.1 })
      .add(oct(0.44), shade(TREE_COLOURS.oak, 1.05), { y: 2.02, sy: 0.55, ry: 0.7 })
      .graded("Oak"),
  "Oak.dead": () => deadTree("Oak", { wood: DEAD_BARK, break: DEAD_BREAK }),
  Succulent: () => succulent(false),
  "Succulent.dead": () => succulent(true),
  // the game's grown blueberry bush: a low mound 0.4 tall, its berries on top; 0.94 across, as much as the game's leaves
  // cover (its cards cut by their texture's alpha: 0.93 across from above, its whole model 1.1; until 2026-11-09 ours was
  // 1.1 across and covered 44 % more than the game's, `tools/game-crowns.py`)
  BlueberryBush: () => {
    const m = new Model().add(ico(0.47), BUSH_LEAVES, { y: 0.13, sy: 0.57 });
    const flowers: [number, number, number][] = [[0.24, 0.3, 0.17], [-0.13, 0.32, 0.22], [0.07, 0.32, -0.24], [0.34, 0.2, -0.17], [-0.3, 0.24, -0.1]];
    for (const [x, y, z] of flowers) m.add(new OctahedronGeometry(0.07, 0), BERRY, { x, y, z });
    return m;
  },
  // the game's dead bush keeps its leaves, gone brown, and loses its berries (dying.ts `DEAD_FORM`)
  "BlueberryBush.dead": () => new Model().add(ico(0.47), deadLeaves("BlueberryBush", BUSH_LEAVES), { y: 0.13, sy: 0.57 }),
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
    // the game's water source (WaterSource.Model, D496): an outcrop of dark rock 1.0 high over its tile, a little
    // wider than it (1.14 × 1.18), lighter on top; the water wells up round it
    const m = new Model();
    const rocks: [number, number, number, number, number, Rgb][] = [
      // x, y, z, radius, height ÷ radius, colour: a block of rock as full as the game's, to 1.0
      [0.0, 0.5, 0.0, 0.5, 1.06, LANDMARK.rock],
      [0.21, 0.33, -0.21, 0.35, 1.02, LANDMARK.rockLow],
      [-0.21, 0.32, 0.21, 0.35, 1.0, LANDMARK.rockLow],
      [0.21, 0.33, 0.21, 0.35, 1.02, LANDMARK.rock],
      [-0.21, 0.32, -0.21, 0.35, 1.0, LANDMARK.rock],
      [0.15, 0.72, -0.1, 0.27, 1.0, LANDMARK.rockTop],
      [-0.12, 0.7, 0.13, 0.28, 1.0, LANDMARK.rockTop],
    ];
    rocks.forEach(([x, y, z, r, sy, c], k) => m.add(ico(r), c, { x, y, z, sy, ry: k * 1.3 }));
    return m;
  },
  BadwaterSource: () => {
    // the game's badwater source (BadwaterSource.Model, D496): a flat, dark crater 2.5 across over its 3 × 3 footprint
    // (centred on it), darker toward its middle, a few low stones round its rim; the badwater wells up over it
    const m = new Model()
      .add(new CylinderGeometry(1.27, 1.27, 0.02, 11), LANDMARK.crater, { y: 0.01 })
      .add(new CylinderGeometry(0.85, 0.85, 0.01, 11), LANDMARK.craterDeep, { y: 0.024, ry: 0.3 })
      .add(new CylinderGeometry(0.36, 0.36, 0.01, 9), shade(LANDMARK.craterDeep, 0.85), { y: 0.03 });
    for (let k = 0; k < 9; k++) {
      const a = (k * 2 * Math.PI) / 9 + 0.2 * (k % 3);
      const r = 1.08 + 0.1 * ((k * 5) % 3);
      m.add(ico(0.11 + 0.03 * (k % 2)), LANDMARK.craterRim, { x: Math.cos(a) * r, y: 0.02, z: Math.sin(a) * r, sy: 0.3, ry: k });
    }
    return m;
  },
  UndergroundRuins: () => mineSite(),
  // (the game's crust of sulphur round its vent, and its rocks, at its measures and in its colours, each corner its own:
  // geothermal.ts)
  GeothermalField: () => perCorner(geothermalParts()),
  // (the game's fallen telescope and crashed satellite, at their measures and in their colours: smallRelics.ts)
  SmallRelic: () => fromParts(smallRelicParts()),
  MediumRelic: () => fromParts(mediumRelicParts()),
  // (the game's fallen dish antenna, at its measures and in its colours: largeRelic.ts)
  LargeRelic: () => {
    const m = new Model();
    for (const { points, colour } of largeRelicParts()) m.tris(points, colour);
    return m;
  },
  // (the game's heap of rock, posts and plank shards, at its measures and in its colours: blockage.ts)
  Blockage: () => {
    const m = new Model();
    for (const { points, colour } of blockageParts()) m.tris(points, colour);
    return m;
  },
  // (the game's low heap of brown rock, logs through it and flat stones over it, at its measures and in its colours:
  // naturalDam.ts)
  NaturalDam: () => fromParts(naturalDamParts()),
  // (the game's spikes and twigs, at their measures and in their colours, each corner its own: thorns.ts)
  Thorns: () => perCorner(thornsParts()),
  WaterSeep: () => seep(false),
  BadwaterSeep: () => seep(true),
  Aquifer: aquifer,
  AncientAquiferDrill: aquiferDrill,
  // (the game's box of rusted plate with its mouth and hood, at its measures and in its colours: badtideDrain.ts)
  BadtideDrain: () => fromParts(badtideDrainParts()),
  UnstableCore: () => fromParts(unstableCoreParts()),
  ReservePile: reservePile,
  ReserveWarehouse: reserveWarehouse,
  ReserveTank: reserveTank,
};
/** The models in the game's own colours, its albedo straight (palette.ts `TREE_COLOURS`, `LANDMARK`, `SMALL_RELIC`, `MEDIUM_RELIC`, `LARGE_RELIC`, `BLOCKAGE`; the
 *  ruins and the start are made apart). Every other model's colours are our own, drawn at `ownAlbedo` (palette.ts
 *  `OWN_LIGHTNESS`). */
const GAME_COLOURED = new Set(["Pine", "Birch", "Oak", "BlueberryBush", "WaterSource", "BadwaterSource", "WaterSeep", "BadwaterSeep", "SmallRelic", "MediumRelic", "LargeRelic", "Blockage", "NaturalDam", "BadtideDrain", "UnstableCore", "Thorns", "GeothermalField"]);
for (const key of Object.keys(MODELS))
  if (!GAME_COLOURED.has(key.split(".")[0])) {
    const make = MODELS[key];
    MODELS[key] = () => make().own();
  }
// (each plant's dying form, drawn while it is dying: dying.ts; its dead form at the game's height for it)
for (const species of Object.keys(DRYING)) MODELS[`${species}.dying`] = () => dyingOf(species, MODELS[species]());
for (const species of Object.keys(DEAD_FORM)) {
  const dead = MODELS[`${species}.dead`];
  if (dead) MODELS[`${species}.dead`] = () => heightTo(dead(), DEAD_FORM[species].height * heightOf(MODELS[species]()));
}

// ------------------------------------------------------------------------------ the 1.x objects

// Models of our own for the objects Timberborn 1.x added (the succulent, the seeps, the aquifer and its
// drill, the badtide drain, the unstable core and the reserves), each shaped after the game's own
// object, within its footprint (a model's x is east and z south; a footprint's local y runs north, so
// −z) and centred on it (`CENTRED`). Flat vertex colours and low triangle counts, like the others;
// both looks draw them. A seep's pit is a terrain cut-out (`mineCutout`), like a mine site's.

/** A dead tree's wood (dying.ts `DEAD_LIMBS`) in its colours by part. */
function deadTree(species: keyof typeof DEAD_LIMBS, colours: Partial<Record<DeadPart, Rgb>>): Model {
  const m = new Model();
  const colour = (part: DeadPart) => colours[part] ?? colours.wood!;
  for (const { line, sides, part, tip, cap } of DEAD_LIMBS[species]) {
    tube(m, line.slice(0, -1), sides, colour(part));
    tube(m, line.slice(-2), sides, colour(tip ?? part));
    if (!cap) continue;
    // (the top end closed: a disc across it, facing along the last length)
    const [a, b] = line.slice(-2);
    const d = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    m.add(new CircleGeometry(b[3], sides, -Math.PI / 2).applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), d)), colour(cap), { x: b[0], y: b[1], z: b[2] });
  }
  return m;
}

/** A tapering tube along a line of points (x, y, z, radius): an open cylinder of `sides` from each point to the next
 *  (2 × sides triangles each), or a cone to a point of radius 0 (sides triangles). */
function tube(m: Model, line: readonly (readonly number[])[], sides: number, color: Rgb): void {
  for (let i = 0; i + 1 < line.length; i++) {
    const [a, b] = [line[i], line[i + 1]];
    const d = new Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const g = (b[3] > 0 ? new CylinderGeometry(b[3], a[3], d.length(), sides, 1, true) : new ConeGeometry(a[3], d.length(), sides, 1, true)).applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), d.clone().normalize()));
    m.add(g, color, { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, z: (a[2] + b[2]) / 2 });
  }
}

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
  // (dead: darker by the game's ratio, its pads gone the game's dead red-brown: dying.ts `DEAD_FORM`)
  const mid: Rgb = dead ? deadRatio("Succulent", [0.5, 0.36, 0.22]) : [0.5, 0.36, 0.22];
  const dark: Rgb = dead ? deadRatio("Succulent", [0.43, 0.3, 0.18]) : [0.43, 0.3, 0.18];
  const cx = 0;
  const m = new Model();
  const rings: [number, number][] = [[0.1, 0.17], [0.17, 0.19], [0.19, 0.15], [0.15, 0.08]];
  rings.forEach(([r0, r1], k) => m.add(cyl(r0, r1, 0.17, 6), k % 2 ? dark : mid, { x: cx, y: 0.085 + 0.17 * k, ry: 0.3 * k }));
  const green: Rgb = dead ? deadLeaves("Succulent", SAGE) : SAGE;
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

/** A seep (2 × 2), as the game's (WaterSeep.Model, BadwaterSeep.Model; D496): a stone slab over the footprint at the
 *  ground, round a pit heaped with rounded rocks a little over half a tile across that rise above it, to 0.57 for water
 *  and 0.40 for badwater, with dark gaps between them: teal for water, rust orange for badwater. The pit is a terrain
 *  cut-out (`mineCutout`), its walls and floor in the gaps' colour, 0.5 deep for water and 0.2 for badwater, as the
 *  game's are. */
function seep(bad: boolean): Model {
  const slab = bad ? LANDMARK.badSeepSlab : LANDMARK.seepSlab;
  const rock = bad ? LANDMARK.badSeepRock : LANDMARK.seepRock;
  const gap = bad ? LANDMARK.badSeepGap : LANDMARK.seepGap;
  const d = bad ? 0.2 : 0.5;
  const a = 0.78;
  const m = new Model();
  for (let f = 0; f < 4; f++)
    onFace(m, f, () => {
      // the pit's wall, and the slab's side of the footprint (overlapping at the corners)
      m.add(plane(2 * a, d), shade(gap, 0.8), { y: -d / 2, z: -a });
      m.add(box(2, 0.05, 1 - a), slab, { y: 0.025, z: -(1 + a) / 2 });
      // studs along the slab's edge
      for (const x of [-0.72, 0.38]) m.add(oct(0.045), shade(slab, 0.85), { x, y: 0.05, z: -0.93 });
    });
  m.add(plane(2 * a, 2 * a), gap, { rx: -Math.PI / 2, y: -d });
  const top = bad ? 0.4 : 0.57;
  // the rocks heaped over the pit, rounded and about the game's size: nine low ones over it, their tops a little over the
  // slab, and three in the middle stacked on them, the tallest to the heap's top; the narrow gaps between them dark. Each
  // given by where it stands, its radius, how much flatter than round it is and its top over the level (as a share of
  // the water seep's heap: a badwater seep's is lower).
  const rocks: [number, number, number, number, number][] = [
    // x, z, radius, height / width, top
    [-0.5, -0.5, 0.29, 0.72, 0.19],
    [0.02, -0.53, 0.3, 0.75, 0.25],
    [0.52, -0.48, 0.28, 0.7, 0.17],
    [-0.53, 0.01, 0.3, 0.74, 0.24],
    [0.0, 0.0, 0.31, 0.8, 0.33],
    [0.51, 0.04, 0.29, 0.72, 0.22],
    [-0.48, 0.52, 0.28, 0.7, 0.16],
    [0.04, 0.51, 0.3, 0.74, 0.23],
    [0.5, 0.5, 0.29, 0.72, 0.18],
    [-0.16, -0.12, 0.24, 0.85, 0.47],
    [0.2, 0.14, 0.23, 0.82, 0.42],
    [0.02, 0.0, 0.2, 0.9, 0.57],
  ];
  // (an icosahedron's top vertex stands 0.851 of its radius over its middle)
  rocks.forEach(([x, z, r, flat, t], k) => {
    const y = (t * top) / 0.57 - 0.851 * r * flat;
    m.add(ico(r), shade(rock, 0.86 + 0.07 * (k % 3)), { x, y, z, sx: 1 + 0.08 * Math.sin(k * 2.3), sy: flat, sz: 1 + 0.08 * Math.cos(k * 1.9), ry: k * 0.9 });
  });
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
export const MINE_PIT = { half: 2.18, depth: 1.35 } as const;

/** A mine site, centred on its 5 × 5 footprint, as the game's (UndergroundRuins.Model; D178, D496): a rusty frame round
 *  the footprint's edge; inside it the pit, filling most of the footprint, with its dark earthen walls and floor, roots
 *  hanging and running over the floor, rock and cracks; ground in its corners, as the game's round pit leaves them, a
 *  ledge falling into the pit as an earthen bank along an arc; rusty posts standing down into the pit round its lip, joined by beams. No scaffolding: the game's has
 *  none. Within ±2.5 of the middle: the footprint. */
function mineSite(): Model {
  const m = new Model();
  const p = MINE_PIT.half;
  const d = MINE_PIT.depth;
  // the pit's walls: a band of browner topsoil under a rusty lip, earth with a pale seam, darker
  // toward the floor; the floor darker toward its edges
  const soil = 0.34;
  const low = 0.3;
  for (let f = 0; f < 4; f++)
    onFace(m, f, () => {
      m.add(plane(2 * p, soil), MINE.earthTop, { y: -soil / 2, z: -p });
      m.add(plane(2 * p, d - soil - low), MINE.earth, { y: -soil - (d - soil - low) / 2, z: -p });
      m.add(plane(2 * p, low), MINE.earthLow, { y: -d + low / 2, z: -p });
      m.add(plane(2 * p, 0.05), MINE.seam, { y: -0.68 - 0.06 * (f % 2), z: -p + 0.006 });
      m.add(plane(2 * p, 0.2), shade(MINE.frame, 0.8), { y: -0.1, z: -p + 0.012 });
    });
  const floor = (w: number, color: Rgb, y: number) => m.add(plane(w, w), color, { rx: -Math.PI / 2, y: -d + y });
  floor(2 * p, MINE.floorEdge, 0);
  floor(2 * p - 1.1, MINE.floor, 0.004);
  // cracks down the walls and over the floor: dark zigzags
  const cracks: [number, number, number, number, number][] = [
    // face, x, top, length, lean
    [0, -0.6, -0.25, 0.8, 0.25],
    [0, 0.7, -0.45, 0.7, -0.3],
    [1, -0.4, -0.3, 0.8, 0.2],
    [1, 0.5, -0.5, 0.6, -0.2],
    [2, 0.6, -0.2, 0.7, -0.2],
    [2, -0.7, -0.4, 0.7, 0.25],
    [3, -0.5, -0.35, 0.8, 0.3],
    [3, 0.8, -0.5, 0.6, -0.25],
  ];
  for (const [f, x, top, len, lean] of cracks)
    onFace(m, f, () => {
      m.add(plane(0.05, len * 0.5), MINE.crack, { rz: lean, x, y: top - len * 0.25, z: -p + 0.01 });
      m.add(plane(0.04, len * 0.5), MINE.crack, { rz: -lean, x: x - Math.sin(lean) * len * 0.22, y: top - len * 0.72, z: -p + 0.01 });
    });
  for (const [x, z, len, turn] of [[-0.9, 0.6, 0.8, 0.6], [0.7, 0.9, 0.7, -0.5], [0.9, -0.7, 0.8, -0.9], [-0.7, -0.9, 0.6, 0.4]] as const) m.add(plane(len, 0.022), MINE.floorCrack, { rx: -Math.PI / 2, ry: turn, x, y: -d + 0.008, z });
  // roots: hanging from the rim down the walls, dark and pale, and running over the floor
  const hanging: [number, number, number][] = [
    // x, length, tilt
    [-1.0, 0.7, 0.15],
    [-0.55, 0.9, 0.1],
    [0.1, 0.55, -0.15],
    [0.75, 0.85, 0.2],
  ];
  for (let f = 0; f < 4; f++)
    hanging.forEach(([x, len, tilt], k) => {
      if ((k + f) % 4 === 3) return;
      const l = len * (0.8 + 0.1 * ((k * 3 + f) % 4));
      onFace(m, f, () => m.add(cone(0.05, l, 3), (k + f) % 3 ? MINE.root : MINE.rootPale, { rx: Math.PI, rz: tilt, x: x * (f % 2 ? -1 : 1), y: -0.05 - l / 2, z: -p + 0.06 }));
    });
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4 + 0.35;
    const r0 = 0.6;
    const r1 = 1.15;
    const len = r1 - r0;
    m.add(cone(0.035, len, 3), k % 2 ? MINE.root : MINE.rootPale, { rz: Math.PI / 2, ry: a, x: Math.cos(a) * (r0 + len / 2), y: -d + 0.03, z: -Math.sin(a) * (r0 + len / 2) });
  }
  // rock over the floor, as the game's pit is strewn: a boulder in the middle, rubble round it
  m.add(ico(0.42), MINE.rubble[1], { x: 0.1, y: -d + 0.16, z: -0.05, sy: 0.55, ry: 0.4 });
  const rubble: [number, number, number, number][] = [
    // x, z, radius, shade
    [-0.95, -0.9, 0.3, 0],
    [-0.6, -1.15, 0.22, 1],
    [1.0, 0.55, 0.26, 0],
    [0.75, 1.05, 0.2, 2],
    [-1.05, 0.5, 0.2, 1],
    [0.5, -1.0, 0.18, 2],
    [-0.4, 0.95, 0.16, 0],
    [0.65, -0.35, 0.12, 2],
    [-0.55, 0.15, 0.12, 1],
  ];
  rubble.forEach(([x, z, r, s], k) => m.add(k % 2 ? oct(r) : ico(r), MINE.rubble[s], { x, y: -d + r * 0.4, z, sy: 0.6, ry: k }));
  // the pit's corners: the ground the game's round pit leaves in its square, a ledge a little under the level (the game's
  // is 0.1 under) whose edge is an arc, falling into the pit as a bank of topsoil over earth, as the walls are, and a few
  // stones on it. Each arc runs between the walls `a` from the corner's middle, round the pit's middle.
  const c = 1.0;
  const arc = (a: number, y: number, n: number): number[][] => {
    const r = Math.hypot(a, p);
    const f0 = Math.atan2(p, a);
    const f1 = Math.atan2(a, p);
    return Array.from({ length: n + 1 }, (_, i) => {
      const f = f0 + ((f1 - f0) * i) / n;
      return [r * Math.cos(f), y + (i % 2 && i < n ? 0.025 * (i % 4 === 1 ? 1 : -1) : 0), -r * Math.sin(f)];
    });
  };
  /** A triangle facing `toward`. */
  const tri = (a: number[], b: number[], q: number[], color: Rgb, toward: number[]) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [q[0] - a[0], q[1] - a[1], q[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const out = n[0] * toward[0] + n[1] * toward[1] + n[2] * toward[2] >= 0;
    m.tris([...a, ...(out ? b : q), ...(out ? q : b)], color);
  };
  const N = 6;
  for (let f = 0; f < 4; f++)
    onFace(m, f, () => {
      // (built in the north-east corner, x east, z south)
      const lip = arc(p - c, -0.1, N);
      const mid = arc(p - c - 0.3, -0.42, N);
      const foot = arc(p - c - 0.6, -d, N);
      const corner = [p, -0.08, -p];
      for (let i = 0; i < N; i++) {
        tri(corner, lip[i], lip[i + 1], shade(MINE.ledge, 0.92 + 0.08 * ((i + f) % 2)), [0, 1, 0]);
        for (const [hi, lo, color] of [[lip, mid, MINE.earthTop], [mid, foot, MINE.earth]] as const) {
          const into = [-(hi[i][0] + hi[i + 1][0]), 0.4, -(hi[i][2] + hi[i + 1][2])];
          const k = 0.9 + 0.1 * ((i + f) % 2);
          tri(hi[i], lo[i], lo[i + 1], shade(color, k), into);
          tri(hi[i], lo[i + 1], hi[i + 1], shade(color, k), into);
        }
      }
      m.add(ico(0.11), MINE.rubble[f % 3], { x: 1.92, y: -0.07, z: -1.9, sy: 0.55, ry: f });
      m.add(ico(0.075), MINE.rubble[(f + 1) % 3], { x: 1.58 + 0.06 * (f % 2), y: -0.08, z: -2.02, sy: 0.6, ry: f + 1 });
    });
  // rusty posts down into the pit round its lip, two a side, joined along each side and across each corner
  const e = p - 0.08;
  const q = p - c + 0.02;
  for (let f = 0; f < 4; f++)
    onFace(m, f, () => {
      for (const x of [-q, q]) m.add(bar(0.055, d + 0.2), shade(MINE.frame, 0.9), { x, y: (0.2 - d) / 2, z: -e });
      m.add(box(2 * q + 0.12, 0.09, 0.09), MINE.frame, { y: 0.1, z: -e });
      beam(m, [q, 0.1, -e], [e, 0.1, -q], 0.04, shade(MINE.frame, 0.95));
    });
  // the rusty frame round the footprint's edge: four beams, a lighter strip along each
  const fw = 2.5 - p;
  for (let f = 0; f < 4; f++)
    onFace(m, f, () => {
      m.add(box(5, 0.2, fw), MINE.frame, { y: 0.05, z: -p - fw / 2 });
      m.add(box(5 - 0.12, 0.03, 0.06), shade(MINE.frame, 1.12), { y: 0.16, z: -2.5 + 0.06 });
    });
  return m;
}

/** Where the terrain leaves its tops out for mine sites' and seeps' pits and geothermal fields' vents (mesh.ts
 *  `cutout`): tile index → the object's level, for every tile of each mine site's 5 × 5 footprint (the model covers
 *  them all: its frame the edge, its pit the rest), of each seep's 2 × 2 (its pit, whole) and a geothermal field's
 *  middle tile, as the game's `BlockObjectTerrainCutoutSpec` cuts it (its crust covers the tile, its bowl and vent below
 *  the ground there). */
export function mineCutout(v: EntityView, W: number, H: number): Map<number, number> {
  const out = new Map<number, number>();
  for (let k = 0; k < v.count; k++) {
    const template = v.templates[v.template[k]];
    const o = ORIENTATION_NAMES[v.orientation[k]] as Orientation;
    if (template === "GeothermalField") {
      const [dx, dy] = rotate(o, 1, 1);
      const x = v.x[k] + dx;
      const y = v.y[k] + dy;
      if (x >= 0 && y >= 0 && x < W && y < H) out.set(y * W + x, v.z[k]);
      continue;
    }
    const size = template === "UndergroundRuins" ? 5 : template === "WaterSeep" || template === "BadwaterSeep" ? 2 : 0;
    if (!size) continue;
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

/** A model of triangles each corner of which has its own colour (thorns.ts, geothermal.ts). */
function perCorner({ points, colours }: { points: number[]; colours: number[] }): Model {
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(points, 3));
  let k = 0;
  return new Model().add(g, () => {
    const c: Rgb = [colours[k], colours[k + 1], colours[k + 2]];
    k += 3;
    return c;
  });
}

/** A model of triangles by colour (our own models of the game's, built as parts). */
function fromParts(parts: readonly { points: number[]; colour: Rgb }[]): Model {
  const m = new Model();
  for (const { points, colour } of parts) m.tris(points, colour);
  return m;
}


/** The light look's models, for browsers that render in software (a few triangles each; D110). */
const LITE_MODELS: Record<string, () => Model> = {
  Pine: () => new Model().add(cone(0.1, 1.4, 3), BARK, { y: 0.7 }).add(cone(0.5, 1.8, 4), TREE_COLOURS.pine, { y: 1.2 + 0.9 }),
  Birch: () => new Model().add(cone(0.07, 1.1, 3), BIRCH_BARK, { y: 0.55 }).add(new OctahedronGeometry(0.5, 0), TREE_COLOURS.birch, { y: 1.42, sy: 1.0 }),
  Oak: () => new Model().add(cone(0.18, 1.3, 3), OAK_BARK, { y: 0.65 }).add(new OctahedronGeometry(0.86, 0), TREE_COLOURS.oak, { y: 1.66, sy: 0.6 }),
  // dead trees: a pale trunk and two bare branches (a few triangles each)
  "Pine.dead": () => liteDead(0.08, 1.35, 0.12, DEAD_WOOD),
  "Birch.dead": () => liteDead(0.07, 0.95, 0.4, DEAD_BIRCH),
  "Oak.dead": () => liteDead(0.14, 0.7, 0.26, DEAD_BARK),
  "BlueberryBush.dead": () => new Model().add(new OctahedronGeometry(0.47, 0), deadLeaves("BlueberryBush", BUSH_LEAVES), { y: 0.13, sy: 0.57 }),
  Succulent: () => liteSucculent().own(),
  BlueberryBush: () => new Model().add(new OctahedronGeometry(0.47, 0), BUSH_LEAVES, { y: 0.13, sy: 0.57 }),
};
for (const species of Object.keys(DRYING)) if (LITE_MODELS[species]) LITE_MODELS[`${species}.dying`] = () => dyingOf(species, LITE_MODELS[species]());
for (const species of Object.keys(DEAD_FORM)) {
  const dead = LITE_MODELS[`${species}.dead`];
  if (dead && LITE_MODELS[species]) LITE_MODELS[`${species}.dead`] = () => heightTo(dead(), DEAD_FORM[species].height * heightOf(LITE_MODELS[species]()));
}
/** The light look's ruin: its four posts and two bands of slab round it (scaled to its height). */
const LITE_RUIN = () => {
  const m = new Model();
  for (const [x, z] of [[RUIN_POST, -RUIN_POST], [RUIN_POST, RUIN_POST], [-RUIN_POST, RUIN_POST], [-RUIN_POST, -RUIN_POST]]) m.add(box(0.08, 1, 0.08), RUIN.rust, { x, y: 0.5, z });
  for (let f = 0; f < 4; f++) onFace(m, f, () => [0.3, 0.75].forEach((y) => m.add(box(0.92, 0.12, 0.03), RUIN.slab, { y, z: RUIN_FACE_Z })));
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

/** A surface turned round the vertical through `rings` (radius, height; a radius given as [half-width] is a square of
 *  that half-width), `n` sides, facing out (a flat ring facing up). */
function lathe(m: Model, rings: readonly (readonly [number | readonly [number], number])[], n: number, color: Rgb): void {
  const at = (ring: readonly [number | readonly [number], number], j: number): number[] => {
    const a = (2 * Math.PI * j) / n;
    const [s, c] = [Math.sin(a), Math.cos(a)];
    const r = typeof ring[0] === "number" ? ring[0] : ring[0][0] / Math.max(Math.abs(s), Math.abs(c));
    return [r * s, ring[1], r * c];
  };
  for (let i = 0; i + 1 < rings.length; i++)
    for (let j = 0; j < n; j++) {
      const q = [at(rings[i], j), at(rings[i], j + 1), at(rings[i + 1], j + 1), at(rings[i + 1], j)];
      for (const [a, b, c] of [[q[0], q[1], q[2]], [q[0], q[2], q[3]]]) {
        const u = b.map((v, k) => v - a[k]);
        const w = c.map((v, k) => v - a[k]);
        const nrm = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
        const mid = [0, 1, 2].map((k) => (a[k] + b[k] + c[k]) / 3);
        const out = nrm[0] * mid[0] + nrm[2] * mid[2];
        const flip = Math.abs(out) > 1e-6 ? out < 0 : nrm[1] < 0;
        m.tris(flip ? [...a, ...c, ...b] : [...a, ...b, ...c], color);
      }
    }
}

/** A flat piece with the convex outline `pts` (x, y) facing +Z, from z0 back to z1 in front, its rim closed. */
function plate(m: Model, pts: readonly (readonly [number, number])[], z0: number, z1: number, color: Rgb): void {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  for (let k = 0; k < pts.length; k++) {
    const [a, b] = [pts[k], pts[(k + 1) % pts.length]];
    facing(m, [[cx, cy, z1], [a[0], a[1], z1], [b[0], b[1], z1]], 1, color);
    facing(m, [[cx, cy, z0], [a[0], a[1], z0], [b[0], b[1], z0]], -1, color);
    // (the rim, facing away from the middle)
    const out = [b[1] - a[1], a[0] - b[0]];
    const s = out[0] * (a[0] - cx) + out[1] * (a[1] - cy) > 0 ? 1 : -1;
    const quad = [[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]];
    for (const [p, q, r] of [[quad[0], quad[1], quad[2]], [quad[0], quad[2], quad[3]]]) {
      const u = q.map((v, i) => v - p[i]);
      const w = r.map((v, i) => v - p[i]);
      const nx = u[1] * w[2] - u[2] * w[1];
      const ny = u[2] * w[0] - u[0] * w[2];
      m.tris((nx * out[0] + ny * out[1]) * s > 0 ? [...p, ...q, ...r] : [...p, ...r, ...q], color);
    }
  }
}

/** An arch's outline: a rectangle `w` wide to `spring` with a half circle on it, `n` steps round. */
const arch = (w: number, spring: number, n = 6): [number, number][] => [
  [w / 2, 0],
  ...Array.from({ length: n + 1 }, (_, k): [number, number] => [(w / 2) * Math.cos((Math.PI * k) / n), spring + (w / 2) * Math.sin((Math.PI * k) / n)]),
  [-w / 2, 0],
];
/** A round outline `r` across its half, `n` sides, round (cx, cy). */
const round = (r: number, cx = 0, cy = 0, n = 8): [number, number][] => Array.from({ length: n }, (_, k) => [cx + r * Math.cos((2 * Math.PI * k) / n + Math.PI / n), cy + r * Math.sin((2 * Math.PI * k) / n + Math.PI / n)]);

/** The start as the game draws it in play: the faction's district center, which the game builds where the map's
 *  StartingLocation stands (DistrictCenter.Folktails.Model, its measures; D178 as amended 2026-11-10, D496), centred on
 *  its 3 × 3 footprint, its door toward +Z (south, a Cw0 start's entrance side). A floor of pale wood 3 across; walls of
 *  dark planks 2.86 across to 1.0 between four pale corner posts 0.25 square to 1.21; an arched door in a pale frame
 *  0.88 wide to 0.76 on the front, round windows 0.52 across either side of it and one on each side; a thatched roof
 *  from its eaves at 0.9, 3.04 across, up to a pale collar round the tower at 1.48; the tower of dark planks, round,
 *  1.05 across its foot narrowing to 0.39 at 2.85, four pale ribs down it, a round window with a teal emblem on each
 *  face in a pale frame and a pale band round it at 2; a brown platform 1.02 across at 2.8 to 2.93 with four pale
 *  points out from it, pale railing posts and spindles to 3.16 and a pale frame; the fire bowl of iron on a pale stand;
 *  the lantern's four pale posts to 4.33 with brown brackets under a thatched hood 1.22 across from 3.78 to 4.21, open
 *  at the top round a brown ring. (The fire the game lights in it, its own particles, is left out.) */
function districtCenter(): Model {
  const m = new Model();
  const W = START.wood;
  m.add(box(3, 0.1, 3), W, { y: 0.05 });
  m.add(box(2.86, 1, 2.86), START.planks, { y: 0.5 });
  for (const x of [-1.425, 1.425]) for (const z of [-1.425, 1.425]) m.add(box(0.25, 1.21, 0.25), W, { x, y: 0.605, z });
  // the door in its frame on the front; round windows either side of it and one on each side
  plate(m, arch(0.88, 0.32), 1.38, 1.5, W);
  plate(m, arch(0.66, 0.33), 1.5, 1.515, START.door);
  for (const x of [-1, 1]) plate(m, round(0.26, x, 0.495), 1.42, 1.48, START.window);
  for (const f of [1, 3]) onFace(m, f, () => plate(m, round(0.26, 0, 0.495), -1.48, -1.42, START.window));
  // the thatched roof: its eaves, then up to the collar round the tower
  lathe(m, [[[1.42], 0.9], [[1.52], 1.08], [[1.42], 1.24], [1.12, 1.48]], 16, START.thatch);
  lathe(m, [[1.14, 1.44], [1.14, 1.53], [1.0, 1.53]], 16, W);
  // the tower, its ribs, its windows and the band round it
  lathe(m, [[1.05, 1.47], [0.61, 2.07], [0.39, 2.85]], 12, START.planks);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) beam(m, [0.79 * sx, 1.39, 0.79 * sz], [0.24 * sx, 2.87, 0.24 * sz], 0.04, shade(W, 0.94));
  for (let f = 0; f < 4; f++)
    onFace(m, f, () => {
      m.add(new CylinderGeometry(0.3, 0.3, 0.1, 8), W, { rx: Math.PI / 2 + 0.45, y: 2.08, z: -0.66 });
      m.add(new CylinderGeometry(0.21, 0.21, 0.1, 8), START.emblem, { rx: Math.PI / 2 + 0.45, y: 2.1, z: -0.72 });
      m.add(box(0.9, 0.13, 0.1), W, { y: 2.055, z: -0.5 });
    });
  // the platform, its points, its railing and frame
  m.add(box(1.02, 0.13, 1.02), START.brown, { y: 2.865 });
  for (let f = 0; f < 4; f++)
    onFace(m, f, () => {
      m.add(new CylinderGeometry(0.21, 0.21, 0.07, 3), W, { sz: 1.2, rx: 0, ry: Math.PI, y: 2.865, z: -0.6 });
      for (const x of [-0.275, -0.09, 0.09, 0.275]) m.add(bar(0.017, 0.14), W, { x, y: 2.99, z: -0.395 });
      m.add(box(0.84, 0.04, 0.08), W, { y: 3.07, z: -0.38 });
    });
  for (const x of [-0.245, 0.245]) for (const z of [-0.245, 0.245]) m.add(box(0.21, 0.26, 0.21), W, { x, y: 3.03, z });
  // the fire bowl
  lathe(m, [[0.15, 3.03], [0.27, 3.15], [0.26, 3.24], [0.22, 3.24]], 8, W);
  lathe(m, [[0.22, 3.2], [0, 3.2]], 8, START.iron);
  // the lantern: its posts and brackets, its thatched hood open at the top round a brown ring
  for (const x of [-0.34, 0.34])
    for (const z of [-0.34, 0.34]) {
      m.add(box(0.1, 1.42, 0.1), W, { x, y: 3.62, z });
      m.add(box(0.12, 0.47, 0.12), START.brown, { x, y: 3.965, z });
    }
  lathe(m, [[0.41, 3.78], [0.6, 3.84], [0.61, 3.9], [0.47, 4.1], [0.34, 4.21]], 12, shade(START.thatch, 1.03));
  lathe(m, [[0.34, 4.21], [0.26, 4.28], [0.2, 4.28]], 12, START.brown);
  lathe(m, [[0.34, 4.18], [0, 4.18]], 12, START.crown);
  return m;
}

/** The entrance tile's marker, an editing aid shown with Markers (renderer.ts; the game draws nothing there, D497): a flat
 *  stone and a lit post. */
function entrance(): Model {
  return new Model()
    .add(box(0.62, 0.06, 0.62), [0.84, 0.78, 0.64], { y: 0.03 })
    .add(cyl(0.03, 0.03, 0.55, 4), [0.3, 0.22, 0.15], { x: 0.24, y: 0.3, z: 0.18 })
    .add(box(0.12, 0.12, 0.12), [1.0, 0.85, 0.42], { x: 0.24, y: 0.6, z: 0.18 })
    .own();
}

// ------------------------------------------------------------------------------ ruins

/** Each variant's storeys as the game's are (RuinColumnA..E.Model, Timberborn 1.1.2.8, read for their measures; D178
 *  as amended 2026-11-10), from the top storey down: its faces north, east, south and west, each a whole band of
 *  slab over the storey's upper part ("S"), a broken one ("s"), rebar rails across it ("R") or nothing ("."). The
 *  game cuts each column's faces out of one cracked-concrete atlas whose rows are a storey apart and anchored at the
 *  column's top, so a variant's storeys read the same counted from its top whatever its height (a column is at most
 *  8 high). Read from the game's at height 8, its cut-out texels sorted by where they fall on each face. The top
 *  storey is its posts broken off with a stub of slab or a few rails. */
export const RUIN_FACES: readonly (readonly string[])[] = [
  [".sRR", "sSSS", "SsSs", "SS.S", "SsSS", "SSsS", "SsSS", "sSSS"],
  ["s.ss", "sSSS", "SSSs", "....", "sSSS", "SSSs", "sSsS", "S.SS"],
  [".RRR", "RRRR", "RRR.", "SSss", "ssSS", "ssSs", "SssS", "ssss"],
  ["sRss", "sSSS", "ssSs", "SSss", "sSSS", "ssSs", "sssS", "sRsS"],
  ["RR.R", "SsSs", "RRR.", "RRRR", ".RRR", "ssss", "sssS", "SsSS"],
];

/** The top storey's corner posts, broken off at these heights (north-east, south-east, south-west, north-west): the
 *  game's for each variant, the same at every height. */
export const RUIN_POST_TOPS: readonly (readonly [number, number, number, number])[] = [
  [0.76, 1, 0.93, 0.77],
  [0.85, 0.88, 0.54, 0.95],
  [1, 0.75, 0.95, 0.85],
  [0.65, 0.88, 0.83, 1],
  [0.73, 0.54, 0.94, 0.62],
];

/** The top storey's post bent over at its broken end, where a variant has one (A, E): its corner (`RUIN_POST_TOPS`'s
 *  order) and its end's offset across the tile (x, z), the game's. */
const RUIN_BENT: readonly ([number, number, number] | null)[] = [[2, 0.23, -0.34], null, null, null, [2, 0.06, -0.16]];

/** The first storey from the top with a floor slab at its foot, by variant (none in A and E): the game's B, C and D
 *  lay one under every storey from there down, B's first only half there. */
const RUIN_FLOOR_FROM = [Infinity, 1, 2, 1, Infinity];

/** The corner posts: 0.08 square, at the tile's corners, as the game's. */
export const RUIN_POST = 0.46;
const RUIN_POST_R = 0.04;
/** Where a storey's band of slab starts, under its top (the game's atlas rows: the slab over the upper 0.47). */
export const RUIN_BAND_LO = 0.53;
/** The slabs' middle and thickness: the game's faces lie on the tile's edges, ours just inside. */
const RUIN_FACE_Z = -0.46;
const RUIN_SLAB = 0.03;
/** The rails' heights in a storey (the game's two rows of rebar across a storey's upper part). */
const RUIN_RAILS = [0.64, 0.88];

/** How much ivy a storey carries: none, a little (the storeys above a wet column's second), clearly (a wet column's
 *  second storey, a dry column's foot), or the most (a wet column's foot). */
export const IVY_NONE = 0;
export const IVY_LIGHT = 1;
export const IVY_MEDIUM = 2;
export const IVY_DENSE = 3;

/** A triangle wound to face toward −Z (`toward` −1) or +Z (1). */
function facing(m: Model, p: readonly number[][], toward: number, color: Rgb): void {
  const [a, b, c] = p;
  const n = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  m.tris(n * toward > 0 ? [...a, ...b, ...c] : [...a, ...c, ...b], color);
}

/** A band of slab across a storey's north face (−Z; `onFace` turns it) from RUIN_BAND_LO to `hi`: whole across the
 *  face, or broken (`whole` false: one piece at a side or two round a gap, about half the face, as the game's broken
 *  rows are), each piece a slab with its lower edge cracked into teeth. `seed` picks the breaks. */
function band(m: Model, whole: boolean, hi: number, seed: [number, number]): void {
  if (hi - RUIN_BAND_LO < 0.06) return;
  const r = jitter(seed[0], seed[1], 60);
  const edge = RUIN_POST + RUIN_POST_R;
  const pieces: [number, number][] = whole
    ? [[-edge, edge]]
    : r < 0.34
      ? [[-edge, -edge + 0.4 + 0.2 * jitter(seed[0], seed[1], 61)]]
      : r < 0.67
        ? [[edge - 0.4 - 0.2 * jitter(seed[0], seed[1], 61), edge]]
        : [[-edge, -0.2 - 0.1 * jitter(seed[0], seed[1], 61)], [0.15 + 0.1 * jitter(seed[0], seed[1], 62), edge]];
  const col = shade(RUIN.slab, [0.97, 1, 1.02][(seed[0] + seed[1]) % 3]);
  const h = hi - RUIN_BAND_LO;
  for (const [a, b] of pieces) {
    m.add(box(b - a, h, RUIN_SLAB), col, { x: (a + b) / 2, y: RUIN_BAND_LO + h / 2, z: RUIN_FACE_Z });
    // its cracked lower edge: teeth hanging from it, seen from either side
    const n = Math.max(1, Math.round((b - a) / 0.2));
    const w = (b - a) / n;
    for (let t = 0; t < n; t++) {
      const d = 0.05 + 0.09 * jitter(seed[0] * 8 + t, seed[1], 63);
      const x0 = a + t * w;
      const tip = x0 + w * (0.3 + 0.4 * jitter(seed[0] * 8 + t, seed[1], 64));
      for (const side of [-1, 1]) {
        const z = RUIN_FACE_Z + (side * RUIN_SLAB) / 2;
        facing(m, [[x0, RUIN_BAND_LO, z], [x0 + w, RUIN_BAND_LO, z], [tip, RUIN_BAND_LO - d, z]], side, col);
      }
    }
  }
}

/** Two rebar rails across a storey's north face, at `ys`, each whole between the posts or broken off at one end. */
function rails(m: Model, ys: readonly number[], seed: [number, number]): void {
  const span = 2 * (RUIN_POST - RUIN_POST_R);
  ys.forEach((y, j) => {
    const r = jitter(seed[0] * 2 + j, seed[1], 65);
    const len = r < 0.6 ? span : span * (0.45 + 0.25 * r);
    const x = r < 0.6 ? 0 : (r < 0.8 ? -1 : 1) * (span - len) / 2;
    m.add(bar(0.017, len), shade(RUIN.rust, 0.95), { rz: Math.PI / 2, x, y, z: RUIN_FACE_Z });
  });
}

/** A storey of a ruin column (variant 0–4, A–E; `k` its place from the top, 0 the top storey), one level high, within
 *  its tile, with `ivy` (IVY_NONE to IVY_DENSE), as the game's (`RUIN_FACES`): the four rebar posts at its corners
 *  (on the top storey broken off at the variant's heights, the tallest bent over), on each face a band of slab over
 *  its upper part, whole or broken, or two rebar rails, a floor slab at its foot in B, C and D, and ivy draped over it
 *  (`drape`). One model at every distance, as the game's. */
function storey(variant: number, k: number, ivy: number): Model {
  const m = frame(variant, k);
  if (ivy) ivyOver(m, variant, k, ivy);
  return m;
}

/** How high each face's posts stand on a storey (its lower one): broken off on the top storey, whole below. */
function faceTops(variant: number, k: number): number[] {
  const posts = k === 0 ? RUIN_POST_TOPS[variant] : [1, 1, 1, 1];
  return [0, 1, 2, 3].map((f) => Math.min(posts[(f + 3) % 4], posts[f]));
}

/** A storey's ivy alone, its own batch as the game's ivy is its own model: below the top storey the same on every
 *  variant (`variant` unused there), on the top storey up to its broken posts. */
function ivyOver(m: Model, variant: number, k: number, ivy: number): void {
  const tops = faceTops(variant, k);
  for (let f = 0; f < 4; f++) onFace(m, f, () => drape(m, f, k === 0 ? variant : 5, ivy, tops[f]));
}

/** The batch a storey's ivy is drawn in: one for each amount below the top storey, one for each variant and amount on
 *  it. */
function ivyBatch(variant: number, k: number, ivy: number): string {
  return `scaffold.ivy.${k === 0 ? `${RUIN_VARIANT_IDS[variant]}0.` : ""}${["", "light", "medium", "dense"][ivy]}`;
}

/** A storey's ivy as its own model. */
function ivyModel(variant: number, k: number, ivy: number): Model {
  const m = new Model();
  ivyOver(m, variant, k, ivy);
  return m;
}

/** A storey's frame: its posts, its faces' slab bands or rails, its floor. */
function frame(variant: number, k: number): Model {
  const m = new Model();
  const top = k === 0;
  const posts = top ? RUIN_POST_TOPS[variant] : [1, 1, 1, 1];
  const e = RUIN_POST;
  const corners: [number, number][] = [[e, -e], [e, e], [-e, e], [-e, -e]];
  const bent = top ? RUIN_BENT[variant] : null;
  corners.forEach(([x, z], c) => {
    if (!top) m.add(bar(RUIN_POST_R, 1), RUIN.rust, { x, y: 0.5, z });
    else if (bent?.[0] !== c) m.add(box(2 * RUIN_POST_R, posts[c], 2 * RUIN_POST_R), RUIN.rust, { x, y: posts[c] / 2, z });
    else {
      // bent over at its broken end, as the game's
      const h = posts[c] - 0.36;
      m.add(box(2 * RUIN_POST_R, h, 2 * RUIN_POST_R), RUIN.rust, { x, y: h / 2, z });
      beam(m, [x, h - 0.02, z], [x + bent[1], posts[c] - 0.03, z + bent[2]], 0.035, RUIN.rust);
    }
  });
  const pattern = RUIN_FACES[variant][Math.min(k, RUIN_FACES[variant].length - 1)];
  for (let f = 0; f < 4; f++) {
    // (how high the face's posts stand: its lower one)
    const stands = Math.min(posts[(f + 3) % 4], posts[f]);
    const face = pattern[f];
    const seed: [number, number] = [variant * 4 + f, k];
    onFace(m, f, () => {
      if (face === "S" || face === "s") band(m, face === "S" && !top, top ? Math.min(0.78, stands - 0.04) : 1, seed);
      else if (face === "R") rails(m, top ? [0.3, 0.55].filter((y) => y < stands - 0.05) : RUIN_RAILS, seed);
    });
  }
  if (k >= RUIN_FLOOR_FROM[variant]) {
    // a floor slab at its foot, broken: three quarters of the tile (half of B's highest), turned by the storey
    const col = shade(RUIN.slab, 0.97);
    const s = RUIN_POST + RUIN_POST_R - 0.01;
    onFace(m, (variant + k) % 4, () => {
      if (variant === 1 && k === 1) m.add(box(2 * s, 0.04, s - 0.02), col, { y: 0.025, z: (-s - 0.02) / 2 });
      else {
        m.add(box(2 * s, 0.04, s + 0.02), col, { y: 0.025, z: (-s + 0.02) / 2 });
        m.add(box(s - 0.04, 0.04, s - 0.02), col, { x: (-s - 0.04) / 2, y: 0.025, z: (s + 0.02) / 2 });
      }
    });
  }
  return m;
}

/** Leaves of ivy on each face of a storey, by how much ivy it carries: what covers as much of a column seen from a side
 *  as the game's ivy does (with the face behind showing through, about 0.74 of its foot, 0.63 of the storey above and a
 *  third of each higher one on a wet column).  */
const IVY_LEAVES = [0, 4, 11, 16];

/** Ivy over a storey's north face (−Z; `onFace` turns it), as the game's clings: flat leaves lying against the face
 *  over its whole height, the most low down, larger there, spread across it from post to post. Most the game's ivy,
 *  about a third the brighter green, so the ivy reads against the rust and the slab. `top`: how high the face's posts
 *  stand. */
function drape(m: Model, f: number, variant: number, ivy: number, top: number): void {
  const n = IVY_LEAVES[ivy];
  const z = RUIN_FACE_Z - RUIN_SLAB / 2 - 0.007;
  const roof = Math.min(top, 1) - 0.06;
  const seed = variant * 4 + f;
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n;
    // (low down more of them: the height a power of the leaf's place in the face's order)
    const ly0 = 0.1 + (roof - 0.16) * t ** 1.25;
    const size = 0.27 - 0.08 * ly0;
    const half = size * 0.72;
    const x = (jitter(seed, k, 70 + ivy) - 0.5) * 0.84;
    const lx = Math.max(-0.49 + half, Math.min(0.49 - half, x));
    const ly = Math.max(half + 0.01, Math.min(1 - half - 0.01, ly0 + (jitter(seed, k, 74) - 0.5) * 0.08));
    const bright = jitter(seed, k, 75) < 0.33;
    const a = jitter(seed, k, 76) * 6.28;
    m.add(plane(size, size), bright ? RUIN.leaf : RUIN.ivy, { rz: Math.PI / 4 + 0.35 * Math.sin(a * 3), rx: -0.02 + 0.01 * Math.sin(a * 5), ry: Math.PI, x: lx, y: ly, z: z - 0.002 * (k % 3) });
  }
}

/** Whether a ruin at (x, y, level z) shows its overgrown model, as the game's: its wet model on soil that is neither
 *  dry nor contaminated, its dry model otherwise (Timberborn.Ruins `RuinModelUpdater.UpdateModel`: `IsDry ||
 *  IsContaminated`, contaminated being any contamination at all). The soil the ground's colour shows (under a roof, its
 *  own run top's, `objectSoilAt`), so on a held Drought or Badtide day the day's. */
export function ruinOvergrown(soil: SoilView | null, W: number, x: number, y: number, z: number): boolean {
  const s = objectSoilAt(soil, W, x, y, z);
  return !!s && s.moisture > 0 && s.contamination === 0;
}

/** Each object's `ruinOvergrown` as drawn (1 overgrown, 0 not or not a ruin): what a new soil is compared against. */
export function ruinsOvergrown(v: EntityView, soil: SoilView | null, W: number): Uint8Array {
  const out = new Uint8Array(v.count);
  const ruin = v.templates.map((t) => /^RuinColumnH\d$/.test(t));
  for (let k = 0; k < v.count; k++) if (ruin[v.template[k]] && ruinOvergrown(soil, W, v.x[k], v.y[k], v.z[k])) out[k] = 1;
  return out;
}

/** The ivy on a storey (level `lv`) of a column `height` high, as the game's (RuinModelFactory: the column's model, its
 *  ivy of that height and the ivy of height 0, `Ivy_Wet` on its wet model and `Ivy_Dry` on its dry one): wet, the
 *  foot clad, the storey above clearly green and every storey higher a little, to the top (seen from a side, the game's
 *  covers about 0.74, 0.63 and 0.3 of them); dry, its foot clearly green (0.66) and, from 5 high, a little on the
 *  storey above it, none higher. */
export function ruinIvy(height: number, lv: number, wet: boolean): number {
  if (!wet) return lv === 0 ? IVY_MEDIUM : lv === 1 && height >= 5 ? IVY_LIGHT : IVY_NONE;
  return lv === 0 ? IVY_DENSE : lv === 1 ? IVY_MEDIUM : IVY_LIGHT;
}

/** A column's storeys as drawn: for each level, its variant (0–4) and its place from the top (`storey`'s `k`). A
 *  column with no variant in its file gets one from its tile (the game picks one at random). */
export function ruinStoreys(x: number, y: number, height: number, variant: number): { variant: number; kind: number }[] {
  const v = variant < RUIN_VARIANT_IDS.length ? variant : Math.floor(jitter(x, y, 40) * RUIN_VARIANT_IDS.length);
  const out: { variant: number; kind: number }[] = [];
  for (let lv = 0; lv < height; lv++) out.push({ variant: v, kind: height - 1 - lv });
  return out;
}

// ------------------------------------------------------------------------------ selection

/** The model an object is drawn with: its species and whether it is dead (tests read this). */
export function modelKeyOf(template: string, flags: number): string {
  if (/^RuinColumnH\d$/.test(template)) return "ruin";
  if (template === "StartingLocation") return "start";
  if (!(template in MODELS)) return "block";
  if (flags & DEAD) return `${template}.dead` in MODELS ? `${template}.dead` : template;
  return flags & DYING && `${template}.dying` in MODELS ? `${template}.dying` : template;
}

/** Triangles of a model (tests and the benchmark's budget). */
export function modelTriangles(key: string): number {
  if (key === "start") return districtCenter().triangles;
  if (key === "ruin") return storey(0, 0, IVY_DENSE).triangles;
  return MODELS[key] ? MODELS[key]().triangles : 12;
}

/** Triangles a ruin storey draws (the worst of its variants and places, with the most ivy). */
export function ruinTriangles(): number {
  let most = 0;
  for (let v = 0; v < RUIN_FACES.length; v++) for (let k = 0; k < RUIN_FACES[v].length; k++) most = Math.max(most, storey(v, k, IVY_DENSE).triangles);
  return most;
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
  [/Geothermal/, [0.82, 0.48, 0.16]],
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
 *  from the tile's middle (x east, y north), its width (`scale`) and its height: the game's randomizer's factors for its
 *  species (plantSize.ts), half for a young plant. */
export function plantPlacement(x: number, y: number, flags: number, template = ""): { dx: number; dy: number; scale: number; height: number } {
  const dead = flags & DEAD ? 0.95 : 1;
  const young = flags & YOUNG ? 0.5 : 0;
  const g = RANDOMIZER[template] ? plantScale(template, jitter(x, y, 1), jitter(x, y, 6)) : null;
  const w = young || (g ? g.width : 0.85 + 0.3 * jitter(x, y, 1));
  const h = young || (g ? g.height : w);
  return { dx: (jitter(x, y, 2) - 0.5) * 0.3, dy: -(jitter(x, y, 3) - 0.5) * 0.3, scale: w * dead, height: h * dead };
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
      put(batch("ruin.lite", LITE_RUIN), x + 0.5, z, -(y + 0.5), turn, 1, 1, Number(template.slice(-1)));
      continue;
    }
    if (key === "ruin") {
      // a storey per level, turned as the file turns the column, as the game places it (its model adds no turn of its
      // own); its wet model's ivy where it stands on moist, uncontaminated ground (`ruinOvergrown`), its dry
      // model's elsewhere (`ruinIvy`)
      const n = Number(template.slice(-1));
      const moist = ruinOvergrown(soil, W, x, y, z);
      ruinStoreys(x, y, n, v.variant?.[k] ?? NO_VARIANT).forEach(({ variant, kind }, lv) => {
        const green = ruinIvy(n, lv, moist);
        put(batch(`scaffold.${RUIN_VARIANT_IDS[variant]}${kind}`, () => frame(variant, kind)), x + 0.5, z + lv, -(y + 0.5), turn, 1);
        if (green) put(batch(ivyBatch(variant, kind, green), () => ivyModel(variant, kind, green)), x + 0.5, z + lv, -(y + 0.5), turn, 1);
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
      const b = batch("block", () => new Model().add(box(0.92, 0.92, 0.92), [1, 1, 1], { y: 0.46 }).own());
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
      // (a mine site, a seep and a geothermal field are the land's own shape: never faded or hidden, objectFade.ts)
      put(b, x + dx + 0.5, z, -(y + dy + 0.5), turn, 1, 1, 1, LAND.has(template) ? LAND_GROW : NO_GROW);
      continue;
    }
    if (PLANTS.has(template)) {
      // every tree upright on its tile, as in the game (D321, item 7: a knocked-down one is dead)
      const dead = !!(flags & DEAD);
      const p = plantPlacement(x, y, flags, template);
      const tint = dead ? 0.94 + 0.08 * jitter(x, y, 5) : 0.9 + 0.2 * jitter(x, y, 5);
      put(b, x + 0.5 + p.dx, z, -(y + 0.5) - p.dy, jitter(x, y, 4) * Math.PI * 2, p.scale, tint, p.height, dead && TREES.has(template) ? GROW_DEAD : NO_GROW);
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
      // (one batch is one kind of object: the land's own shape's mark, objectFade.ts, kept)
      mesh.geometry.setAttribute("grow", new InstancedBufferAttribute(new Float32Array([0, 0, 1].map((v, i) => (b.grows[0] < 0 ? b.grows[i] : v))), 3));
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
  // (each vertex's object's place, x and z: the fade round the pointer takes an object whole, objectFade.ts)
  const origin = new Float32Array(n * V * 2);
  for (let k = 0; k < n; k++) {
    const e = matrices.slice(k * 16, k * 16 + 16);
    for (let v = 0; v < V; v++) {
      origin[(k * V + v) * 2] = e[12];
      origin[(k * V + v) * 2 + 1] = e[14];
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
  g.setAttribute("origin", new Float32BufferAttribute(origin, 2));
  g.computeBoundingSphere();
  return g;
}

/** The models the map's objects may yet be drawn with as the water and soil change, not made yet: a ruin's storeys
 *  with and without their ivy (moist ground grows it), a plant's dead and dying models (water drowns it, dry ground starts
 *  it dying). Each as its batch's key
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
        want(`scaffold.${RUIN_VARIANT_IDS[variant]}${kind}`, () => frame(variant, kind));
        for (const green of [ruinIvy(n, lv, false), ruinIvy(n, lv, true)]) if (green) want(ivyBatch(variant, kind, green), () => ivyModel(variant, kind, green));
      });
    } else if (PLANTS.has(template)) {
      // (its dead and dying forms: drought and water kill it, dry or wet ground and contamination start it dying)
      for (const form of [`${template}.dead`, `${template}.dying`]) if (form in MODELS) want(form, MODELS[form]);
    }
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
