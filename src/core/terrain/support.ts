// The game's support rule (D121; investigation/terrain3d/GAME_RULES.md §2): when a map loads, and after
// terrain is removed, a voxel is kept only if it is reached from a supported voxel through at most 3
// sideways steps in its layer (`TerrainPhysicsValidator.MaxSupportDistance`). A voxel at z = 0 is
// supported, and so is one standing on a kept voxel or on the top of a finished stackable object (a
// NaturalOverhang holds the rock above it); support never passes downward or through air. What is
// never reached is deleted. So a ledge reaches 3 out of a wall, a flat roof spans at most 6, each
// layer of a leaning cliff reaches 3 beyond the one below, and nothing hangs.
//
// The Unstable Core's blast uses it (sim/explosion.ts), and the probe's test maps to say what the
// game will delete (tools/terrain3d-maps.ts); the checks have the same rule in Rust (rust/checks
// `unsupported_voxels`), which the game confirmed on test map T1 (probe run terrain3d-20260927).

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
 *  counts as standing on ground. One pass: on terrain alone a deleted voxel held nothing up. */
export function unsupportedVoxels(t: SupportTerrain, stackTops: Iterable<number> | null = null): Uint8Array {
  const { W, H, mask } = t;
  const N = W * H;
  const Z = LAYERS;
  const solid = (i: number, z: number) => (mask[i] & (1 << z)) !== 0;
  const best = new Int8Array(Z * N).fill(99);
  const queue: number[] = [];
  for (let i = 0; i < N; i++)
    if (solid(i, 0)) {
      best[i] = 0;
      queue.push(i);
    }
  if (stackTops)
    for (const k of stackTops) {
      const up = k + N;
      if (up >= 0 && up < Z * N && solid(up % N, Math.floor(up / N)) && best[up] > 0) {
        best[up] = 0;
        queue.push(up);
      }
    }
  for (let head = 0; head < queue.length; head++) {
    const v = queue[head];
    const s = best[v];
    const z = Math.floor(v / N);
    const i = v - z * N;
    const x = i % W;
    const y = (i - x) / W;
    if (z + 1 < Z && solid(i, z + 1) && best[v + N] > 0) {
      best[v + N] = 0;
      queue.push(v + N);
    }
    if (s < MAX_SUPPORT_DISTANCE) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        const n = z * N + j;
        if (solid(j, z) && best[n] > s + 1) {
          best[n] = s + 1;
          queue.push(n);
        }
      }
    }
  }
  const out = new Uint8Array(Z * N);
  for (let v = 0; v < Z * N; v++) {
    const z = Math.floor(v / N);
    if (solid(v - z * N, z) && best[v] === 99) out[v] = 1;
  }
  return out;
}
