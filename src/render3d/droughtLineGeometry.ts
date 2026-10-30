// The drought line's geometry (the Weather view, D133, D269; EDITOR_PLAN §5): a faint line along each shore tile's
// sides at the height the water will stand on the drought's last day, and a faint dry tint over the beds that dry
// out completely, both a little stronger on the start's water. Pure: `DroughtLine` in, plain buffers out (no
// three.js), built once per line, never per frame (`droughtLine.ts` draws them). The line and the tint are two
// meshes: the tint is drawn before the water (today's water veils it as it veils the ground), the line after it.
//
// World space as everywhere: X = x, Y = height, Z = −y. A tile (x, y) spans X x…x+1 and Z −y−1…−y. A side facing
// the neighbour at x−1 is the edge X = x; at x+1, X = x+1; at y−1, Z = −y; at y+1, Z = −y−1.
//
// Each side is a thin strip lying flat at the water's height just inside the tile (seen from above and from the
// side) with a thin upright one on the bank's face beside it (so it reads as the waterline along the bank, and
// along a slope). The strips of a tile's neighbouring sides stop short of each other at a corner, so no corner is
// drawn twice (a doubled corner would show as a bead). Each corner of a strip carries its strip's middle line and
// the strip's width, so the line's shader can widen it about that line to a minimum on-screen width (a line under
// a pixel wide would shimmer as the camera moves).

import { SIDE_EAST, SIDE_NORTH, SIDE_SOUTH, SIDE_WEST, type DroughtLine } from "../core/sim/droughtLine";

/** How wide the flat strip is (tiles, inward from the side) and how tall the upright one is: the line up close. */
export const LINE_WIDTH = 0.07;
/** The line is never narrower than this on screen (pixels). */
export const LINE_MIN_PX = 1.5;
/** The upright strip stands this far inside the tile, off the bank's face (no z-fighting with it). */
export const FACE_INSET = 0.012;
/** The tint floats this far over the bed's ground. */
export const TINT_LIFT = 0.03;

/** The line's colour (a pale dry-earth white: the mark a falling lake leaves on its bank, apart from the water's blues,
 *  the land's greens and the editor's gold selection outlines), and its opacity on the start's water and elsewhere.
 *  Faint: an editing aid drawn on the land, not a readout (D133, D184). */
export const LINE_COLOR: readonly [number, number, number] = [0.92, 0.88, 0.78];
export const LINE_ALPHA = { start: 0.45, other: 0.3 };
/** Where today's water stands over the line (`DroughtLine` `under`: a lake that falls, its last day's shore inside
 *  today's lake), the line is seen through it: this much of its opacity, so it never draws bright lines across the
 *  water. */
export const UNDER_WATER = 0.4;
/** The dry tint: where a lake or river dries out completely (it lies under today's water, which veils it; High's near-opaque water hides it, so it is stronger there). Its vertices carry 1 on the start's water, else 0 in the alpha: the tint's shader sets the opacity for the look. */
export const TINT_COLOR: readonly [number, number, number] = [0.95, 0.68, 0.2];
export const TINT_ALPHA = { standard: { start: 0.3, other: 0.2 }, high: { start: 0.6, other: 0.45 } };

export interface QuadBuffers {
  /** x, y, z per vertex. */
  positions: Float32Array;
  /** r, g, b, a per vertex (0–1). */
  colors: Float32Array;
  /** Two triangles a quad. */
  indices: Uint32Array;
  quads: number;
}

export interface DroughtLineBuffers {
  line: QuadBuffers & {
    /** x, y, z per vertex: the middle line of the vertex's strip, across its width. */
    centers: Float32Array;
    /** The strip's width in tiles, per vertex. */
    widths: Float32Array;
  };
  tint: QuadBuffers;
}

/** A growable list of quads (four corners each, flat colour). */
class Quads {
  pos: number[] = [];
  ctr: number[] = [];
  wid: number[] = [];
  col: number[] = [];
  n = 0;
  quad(c: readonly number[], rgb: readonly [number, number, number], a: number, mid?: readonly number[], width = 0): void {
    this.pos.push(...c);
    for (let k = 0; k < 4; k++) {
      if (mid) this.ctr.push(mid[k * 3], mid[k * 3 + 1], mid[k * 3 + 2]);
      this.wid.push(width);
      this.col.push(rgb[0], rgb[1], rgb[2], a);
    }
    this.n++;
  }
  buffers(): QuadBuffers {
    const indices = new Uint32Array(this.n * 6);
    for (let n = 0; n < this.n; n++) indices.set([n * 4, n * 4 + 1, n * 4 + 2, n * 4, n * 4 + 2, n * 4 + 3], n * 6);
    return { positions: Float32Array.from(this.pos), colors: Float32Array.from(this.col), indices, quads: this.n };
  }
}

/** The lines and tint of `line` on ground `heights` (tile i = x + y·W). A refused or empty line gives nothing. */
export function droughtLineGeometry(line: DroughtLine, heights: ArrayLike<number>): DroughtLineBuffers {
  const { W } = line;
  const q = new Quads();
  const t = new Quads();
  const { line: ln, bed } = line;
  const w = LINE_WIDTH;
  for (let k = 0; k < ln.count; k++) {
    const i = ln.tile[k];
    const x = i % W;
    const y = (i - x) / W;
    const s = ln.sides[k];
    const L = ln.level[k];
    // (under today's water as the line itself says, from the map's settled water: never whatever the view shows now)
    const a = (ln.start[k] ? LINE_ALPHA.start : LINE_ALPHA.other) * (ln.under[k] ? UNDER_WATER : 1);
    const west = (s & SIDE_WEST) !== 0;
    const east = (s & SIDE_EAST) !== 0;
    const north = (s & SIDE_NORTH) !== 0;
    const south = (s & SIDE_SOUTH) !== 0;
    // (along z: a strip on an x-side stops short at a corner where a y-side is also drawn; the y-sides' own
    // strips run between those, in x)
    const zHi = -y - (north ? w : 0); // towards y−1 is −y
    const zLo = -y - 1 + (south ? w : 0);
    const xLo = x + (west ? w : 0);
    const xHi = x + 1 - (east ? w : 0);
    const h = w / 2;
    if (west) {
      flat(q, x, x + w, zLo, zHi, L, a, "x");
      upright(q, x + FACE_INSET, "x", zLo, zHi, L, h, a);
    }
    if (east) {
      flat(q, x + 1 - w, x + 1, zLo, zHi, L, a, "x");
      upright(q, x + 1 - FACE_INSET, "x", zLo, zHi, L, h, a);
    }
    if (north) {
      flat(q, xLo, xHi, -y - w, -y, L, a, "z");
      upright(q, -y - FACE_INSET, "z", xLo, xHi, L, h, a);
    }
    if (south) {
      flat(q, xLo, xHi, -y - 1, -y - 1 + w, L, a, "z");
      upright(q, -y - 1 + FACE_INSET, "z", xLo, xHi, L, h, a);
    }
  }
  // the tint: beds that dry out completely, a run of tiles along x with the same strength one quad
  const cell = new Map<number, number>(); // tile → 1 on the start's water, else 0 (the look sets the opacity)
  for (let k = 0; k < bed.count; k++) if (bed.gone[k]) cell.set(bed.tile[k], bed.start[k] ? 1 : 0);
  const done = new Set<number>();
  for (const i of [...cell.keys()].sort((a, b) => a - b)) {
    if (done.has(i)) continue;
    const a = cell.get(i)!;
    const x = i % W;
    const y = (i - x) / W;
    let n = 1;
    while (x + n < W && cell.get(i + n) === a) n++;
    // (the ground's height changes along a run: one quad a tile of the same height)
    let from = 0;
    for (let u = 1; u <= n; u++) {
      if (u < n && heights[i + u] === heights[i + from]) continue;
      const g = heights[i + from] + TINT_LIFT;
      t.quad([x + from, g, -y, x + u, g, -y, x + u, g, -y - 1, x + from, g, -y - 1], TINT_COLOR, a);
      from = u;
    }
    for (let u = 0; u < n; u++) done.add(i + u);
  }
  return {
    line: { ...q.buffers(), centers: Float32Array.from(q.ctr), widths: Float32Array.from(q.wid) },
    tint: t.buffers(),
  };
}

/** A strip lying flat at height `y`, over X x0…x1 and Z z0…z1; `across` is the axis of its width. */
function flat(q: Quads, x0: number, x1: number, z0: number, z1: number, y: number, a: number, across: "x" | "z"): void {
  if (x1 <= x0 || z1 <= z0) return;
  const c = [x0, y, z1, x1, y, z1, x1, y, z0, x0, y, z0];
  const mx = (x0 + x1) / 2;
  const mz = (z0 + z1) / 2;
  const mid: number[] = [];
  for (let k = 0; k < 4; k++) mid.push(across === "x" ? mx : c[k * 3], y, across === "z" ? mz : c[k * 3 + 2]);
  q.quad(c, LINE_COLOR, a, mid, across === "x" ? x1 - x0 : z1 - z0);
}

/** A strip standing on a plane (`axis` "x": the plane X = at, spanning Z lo…hi; "z": the plane Z = at, spanning X
 *  lo…hi), `h` either side of height `y`. */
function upright(q: Quads, at: number, axis: "x" | "z", lo: number, hi: number, y: number, h: number, a: number): void {
  if (hi <= lo) return;
  const c = axis === "x" ? [at, y - h, lo, at, y - h, hi, at, y + h, hi, at, y + h, lo] : [lo, y - h, at, hi, y - h, at, hi, y + h, at, lo, y + h, at];
  const mid: number[] = [];
  for (let k = 0; k < 4; k++) mid.push(c[k * 3], y, c[k * 3 + 2]);
  q.quad(c, LINE_COLOR, a, mid, 2 * h);
}
