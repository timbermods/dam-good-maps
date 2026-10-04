// The page's copy of the map (heights, water, objects), kept in step with the worker's.

import { surfaceWater, type EntityView, type MapView, type SoilView, type SurfaceWater, type WaterView } from "../../render3d/model";

export interface Mirror {
  heights: Uint8Array;
  water: SurfaceWater;
  /** The water on screen, as the worker sent it. */
  waterView: WaterView;
  /** The map's water: the last the worker put in place (a journey's frames pass over it). */
  mapWater: WaterView;
  entities: EntityView;
  /** The objects on each tile, made when first asked for after the objects change. */
  entitiesAt: Map<number, number[]> | null;
  /** The objects covering each tile (their footprints), likewise. */
  coverAt?: Map<number, number[]> | null;
  soil?: SoilView;
  /** A held weather day's soil (its moisture and contamination), while a drought or a badtide is on: the readout reads
   *  it; the map's own stays in `soil`. */
  daySoil?: SoilView | null;
}

export function mirrorOf(v: MapView): Mirror {
  return { heights: v.heights, water: surfaceWater(v.W, v.H, v.water), waterView: v.water, mapWater: v.water, entities: v.entities, entitiesAt: null, soil: v.soil };
}
