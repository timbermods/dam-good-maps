// The caves seen through the rock (D488: overhangs and caves read clearly while editing). With the Caves and overhangs
// layer on, the page paints the roofs' tops violet: that says where a cave is, not its shape, how far under the rock it
// runs or where it opens, and from the editing pitch (50°, the game's 60° and the editor's) a cave's mouth is often on
// a cliff the camera does not face. So with the layer on, the air under every roof is drawn through the rock that hides
// it, in the layer's violet: its floor a pale fill outlined where it ends (at a wall, a drop or the open), its walls a
// fainter fill, and each mouth (where the air under a roof meets the open air) framed. Where the cave is in plain sight
// (through its mouth, under an overhang) only the outlines and the mouths' frames are drawn, over the real rock.
//
// An editing aid on its own channel (aidLayer.ts; D497): the look is never changed, nothing glows. Worked out from the
// columns as drawn (under a layer cut, the voxels the cut leaves) when the layer is turned on and after each terrain
// update while it is on; nothing per frame. A map without terrain above terrain never makes it.
//
// `caveFaces` is the plain question (which cells are air under a roof, their floors, walls, mouths and the outlines),
// `CaveGhost` draws its answer: one mesh of fills drawn only where the terrain hides them (the depth test reversed),
// and one of lines drawn twice, plainly where in sight and fainter where hidden.

import { BufferAttribute, BufferGeometry, DoubleSide, GreaterDepth, LessEqualDepth, Mesh, MeshBasicMaterial, type Scene } from "three";
import { LAYERS } from "./model";
import { WATER_UI } from "./palette";
import { onAidLayer } from "./aidLayer";

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

/** Quads as flat arrays: four corners (x, y, z world) and four RGBA colours each. */
export interface Quads {
  pos: Float32Array;
  col: Float32Array;
}

/** Quads written into buffers that grow by doubling (a map's caves are built in one go, after each terrain update). */
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

  /** The quads written, `first`'s then `then`'s (copies, sized to fit). */
  static joined(first: QuadBuffer, then?: QuadBuffer): Quads {
    const n2 = then?.n ?? 0;
    const pos = new Float32Array((first.n + n2) * 12);
    const col = new Float32Array((first.n + n2) * 16);
    pos.set(first.pos.subarray(0, first.n * 12));
    col.set(first.col.subarray(0, first.n * 16));
    if (then) {
      pos.set(then.pos.subarray(0, n2 * 12), first.n * 12);
      col.set(then.col.subarray(0, n2 * 16), first.n * 16);
    }
    return { pos, col };
  }
}

/** A tile next to a listed one (its mask is asked as a neighbour's). */
function besideListed(listed: Uint8Array, W: number, H: number, i: number): boolean {
  const x = i % W;
  const y = (i - x) / W;
  return (x > 0 && listed[i - 1] === 1) || (x < W - 1 && listed[i + 1] === 1) || (y > 0 && listed[i - W] === 1) || (y < H - 1 && listed[i + W] === 1);
}

/** What `caveFaces` found: the fills and the lines, and the counts (tests): the cells of air under a roof, their floor
 *  faces, wall faces and mouth faces. */
export interface CaveFaces {
  fill: Quads;
  line: Quads;
  cells: number;
  floors: number;
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

/** The cells of air under a roof on the tiles `listed` names (`listed(i)`: not one plain run, a quick test that skips
 *  plain tiles), from the masks `maskAt(i)` gives (any tile, plain ones too; as drawn, under a layer cut the voxels the
 *  cut leaves): a cell is air under a roof when its layer is clear below its column's top. Its floor (rock under it, or
 *  the map's floor) is filled and outlined where the floor ends; a side against rock is a wall; a side against the open
 *  air (a neighbour's layer above that neighbour's top) is a mouth, filled and framed where the opening ends. The map's
 *  edge is a wall nobody sees and is not drawn. World space as pick.ts: X = x, Y = height, Z = −y. Pure. */
export function caveFaces(W: number, H: number, listed: (i: number) => boolean, maskAt: (i: number) => number): CaveFaces {
  const fill = new QuadBuffer();
  const line = new QuadBuffer();
  // the lines' dark edges go first, so each light line lies on its own edge
  const edges = new QuadBuffer();
  let cells = 0;
  let floors = 0;
  let walls = 0;
  let mouths = 0;
  // (each mask asked once, the listed tiles' and their neighbours': the questions below ask them many times)
  const N = W * H;
  const isListed = new Uint8Array(N);
  for (let i = 0; i < N; i++) if (listed(i)) isListed[i] = 1;
  const masks = new Uint32Array(N);
  for (let i = 0; i < N; i++) if (isListed[i] || besideListed(isListed, W, H, i)) masks[i] = maskAt(i);
  const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const solid = (x: number, y: number, z: number) => z < 0 || ((masks[y * W + x] >>> z) & 1) === 1;
  /** Air under a roof at (x, y, z). */
  const roofed = (x: number, y: number, z: number) => {
    if (!inMap(x, y) || z < 0) return false;
    const m = masks[y * W + x];
    return z < topOf(m) && ((m >>> z) & 1) === 0;
  };
  /** Open air at (x, y, z): at or above the column's top. */
  const open = (x: number, y: number, z: number) => inMap(x, y) && z >= topOf(masks[y * W + x]);
  /** A cell's side toward (dx, dy) is a mouth. */
  const mouthAt = (x: number, y: number, z: number, dx: number, dy: number) => roofed(x, y, z) && open(x + dx, y + dy, z);
  /** A cell has a floor at its own layer. */
  const floored = (x: number, y: number, z: number) => roofed(x, y, z) && solid(x, y, z - 1);

  const edge = WATER_UI.ringEdge;
  /** A line on a face: from corner (ax, ay, az) along u (one block), the strip `WIDTH` deep along the unit v, over its
   *  dark edge; (lx, ly, lz) is the face's outward direction, the line a hair further out than its edge. */
  const strip = (ax: number, ay: number, az: number, ux: number, uy: number, uz: number, vx: number, vy: number, vz: number, lx: number, ly: number, lz: number) => {
    edges.quad(ax, ay, az, ux, uy, uz, vx * EDGE_WIDTH, vy * EDGE_WIDTH, vz * EDGE_WIDTH, edge, GHOST.edge);
    const k = 0.006;
    line.quad(ax + lx * k, ay + ly * k, az + lz * k, ux, uy, uz, vx * WIDTH, vy * WIDTH, vz * WIDTH, LINE, GHOST.line);
  };

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!isListed[i]) continue;
      const m = masks[i];
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
          if (solid(nx, ny, z)) {
            walls++;
            fill.quad(ax - ox * LIFT, z, az - oz * LIFT, ux, 0, uz, 0, 1, 0, VIOLET, GHOST.wall);
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
          // the floor's outline where it ends: at a wall, a drop, or the open (along the side on the floor, inward)
          if (floor && !floored(nx, ny, z)) strip(ax, z + LIFT, az, ux, 0, uz, -ox, 0, -oz, 0, 1, 0);
        }
      }
    }
  // (edges first: each light line over its dark edge)
  return { fill: QuadBuffer.joined(fill), line: QuadBuffer.joined(edges, line), cells, floors, walls, mouths };
}

/** Index buffer for `n` quads (two triangles each). */
function quadIndex(n: number): BufferAttribute {
  const idx = new Uint32Array(n * 6);
  for (let q = 0; q < n; q++) {
    const v = q * 4;
    idx.set([v, v + 1, v + 2, v, v + 2, v + 3], q * 6);
  }
  return new BufferAttribute(idx, 1);
}

export class CaveGhost {
  private readonly fillGeo = new BufferGeometry();
  private readonly lineGeo = new BufferGeometry();
  private readonly meshes: Mesh[];
  /** What is drawn (tests): the cells of air under a roof, and the mouths' faces. */
  drawn = { cells: 0, mouths: 0 };

  constructor(scene: Scene) {
    const mat = (depthFunc: typeof GreaterDepth | typeof LessEqualDepth, opacity: number) =>
      new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity, depthWrite: false, depthFunc, side: DoubleSide, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    // the fills only where the terrain hides them; the lines in sight, and fainter where hidden
    this.meshes = [new Mesh(this.fillGeo, mat(GreaterDepth, 1)), new Mesh(this.lineGeo, mat(GreaterDepth, GHOST.hidden)), new Mesh(this.lineGeo, mat(LessEqualDepth, 1))];
    for (const mesh of this.meshes) {
      mesh.frustumCulled = false;
      // (under the hollow under the cursor, 5.5, and the edit glow)
      mesh.renderOrder = 5.4;
      mesh.visible = false;
      scene.add(onAidLayer(mesh));
    }
  }

  /** Draw `faces`; null hides it. */
  set(faces: CaveFaces | null): void {
    const any = !!faces && faces.cells > 0;
    for (const mesh of this.meshes) mesh.visible = any;
    this.drawn = any ? { cells: faces.cells, mouths: faces.mouths } : { cells: 0, mouths: 0 };
    if (!any) return;
    for (const [geo, q] of [[this.fillGeo, faces.fill], [this.lineGeo, faces.line]] as const) {
      // (the old buffers' GPU copies go with them)
      geo.dispose();
      geo.setAttribute("position", new BufferAttribute(q.pos, 3));
      geo.setAttribute("color", new BufferAttribute(q.col, 4));
      geo.setIndex(quadIndex(q.pos.length / 12));
    }
  }

  dispose(): void {
    this.fillGeo.dispose();
    this.lineGeo.dispose();
    for (const mesh of this.meshes) (mesh.material as MeshBasicMaterial).dispose();
  }
}
