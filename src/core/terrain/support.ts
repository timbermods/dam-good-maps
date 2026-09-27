// The game's support rule (D121; investigation/terrain3d/GAME_RULES.md §2, from the investigation's
// proto/support.ts): on load (`TerrainPhysicsPostLoader.ValidateTerrain`, in the game and the map
// editor) a queue starts at z = 0 on every tile with distance 0; a solid voxel reached with distance
// d is valid, the voxel above it is reached with distance 0, and if d < 3
// (`TerrainPhysicsValidator.MaxSupportDistance`) its four sideways neighbours in the same layer are
// reached with d + 1. Support never passes downward or through air; the top of a finished stackable
// object counts as ground for the voxel above it. Every voxel outside the run that starts at z = 0
// that was never reached is deleted (with a loading issue).
//
// Computed layer by layer on the terrain's masks: since support never passes downward, a layer's
// support depends only on the layers below it, so in layer z a voxel is valid exactly when it is
// within 3 same-layer steps, through solid voxels, of a voxel standing on a valid voxel (or on a
// stackable's top, or in the run from z = 0). The game repeats the pass until nothing changes, but
// on terrain alone a deleted voxel was never reached, so it held nothing up: one pass gives the
// game's result. A map whose every tile is one plain run from z = 0 (every heightfield) has nothing
// to check; any other tile is checked, whatever its count of floors (INVENTORY.md, bug 1: a run
// floating over air down to z = 0 has one floor, and today's validator skips it).
//
// What the rule allows (GAME_RULES.md §2): a ledge 3 out of a wall; a flat roof over at most 6; each
// layer of a corbelled arch or leaning cliff reaching 3 beyond the one below; never a hanging column.

import { FOOTPRINTS, worldBlocks, type Placement } from "../format/footprints";

/** The game's 22 + 1 terrain layers. */
const LAYERS = 23;
/** `TerrainPhysicsValidator.MaxSupportDistance`. */
export const MAX_SUPPORT_DISTANCE = 3;

/** The terrain: bit z of `mask[i]` set when voxel z of tile i is solid (sim/columns.ts
 *  `VoxelMasks`; M9a's `ColumnTerrain`). */
export interface SupportTerrain {
  W: number;
  H: number;
  mask: Uint32Array;
}

export interface SupportResult {
  /** The voxels the game deletes on load, as cells z·N + tile, ascending. */
  dropped: Int32Array;
  /** The terrain the game keeps (the masks without the dropped voxels). */
  kept: Uint32Array;
}

/** The number of solid voxels from z = 0 up before the first air (the run from z = 0). */
function groundRun(m: number): number {
  const air = ~m;
  return 31 - Math.clz32(air & -air);
}

/** The cells (z·N + tile) of the objects' stackable blocks (a NaturalOverhang, a platform, a
 *  drain's body): the voxel above each counts as standing on ground. The validator's placement scan
 *  gathers the same set, from the objects that load. */
export function stackableTops(W: number, H: number, objects: readonly Placement[]): Set<number> {
  const out = new Set<number>();
  const N = W * H;
  for (const o of objects) {
    const fp = FOOTPRINTS[o.template];
    if (!fp) continue;
    for (const b of worldBlocks(fp, o)) if (b.stackable && b.x >= 0 && b.x < W && b.y >= 0 && b.y < H) out.add(b.z * N + b.y * W + b.x);
  }
  return out;
}

/** Whether every tile is one plain run from z = 0 (a heightfield): then nothing can fall. */
export function allPlain(t: SupportTerrain): boolean {
  const mask = t.mask;
  for (let i = 0; i < mask.length; i++) {
    const m = mask[i];
    if ((m & (m + 1)) !== 0) return false;
  }
  return true;
}

/** The game's support rule on a whole map. `stackTops` are cells z·N + tile holding the top of a
 *  finished stackable object: the voxel above counts as standing on ground. */
export function supportRule(t: SupportTerrain, stackTops: ReadonlySet<number> | null = null): SupportResult {
  const { W, H, mask } = t;
  const N = W * H;
  const kept = mask.slice();
  if (allPlain(t)) return { dropped: new Int32Array(0), kept };
  // the voxels outside each tile's ground run, by layer (tiles ascending)
  const byLayer: number[][] = [];
  for (let z = 0; z < LAYERS; z++) byLayer.push([]);
  const ground = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const m = mask[i];
    const g = groundRun(m);
    ground[i] = g;
    if ((m & (m + 1)) === 0) continue;
    for (let z = g + 1; z < LAYERS; z++) if (m & (1 << z)) byLayer[z].push(i);
  }
  // the valid voxels, as masks (the ground run is always valid)
  const valid = new Uint32Array(N);
  for (let i = 0; i < N; i++) valid[i] = 2 ** ground[i] - 1;
  const dist = new Int8Array(N);
  const seenAt = new Int32Array(N).fill(-1);
  const queue = new Int32Array(N);
  const dropped: number[] = [];
  for (let z = 1; z < LAYERS; z++) {
    const layer = byLayer[z];
    if (!layer.length) continue;
    const bit = 1 << z;
    const below = 1 << (z - 1);
    // stamp this layer's voxels: 0 stands on valid ground, 1 does not (yet)
    let head = 0;
    let tail = 0;
    let floating = 0;
    for (const i of layer) {
      if (valid[i] & below || (stackTops !== null && stackTops.has((z - 1) * N + i))) {
        valid[i] |= bit;
      } else {
        seenAt[i] = z;
        dist[i] = 99;
        floating++;
      }
    }
    if (!floating) continue;
    // sideways from the valid voxels beside a floating one, up to 3 steps through floating ones
    const isFloating = (i: number) => seenAt[i] === z && dist[i] === 99;
    for (const i of layer) {
      if (!isFloating(i)) continue;
      const x = i % W;
      const y = (i - x) / W;
      const touch = (n: number) => {
        if (mask[n] & bit && valid[n] & bit && seenAt[n] !== -z - 1) {
          seenAt[n] = -z - 1;
          queue[tail++] = n;
        }
      };
      if (x > 0) touch(i - 1);
      if (x < W - 1) touch(i + 1);
      if (y > 0) touch(i - W);
      if (y < H - 1) touch(i + W);
    }
    while (head < tail) {
      const v = queue[head++];
      const d = seenAt[v] === z ? dist[v] : 0;
      if (d >= MAX_SUPPORT_DISTANCE) continue;
      const x = v % W;
      const y = (v - x) / W;
      const reach = (n: number) => {
        if (seenAt[n] === z && dist[n] > d + 1) {
          dist[n] = d + 1;
          queue[tail++] = n;
        }
      };
      if (x > 0) reach(v - 1);
      if (x < W - 1) reach(v + 1);
      if (y > 0) reach(v - W);
      if (y < H - 1) reach(v + W);
    }
    for (const i of layer) {
      if (seenAt[i] !== z) continue;
      if (dist[i] <= MAX_SUPPORT_DISTANCE) valid[i] |= bit;
      else {
        dropped.push(z * N + i);
        kept[i] &= ~bit;
      }
    }
  }
  return { dropped: Int32Array.from(dropped), kept };
}
