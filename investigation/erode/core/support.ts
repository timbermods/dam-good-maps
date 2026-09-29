// The game's support rule (GAME_RULES.md §2: `TerrainPhysicsPostLoader.ValidateTerrain`,
// MaxSupportDistance 3), computed layer by layer on the runs, for the planner. Run 0 (the run from
// z = 0) is always held. A voxel above air is held when, in its own layer and through solid voxels,
// it is at most 3 steps from a voxel that stands on a held voxel. Layer by layer from the bottom
// this is exactly the game's queue (support never passes downward), and it only has to look at
// tiles with more than one run, so it costs next to nothing on a heightfield.
//
// The critical check does not use this: it runs the port in investigation/terrain3d/proto/support.ts
// (the model GAME_RULES.md describes) over every voxel of the map.

import { LAYERS, Terrain } from "./terrain";

export const MAX_SUPPORT = 3;

export interface Support {
  /** Voxels (z·N + tile) the game would delete on load. */
  unsupported: number[];
  /** Support distance of voxels above air (z·N + tile → 0–3), for the reach measure. */
  distance: Map<number, number>;
}

/** Which voxels hold, by the game's rule. `tiles`: the tiles to look at (default: every tile with
 *  more than one run; other tiles are one run from z = 0 and always hold). */
export function support(t: Terrain, tiles?: number[]): Support {
  const { W, H, N, cols } = t;
  const list = tiles ?? [];
  if (!tiles) for (let i = 0; i < N; i++) if (!t.plain(i)) list.push(i);
  const unsupported: number[] = [];
  const distance = new Map<number, number>();
  if (!list.length) return { unsupported, distance };
  // held voxels per tile, as masks: run 0 to start with
  const held = new Map<number, number>();
  const r0 = new Map<number, number>();
  for (const i of list) {
    const top = t.run0Top(i);
    r0.set(i, top);
    held.set(i, top >= 32 ? 0xffffffff : ((1 << top) >>> 0) - 1);
  }
  const isRun0 = (j: number, z: number): boolean => {
    const c = cols[j];
    if (!((c >>> z) & 1)) return false;
    const inv = ~c >>> 0;
    const top = inv === 0 ? 32 : 31 - Math.clz32((inv & -inv) >>> 0);
    return z < top;
  };
  const dist = new Map<number, number>();
  for (let z = 1; z < LAYERS; z++) {
    // the voxels of this layer above run 0
    const layer: number[] = [];
    for (const i of list) if ((cols[i] >>> z) & 1 && z >= (r0.get(i) as number)) layer.push(i);
    if (!layer.length) continue;
    dist.clear();
    for (const i of layer) dist.set(i, 99);
    const q0: number[] = [];
    const q1: number[] = [];
    for (const i of layer) {
      if (((held.get(i) as number) >>> (z - 1)) & 1) {
        dist.set(i, 0);
        q0.push(i);
        continue;
      }
      const x = i % W;
      const y = (i - x) / W;
      if ((x > 0 && isRun0(i - 1, z)) || (x < W - 1 && isRun0(i + 1, z)) || (y > 0 && isRun0(i - W, z)) || (y < H - 1 && isRun0(i + W, z))) {
        dist.set(i, 1);
        q1.push(i);
      }
    }
    // unit steps from sources at 0 and 1: a two-bucket breadth-first walk
    const queue = q0.concat(q1);
    for (let h = 0; h < queue.length; h++) {
      const v = queue[h];
      const d = dist.get(v) as number;
      if (d >= MAX_SUPPORT) continue;
      const x = v % W;
      const y = (v - x) / W;
      const nb = [x > 0 ? v - 1 : -1, x < W - 1 ? v + 1 : -1, y > 0 ? v - W : -1, y < H - 1 ? v + W : -1];
      for (const n of nb) {
        if (n < 0) continue;
        const dn = dist.get(n);
        if (dn === undefined || dn <= d + 1) continue;
        dist.set(n, d + 1);
        queue.push(n);
      }
    }
    for (const i of layer) {
      const d = dist.get(i) as number;
      if (d <= MAX_SUPPORT) {
        held.set(i, ((held.get(i) as number) | (1 << z)) >>> 0);
        if (!(((cols[i] >>> (z - 1)) & 1))) distance.set(z * N + i, d);
      } else unsupported.push(z * N + i);
    }
  }
  return { unsupported, distance };
}
