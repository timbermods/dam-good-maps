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

/** A force's terrain reply: a whole snapshot of the heights, or (from a worker that packs it, investigation/force-playback)
 *  the changed rectangle's rows only, with the rectangle that changed. */
export interface ForceTerrain {
  heights?: Uint8Array;
  heightPatch?: Uint8Array;
  rect?: { x0: number; y0: number; x1: number; y1: number };
}

/** Apply a force's terrain reply to the mirror before its rectangle is queued for the next draw (#312): a whole
 *  snapshot replaces the heights, a packed rectangle is written into them in place. Whether there was one; the
 *  renderer keeps its own drawn land to find what changed. */
export function applyForceTerrain(m: Pick<Mirror, "heights">, f: ForceTerrain, W: number): boolean {
  const rect = f.rect;
  if (!rect) return false;
  if (f.heights) m.heights = f.heights;
  else if (f.heightPatch) {
    const width = rect.x1 - rect.x0 + 1;
    for (let y = rect.y0; y <= rect.y1; y++) m.heights.set(f.heightPatch.subarray((y - rect.y0) * width, (y - rect.y0 + 1) * width), y * W + rect.x0);
  } else return false;
  return true;
}

export function mirrorOf(v: MapView): Mirror {
  return { heights: v.heights, water: surfaceWater(v.W, v.H, v.water), waterView: v.water, mapWater: v.water, entities: v.entities, entitiesAt: null, soil: v.soil };
}
