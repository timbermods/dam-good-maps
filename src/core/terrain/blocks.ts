// The Block tool's operation, as plain data and plain functions (3D step 3, D335, D342): add blocks
// against the ground, or remove blocks, one by one or across a footprint, in a click or a drag. Nothing
// here knows the session: the cells an operation acts on, why it cannot be taken (never clamped: a cell
// off the layers, outside the selection, an object in the way, nothing to change), the plants that ride
// or go, the terrain it makes. The support rule (a block that would fall) is `terrain/support.ts`'s, put
// together with this by `doc/session.ts` `blockFalls`; the build applies the operation tile by tile
// (`features/build.ts` step 6, through `blockTileMask`).
//
// The coordinates are the voxels': x and y the tile, z the layer (0 at the bottom). A face is named
// by the block it belongs to and its outward direction (`side`).

import { FOOTPRINTS, worldBlocks } from "../format/footprints";
import { CEILING } from "../format/world";
import { ColumnTerrain, isPlainMask, reshapeTop, surfaceOfMask } from "./runs";

/** The highest layer a block can occupy: the surface may reach CEILING, so the top layer (CEILING)
 *  stays empty, as everywhere else in the editor. */
export const BLOCK_TOP_LAYER = CEILING - 1;
export const BLOCK_SIZE_MIN = 1;
export const BLOCK_SIZE_MAX = 8;
/** The most positions a drag may sweep in one operation. */
export const MAX_BLOCK_POSITIONS = 4096;

/** The six faces of a block, by the axis they face along and their direction. */
export type BlockSide = "+x" | "-x" | "+y" | "-y" | "+z" | "-z";
export const BLOCK_SIDES: readonly BlockSide[] = ["+x", "-x", "+y", "-y", "+z", "-z"];
const NORMAL: Record<BlockSide, readonly [number, number, number]> = { "+x": [1, 0, 0], "-x": [-1, 0, 0], "+y": [0, 1, 0], "-y": [0, -1, 0], "+z": [0, 0, 1], "-z": [0, 0, -1] };

export type BlockMode = "add" | "remove";

/** The Block tool's operation (`blocks` in ops.schema.json). */
export interface BlocksParams {
  mode: BlockMode;
  /** The face pointed at: `at[0]` is the block it belongs to, `side` which of its six faces. */
  side: BlockSide;
  /** The blocks whose `side` face was swept, in order: a click names one (the face pointed at), a
   *  drag the face and every position it passed over, all in the face's own plane (the same x for an
   *  east or west face, y for north or south, z for top or bottom). An add puts its blocks in the
   *  cells beyond these faces, a remove takes these blocks themselves. */
  at: [number, number, number][];
  /** The footprint across the plane, in blocks: 1 to 8 (square), or the disc of that diameter. Where it
   *  overhangs the edge of the map or the layers it is clipped, as a brush is. */
  size: number;
  /** "square" when absent. */
  shape?: "square" | "round";
  /** The working area (D254: the Select tool's open selection), as runs [y, x0, x1]: a cell outside it
   *  refuses the operation. */
  area?: [number, number, number][];
  /** The view's cut (D196, D207): the layers from this one up are hidden, and the operation touches
   *  nothing in them; a layer at or above it counts as open air to a remove's exposure test. */
  cut?: number;
  /** The blocks the operation changed, as the session found them when it took it (an add's new
   *  blocks, a remove's old ones): pairs [tile, layers] by ascending tile, `layers` the bits (layer z =
   *  1 << z) changed in that tile. The build applies these literally, so a replay never looks at the
   *  ground again. Absent on the operation a caller gives; the session fills it in. */
  cells?: number[];
  /** The plants the operation removes (ids), as the session found them: those its blocks fill in or
   *  take the ground from. Plants on a tile's top that only rise or sink with it are not here; they ride
   *  (D368 (10)). Filled in by the session. */
  plants?: string[];
  /** The plants that stand on a layer other than the surface rule's (the top of the tile): [id, layer].
   *  A plant stays on the top of the run it stands on when a block is built above it, and a plant that
   *  rides to another run's top keeps it; the build puts each there (D368 (10)). Filled in by the session. */
  stands?: [string, number][];
}

export type Rect = { x0: number; y0: number; x1: number; y1: number };

const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);

/** Why these parameters are not a block operation on a W × H map (empty when they are): their shape and
 *  where they point, which does not depend on the ground. */
export function blockProblems(p: BlocksParams, W: number, H: number): string[] {
  if (p.mode !== "add" && p.mode !== "remove") return ["a block operation adds or removes"];
  if (!BLOCK_SIDES.includes(p.side)) return [`a block has six faces: ${BLOCK_SIDES.join(", ")}`];
  if (!Array.isArray(p.at) || !p.at.length) return ["a block operation needs the face it points at"];
  if (p.at.length > MAX_BLOCK_POSITIONS) return [`a block operation sweeps at most ${MAX_BLOCK_POSITIONS} positions`];
  if (!p.at.every((c) => Array.isArray(c) && c.length === 3 && c.every(isInt))) return ["a block is named by three whole numbers: x, y, layer"];
  if (!isInt(p.size) || p.size < BLOCK_SIZE_MIN || p.size > BLOCK_SIZE_MAX) return [`a block's size is ${BLOCK_SIZE_MIN} to ${BLOCK_SIZE_MAX} blocks across`];
  if (p.shape !== undefined && p.shape !== "square" && p.shape !== "round") return ["a block's footprint is square or round"];
  if (p.area !== undefined && !(Array.isArray(p.area) && p.area.every((r) => Array.isArray(r) && r.length === 3 && r.every(isInt) && r[1] <= r[2]))) return ["a block operation's working area is runs [y, x0, x1]"];
  if (p.cut !== undefined && !(isInt(p.cut) && p.cut >= 0 && p.cut <= BLOCK_TOP_LAYER + 1)) return [`the view's cut is a layer from 0 to ${BLOCK_TOP_LAYER + 1}`];
  if (p.cells !== undefined && !(Array.isArray(p.cells) && p.cells.length % 2 === 0 && p.cells.every((c, k) => isInt(c) && (k % 2 ? c > 0 && c < 1 << (BLOCK_TOP_LAYER + 1) : c >= 0 && c < W * H)))) return ["a block operation's cells are pairs [tile, layers] on the map"];
  if (p.plants !== undefined && !(Array.isArray(p.plants) && p.plants.every((id) => typeof id === "string"))) return ["a block operation's plants are object ids"];
  if (p.stands !== undefined && !(Array.isArray(p.stands) && p.stands.every((e) => Array.isArray(e) && e.length === 2 && typeof e[0] === "string" && isInt(e[1]) && e[1] >= 0 && e[1] <= BLOCK_TOP_LAYER + 1))) return ["a block operation's stands are [plant id, layer]"];
  const axis = axisOf(p.side);
  for (const c of p.at) {
    if (c[0] < 0 || c[1] < 0 || c[0] >= W || c[1] >= H) return [`X ${c[0]} · Y ${c[1]} is outside the map`];
    if (c[2] < 0 || c[2] > BLOCK_TOP_LAYER) return [layerProblem(c[2])];
    if (c[axis] !== p.at[0][axis]) return [`a sweep stays in the face's plane: ${"xyz"[axis]} is ${p.at[0][axis]}`];
  }
  return [];
}

function layerProblem(z: number): string {
  return z > BLOCK_TOP_LAYER ? `layer ${z} is above the highest layer (${BLOCK_TOP_LAYER})` : `layer ${z} is below the lowest layer (0)`;
}

function axisOf(side: BlockSide): 0 | 1 | 2 {
  return side[1] === "x" ? 0 : side[1] === "y" ? 1 : 2;
}

/** The footprint's offsets across the plane (a, b), for the two axes of the plane in order. */
function footprint(size: number, shape: "square" | "round"): [number, number][] {
  const lo = -Math.floor((size - 1) / 2);
  const hi = lo + size - 1;
  const c = (lo + hi) / 2;
  const out: [number, number][] = [];
  for (let a = lo; a <= hi; a++)
    for (let b = lo; b <= hi; b++) if (shape === "square" || (a - c) * (a - c) + (b - c) * (b - c) <= (size / 2) * (size / 2)) out.push([a, b]);
  return out;
}

/** One cell an operation acts on: the cell itself, and where it lies in the plane of the face before an
 *  add's step beyond it (`plane`; a clipped cell is one whose plane position is off the map or the
 *  layers). */
export interface BlockTarget {
  cell: [number, number, number];
  plane: [number, number, number];
  /** Which swept position (an index into `at`) it belongs to. */
  pos: number;
}

/** The cells an operation acts on, in sweep order (each swept position's footprint in turn): an add's are
 *  the cells beyond the swept faces, a remove's the swept blocks, each across the footprint. A cell two
 *  positions both reach is returned for both. Cells off the map or the layers are returned as they are
 *  (`blockEffect` clips or refuses them). */
export function blockTargets(p: BlocksParams): BlockTarget[] {
  const axis = axisOf(p.side);
  const n = NORMAL[p.side];
  const off = footprint(p.size, p.shape ?? "square");
  const out: BlockTarget[] = [];
  // (the plane's two axes, in order)
  const u = axis === 0 ? 1 : 0;
  const v = axis === 2 ? 1 : 2;
  for (let pos = 0; pos < p.at.length; pos++) {
    const c = p.at[pos];
    for (const [a, b] of off) {
      const plane: [number, number, number] = [c[0], c[1], c[2]];
      plane[u] += a;
      plane[v] += b;
      const cell: [number, number, number] = p.mode === "add" ? [plane[0] + n[0], plane[1] + n[1], plane[2] + n[2]] : [plane[0], plane[1], plane[2]];
      out.push({ cell, plane, pos });
    }
  }
  return out;
}

/** The tiles an operation can change (its cells' columns), clipped to the map; null when none. */
export function blockBounds(p: BlocksParams, W: number, H: number): Rect | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const tiles: [number, number][] = [];
  if (p.cells) for (let k = 0; k < p.cells.length; k += 2) tiles.push([p.cells[k] % W, Math.floor(p.cells[k] / W)]);
  else for (const t of blockTargets(p)) tiles.push([t.cell[0], t.cell[1]]);
  for (const [x, y] of tiles) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  }
  return x0 <= x1 ? { x0, y0, x1, y1 } : null;
}

/** What stands on the map, as the Block tool meets it: the cells (layer·N + tile) of the objects that
 *  hold their ground (everything but plants), and the plants by every cell they occupy. */
export interface BlockGround {
  objects: ReadonlySet<number>;
  /** Every cell a plant occupies → the plant. */
  plants: ReadonlyMap<number, Plant>;
  /** The plants of each tile. */
  byTile: ReadonlyMap<number, readonly Plant[]>;
}

/** A plant (a tree, a bush, a succulent, a ruin column): it stands on the surface where it is and rides
 *  the ground (D368 (10)). */
export interface Plant {
  id: string;
  /** The cell it stands in (its lowest block). */
  base: number;
  /** How many layers it fills (a pine's three). */
  h: number;
}

const PLANT = /^(Pine|Birch|Oak|Maple|ChestnutTree|Mangrove|Succulent|BlueberryBush|RuinColumnH\d+)$/;

/** The objects standing on the map, for the Block tool: every block of every object that has a footprint
 *  (an object always holds the cell it stands in, a slope's too). Plants are kept apart: they ride. */
export function blockGround(entities: readonly { id: string; template: string; x: number; y: number; z: number; orientation: "Cw0" | "Cw90" | "Cw180" | "Cw270"; flipped?: boolean; raw?: { Components?: unknown } }[], W: number, H: number): BlockGround {
  const N = W * H;
  const objects = new Set<number>();
  const plants = new Map<number, Plant>();
  const byTile = new Map<number, Plant[]>();
  for (const e of entities) {
    const fp = FOOTPRINTS[e.template];
    if (!fp) continue;
    const comps = e.raw ? (e.raw.Components as { BlockObject?: unknown } | undefined) : undefined;
    if (e.raw && !(comps && typeof comps === "object" && comps.BlockObject)) continue;
    const blocks = worldBlocks(fp, { template: e.template, x: e.x, y: e.y, z: e.z, orientation: e.orientation, flipped: !!e.flipped });
    const cells: number[] = [];
    // (an object always holds the cell it stands in, whatever its footprint says)
    if (e.x >= 0 && e.y >= 0 && e.x < W && e.y < H && e.z >= 0) cells.push(e.z * N + e.y * W + e.x);
    for (const b of blocks) if (b.x >= 0 && b.y >= 0 && b.x < W && b.y < H && b.z >= 0) cells.push(b.z * N + b.y * W + b.x);
    if (PLANT.test(e.template)) {
      const plant = { id: e.id, base: e.z * N + e.y * W + e.x, h: blocks.reduce((h, b) => Math.max(h, b.z - e.z + 1), 1) };
      for (const c of cells) plants.set(c, plant);
      const tile = e.y * W + e.x;
      byTile.set(tile, [...(byTile.get(tile) ?? []), plant]);
    } else for (const c of cells) objects.add(c);
  }
  return { objects, plants, byTile };
}

/** What an operation does to the ground it meets. */
export interface BlockEffect {
  /** One line, or none: why the operation cannot be taken. */
  errors: string[];
  /** The cells (z·N + tile) that get a block, and the cells that lose one, ascending. */
  added: number[];
  removed: number[];
  /** The plants the blocks fill in or take the ground from (ids): the build removes them. */
  plants: string[];
  /** How many plants stand on the top of a run that rises or sinks: they ride. */
  riding: number;
  /** The plants the surface rule would put elsewhere than the run top they stand on (a block built over
   *  them leaves them where they are; one that rides to another run's top): [id, layer]. */
  stands: [string, number][];
}

const NEIGHBOURS: readonly (readonly [number, number, number])[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

/** What an operation would do on this terrain, with what stands on the map (`blockGround`): the cells it
 *  adds and removes, the plants that go, or why it cannot be taken. Never clamps: a cell outside the
 *  working area, beyond the map or the layers in the direction of the face, or on an object, refuses the
 *  operation; so does one that changes nothing. A footprint that overhangs the edge of the map or the
 *  layers is clipped, as a brush is; the cells from the view's cut up are left alone.
 *
 *  An add puts a block in a cell only where it touches a block (one of the terrain, or one this operation
 *  added earlier in its sweep): a drag over air grows a span from the ground across it. A remove takes only
 *  the blocks whose face toward `side` is open (the cell beyond is air, or at or above the cut), so a drag
 *  across a hill takes the surface a viewer sees and nothing buried. */
export function blockEffect(p: BlocksParams, t: ColumnTerrain, ground: BlockGround | null = null): BlockEffect {
  const refuse = (e: string): BlockEffect => ({ errors: [e], added: [], removed: [], plants: [], riding: 0, stands: [] });
  const { W, H } = t;
  const N = t.N;
  const bad = blockProblems(p, W, H);
  if (bad.length) return refuse(bad[0]);
  const [fx, fy, fz] = p.at[0];
  if (!t.solid(fy * W + fx, fz)) return refuse(`X ${fx} · Y ${fy} has no block in layer ${fz} to point at`);
  const inArea = p.area ? areaTiles(p.area, W, H) : null;
  const cut = p.cut ?? BLOCK_TOP_LAYER + 1;
  const added: number[] = [];
  const removed: number[] = [];
  const placed = new Set<number>();
  let hidden = 0;
  const solidNow = (x: number, y: number, z: number) => x >= 0 && y >= 0 && x < W && y < H && z >= 0 && z <= BLOCK_TOP_LAYER && (t.solid(y * W + x, z) || placed.has(z * N + y * W + x));
  // an add chains: a swept position's cells go in wherever they touch a block, one already there or one added
  // before, and again and again until none more does, so the order of the cells in a footprint decides
  // nothing; the next position goes after, in sweep order
  let pending: number[] = [];
  const flush = () => {
    for (let more = pending.length > 0; more; ) {
      more = false;
      const rest: number[] = [];
      for (const cell of pending) {
        const z = Math.floor(cell / N);
        const i = cell % N;
        const x = i % W;
        const y = (i - x) / W;
        if (placed.has(cell)) continue;
        if (NEIGHBOURS.some(([dx, dy, dz]) => solidNow(x + dx, y + dy, z + dz))) {
          added.push(cell);
          placed.add(cell);
          more = true;
        } else rest.push(cell);
      }
      pending = rest;
    }
    pending = [];
  };
  const taken = new Set<number>();
  let pos = 0;
  for (const target of blockTargets(p)) {
    const { cell: [x, y, z], plane } = target;
    if (target.pos !== pos) {
      flush();
      pos = target.pos;
    }
    // (a footprint over the map's edge or the layers' is clipped)
    if (plane[0] < 0 || plane[1] < 0 || plane[0] >= W || plane[1] >= H || plane[2] < 0 || plane[2] > BLOCK_TOP_LAYER) continue;
    if (x < 0 || y < 0 || x >= W || y >= H) return refuse(`X ${x} · Y ${y} is outside the map`);
    if (z < 0 || z > BLOCK_TOP_LAYER) return refuse(layerProblem(z));
    const i = y * W + x;
    if (inArea && !inArea[i]) return refuse(`X ${x} · Y ${y} is outside the selection`);
    if (z >= cut) {
      hidden++;
      continue;
    }
    const cell = z * N + i;
    if (ground?.objects.has(cell)) return refuse(`an object stands at X ${x} · Y ${y} in layer ${z}`);
    if (p.mode === "add") {
      if (!t.solid(i, z) && !placed.has(cell)) pending.push(cell);
    } else if (t.solid(i, z) && !taken.has(cell)) {
      // (a remove takes what a viewer sees: a block whose aimed face is buried in the ground stays)
      if (!openBeyond(t, x, y, z, p.side, cut)) continue;
      // (the block an object stands on stays)
      if (ground?.objects.has(cell + N)) return refuse(`an object stands on the block at X ${x} · Y ${y} in layer ${z}`);
      taken.add(cell);
      removed.push(cell);
    }
  }
  flush();
  if (!added.length && !removed.length) return refuse(hidden && p.cut !== undefined ? `nothing below layer ${cut} would change` : p.mode === "add" ? "there is no room for a block there" : "there is no block there to remove");
  added.sort((a, b) => a - b);
  removed.sort((a, b) => a - b);
  // the plants (D368 (10)): one stands on the top of its run of blocks. A block added into its cells takes it
  // away. Only a change to the top of that run moves it: the run grows over its base, or loses its top blocks,
  // and it rides. A block built above it, with the cells it fills left free, leaves it where it is, under the
  // block, even where the surface now is higher.
  const gone: string[] = [];
  const stands: [string, number][] = [];
  let riding = 0;
  if (ground?.byTile.size) {
    const changed = new Map<number, number>();
    for (const c of added) changed.set(c % N, (changed.get(c % N) ?? 0) | (1 << Math.floor(c / N)));
    for (const c of removed) changed.set(c % N, (changed.get(c % N) ?? 0) | (1 << Math.floor(c / N)));
    for (const [tile, bits] of changed) {
      const plants = ground.byTile.get(tile);
      if (!plants) continue;
      const was = t.mask[tile];
      const now = (was | (p.mode === "add" ? bits : 0)) & ~(p.mode === "remove" ? bits : 0);
      const defaultLayer = surfaceOfMask(now);
      for (const plant of plants) {
        const z0 = Math.floor(plant.base / N);
        // (one not standing on a block, or inside one, is the build's: it leaves it)
        if (z0 < 1 || !(was & (1 << (z0 - 1))) || (was & (1 << z0))) continue;
        let z1 = z0;
        if (!(now & (1 << (z0 - 1)))) {
          // the top of its run was taken: it sinks to what is left of the run
          let a = z0 - 1;
          while (a >= 1 && was & (1 << (a - 1))) a--;
          let top = -1;
          for (let z = z0 - 2; z >= a; z--) if (now & (1 << z)) {
            top = z;
            break;
          }
          if (top < 0) {
            gone.push(plant.id);
            continue;
          }
          z1 = top + 1;
        } else if (now & (1 << z0)) {
          // the run grew over its base: it rides up to the new top
          z1 = z0;
          while (now & (1 << z1)) z1++;
        }
        let free = true;
        for (let z = z1; z < z1 + plant.h; z++) if (z > BLOCK_TOP_LAYER || now & (1 << z)) free = false;
        if (!free) {
          gone.push(plant.id);
          continue;
        }
        if (z1 !== z0) riding++;
        if (z1 !== defaultLayer) stands.push([plant.id, z1]);
      }
    }
  }
  gone.sort();
  stands.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return { errors: [], added, removed, plants: gone, riding, stands };
}

/** Whether the block at (x, y, z) has its `side` face open to a viewer under the layer cut: the cell beyond
 *  it is air, off the map or the layers, or cut away (at or above the cut). Read from the ground before
 *  the operation: a block taken earlier in a sweep opens nothing for the next. */
function openBeyond(t: ColumnTerrain, x: number, y: number, z: number, side: BlockSide, cut: number): boolean {
  const n = NORMAL[side];
  const nx = x + n[0];
  const ny = y + n[1];
  const nz = z + n[2];
  if (nx < 0 || ny < 0 || nx >= t.W || ny >= t.H || nz < 0 || nz > BLOCK_TOP_LAYER || nz >= cut) return true;
  return !t.solid(ny * t.W + nx, nz);
}

/** A working area as a mask over the tiles. */
function areaTiles(area: readonly (readonly [number, number, number])[], W: number, H: number): Uint8Array {
  const m = new Uint8Array(W * H);
  for (const [y, a, b] of area) if (y >= 0 && y < H) for (let x = Math.max(0, a); x <= Math.min(W - 1, b); x++) m[y * W + x] = 1;
  return m;
}

/** An effect's cells as an operation stores them (`BlocksParams.cells`): pairs [tile, layers] by ascending tile. */
export function cellPairs(cells: readonly number[], N: number): number[] {
  const byTile = new Map<number, number>();
  for (const c of cells) byTile.set(c % N, (byTile.get(c % N) ?? 0) | (1 << Math.floor(c / N)));
  return [...byTile].sort((a, b) => a[0] - b[0]).flat();
}

/** The terrain after an effect: a copy of `t` with the cells added and removed. */
export function withBlocks(t: ColumnTerrain, added: readonly number[], removed: readonly number[]): ColumnTerrain {
  const mask = t.mask.slice();
  const N = t.N;
  for (const c of added) mask[c % N] |= 1 << Math.floor(c / N);
  for (const c of removed) mask[c % N] &= ~(1 << Math.floor(c / N));
  return new ColumnTerrain(t.W, t.H, mask);
}

/** The tiles an operation changes in the build's step 6, with each one's layer bits to set (an add) or
 *  clear (a remove): tile → bits. The operation's own `cells` when the session filled them in; else
 *  every cell it names (cells off the map or the layers are left out). */
export function blockTileBits(p: BlocksParams, W: number, H: number): Map<number, number> {
  const out = new Map<number, number>();
  if (p.cells) {
    for (let k = 0; k + 1 < p.cells.length; k += 2) out.set(p.cells[k], p.cells[k + 1]);
    return out;
  }
  for (const { cell: [x, y, z] } of blockTargets(p)) {
    if (x < 0 || y < 0 || x >= W || y >= H || z < 0 || z > BLOCK_TOP_LAYER) continue;
    const i = y * W + x;
    out.set(i, (out.get(i) ?? 0) | (1 << z));
  }
  return out;
}

/** A tile's mask after an operation's cells in it. */
export function blockTileMask(mask: number, bits: number, mode: BlockMode): number {
  return mode === "add" ? mask | bits : mask & ~bits;
}

/** The terrain a build leaves: `base` (the stored ground; null for a heightfield map) under the
 *  surface `heights`, with every tile a block operation touched as `masks` has it, its top run
 *  following `heights` (D280 (3): a brush after a block shapes the top and nothing under it). */
export function terrainUnder(base: ColumnTerrain | null, heights: ArrayLike<number>, masks: ReadonlyMap<number, number> | null | undefined, W: number, H: number): ColumnTerrain {
  const t = base ? base.withSurface(heights) : ColumnTerrain.fromHeights(heights, W, H);
  if (!masks || !masks.size) return t;
  const mask = t.mask.slice();
  for (const [i, m] of masks) mask[i] = surfaceOfMask(m) === heights[i] ? m : reshapeTop(m, heights[i]);
  return new ColumnTerrain(W, H, mask);
}

/** Whether any tile in `masks` is not one plain run from z = 0. */
export function layeredMasks(masks: ReadonlyMap<number, number> | null | undefined): boolean {
  if (!masks) return false;
  for (const m of masks.values()) if (!isPlainMask(m)) return true;
  return false;
}
