// A built standalone waterfall's lip, measured on the settled water (PLAN §9.2 "Validated"): moved out of
// features/setpieces/waterfall.ts, which only tests and tools read it from.

import { inMap, local } from "../../src/core/features/setpieces/common";
import { lipTiles, type StandalonePlan } from "../../src/core/features/setpieces/waterfall";
import type { SetPieceFeature } from "../../src/core/features/schema";

export interface LipMeasure {
  /** Lip tiles, first to last across the fall. */
  tiles: [number, number][];
  /** Lip tiles with any water (depth > 0.001) and a drop of at least 1.5 to the tile below
   *  (PLAN §9.2): the width Claude's intent checks read. */
  width: number;
  /** Mean water depth on the lip's wet tiles. */
  depth: number;
  /** The least surface drop from a wet lip tile to the tile below it. */
  drop: number;
}

/** Measure a built standalone fall on the settled water (PLAN §9.2 "Validated"). */
export function measureLip(feature: SetPieceFeature, W: number, heights: ArrayLike<number>, water: ArrayLike<number>): LipMeasure | null {
  const plan = feature.params.plan;
  if (plan.mode !== "standalone") return null;
  const p = plan as unknown as StandalonePlan;
  const tiles = lipTiles(p);
  const H = heights.length / W;
  let width = 0;
  let sum = 0;
  let least = Infinity;
  for (const [x, y] of tiles) {
    const [dx, dy] = local(0, 0, p.facing, 1, 0);
    const i = y * W + x;
    const j = (y + dy) * W + (x + dx);
    if (!inMap(W, H, x + dx, y + dy)) continue;
    const d = water[i];
    const drop = heights[i] + d - (heights[j] + water[j]);
    if (d > 0.001 && drop >= 1.5) {
      width++;
      sum += d;
      least = Math.min(least, drop);
    }
  }
  return { tiles, width, depth: width ? sum / width : 0, drop: width ? least : 0 };
}
