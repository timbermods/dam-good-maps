// The Block tool's gestures as plain functions (3D step 3, D335, D342): which face a click points at, the
// operation a click or a drag makes of it, and the cells a drag sweeps in the plane of its first face. The page
// holds the state and shows the result; the core (`core/doc/blockTool.ts`) says what it would do and does it.
// tests/unit/blockTool.test.ts checks it.

import { BLOCK_SIZE_MAX, BLOCK_SIZE_MIN, BLOCK_TOP_LAYER, type BlockMode, type BlockSide, type BlocksParams } from "../../core/doc/blockTool";
import type { BlockAim, Ray } from "../../render3d/pick";

/** The tool's three settings, kept between visits (prefs/blockPrefs.ts). */
export interface BlockSettings {
  /** Blocks across the footprint, 1 to 8. */
  size: number;
  shape: "square" | "round";
  /** What a plain click does; Shift does the other (the brushes' habit, D184). */
  mode: BlockMode;
}

export const DEFAULT_BLOCK: BlockSettings = { size: 3, shape: "square", mode: "add" };

export type { BlockAim };

export const clampSize = (n: number) => Math.max(BLOCK_SIZE_MIN, Math.min(BLOCK_SIZE_MAX, Math.round(n)));

/** What a click does with Shift held or not: the setting, or its opposite. */
export const modeFor = (s: BlockSettings, shift: boolean): BlockMode => (shift ? (s.mode === "add" ? "remove" : "add") : s.mode);

/** The operation a click or a drag makes: `at` the faces swept, the first the one pointed at. */
export function blockParams(s: BlockSettings, mode: BlockMode, side: BlockSide, at: readonly [number, number, number][]): BlocksParams {
  return { mode, side, at: at.map((c) => [c[0], c[1], c[2]]), size: clampSize(s.size), ...(s.shape === "round" ? { shape: "round" as const } : {}) };
}

/** The history label of the step. */
export const blockLabel = (mode: BlockMode) => (mode === "add" ? "Add blocks" : "Carve blocks");

/** The most positions a drag keeps (the core's limit). */
const MAX_POSITIONS = 4096;

const AXIS: Record<BlockSide, 0 | 1 | 2> = { "+x": 0, "-x": 0, "+y": 1, "-y": 1, "+z": 2, "-z": 2 };

/** The plane of a face in grid units: the coordinate along its axis where the face lies (a block at x has its +x
 *  face at x + 1 and its -x face at x). */
export function planeOf(aim: BlockAim): { axis: 0 | 1 | 2; at: number } {
  const axis = AXIS[aim.side];
  return { axis, at: aim.at[axis] + (aim.side[0] === "+" ? 1 : 0) };
}

/** Where a ray crosses the plane of a face, in grid units (x, y, layer as fractions), or null when it misses it or the
 *  plane is behind the eye. World space: X = x, Y = layer, Z = −y. */
export function planeHit(aim: BlockAim, ray: Ray): [number, number, number] | null {
  const { axis, at } = planeOf(aim);
  const [ox, oy, oz] = ray.origin;
  const [dx, dy, dz] = ray.direction;
  // the plane in world space: X = at, Y = at (the layer), or Z = −at (the grid's y)
  const t = axis === 0 ? (at - ox) / dx : axis === 1 ? (-at - oz) / dz : (at - oy) / dy;
  if (!Number.isFinite(t) || t <= 0) return null;
  return [ox + dx * t, -(oz + dz * t), oy + dy * t];
}

/** The cell of the face's plane a ray crosses, as the block whose face it is (the plane's own coordinate kept), or
 *  null when the ray misses the plane or the cell is off the map or the layers. */
export function planeCell(aim: BlockAim, ray: Ray, W: number, H: number): [number, number, number] | null {
  const p = planeHit(aim, ray);
  if (!p) return null;
  const axis = AXIS[aim.side];
  const cell: [number, number, number] = [axis === 0 ? aim.at[0] : Math.floor(p[0]), axis === 1 ? aim.at[1] : Math.floor(p[1]), axis === 2 ? aim.at[2] : Math.floor(p[2])];
  if (cell[0] < 0 || cell[1] < 0 || cell[0] >= W || cell[1] >= H || cell[2] < 0 || cell[2] > BLOCK_TOP_LAYER) return null;
  return cell;
}

/** The two axes of a face's plane, in order (the footprint's). */
export function planeAxes(side: BlockSide): [0 | 1 | 2, 0 | 1 | 2] {
  return side[1] === "x" ? [1, 2] : side[1] === "y" ? [0, 2] : [0, 1];
}

/** F held: the Size the pointer asks for, from where its ray crosses the face's plane: the footprint reaches as far from
 *  the pointed block's middle as the pointer is (a square by its farther axis, a disc by its distance). */
export function sizeFromPointer(aim: BlockAim, ray: Ray, shape: "square" | "round"): number | null {
  const p = planeHit(aim, ray);
  if (!p) return null;
  const [u, v] = planeAxes(aim.side);
  const du = Math.abs(p[u] - (aim.at[u] + 0.5));
  const dv = Math.abs(p[v] - (aim.at[v] + 0.5));
  const reach = shape === "round" ? Math.hypot(du, dv) : Math.max(du, dv);
  return clampSize(2 * reach);
}

/** A drag in the plane of its first face: the positions it has swept, in order, the first the face pointed at. The cells
 *  between two moves are filled in, so a fast drag leaves no gaps. A position need not hold a block: an add there
 *  puts a block in the cell beyond it all the same, which is how a drag builds a bridge across air from the face it
 *  began on (the support rule says whether it holds). */
export class PlaneSweep {
  readonly at: [number, number, number][];
  private readonly seen = new Set<string>();
  private last: [number, number, number];

  constructor(
    readonly aim: BlockAim,
    private readonly W: number,
    private readonly H: number,
  ) {
    this.at = [[aim.at[0], aim.at[1], aim.at[2]]];
    this.seen.add(aim.at.join());
    this.last = [aim.at[0], aim.at[1], aim.at[2]];
  }

  /** The ray under the pointer now: the positions it adds (the same when it adds none). */
  move(ray: Ray): boolean {
    const cell = planeCell(this.aim, ray, this.W, this.H);
    if (!cell) return false;
    const [u, v] = planeAxes(this.aim.side);
    const du = cell[u] - this.last[u];
    const dv = cell[v] - this.last[v];
    const n = Math.min(64, Math.max(Math.abs(du), Math.abs(dv)));
    if (n === 0) return false;
    let changed = false;
    for (let k = 1; k <= n; k++) {
      const c: [number, number, number] = [this.last[0], this.last[1], this.last[2]];
      c[u] = Math.round(this.last[u] + (du * k) / n);
      c[v] = Math.round(this.last[v] + (dv * k) / n);
      const key = c.join();
      if (this.seen.has(key) || this.at.length >= MAX_POSITIONS) continue;
      this.seen.add(key);
      this.at.push(c);
      changed = true;
    }
    this.last = cell;
    return changed;
  }
}

/** A stable key for a preview request: the same operation asks the worker once. */
export const paramsKey = (p: BlocksParams) => `${p.mode}|${p.side}|${p.size}|${p.shape ?? "square"}|${p.at.map((c) => c.join()).join(";")}`;
