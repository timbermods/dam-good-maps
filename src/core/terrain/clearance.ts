// The room a plant needs above its floor (investigation/terrain3d/GAME_RULES.md §5): its blocks' height
// in air. The game tests only the cells an object occupies, so a pine or an oak needs 3 levels of air, a
// birch or a succulent 2 and a blueberry bush 1; a plant whose blocks meet the rock above it is removed
// when the map loads. The checks' row `plants.clearance` is this rule in Rust (rust/checks: the table is
// generated from here, tools/rust/checks-tables.ts), and the probe's test maps use it to say which plants
// the game will remove (tools/terrain3d-maps.ts, T5).

/** Levels of air a plant needs from its floor up: its blocks. */
export const PLANT_CLEARANCE: Readonly<Record<string, number>> = { Pine: 3, Oak: 3, Birch: 2, Succulent: 2, BlueberryBush: 1 };

/** The top of the terrain's levels: nothing is solid from here up. */
const TOP = 22;

/** A plant with no room: its levels of air, fewer than it needs. */
export interface CrampedPlant<P> {
  plant: P;
  air: number;
}

/** The plants whose blocks do not fit under the terrain above them (`mask[i]` bit z set when voxel z of
 *  tile i is solid: terrain/runs.ts `ColumnTerrain`), each with the levels of air it has. */
export function plantsWithoutRoom<P extends { template: string; x: number; y: number; z: number }>(t: { W: number; H: number; mask: Uint32Array }, plants: readonly P[]): CrampedPlant<P>[] {
  const out: CrampedPlant<P>[] = [];
  for (const plant of plants) {
    const need = PLANT_CLEARANCE[plant.template];
    if (need === undefined) continue;
    const column = t.mask[plant.y * t.W + plant.x];
    let air = 0;
    while (plant.z + air < TOP && !(column & (1 << (plant.z + air)))) air++;
    if (air < need) out.push({ plant, air });
  }
  return out;
}
