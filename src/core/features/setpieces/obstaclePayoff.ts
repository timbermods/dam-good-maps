// Obstacle with payoff (PLAN §9.4), the "ruins on a plateau" kind: a round plateau `rise` levels
// (2–4) above the highest ground round it, with a cliff all round, so no derived slope reaches it
// (they join 1-level steps only, PLAN §7.5) and a beaver needs player stairs to get up; the
// payoff (a ruin field, or a relic) stands on top. With a rise of 2 one flight of stairs from the
// ground round it is enough. The generator places it (gen/generate.ts); this builds its stored plan.

import { inMap, POINT_SCHEMA, type PlanRecord } from "./common";
import { clipRect, type BuildTarget, type Rect } from "../target";
import type { SetPieceFeature } from "../schema";
import type { SetPieceBuilder } from "./index";

export interface ObstaclePlan {
  x: number;
  y: number;
  radius: number;
  /** The plateau's level. */
  top: number;
  /** Levels above the highest ground round it. */
  rise: number;
}

/** The plateau's tiles: a disc of `radius` round (x, y). */
export function obstacleTiles(p: Pick<ObstaclePlan, "x" | "y" | "radius">, W: number, H: number): number[] {
  const out: number[] = [];
  const r = p.radius;
  for (let y = p.y - r; y <= p.y + r; y++)
    for (let x = p.x - r; x <= p.x + r; x++) if (inMap(W, H, x, y) && (x - p.x) * (x - p.x) + (y - p.y) * (y - p.y) <= r * r + r) out.push(y * W + x);
  return out;
}

export const obstaclePayoff: SetPieceBuilder = {
  kind: "obstaclePayoff",
  request: {
    type: "object",
    required: ["at"],
    properties: {
      at: POINT_SCHEMA,
      radius: { type: "integer", minimum: 3, maximum: 16 },
      rise: { type: "integer", minimum: 2, maximum: 4 },
    },
  },
  check(plan: PlanRecord, W: number, H: number): string[] {
    const p = plan as unknown as ObstaclePlan;
    if (!Number.isInteger(p.x) || !Number.isInteger(p.y) || !inMap(W, H, p.x, p.y)) return ["the plateau must be on the map"];
    if (!Number.isInteger(p.radius) || p.radius < 3 || p.radius > 16) return ["the plateau's radius is 3–16"];
    // (a generated map's rise may stand on tall ground, up to the game's top, D172)
    if (!Number.isInteger(p.top) || p.top < 2 || p.top > 22) return ["the plateau's level is 2–22"];
    return [];
  },
  rasterize(feature: SetPieceFeature, t: BuildTarget): void {
    const p = feature.params.plan as unknown as ObstaclePlan;
    for (const i of obstacleTiles(p, t.W, t.H)) {
      if (!t.inRegion(i) || !t.writable(i, feature)) continue;
      t.heights[i] = p.top;
      t.protect(i);
    }
  },
  footprint(feature: SetPieceFeature, t: Pick<BuildTarget, "W" | "H">): Rect | "all" | null {
    const p = feature.params.plan as unknown as ObstaclePlan;
    return clipRect({ x0: p.x - p.radius, y0: p.y - p.radius, x1: p.x + p.radius, y1: p.y + p.radius }, t.W, t.H, 1);
  },
  area(feature: SetPieceFeature, W: number, H: number): number[] {
    return obstacleTiles(feature.params.plan as unknown as ObstaclePlan, W, H);
  },
};
