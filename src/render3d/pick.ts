// Picking (EDITOR_PLAN §8): which tile, and which face of it, a ray from the camera hits.
// `pickTerrain` walks the voxels the map is made of (a 3D DDA over the columns' masks, the ones
// `mesh.ts` draws) and stops at the first solid voxel's face: a run's top, its underside or a wall.
// So a ray aims at the ground the player sees (a cave's floor through its mouth, a ledge under an
// overhang, a roof's underside) and never at a face behind a wall. On a map without terrain above
// terrain it returns exactly what `pickHeightfield` (the tile grid's 2D DDA, kept as the reference
// and for the investigations) returns. Pure TypeScript.
//
// World space: X = x, Y = height, Z = −y.

import { LAYERS } from "./model";

export interface Ray {
  origin: [number, number, number];
  direction: [number, number, number];
}

/** A solid run of a column: voxels `bottom` … `top − 1` are solid, so `top` is the level of its top
 *  face and `bottom` the level of its underside. The map's floor under a column with air at its
 *  bottom is the empty run at level 0 (`bottom` = `top` = 0). */
export interface Run {
  bottom: number;
  top: number;
}

export interface TileHit {
  x: number;
  y: number;
  /** Where the ray hit, in world space. */
  point: [number, number, number];
  /** The face hit: a run's top, its underside, or one of its walls (`side` says which). */
  face: "top" | "bottom" | "side";
  /** For a wall, the way it faces. */
  side?: "east" | "west" | "north" | "south";
  /** The run the face belongs to; absent on a hit made some other way (the water's surface). */
  run?: Run;
  /** The level of the ground hit: its run's top. */
  level?: number;
  /** The layer of the voxel the face belongs to (0 at the bottom); absent where the hit names no voxel (the map's
   *  floor under air, a hit made some other way). */
  layer?: number;
  t: number;
}

/** The six faces of a block, named by the way they face in tile coordinates (x east, y north: `+y` is toward
 *  y + 1, which is −Z in world space), as the `blocks` operation names them. */
export type BlockFace = "+x" | "-x" | "+y" | "-y" | "+z" | "-z";

/** The block whose face the pointer is on, and which of its faces (the Block tool's aim; `blocks` in
 *  `ops.schema.json`): `at` is the block's tile and layer, `side` the face that was hit. */
export interface BlockAim {
  at: [number, number, number];
  side: BlockFace;
}

const SIDE_FACE: Record<NonNullable<TileHit["side"]>, BlockFace> = { east: "+x", west: "-x", north: "+y", south: "-y" };

/** The block a pick hit is on, or null where there is none to point at: no hit (the sky, off the map), a hit that
 *  names no run (the water's surface), or the map's floor under air (the empty run at level 0: layer 0 is a block
 *  only where the ground holds one). The top face of a run belongs to its top block, the underside to its bottom
 *  block, a wall to the block at the height hit.
 *
 *  Only right on a hit of the voxel pick (`pickSeen`: the tools registered with `voxel: true`, so the page wires the
 *  Block tool that way); the editing pick (`pickEditing`) aims at the tile's top, not at what is seen.
 *
 *  Under a layer cut (`cut`, as `pickSeen` was cut), a top face at or above the cut (the cut's own cap, or a real top
 *  exactly at it) is the block just under the cut, at layer `cut − 1`, which is seen: Remove takes it. Add gives null
 *  there, since it would fill layer `cut`, which the cut hides. Walls, undersides and tops under the cut aim as
 *  without a cut. */
export function blockAim(hit: TileHit | null, cut: number | null = null, mode: "add" | "remove" = "add"): BlockAim | null {
  const run = hit?.run;
  if (!hit || !run || run.top <= run.bottom) return null;
  if (hit.face === "top") {
    if (cut === null || run.top < cut) return { at: [hit.x, hit.y, run.top - 1], side: "+z" };
    return mode === "add" ? null : { at: [hit.x, hit.y, cut - 1], side: "+z" };
  }
  if (hit.face === "bottom") return { at: [hit.x, hit.y, run.bottom], side: "-z" };
  if (!hit.side) return null;
  const layer = hit.layer ?? Math.floor(hit.point[1]);
  return { at: [hit.x, hit.y, Math.max(run.bottom, Math.min(run.top - 1, layer))], side: SIDE_FACE[hit.side] };
}

/** The level of the ground a hit is on: its run's top, or the tile's height for a hit that names no run. */
export function hitLevel(hit: TileHit, heights: ArrayLike<number>, W: number): number {
  return hit.level ?? heights[hit.y * W + hit.x];
}

/** The levels of a column's tops: the map's floor (0) when voxel 0 is air, and every solid run's top. */
export function runTops(mask: number): number[] {
  const out: number[] = [];
  if (!(mask & 1)) out.push(0);
  for (let z = 0; z < LAYERS; z++) if (((mask >>> z) & 1) && !((mask >>> (z + 1)) & 1)) out.push(z + 1);
  return out;
}

/** The top of a column nearest `level` (the lower when two are as near): the ground a cursor aimed
 *  at that level lies on in this column. */
export function groundNear(mask: number, level: number): number {
  let best = 0;
  let gap = mask & 1 ? Infinity : Math.abs(level);
  for (let z = 0; z < LAYERS; z++) {
    if (!(((mask >>> z) & 1) && !((mask >>> (z + 1)) & 1))) continue;
    const d = Math.abs(z + 1 - level);
    if (d < gap) {
      gap = d;
      best = z + 1;
    }
  }
  return best;
}

/** Whether a tile has a ground top at `level`, under a layer cut or not: its column's tops (`mask`: a column with
 *  terrain above terrain; none: one plain run up to `height`), with the terrain above the cut gone, the cut itself a
 *  top where rock crosses it. */
export function hasTopAt(height: number, mask: number | undefined, level: number, cut: number | null): boolean {
  if (mask === undefined) return (cut === null ? height : Math.min(height, cut)) === level;
  return runTops(mask & cutKeep(cut)).includes(level);
}

/** The editing tools' pick (brushes, forces, the shelf, the start, sources): the tile's top, exactly the heightfield
 *  picker's hit (heights clamped by the cut), until step 3 puts them on runs. A ray through a cave's mouth lands on the
 *  tile in front (the roof's wall), not on the inner tile whose floor is seen: a cursor is where the pointer is (D321, 13)
 *  and a stroke changes the tile's top. Only the Select tool and the hover highlight use `pickTerrain`. */
export function pickEditing(ray: Ray, W: number, H: number, heights: Uint8Array, cut?: number): TileHit | null {
  return pickTerrain(ray, W, H, (i) => (heights[i] >= 31 ? 0x7fffffff : (1 << heights[i]) - 1), { cut });
}

/** The mask of the voxels a layer cut leaves (cut: the level, or null for none). */
export function cutKeep(cut: number | null | undefined): number {
  return cut === null || cut === undefined || cut >= 31 ? -1 : (1 << Math.max(0, cut)) - 1;
}

/** The heights a cursor lies on, near `at`: `heights` itself, unless the cursor follows the run the pointer
 *  aims at (`onRun`, the Select tool's ring) and some column with terrain above terrain lies within its reach,
 *  where that column's height becomes the top of its run nearest the aimed level (a copy then). The editing
 *  tools (brushes, forces) never follow the run: their stroke changes the tile's top, and the cursor draws
 *  where the ground will change. */
export function aimedHeights(
  heights: Uint8Array,
  W: number,
  H: number,
  columns: ReadonlyMap<number, Uint8Array>,
  maskAt: (i: number) => number,
  aim: number | null,
  at: { x: number; y: number; radius: number },
  onRun: boolean,
): Uint8Array {
  if (!onRun || aim === null || columns.size === 0) return heights;
  const r = Math.ceil(at.radius) + 1;
  const x0 = Math.max(0, Math.floor(at.x) - r);
  const x1 = Math.min(W - 1, Math.floor(at.x) + r);
  const y0 = Math.max(0, Math.floor(at.y) - r);
  const y1 = Math.min(H - 1, Math.floor(at.y) + r);
  let out: Uint8Array | null = null;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const i = y * W + x;
      if (!columns.has(i)) continue;
      const g = groundNear(maskAt(i), aim);
      if (g === heights[i]) continue;
      out ??= heights.slice();
      out[i] = g;
    }
  return out ?? heights;
}

export interface TerrainPickOptions {
  /** The level the world is cut at (the game's layers): voxels at or above it are air. */
  cut?: number;
  /** The top of the box the ray is clipped to (default: the map's 23 layers). */
  maxHeight?: number;
}

/** The first face of solid terrain a ray meets, or null if it misses the map. `maskAt(i)` is the
 *  column of tile i = y·W + x: bit z set when voxel z is solid (`mesh.ts` `columnMask`). The map's
 *  floor (level 0) is solid under every column: a ray through air at the bottom lands on it. */
export function pickTerrain(ray: Ray, W: number, H: number, maskAt: (i: number) => number, opts: TerrainPickOptions = {}): TileHit | null {
  const [ox, oy, oz] = ray.origin;
  const [dxw, dy, dzw] = ray.direction;
  const maxH = opts.maxHeight ?? LAYERS;
  const keep = cutKeep(opts.cut);
  // grid coordinates: gx = X, gy = −Z
  const gx0 = ox;
  const gy0 = -oz;
  const dgx = dxw;
  const dgy = -dzw;
  // clip to the box [0, W] × [0, H] × [0, maxH], noting the plane the ray comes in through
  let tmin = 0;
  let tmax = Infinity;
  const came: { axis: 0 | 1 | 2 | null } = { axis: null };
  const slab = (axis: 0 | 1 | 2, o: number, d: number, lo: number, hi: number): boolean => {
    if (Math.abs(d) < 1e-12) return o >= lo && o <= hi;
    let t0 = (lo - o) / d;
    let t1 = (hi - o) / d;
    if (t0 > t1) [t0, t1] = [t1, t0];
    if (t0 > tmin) {
      tmin = t0;
      came.axis = axis;
    }
    tmax = Math.min(tmax, t1);
    return tmin <= tmax;
  };
  if (!slab(0, gx0, dgx, 0, W) || !slab(1, gy0, dgy, 0, H) || !slab(2, oy, dy, 0, maxH)) return null;
  const eps = 1e-7;
  let t = tmin;
  let x = Math.min(W - 1, Math.max(0, Math.floor(gx0 + dgx * (t + eps))));
  let y = Math.min(H - 1, Math.max(0, Math.floor(gy0 + dgy * (t + eps))));
  let z = Math.min(maxH - 1, Math.max(0, Math.floor(oy + dy * (t + eps))));
  const stepX = dgx > 0 ? 1 : dgx < 0 ? -1 : 0;
  const stepY = dgy > 0 ? 1 : dgy < 0 ? -1 : 0;
  const stepZ = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  // when the ray leaves the voxel through each pair of planes, worked out afresh at every step (not
  // summed, so the end of the walk meets the box's edge exactly, as the clip above does)
  const leave = (step: number, cell: number, o: number, d: number) => (step > 0 ? (cell + 1 - o) / d : step < 0 ? (cell - o) / d : Infinity);
  let tMaxX = leave(stepX, x, gx0, dgx);
  let tMaxY = leave(stepY, y, gy0, dgy);
  let tMaxZ = leave(stepZ, z, oy, dy);
  // the plane the ray crossed into the voxel it is in: the face it will land on (a ray that begins
  // inside the terrain lands on the top of the run it is in)
  let axis = came.axis;
  const hit = (m: number): TileHit => {
    let bottom = z;
    while (bottom > 0 && (m >>> (bottom - 1)) & 1) bottom--;
    let top = z + 1;
    while (top < 31 && (m >>> top) & 1) top++;
    const point: [number, number, number] = [ox + dxw * t, oy + dy * t, oz + dzw * t];
    const run = { bottom, top };
    if (axis === 2 || axis === null) return { x, y, point, face: axis === 2 && stepZ > 0 ? "bottom" : "top", run, level: top, layer: z, t };
    const side = axis === 0 ? (stepX > 0 ? "west" : "east") : stepY > 0 ? "south" : "north";
    return { x, y, point, face: "side", side, run, level: top, layer: z, t };
  };
  for (let guard = 0; guard < 4 * (W + H) + 4 * maxH + 8; guard++) {
    const m = maskAt(y * W + x) & keep;
    if ((m >>> z) & 1) return hit(m);
    const next = tMaxX < tMaxY ? (tMaxX < tMaxZ ? 0 : 2) : tMaxY < tMaxZ ? 1 : 2;
    const tNext = next === 0 ? tMaxX : next === 1 ? tMaxY : tMaxZ;
    if (tNext > tmax) return null;
    if (next === 2) {
      // through the voxel's top or bottom: the box's top ends the walk, and the map's floor is solid
      if (stepZ < 0 && z === 0) return { x, y, point: [ox + dxw * tMaxZ, 0, oz + dzw * tMaxZ], face: "top", run: { bottom: 0, top: 0 }, level: 0, t: tMaxZ };
      z += stepZ;
      if (z >= maxH) return null;
      t = tMaxZ;
      tMaxZ = leave(stepZ, z, oy, dy);
    } else if (next === 0) {
      x += stepX;
      if (x < 0 || x >= W) return null;
      t = tMaxX;
      tMaxX = leave(stepX, x, gx0, dgx);
    } else {
      y += stepY;
      if (y < 0 || y >= H) return null;
      t = tMaxY;
      tMaxY = leave(stepY, y, gy0, dgy);
    }
    axis = next;
  }
  return null;
}

/** The first tile the ray hits, or null if it misses the map. */
export function pickHeightfield(ray: Ray, W: number, H: number, heights: Uint8Array, maxHeight = 23): TileHit | null {
  const [ox, oy, oz] = ray.origin;
  const [dxw, dy, dzw] = ray.direction;
  // grid coordinates: gx = X, gy = −Z
  const gx0 = ox;
  const gy0 = -oz;
  const dgx = dxw;
  const dgy = -dzw;
  // clip to the box [0, W] × [0, maxHeight] × [0, H]
  let tmin = 0;
  let tmax = Infinity;
  const slab = (o: number, d: number, lo: number, hi: number): boolean => {
    if (Math.abs(d) < 1e-12) return o >= lo && o <= hi;
    let t0 = (lo - o) / d;
    let t1 = (hi - o) / d;
    if (t0 > t1) [t0, t1] = [t1, t0];
    tmin = Math.max(tmin, t0);
    tmax = Math.min(tmax, t1);
    return tmin <= tmax;
  };
  if (!slab(gx0, dgx, 0, W) || !slab(gy0, dgy, 0, H) || !slab(oy, dy, 0, maxHeight)) return null;
  const eps = 1e-7;
  let t = tmin;
  const px = gx0 + dgx * (t + eps);
  const py = gy0 + dgy * (t + eps);
  let x = Math.min(W - 1, Math.max(0, Math.floor(px)));
  let y = Math.min(H - 1, Math.max(0, Math.floor(py)));
  const stepX = dgx > 0 ? 1 : dgx < 0 ? -1 : 0;
  const stepY = dgy > 0 ? 1 : dgy < 0 ? -1 : 0;
  const tDeltaX = stepX ? Math.abs(1 / dgx) : Infinity;
  const tDeltaY = stepY ? Math.abs(1 / dgy) : Infinity;
  let tMaxX = stepX > 0 ? (x + 1 - gx0) / dgx : stepX < 0 ? (x - gx0) / dgx : Infinity;
  let tMaxY = stepY > 0 ? (y + 1 - gy0) / dgy : stepY < 0 ? (y - gy0) / dgy : Infinity;
  let first = true;
  for (let guard = 0; guard < 4 * (W + H) + 8; guard++) {
    const tOut = Math.min(tMaxX, tMaxY, tmax);
    const h = heights[y * W + x];
    const yIn = oy + dy * t;
    const yOut = oy + dy * tOut;
    if (yIn <= h) {
      // entered this tile below its top: its wall (or, on the first tile, the ray started below)
      return { x, y, point: [ox + dxw * t, yIn, oz + dzw * t], face: first && t === 0 ? "top" : "side", t };
    }
    if (yOut <= h && dy < 0) {
      const th = (h - oy) / dy;
      return { x, y, point: [ox + dxw * th, h, oz + dzw * th], face: "top", t: th };
    }
    if (tOut >= tmax) return null;
    first = false;
    if (tMaxX < tMaxY) {
      t = tMaxX;
      x += stepX;
      tMaxX += tDeltaX;
    } else {
      t = tMaxY;
      y += stepY;
      tMaxY += tDeltaY;
    }
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
  }
  return null;
}

/** Where the ray crosses the horizontal plane at `height` (null if parallel or behind). */
export function pickPlane(ray: Ray, height: number): { x: number; y: number; point: [number, number, number] } | null {
  const [ox, oy, oz] = ray.origin;
  const [dx, dy, dz] = ray.direction;
  if (Math.abs(dy) < 1e-9) return null;
  const t = (height - oy) / dy;
  if (t < 0) return null;
  const X = ox + dx * t;
  const Z = oz + dz * t;
  return { x: Math.floor(X), y: Math.floor(-Z), point: [X, height, Z] };
}
