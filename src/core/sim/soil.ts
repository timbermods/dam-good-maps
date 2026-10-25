// The soil of a heightfield map by the game's own rules (PLAN §20 D298, D308): moisture and
// contamination at the steady state the game stores, from `sim/soil3d.ts` on one run per tile. The
// build and both validators take it (prototype/soil.py is the Python validator's port). The
// settler's first guess, on water the hydrology only planned, keeps the fast approximation
// (sim/moisture.ts, sim/contamination.ts).

import { heightMasks, waterColumns, type TerrainColumns, type VoxelMasks, type WaterColumns } from "./columns";
import { columnSaturation, soil3d, soilBarrierCells, type Soil3d } from "./soil3d";
import type { MapObject } from "./model";
import type { StackSettle } from "./stackWater";

export interface Soil {
  moisture: Float64Array;
  contamination: Float64Array;
}

/** The soil on a heightfield: `depth` and `contamination` per tile (a settle's), `sat` its cluster
 *  saturation (computed when absent), the map's objects (Thorns bar the soil; a Blockage lifts its
 *  tile's water above the ground). */
export function gameSoil(W: number, H: number, heights: ArrayLike<number>, depth: ArrayLike<number>, contamination: ArrayLike<number>, objects: readonly MapObject[], sat?: Uint8Array): Soil {
  const N = W * H;
  const masks = heightMasks(W, H, heights);
  const wc = waterColumns(masks, objects);
  // (water per column id: a tile with more than one column, under an overhang, holds none above)
  const M = wc.L * N;
  let d: ArrayLike<number> = depth;
  let c: ArrayLike<number> = contamination;
  if (M > N) {
    const dd = new Float64Array(M);
    const cc = new Float64Array(M);
    for (let i = 0; i < N; i++) {
      dd[i] = depth[i];
      cc[i] = contamination[i];
    }
    d = dd;
    c = cc;
  }
  let s = sat;
  if (s && M > N) {
    const ss = new Uint8Array(M);
    ss.set(s.subarray(0, N));
    s = ss;
  }
  const out = soil3d(masks, wc, { depth: d, contamination: c, sat: s ?? columnSaturation(wc, d) }, objects);
  // one run per tile: the first N values are the tiles'
  return { moisture: out.moisture.length === N ? out.moisture : out.moisture.slice(0, N), contamination: out.contamination.length === N ? out.contamination : out.contamination.slice(0, N) };
}

const stackSoils = new WeakMap<StackSettle, { barrier: string; soil: Soil3d }>();

/** The soil of a map with terrain above terrain, per run top (D120): from the water on its stacked
 *  columns (`stack`, a settle of `t` and `objects`, or water carried over to them). Worked out once
 *  per settle: the build takes each tile's top run for its plants, the export writes every run. */
export function stackedSoil(t: VoxelMasks, cols: WaterColumns, stack: StackSettle, objects: readonly MapObject[]): Soil3d {
  const cells = soilBarrierCells(t.W, t.H, objects);
  const barrier = cells ? [...cells].sort((a, b) => a - b).join() : "";
  const hit = stackSoils.get(stack);
  if (hit && hit.barrier === barrier) return hit.soil;
  // (a settle carries its cluster saturation; water carried over has none of its own)
  const soil = soil3d(t, cols, { depth: stack.depth, contamination: stack.contamination, sat: stack.ticks > 0 ? stack.sat : columnSaturation(cols, stack.depth) }, objects);
  stackSoils.set(stack, { barrier, soil });
  return soil;
}

/** Each tile's top run of a per-run soil array (`Soil3d`): the ground seen from above. */
export function topRuns(soil: Soil3d, values: Float64Array): Float64Array {
  const { N, count } = soil.runs;
  if (soil.runs.T === 1) return values.length === N ? values : values.slice(0, N);
  const out = new Float64Array(N);
  for (let i = 0; i < N; i++) out[i] = values[(count[i] - 1) * N + i];
  return out;
}

/** A map's water columns and its soil per run when its water is on stacked columns that fit its ground (`stack`, a
 *  settle of `t` and `objects`, or water carried over to them), else null. */
export function stackSoilOf(t: VoxelMasks, stack: StackSettle, objects: readonly MapObject[]): { cols: WaterColumns; soil: Soil3d } | null {
  const cols = waterColumns(t, objects);
  if (cols.L !== stack.L || cols.count.some((c, i) => c !== stack.count[i])) return null;
  return { cols, soil: stackedSoil(t, cols, stack, objects) };
}

/** The soil and the water on one run top: what a plant standing there lives or dies on (D235, D491). */
export interface RunGround {
  moisture: number;
  contamination: number;
  /** The water standing on the run top, blocks deep (0: none). */
  depth: number;
}

/** The slot of tile `i`'s run whose top is level `z` (where an object standing on it is), or -1 when it has none. */
export function runSlotAt(runs: TerrainColumns, i: number, z: number): number {
  for (let s = 0; s < runs.count[i]; s++) if (runs.ceil[s * runs.N + i] === z) return s;
  return -1;
}

/** The ground on tile `i`'s run top at level `z`, under a roof as on top (a cave's floor, the ground under a ledge), of a
 *  map's soil per run and its water on stacked columns: the run's moisture and contamination, and the water of the
 *  column whose floor is the run's top (the game's `TryGetColumnWithFloorAtHeight`). Null where no run's top is `z`. */
export function runGround(soil: Soil3d, stack: Pick<StackSettle, "W" | "H" | "count" | "floor" | "depth">, i: number, z: number): RunGround | null {
  const s = runSlotAt(soil.runs, i, z);
  if (s < 0) return null;
  const N = soil.runs.N;
  let depth = 0;
  for (let q = 0; q < stack.count[i]; q++)
    if (stack.floor[q * N + i] === z) {
      depth = stack.depth[q * N + i];
      break;
    }
  return { moisture: soil.moisture[s * N + i], contamination: soil.contamination[s * N + i], depth };
}
