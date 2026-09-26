// The start's check off the page (PLAN §20 D204 (4)): whether the start's requirements would hold
// at a spot ("the start fits here, with water, wood and berries in reach") walks the whole map, tens
// of milliseconds on 256², so it runs here and the page never waits for it. It is the page's own
// check (features.ts, `checkStartAt`), on a copy of what the page shows.

import { expose } from "comlink";
import type { EntityView, SurfaceWater } from "../render3d/model";
import { checkStartAt, entitiesByTile, type FeatureIndex, type StartCheck, type StartNeeds, type TileContext } from "./features";

export interface StartCheckJob {
  W: number;
  H: number;
  heights: Uint8Array;
  water: SurfaceWater;
  entities: EntityView;
  /** The rivers' tiles (the feature index's river array), or null. */
  river: Int32Array | null;
  x: number;
  y: number;
  door: [number, number];
  bench: { level: number; radius: number } | null;
  self: string | null;
  needs: StartNeeds;
  /** Away from where the start stands (its slopes are predicted there); true unless said. */
  moved?: boolean;
}

const api = {
  check(j: StartCheckJob): StartCheck {
    const c: TileContext = { W: j.W, H: j.H, heights: j.heights, water: j.water, entities: j.entities, entitiesAt: entitiesByTile(j.entities, j.W), index: j.river ? ({ river: j.river } as FeatureIndex) : null };
    return checkStartAt(c, j.x, j.y, j.door, j.bench, j.self, j.needs, j.moved ?? true);
  },
};

export type StartCheckApi = typeof api;

expose(api);
