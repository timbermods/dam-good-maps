// Maps whose water a steady state cannot show (PLAN §11, D87; decisions-pending #36, the workshop
// study's W6). The canonical settle runs every running source to steady state on the top surface.
// Some maps rely on what that leaves out: water under roofs (caves and tunnels), sources that turn
// on later, aquifers that need a powered drill, seeps that stop at 0.8 deep, or a start that stands
// under a roof. On those maps the settle floods starts the game never floods (Hollows 9 deep,
// Nomads 7, Oasis 2.8), so their water and start checks are reported as approximate, with the
// reason, in both validators (prototype/playability.py `mechanics`).
//
// The causes are the study's (investigation/workshop/lib/measures.ts `mechanics`, lib/table.ts
// `waterReliable`): caves on 5% or more of tiles; delayed sources or aquifers carrying a quarter or
// more of the clean water; seeps carrying half or more of the running water; or the start below the
// top surface. A cause alone is not enough (PLAN §20, D98): the checks turn approximate only where the
// settle also disagrees with the map's own water: it floods more of the start's ring (Chebyshev 2)
// than the map's water does, or its wet tiles differ from the map's on 10% or more of the map. A start
// under a roof is approximate on its own. The rule runs in Rust with the checks (rust/checks/src/
// mechanics.rs, D465); the validation returns what it found (`Mechanics`).

/** What a steady state leaves out of a map's water (rust/checks/src/mechanics.rs `Mechanics`). */
export interface Mechanics {
  /** Clean water by kind, blocks per second (SpecifiedStrength, summed in object order). */
  cleanRunning: number;
  cleanDelayed: number;
  aquifers: number;
  seeps: number;
  /** Share of tiles with more than one floor (caves, tunnels, overhangs). */
  caveShare: number;
  /** The start stands below the top surface of its tile. */
  startUnderRoof: boolean;
  /** Why the steady state cannot show this map's water, in plain words (empty when it can). */
  reasons: string[];
}

/** Tiles where a map's own water (WaterMapNew, any level) is deeper than 0.05. */
export function storedWetMask(stored: { tile: ArrayLike<number>; depth: ArrayLike<number> }, N: number): Uint8Array {
  const out = new Uint8Array(N);
  for (let k = 0; k < stored.tile.length; k++) if (stored.depth[k] > 0.05) out[stored.tile[k]] = 1;
  return out;
}
