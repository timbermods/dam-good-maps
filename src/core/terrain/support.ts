// The game's support rule (D121; investigation/terrain3d/GAME_RULES.md §2): when a map loads, and after
// terrain is removed, a voxel is kept only if it is reached from a supported voxel through at most 3
// sideways steps in its layer (`TerrainPhysicsValidator.MaxSupportDistance`). A voxel at z = 0 is
// supported, and so is one standing on a kept voxel or on the top of a finished stackable object (a
// NaturalOverhang holds the rock above it); support never passes downward or through air. What is
// never reached is deleted. So a ledge reaches 3 out of a wall, a flat roof spans at most 6, each
// layer of a leaning cliff reaches 3 beyond the one below, and nothing hangs.
//
// The Unstable Core's blast uses it (sim/explosion.ts), the build's rule pass (`supportPass`, PLAN
// §19.8 step 7), and the probe's test maps to say what the game will delete (tools/terrain3d-maps.ts);
// the checks have the same rule in Rust (rust/checks `unsupported_voxels`), which the game confirmed
// on test map T1 (probe run terrain3d-20260927).

import { FOOTPRINTS, worldBlocks, type Placement } from "../format/footprints";
import { ColumnTerrain } from "./runs";

/** How far terrain support reaches sideways in a layer. */
export const MAX_SUPPORT_DISTANCE = 3;

/** The game's 22 + 1 terrain layers. */
const LAYERS = 23;

/** The terrain: bit z of `mask[i]` set when voxel z of tile i is solid (terrain/runs.ts
 *  `ColumnTerrain` is one). */
export interface SupportTerrain {
  W: number;
  H: number;
  mask: Uint32Array;
}

/** Solid voxels that are not supported, by cell (z·N + tile): 1 where the game deletes the voxel.
 *  `stackTops` are the cells holding the top of a finished stackable object: the voxel above each
 *  counts as standing on ground. One pass: on terrain alone a deleted voxel held nothing up.
 *  (Each tile's run from z = 0 is supported as a whole, so the search runs only over the voxels above
 *  it: on a map with a few caves it touches only those.) */
export function unsupportedVoxels(t: SupportTerrain, stackTops: Iterable<number> | null = null): Uint8Array {
  const { W, H, mask } = t;
  const N = W * H;
  const Z = LAYERS;
  const ALL = (1 << Z) - 1;
  const out = new Uint8Array(Z * N);
  // the voxels above each tile's run from z = 0 (the run itself is all supported)
  const upper = new Uint32Array(N);
  let any = false;
  for (let i = 0; i < N; i++) {
    const m = mask[i] & ALL;
    const u = m & ~(m & ~(m + 1));
    upper[i] = u;
    if (u) any = true;
  }
  if (!any) return out;
  const isUpper = (i: number, z: number) => (upper[i] & (1 << z)) !== 0;
  const best = new Int8Array(Z * N).fill(99);
  const queue: number[] = [];
  const reach = (v: number, s: number) => {
    if (best[v] > s) {
      best[v] = s;
      queue.push(v);
    }
  };
  // a voxel beside a run from z = 0 is one step out; one on a stackable object's top is on ground
  for (let i = 0; i < N; i++) {
    const u = upper[i];
    if (!u) continue;
    const x = i % W;
    const y = (i - x) / W;
    for (let z = 0; z < Z; z++) {
      if (!(u & (1 << z))) continue;
      const bit = 1 << z;
      if ((x > 0 && mask[i - 1] & bit && !isUpper(i - 1, z)) || (x + 1 < W && mask[i + 1] & bit && !isUpper(i + 1, z)) || (y > 0 && mask[i - W] & bit && !isUpper(i - W, z)) || (y + 1 < H && mask[i + W] & bit && !isUpper(i + W, z))) reach(z * N + i, 1);
    }
  }
  if (stackTops)
    for (const k of stackTops) {
      const up = k + N;
      if (up >= 0 && up < Z * N && isUpper(up % N, Math.floor(up / N))) reach(up, 0);
    }
  for (let head = 0; head < queue.length; head++) {
    const v = queue[head];
    const s = best[v];
    const z = Math.floor(v / N);
    const i = v - z * N;
    const x = i % W;
    const y = (i - x) / W;
    if (z + 1 < Z && isUpper(i, z + 1)) reach(v + N, 0);
    if (s < MAX_SUPPORT_DISTANCE) {
      if (x > 0 && isUpper(i - 1, z)) reach(v - 1, s + 1);
      if (x + 1 < W && isUpper(i + 1, z)) reach(v + 1, s + 1);
      if (y > 0 && isUpper(i - W, z)) reach(v - W, s + 1);
      if (y + 1 < H && isUpper(i + W, z)) reach(v + W, s + 1);
    }
  }
  for (let i = 0; i < N; i++) {
    const u = upper[i];
    if (u) for (let z = 0; z < Z; z++) if (u & (1 << z) && best[z * N + i] === 99) out[z * N + i] = 1;
  }
  return out;
}

/** The cells (z·N + tile) holding the top of a finished stackable object (a NaturalOverhang, a
 *  platform): what `unsupportedVoxels` takes as ground under the voxel above. */
export function stackableTops(W: number, H: number, objects: Iterable<Placement>): number[] {
  const out: number[] = [];
  for (const e of objects) {
    const fp = FOOTPRINTS[e.template];
    if (!fp) continue;
    for (const b of worldBlocks(fp, e)) if (b.stackable && b.x >= 0 && b.x < W && b.y >= 0 && b.y < H) out.push(b.z * W * H + b.y * W + b.x);
  }
  return out;
}

/** The build's rule pass (D121): the terrain the game keeps when it loads the map, and how many
 *  blocks of ground it deletes from `t` (`terrain.dropped` reports them). A heightfield drops
 *  nothing, so on one every tile is plain and `t` itself comes back, nothing worked out. */
export function supportPass(t: ColumnTerrain, objects: Iterable<Placement> = []): { terrain: ColumnTerrain; dropped: number } {
  if (t.allPlain()) return { terrain: t, dropped: 0 };
  const falls = unsupportedVoxels(t, stackableTops(t.W, t.H, objects));
  const N = t.N;
  let mask: Uint32Array | null = null;
  let dropped = 0;
  for (let c = 0; c < falls.length; c++)
    if (falls[c]) {
      mask ??= t.mask.slice();
      mask[c % N] &= ~(1 << Math.floor(c / N));
      dropped++;
    }
  return { terrain: mask ? new ColumnTerrain(t.W, t.H, mask) : t, dropped };
}

/** The blocks of ground `after` holds that the game would delete and `before` did not (D121, D280
 *  (3)): what an edit would make fall, by cell (z·N + tile), ascending. Ground the game already
 *  deletes from `before` (an imported map's own) is not the edit's. Each terrain comes with the cells
 *  of its objects' stackable tops, which hold ground (`stackableTops`). Empty on a heightfield,
 *  nothing worked out. */
export function newFalls(before: SupportTerrain, after: SupportTerrain, topsBefore: Iterable<number> | null = null, topsAfter: Iterable<number> | null = null): number[] {
  const now = unsupportedVoxels(after, topsAfter);
  const out: number[] = [];
  let was: Uint8Array | null = null;
  for (let c = 0; c < now.length; c++) {
    if (!now[c]) continue;
    was ??= unsupportedVoxels(before, topsBefore);
    if (!was[c]) out.push(c);
  }
  return out;
}

/** The tiles that hold up a roof (a cave's, an overhang's, floating ground): every tile of one plain
 *  run that stands beside a column of `columns` (the map's tiles that are not one plain run) and
 *  reaches a layer where that column has ground above its own run from z = 0. Support starts only
 *  there (`unsupportedVoxels`: from a run from z = 0 beside it, then sideways and up through the
 *  roof's own voxels), so with these tiles and the columns themselves left as they are, no change
 *  elsewhere takes any roof's support away. Ascending; empty on a heightfield. */
export function roofHolders(t: SupportTerrain, columns: Iterable<number>): number[] {
  const { W, H, mask } = t;
  const ALL = (1 << LAYERS) - 1;
  const run = (i: number) => {
    const m = mask[i] & ALL;
    return m & ~(m + 1);
  };
  const cols = new Set(columns);
  const out = new Set<number>();
  for (const i of cols) {
    const upper = (mask[i] & ALL) & ~run(i);
    if (!upper) continue;
    const x = i % W;
    const y = (i - x) / W;
    for (const j of [x > 0 ? i - 1 : -1, x + 1 < W ? i + 1 : -1, y > 0 ? i - W : -1, y + 1 < H ? i + W : -1]) if (j >= 0 && !cols.has(j) && run(j) & upper) out.add(j);
  }
  return [...out].sort((a, b) => a - b);
}

/** The tiles of the objects that hold up a roof: each object with a stackable top (a NaturalOverhang,
 *  `stackableTops`) under a voxel of ground above its tile's run from z = 0, every tile of it. A force
 *  that took the object would drop that ground, so it leaves the object's ground as it is (D487).
 *  Ascending; empty when none does. */
export function objectRoofHolders(t: SupportTerrain, objects: Iterable<Placement>): number[] {
  const { W, H, mask } = t;
  const out = new Set<number>();
  for (const e of objects) {
    const fp = FOOTPRINTS[e.template];
    if (!fp) continue;
    const blocks = worldBlocks(fp, e).filter((b) => b.x >= 0 && b.x < W && b.y >= 0 && b.y < H);
    const holds = blocks.some((b) => {
      if (!b.stackable || b.z + 1 >= LAYERS) return false;
      const m = mask[b.y * W + b.x];
      const run = m & ~(m + 1);
      return ((m & ~run) >> (b.z + 1)) & 1;
    });
    if (holds) for (const b of blocks) out.add(b.y * W + b.x);
  }
  return [...out].sort((a, b) => a - b);
}

/** Where a cell (z·N + tile) is, as the page names a place: "X 32 · Y 19" (the 3D view's readout). */
export function placeOf(cell: number, W: number, H: number): string {
  const i = cell % (W * H);
  return `X ${i % W} · Y ${Math.floor(i / W)}`;
}

/** An edit's refusal when it would make ground fall (D280 (3)), in one plain line; `at`, the place
 *  of the first block (`placeOf`), for an edit whose result shows nothing falling first (a force). */
export function fallsReason(n: number, at?: string): string {
  const where = at ? ` at ${at}` : "";
  return n === 1 ? `1 block of ground would fall${where}: nothing would hold it up` : `${n} blocks of ground would fall${where}: nothing would hold them up`;
}
