// How the start's own planting sits round the start (PLAN §20 D252). The start rules plant groves
// for Minimum starting wood and berry patches for Minimum starting bushes within 20 tiles' walk of
// the start (D85, D164, D227): the forests whose role starts `forest/start/` and the berry patches
// whose role starts `berryPatch/start/`. Planted evenly on the moist land nearest the start, they
// made the same ring of groves and patches within about 10 tiles of every start; D252 spreads them
// over the walk the way the land offers it. This measures the arrangement, so the tests and the
// batch tools can tell a ring from a planting that leans to one side or reaches farther out.

import type { Feature } from "../features/schema";
import { runsToTiles } from "../math/grid";

/** Within this many tiles of the start (straight-line, from its middle) a planting is "close". */
export const RING_RADIUS = 10;
/** A direction round the start is filled when at least this share of the planting stands in it
 *  within `RING_RADIUS` tiles: half of an eighth, what each direction would hold if half the
 *  planting stood evenly round the start. */
export const RING_SHARE = 1 / 16;
/** A planting that fills this many of the eight directions round the start within `RING_RADIUS`
 *  tiles surrounds it closely: a ring. */
export const RING_OCTANTS = 6;
/** The start's yard: within this many tiles of its middle. */
export const YARD_RADIUS = 6;

export interface StartPlantingSpread {
  /** Trees and bushes the start rules planted (one per tile of their groves and patches). */
  plants: number;
  groves: number;
  patches: number;
  /** Their share within `YARD_RADIUS` tiles of the start (hemming it in). */
  yardShare: number;
  /** Their share within `RING_RADIUS` tiles of the start. */
  innerShare: number;
  /** Of the eight directions round the start, how many hold at least `RING_SHARE` of them within
   *  `RING_RADIUS` tiles. */
  octants: number;
  /** The planting surrounds the start closely (`octants` ≥ `RING_OCTANTS`). */
  ring: boolean;
  /** How much the planting leans to one side: the length of the mean of their directions from the
   *  start (0 all round, 1 all on one bearing). */
  lean: number;
  /** The nearest of them to the start's middle, in tiles (straight-line; Infinity when none). */
  nearest: number;
  /** Their mean straight-line distance from the start, in tiles. */
  meanDistance: number;
  /** The trees of its groves by species. */
  species: Record<string, number>;
  /** The kinds of place the groves and patches were planted in (their roles' third part). */
  kinds: string[];
}

/** The arrangement of the start rules' planting round `start` (its middle tile). */
export function startPlantingSpread(features: readonly Feature[], W: number, start: { x: number; y: number }): StartPlantingSpread {
  const byOctant = new Array<number>(8).fill(0);
  let plants = 0;
  let inner = 0;
  let yard = 0;
  let sx = 0;
  let sy = 0;
  let dist = 0;
  let nearest = Infinity;
  let groves = 0;
  let patches = 0;
  const kinds: string[] = [];
  const species: Record<string, number> = {};
  for (const f of features) {
    const grove = f.kind === "forest" && f.role?.startsWith("forest/start/");
    const patch = f.kind === "berryPatch" && f.role?.startsWith("berryPatch/start/");
    if (!grove && !patch) continue;
    if (grove) groves++;
    else patches++;
    const kind = f.role!.split("/")[2];
    if (kind && !/^\d+$/.test(kind)) kinds.push(kind);
    const tiles = runsToTiles((f.params as { area: [number, number, number][] }).area, W);
    if (f.kind === "forest") for (const sp of Object.keys(f.params.speciesMix ?? {})) species[sp] = (species[sp] ?? 0) + tiles.length;
    for (const i of tiles) {
      const x = i % W;
      const y = (i - x) / W;
      const dx = x - start.x;
      const dy = y - start.y;
      const r = Math.sqrt(dx * dx + dy * dy);
      plants++;
      dist += r;
      if (r < nearest) nearest = r;
      if (r > 0) {
        sx += dx / r;
        sy += dy / r;
      }
      if (r < YARD_RADIUS) yard++;
      if (r <= RING_RADIUS) {
        inner++;
        byOctant[(Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8]++;
      }
    }
  }
  const octants = plants ? byOctant.filter((n) => n >= RING_SHARE * plants).length : 0;
  return {
    plants,
    groves,
    patches,
    yardShare: plants ? yard / plants : 0,
    innerShare: plants ? inner / plants : 0,
    octants,
    ring: octants >= RING_OCTANTS,
    lean: plants ? Math.sqrt(sx * sx + sy * sy) / plants : 0,
    meanDistance: plants ? dist / plants : 0,
    nearest,
    kinds,
    species,
  };
}
