// The simulation singletons of a map with terrain above terrain (D120; FORMAT.md §4.3;
// investigation/terrain3d/proto/write3d.ts): settled stacked water and soil per slot, the way the
// game saves them.
// - `WaterMapNew.Levels` is the most water columns of any tile, and each (slot, tile) token is the
//   column's `depth:contamination:overflow:floor:depth` (overflow is a full cave's pressure, 0 in the
//   open), "0" when dry or when the tile has no such slot; outflows are all "0" (momentum rebuilds
//   within a few ticks).
// - `WaterEvaporationMap` has the same levels: each wet column's modifier from its saturation.
// - `SoilMoistureSimulator` and `SoilContaminationSimulator` have `Size` = the most terrain runs of
//   any tile, one value per run (sim/soil3d.ts).
// On a heightfield (one run and one water column per tile) this is world.ts
// `settledSimulationSingletons`, byte for byte: such a tile's token names its terrain's surface as
// the floor, as that writer does (a Blockage raises the column's floor above it; the field is
// informational and the game recomputes it on load), and every other tile its column's floor.

import type { JsonObject } from "./json";
import { emptySimulationSingletons, numToken } from "./world";
import type { TerrainColumns, WaterColumns } from "../sim/columns";

export interface StackedSettledState {
  /** The water columns (sim/columns.ts), and per column id (slot·N + tile) the settled water. */
  cols: WaterColumns;
  depth: ArrayLike<number>;
  overflow: ArrayLike<number>;
  contamination: ArrayLike<number>;
  /** Cluster saturation per column id (the evaporation modifiers). */
  sat: ArrayLike<number>;
  /** The terrain runs (sim/columns.ts `terrainColumns`), and per run id (slot·N + tile) the soil. */
  runs: TerrainColumns;
  moisture: ArrayLike<number>;
  soilContamination: ArrayLike<number>;
}

export function stackedSimulationSingletons(sizeX: number, sizeY: number, st: StackedSettledState): JsonObject {
  const { cols, runs } = st;
  const N = sizeX * sizeY;
  if (cols.N !== N || runs.N !== N) throw new Error("the water columns and runs do not fit the map");
  const L = cols.L;
  const T = runs.T;
  const s = emptySimulationSingletons(sizeX, sizeY, L);
  const water: string[] = new Array(L * N).fill("0");
  const evap: string[] = new Array(L * N).fill("1");
  for (let i = 0; i < N; i++) {
    const heightfield = cols.count[i] === 1 && runs.count[i] === 1;
    for (let k = 0; k < cols.count[i]; k++) {
      const c = k * N + i;
      const d = st.depth[c];
      if (d > 1e-6) {
        const ds = numToken(d);
        const cn = st.contamination[c];
        const o = st.overflow[c];
        const floor = heightfield ? runs.ceil[i] : cols.floor[c];
        water[c] = `${ds}:${cn > 1e-6 ? numToken(cn) : "0"}:${o > 1e-6 ? numToken(o) : "0"}:${floor}:${ds}`;
      }
      const sat = st.sat[c];
      if (sat > 0) {
        const t = 10 - sat;
        evap[c] = numToken(0.0595 * (t * t) + 0.101 * t + 0.72);
      }
    }
  }
  const moist: string[] = new Array(T * N).fill("0");
  const soil: string[] = new Array(T * N).fill("0");
  for (let i = 0; i < N; i++)
    for (let k = 0; k < runs.count[i]; k++) {
      const n = k * N + i;
      moist[n] = numToken(st.moisture[n]);
      soil[n] = numToken(st.soilContamination[n]);
    }
  (s.WaterMapNew as JsonObject).WaterColumns = { Array: water.join(" ") };
  (s.WaterEvaporationMap as JsonObject).EvaporationModifiers = { Array: evap.join(" ") };
  const soilText = soil.join(" ");
  s.SoilMoistureSimulator = { Size: T, MoistureLevels: { Array: moist.join(" ") } };
  s.SoilContaminationSimulator = { Size: T, ContaminationCandidates: { Array: soilText }, ContaminationLevels: { Array: soilText } };
  return s;
}
