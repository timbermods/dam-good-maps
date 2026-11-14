// The caves seen through the rock (D488: overhangs and caves read clearly while editing). With the Caves and overhangs
// layer on, the page paints the roofs' tops violet: that says where a cave is, not its shape, how far under the rock it
// runs or where it opens, and from the editing pitch (50°, the game's 60° and the editor's) a cave's mouth is often on
// a cliff the camera does not face. So with the layer on, the air under every roof is drawn through the rock that hides
// it, in the layer's violet: its floor a pale fill outlined where it ends (at a wall, a drop or the open), its walls a
// fainter fill, and each mouth (where the air under a roof meets the open air) framed. A step in a tunnel's floor (the
// rock beside a cell rising a layer or two to a floor of air under the same roof) is drawn as the floor's own, its
// riser filled as the floor is and the outline running up its ends, so a stepped tunnel reads as one passage from mouth
// to mouth. Where the cave is in plain sight (through its mouth, under an overhang) only the outlines and the mouths'
// frames are drawn, over the real rock.
//
// An editing aid on its own channel (aidLayer.ts; D497): the look is never changed, nothing glows. Worked out from the
// columns as drawn (under a layer cut, the voxels the cut leaves) when the layer is turned on, and after an edit while
// it is on only in the chunks the edit reached (a brush stroke builds a chunk or two a frame, not the map); nothing per
// frame. A map without terrain above terrain never makes it.
//
// `caveFaces` is the plain question (which cells are air under a roof, their floors, steps, walls, mouths and the
// outlines), `CaveGhost` draws its answer a chunk at a time: the fills drawn only where the terrain hides them (the
// depth test reversed), in the opaque pass after the terrain and before the objects, so a tree standing on a roof draws
// over them; the lines drawn twice, plainly where in sight and fainter where hidden (the hidden ones with the fills).

import { BufferAttribute, BufferGeometry, CustomBlending, DoubleSide, GreaterDepth, LessEqualDepth, Mesh, MeshBasicMaterial, OneFactor, OneMinusSrcAlphaFactor, SrcAlphaFactor, type Scene } from "three";
import { LAYERS } from "./model";
import { WATER_UI } from "./palette";
import { onAidLayer } from "./aidLayer";
import { CHUNK, type TerrainSource } from "./mesh";

/** The Caves layer's violet (`LAYER_COLORS.roofed`, 170 90 220): the walls' fill. */
const VIOLET: readonly [number, number, number] = [170 / 255, 90 / 255, 220 / 255];
/** The floor's and a mouth's fill: the violet lifted, so a floor reads over the violet the layer paints on the roof. */
const PALE: readonly [number, number, number] = [0.8, 0.64, 1.0];
/** The outlines: hollow.ts's line, the violet lifted toward white, over the brush ring's dark edge. */
const LINE: readonly [number, number, number] = [0.88, 0.76, 1.0];

/** The fills' and lines' strengths. The floor carries the shape; the walls only say where the air stands. */
export const GHOST = { floor: 0.36, wall: 0.22, mouth: 0.3, line: 0.95, edge: 0.55, hidden: 0.65 } as const;
/** The lines' width (blocks) and the dark edge's, and how far the marks stand off the faces they lie on. */
const WIDTH = 0.07;
const EDGE_WIDTH = 0.11;
const LIFT = 0.03;
/** The highest step drawn as the floor's own: the rock beside a cell rising at most this many layers from the cell's
 *  floor to a floor of air under a roof (a tunnel's step; a higher rise is a wall of the room). */
export const STEP = 2;

/** Tiles from (x0, y0) to (x1, y1), inclusive. */
export type Rect = { x0: number; y0: number; x1: number; y1: number };

/** Quads as flat arrays: four corners (x, y, z world) and four RGBA colours each. */
export interface Quads {
  pos: Float32Array;
  col: Float32Array;
}

/** Quads written into buffers that grow by doubling (a chunk's caves are built in one go). */
class QuadBuffer {
  pos = new Float32Array(64 * 12);
  col = new Float32Array(64 * 16);
  n = 0;

  /** A quad from corner (ax, ay, az) along u and v (world), in one colour. */
  quad(ax: number, ay: number, az: number, ux: number, uy: number, uz: number, vx: number, vy: number, vz: number, c: readonly number[], alpha: number): void {
    if ((this.n + 1) * 12 > this.pos.length) {
      const pos = new Float32Array(this.pos.length * 2);
      pos.set(this.pos);
      this.pos = pos;
      const col = new Float32Array(this.col.length * 2);
      col.set(this.col);
      this.col = col;
    }
    const p = this.pos;
    let o = this.n * 12;
    p[o++] = ax;
    p[o++] = ay;
    p[o++] = az;
    p[o++] = ax + ux;
    p[o++] = ay + uy;
    p[o++] = az + uz;
    p[o++] = ax + ux + vx;
    p[o++] = ay + uy + vy;
    p[o++] = az + uz + vz;
    p[o++] = ax + vx;
    p[o++] = ay + vy;
    p[o] = az + vz;
    const k = this.col;
    for (let q = this.n * 16, end = q + 16; q < end; q += 4) {
      k[q] = c[0];
      k[q + 1] = c[1];
      k[q + 2] = c[2];
      k[q + 3] = alpha;
    }
    this.n++;
  }

  /** The quads written (copies, sized to fit). */
  done(): Quads {
    return { pos: this.pos.slice(0, this.n * 12), col: this.col.slice(0, this.n * 16) };
  }
}

/** What `caveFaces` found: the fills, the lines' dark edges and the light lines over them, and the counts (tests): the
 *  cells of air under a roof, their floor faces, step faces (a riser drawn as the floor), wall faces and mouth faces. */
export interface CaveFaces {
  fill: Quads;
  edge: Quads;
  line: Quads;
  cells: number;
  floors: number;
  steps: number;
  walls: number;
  mouths: number;
}

/** The four sides of a cell: the step to the neighbour (x, y). */
const SIDES: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** The height a column's top run ends at: one past its highest solid layer (0 for none). */
const topOf = (m: number): number => 32 - Math.clz32(m);

/** The cells of air under a roof on the tiles of `rect` (the whole map when absent) that `listed` names (`listed(i)`:
 *  not one plain run, a quick test that skips plain tiles), from the masks `maskAt(i)` gives (any tile, plain ones too;
 *  as drawn, under a layer cut the voxels the cut leaves): a cell is air under a roof when its layer is clear below its
 *  column's top. Its floor (rock under it, or the map's floor) is filled and outlined where the floor ends; a side
 *  against rock is a wall, or a step of the floor when that rock rises at most `STEP` layers from the cell's floor to a
 *  floor of air under a roof the cell's own air reaches (filled as the floor, outlined up its ends, and the floors'
 *  outlines across it left out); a side against the open air (a neighbour's layer above that neighbour's top) is a
 *  mouth, filled and framed where the opening ends. The map's edge is a wall nobody sees and is not drawn. A cell's faces
 *  read the columns a tile round it only. World space as pick.ts: X = x, Y = height, Z = −y. Pure. */
export function caveFaces(W: number, H: number, listed: (i: number) => boolean, maskAt: (i: number) => number, rect?: Rect): CaveFaces {
  const fill = new QuadBuffer();
  const line = new QuadBuffer();
  const edges = new QuadBuffer();
  let cells = 0;
  let floors = 0;
  let steps = 0;
  let walls = 0;
  let mouths = 0;
  const r = { x0: Math.max(0, rect?.x0 ?? 0), y0: Math.max(0, rect?.y0 ?? 0), x1: Math.min(W - 1, rect?.x1 ?? W - 1), y1: Math.min(H - 1, rect?.y1 ?? H - 1) };
  // (each mask asked once, the rect's and a tile round it: the questions below ask them many times)
  const gx0 = Math.max(0, r.x0 - 1);
  const gy0 = Math.max(0, r.y0 - 1);
  const GW = Math.max(0, Math.min(W - 1, r.x1 + 1) - gx0 + 1);
  const GH = Math.max(0, Math.min(H - 1, r.y1 + 1) - gy0 + 1);
  const masks = new Uint32Array(GW * GH);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) masks[y * GW + x] = maskAt((gy0 + y) * W + gx0 + x);
  const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  /** A column's mask (in the map; beyond the tile kept round the rect, asked of `maskAt`: never, as the faces are). */
  const maskOf = (x: number, y: number) => {
    const lx = x - gx0;
    const ly = y - gy0;
    return lx >= 0 && ly >= 0 && lx < GW && ly < GH ? masks[ly * GW + lx] : maskAt(y * W + x);
  };
  const solid = (x: number, y: number, z: number) => z < 0 || ((maskOf(x, y) >>> z) & 1) === 1;
  /** Air under a roof at (x, y, z). */
  const roofed = (x: number, y: number, z: number) => {
    if (!inMap(x, y) || z < 0) return false;
    const m = maskOf(x, y);
    return z < topOf(m) && ((m >>> z) & 1) === 0;
  };
  /** Open air at (x, y, z): at or above the column's top. */
  const open = (x: number, y: number, z: number) => inMap(x, y) && z >= topOf(maskOf(x, y));
  /** A cell's side toward (dx, dy) is a mouth. */
  const mouthAt = (x: number, y: number, z: number, dx: number, dy: number) => roofed(x, y, z) && open(x + dx, y + dy, z);
  /** A cell has a floor at its own layer. */
  const floored = (x: number, y: number, z: number) => roofed(x, y, z) && solid(x, y, z - 1);
  /** A cell's side toward (dx, dy) is a step of its floor: the rock there rises from the cell's floor (solid all the way
   *  up from it: a slab with air under it is a wall) at most `STEP` layers to a floor of air under a roof, and the
   *  cell's own air reaches that floor's level (the passage goes on up it; no air is made that isn't there). */
  const riser = (x: number, y: number, z: number, dx: number, dy: number) => {
    const nx = x + dx;
    const ny = y + dy;
    if (!roofed(x, y, z) || !inMap(nx, ny) || !solid(nx, ny, z)) return false;
    let f = z;
    while (f > 0 && !solid(x, y, f - 1)) f--;
    for (let k = f; k < z; k++) if (!solid(nx, ny, k)) return false;
    let t = z + 1;
    while (t - f <= STEP && solid(nx, ny, t)) t++;
    if (t - f > STEP || !roofed(nx, ny, t)) return false;
    for (let k = z + 1; k <= t; k++) if (solid(x, y, k)) return false;
    return true;
  };

  const edge = WATER_UI.ringEdge;
  /** A line on a face: from corner (ax, ay, az) along u (one block), the strip `WIDTH` deep along the unit v, over its
   *  dark edge; (lx, ly, lz) is the face's outward direction, the line a hair further out than its edge. */
  const strip = (ax: number, ay: number, az: number, ux: number, uy: number, uz: number, vx: number, vy: number, vz: number, lx: number, ly: number, lz: number) => {
    edges.quad(ax, ay, az, ux, uy, uz, vx * EDGE_WIDTH, vy * EDGE_WIDTH, vz * EDGE_WIDTH, edge, GHOST.edge);
    const k = 0.006;
    line.quad(ax + lx * k, ay + ly * k, az + lz * k, ux, uy, uz, vx * WIDTH, vy * WIDTH, vz * WIDTH, LINE, GHOST.line);
  };

  for (let y = r.y0; y <= r.y1; y++)
    for (let x = r.x0; x <= r.x1; x++) {
      const i = y * W + x;
      if (!listed(i)) continue;
      const m = maskOf(x, y);
      const top = Math.min(topOf(m), LAYERS);
      for (let z = 0; z < top; z++) {
        if ((m >>> z) & 1) continue;
        cells++;
        // (world corners of the cell: X x..x+1, Y z..z+1, Z −y..−y−1)
        const X0 = x;
        const Z0 = -y;
        const floor = solid(x, y, z - 1);
        if (floor) {
          floors++;
          fill.quad(X0, z + LIFT, Z0, 1, 0, 0, 0, 0, -1, PALE, GHOST.floor);
        }
        for (const [dx, dy] of SIDES) {
          const nx = x + dx;
          const ny = y + dy;
          if (!inMap(nx, ny)) continue;
          // the side's own frame: (ax, az) its lower corner, (ux, uz) along it (one block, world X and Z; in map steps
          // (ux, −uz)); (ox, oz) the step off it into the neighbour, its opposite back into this cell
          const ax = dx === 1 || dy === 1 ? X0 + 1 : X0;
          const az = dx === -1 || dy === 1 ? Z0 - 1 : Z0;
          const ux = dx === 0 ? -dy : 0;
          const uz = dx === 0 ? 0 : -dx;
          const ox = dx;
          const oz = -dy;
          const step = riser(x, y, z, dx, dy);
          if (solid(nx, ny, z)) {
            const wx = ax - ox * LIFT;
            const wz = az - oz * LIFT;
            if (step) {
              // a step of the floor: filled as the floor, and outlined up its ends where the step's run ends (its
              // start toward the cell at −u, its end toward +u), joining the floors' outlines along the walls
              steps++;
              fill.quad(wx, z, wz, ux, 0, uz, 0, 1, 0, PALE, GHOST.floor);
              if (!riser(x - ux, y + uz, z, dx, dy)) strip(wx, z, wz, 0, 1, 0, ux, 0, uz, -ox, 0, -oz);
              if (!riser(x + ux, y - uz, z, dx, dy)) strip(wx + ux, z, wz + uz, 0, 1, 0, -ux, 0, -uz, -ox, 0, -oz);
            } else {
              walls++;
              fill.quad(wx, z, wz, ux, 0, uz, 0, 1, 0, VIOLET, GHOST.wall);
            }
          } else if (open(nx, ny, z)) {
            mouths++;
            const fx = ax + ox * LIFT;
            const fz = az + oz * LIFT;
            fill.quad(fx, z, fz, ux, 0, uz, 0, 1, 0, PALE, GHOST.mouth);
            // the frame where the opening ends: below, above, and at either end along the side (its start toward the
            // cell at −u, its end toward +u)
            if (!mouthAt(x, y, z - 1, dx, dy)) strip(fx, z, fz, ux, 0, uz, 0, 1, 0, ox, 0, oz);
            if (!mouthAt(x, y, z + 1, dx, dy)) strip(fx, z + 1, fz, ux, 0, uz, 0, -1, 0, ox, 0, oz);
            if (!mouthAt(x - ux, y + uz, z, dx, dy)) strip(fx, z, fz, 0, 1, 0, ux, 0, uz, ox, 0, oz);
            if (!mouthAt(x + ux, y - uz, z, dx, dy)) strip(fx + ux, z, fz + uz, 0, 1, 0, -ux, 0, -uz, ox, 0, oz);
          }
          // the floor's outline where it ends: at a wall, a drop, or the open (along the side on the floor, inward); not
          // where it goes on up a step, or down one to the floor below
          if (floor && !floored(nx, ny, z) && !step && !riser(nx, ny, z - 1, -dx, -dy)) strip(ax, z + LIFT, az, ux, 0, uz, -ox, 0, -oz, 0, 1, 0);
        }
      }
    }
  return { fill: fill.done(), edge: edges.done(), line: line.done(), cells, floors, steps, walls, mouths };
}

/** Index buffer for `n` quads (two triangles each). */
function quadIndex(n: number): BufferAttribute {
  const idx = n * 4 <= 65536 ? new Uint16Array(n * 6) : new Uint32Array(n * 6);
  for (let q = 0; q < n; q++) {
    const v = q * 4;
    const o = q * 6;
    idx[o] = v;
    idx[o + 1] = v + 1;
    idx[o + 2] = v + 2;
    idx[o + 3] = v;
    idx[o + 4] = v + 2;
    idx[o + 5] = v + 3;
  }
  return new BufferAttribute(idx, 1);
}

/** `a`'s quads, then `b`'s. */
function joined(a: Quads, b: Quads): Quads {
  const pos = new Float32Array(a.pos.length + b.pos.length);
  pos.set(a.pos);
  pos.set(b.pos, a.pos.length);
  const col = new Float32Array(a.col.length + b.col.length);
  col.set(a.col);
  col.set(b.col, a.col.length);
  return { pos, col };
}

function geometryOf(q: Quads): BufferGeometry {
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(q.pos, 3));
  geo.setAttribute("color", new BufferAttribute(q.col, 4));
  geo.setIndex(quadIndex(q.pos.length / 12));
  return geo;
}

/** The chunks (`CHUNK`² tiles, the terrain's) an edit of `rect` reaches, every chunk for null: a cell's faces read the
 *  columns a tile round it, so the rect a tile wider. Chunk keys `cy * nx + cx`. */
export function caveChunksOf(W: number, H: number, rect: Rect | null): number[] {
  const nx = Math.ceil(W / CHUNK);
  const ny = Math.ceil(H / CHUNK);
  const cx0 = rect ? Math.max(0, Math.floor((rect.x0 - 1) / CHUNK)) : 0;
  const cy0 = rect ? Math.max(0, Math.floor((rect.y0 - 1) / CHUNK)) : 0;
  const cx1 = rect ? Math.min(nx - 1, Math.floor((rect.x1 + 1) / CHUNK)) : nx - 1;
  const cy1 = rect ? Math.min(ny - 1, Math.floor((rect.y1 + 1) / CHUNK)) : ny - 1;
  const out: number[] = [];
  for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) out.push(cy * nx + cx);
  return out;
}

/** What the caves drawn were built from, and what has changed since (the renderer's): the map, its ground as last
 *  accounted for, the cut, and the tiles edits changed. Pure. */
export class CaveBook {
  private of: { map: object; source: TerrainSource; slice: number | null } | null = null;
  private dirty: Rect | null = null;

  /** The ground changed from `was` to `now` over `rect` (an edit, a stroke's frame). The rect is kept whenever caves are
   *  drawn, even when `was` is not the ground they were built from (another change came first in the frame, a pit's
   *  cutout, or the heights changed in place): `due` then decides whether that change needs every chunk. */
  edited(was: TerrainSource, now: TerrainSource, rect: Rect | null): void {
    const of = this.of;
    if (!of) return;
    if (of.source === was) of.source = now;
    if (rect) this.dirty = this.dirty ? { x0: Math.min(this.dirty.x0, rect.x0), y0: Math.min(this.dirty.y0, rect.y0), x1: Math.max(this.dirty.x1, rect.x1), y1: Math.max(this.dirty.y1, rect.y1) } : { ...rect };
  }

  /** What to build now for `map`'s ground `src` under the cut `slice`: null every chunk (the caves new, the map, the cut
   *  or a part of the ground the caves read changed in a way no edit accounted for), a rect the chunks it reaches,
   *  undefined nothing. Marks the caves built. */
  due(map: object, src: TerrainSource, slice: number | null): Rect | null | undefined {
    const of = this.of;
    // (a change of the source no edit accounted for builds every chunk, unless only what the caves never read changed,
    // a pit's cutout)
    const all = !of || of.map !== map || of.slice !== slice || (of.source !== src && (of.source.heights !== src.heights || of.source.masks !== src.masks || of.source.columns !== src.columns));
    const rect = all ? null : this.dirty ?? undefined;
    this.of = { map, source: src, slice };
    this.dirty = null;
    return rect;
  }

  /** No caves drawn (the layer off). */
  clear(): void {
    this.of = null;
    this.dirty = null;
  }

  /** Caves are drawn. */
  get drawn(): boolean {
    return this.of !== null;
  }
}

/** One chunk's caves as drawn: what `caveFaces` found there, and its meshes (its fills, its lines hidden and in
 *  sight: three draws a chunk with a cave, none without). */
interface ChunkDrawn {
  faces: CaveFaces;
  meshes: Mesh[];
}

export class CaveGhost {
  /** The fills (hidden only), the hidden lines (fainter) and the lines in sight. */
  private readonly mats: { fill: MeshBasicMaterial; hidden: MeshBasicMaterial; seen: MeshBasicMaterial };
  private readonly chunks = new Map<number, ChunkDrawn>();
  /** What is drawn (tests): the cells of air under a roof, the mouths' and the steps' faces, and the chunks built at
   *  the last update. */
  drawn = { cells: 0, mouths: 0, steps: 0, built: 0 };

  constructor(private readonly scene: Scene) {
    // The fills and the hidden lines are drawn where the terrain hides them, in the opaque pass (blended all the same):
    // three.js draws it by group, then render order, so after the terrain's chunks (no group, order 0) and before the
    // objects (their group's order 1), which draw over them where they stand in front, a tree on a roof as anywhere.
    // The lines in sight are drawn with the other aids, after the water.
    const mat = (depthFunc: typeof GreaterDepth | typeof LessEqualDepth, opacity: number, opaquePass: boolean) =>
      new MeshBasicMaterial({
        vertexColors: true,
        transparent: !opaquePass,
        ...(opaquePass ? { blending: CustomBlending, blendSrc: SrcAlphaFactor, blendDst: OneMinusSrcAlphaFactor, blendSrcAlpha: OneFactor, blendDstAlpha: OneMinusSrcAlphaFactor } : {}),
        opacity,
        depthWrite: false,
        depthFunc,
        side: DoubleSide,
        fog: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
    this.mats = { fill: mat(GreaterDepth, 1, true), hidden: mat(GreaterDepth, GHOST.hidden, true), seen: mat(LessEqualDepth, 1, false) };
  }

  /** Build the caves again on the chunks `rect` reaches (`caveChunksOf`), every chunk for null; the masks as
   *  `caveFaces` reads them. */
  update(W: number, H: number, listed: (i: number) => boolean, maskAt: (i: number) => number, rect: Rect | null): void {
    const nx = Math.ceil(W / CHUNK);
    if (!rect) this.clear();
    const keys = caveChunksOf(W, H, rect);
    for (const key of keys) {
      const cx = key % nx;
      const cy = (key - cx) / nx;
      const faces = caveFaces(W, H, listed, maskAt, { x0: cx * CHUNK, y0: cy * CHUNK, x1: cx * CHUNK + CHUNK - 1, y1: cy * CHUNK + CHUNK - 1 });
      this.lay(key, faces.cells > 0 ? faces : null);
    }
    let cells = 0;
    let mouths = 0;
    let steps = 0;
    for (const c of this.chunks.values()) {
      cells += c.faces.cells;
      mouths += c.faces.mouths;
      steps += c.faces.steps;
    }
    this.drawn = { cells, mouths, steps, built: keys.length };
  }

  /** What one chunk draws now (tests): its faces, or null where it has no cave. */
  chunk(key: number): CaveFaces | null {
    return this.chunks.get(key)?.faces ?? null;
  }

  /** The meshes drawn (tests). */
  get meshes(): Mesh[] {
    return [...this.chunks.values()].flatMap((c) => c.meshes);
  }

  /** Draw one chunk's `faces` (null: none there now), its old geometry gone with it. */
  private lay(key: number, faces: CaveFaces | null): void {
    const old = this.chunks.get(key);
    if (old) {
      for (const mesh of old.meshes) {
        this.scene.remove(mesh);
        mesh.geometry.dispose();
      }
      this.chunks.delete(key);
    }
    if (!faces) return;
    const { fill, hidden, seen } = this.mats;
    // (each light line over its own dark edge: the edges first in the one buffer)
    const lineGeo = geometryOf(joined(faces.edge, faces.line));
    const parts: [BufferGeometry, MeshBasicMaterial, number][] = [
      [geometryOf(faces.fill), fill, 5.4],
      [lineGeo, hidden, 5.41],
      [lineGeo, seen, 5.41],
    ];
    // (under the hollow under the cursor, 5.5, and the edit glow)
    const meshes = parts.map(([geo, mat, order]) => {
      const mesh = new Mesh(geo, mat);
      mesh.frustumCulled = false;
      mesh.matrixAutoUpdate = false;
      mesh.renderOrder = order;
      this.scene.add(onAidLayer(mesh));
      return mesh;
    });
    this.chunks.set(key, { faces, meshes });
  }

  /** Draw nothing (the layer off): every chunk's geometry gone. */
  clear(): void {
    for (const key of [...this.chunks.keys()]) this.lay(key, null);
    this.drawn = { cells: 0, mouths: 0, steps: 0, built: 0 };
  }

  dispose(): void {
    this.clear();
    for (const mat of Object.values(this.mats)) mat.dispose();
  }
}
