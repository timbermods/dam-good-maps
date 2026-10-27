// The second district site (PLAN §9.8): a place for a second district, 60–120 tiles from the start
// on maps of 128² and up, with its own clean water in pump reach and 600+ tiles of level land. It
// changes no terrain: it marks the site, the derived slopes join its ground to the start's network
// (PLAN §7.5), and the generator plants a grove and berries there (40+ trees, 20+ bushes). It is
// also where a second colony could start on a Timber Together map (PLAN §20, D5).

import * as portable from "../../math/portable";
import { levelRegions } from "../../math/grid";
import type { BuildTarget, Rect } from "../target";
import type { SetPieceFeature } from "../schema";
import { fmt, inMap, POINT_SCHEMA, pointOf, type PlanContext, type PlanOutcome, type PlanRecord } from "./common";
import type { SetPieceBuilder } from "./index";

export interface DistrictPlan {
  x: number;
  y: number;
  /** The level of the site's ground. */
  level: number;
  /** Tiles round the site the district's first buildings take (the editor shows them). */
  radius: number;
  /** Tiles of level ground joined to the site, and its distance from the start. */
  land: number;
  distance: number;
  /** Tiles to the nearest pumpable clean water (0.3+ deep, its surface 0–2 below the site). */
  water: number;
}

/** Level land a district needs round its site (PLAN §9.8). */
export const DISTRICT_LAND = 600;
/** How far the site's water may be (the start's rule at Normal, PLAN §5.6). */
export const DISTRICT_WATER = 16;
export const DISTRICT_RADIUS = 8;

/** Tiles to the nearest pumpable clean water from (x, y) at `level`, within `max` (Infinity: none). */
export function pumpableWithin(ctx: Pick<PlanContext, "W" | "H" | "heights" | "water" | "contamination">, x: number, y: number, level: number, max: number): number {
  const { W, H, heights: h, water: D, contamination: C } = ctx;
  if (!D) return Infinity;
  let best = Infinity;
  for (let yy = Math.max(0, y - max); yy <= Math.min(H - 1, y + max); yy++)
    for (let xx = Math.max(0, x - max); xx <= Math.min(W - 1, x + max); xx++) {
      const i = yy * W + xx;
      if (!(D[i] >= 0.3) || (C && C[i] >= 0.05)) continue;
      const s = h[i] + D[i];
      if (s > level + 0.01 || s < level - 2) continue;
      const d = portable.sqrt((xx - x) * (xx - x) + (yy - y) * (yy - y));
      if (d < best) best = d;
    }
  return best <= max ? best : Infinity;
}

function planDistrict(req: PlanRecord, ctx: PlanContext): PlanOutcome {
  const { W, H } = ctx;
  const at = pointOf(req.at);
  if (!at) return { ok: false, errors: ["click where the second district should go"] };
  const x = Math.round(at[0]);
  const y = Math.round(at[1]);
  if (!inMap(W, H, x, y) || x < DISTRICT_RADIUS || y < DISTRICT_RADIUS || x >= W - DISTRICT_RADIUS || y >= H - DISTRICT_RADIUS) return { ok: false, errors: ["too close to the map edge"] };
  if (ctx.water && ctx.water[y * W + x] > 0.05) return { ok: false, errors: ["the site is under water"] };
  const level = ctx.heights[y * W + x];
  const regions = levelRegions(ctx.heights, W, H);
  const land = regions.size[regions.labels[y * W + x]];
  if (land < DISTRICT_LAND) return { ok: false, errors: [`a district needs ${DISTRICT_LAND}+ tiles of level land round it; this ground has ${land}`] };
  const water = pumpableWithin(ctx, x, y, level, DISTRICT_WATER);
  if (ctx.water && !Number.isFinite(water)) return { ok: false, errors: [`a district needs clean water a pump can reach within ${DISTRICT_WATER} tiles`] };
  const s = ctx.start;
  const distance = s ? Math.round(portable.sqrt((x - s.x) * (x - s.x) + (y - s.y) * (y - s.y))) : 0;
  const report = [`a second district site on ${fmt(land)} tiles of level ground at level ${level}${s ? `, ${distance} tiles from the start` : ""}${Number.isFinite(water) ? `, with pumpable water ${fmt(Math.round(water))} tiles away` : ""}`];
  if (s && (distance < 60 || distance > 120)) report.push("second districts usually stand 60–120 tiles from the start");
  const plan: DistrictPlan = { x, y, level, radius: DISTRICT_RADIUS, land, distance, water: Number.isFinite(water) ? Math.round(water) : -1 };
  return { ok: true, request: req, plan: plan as unknown as PlanRecord, report };
}

/** The site's disc (the tiles the editor shows and the slopes join). */
export function districtTiles(p: Pick<DistrictPlan, "x" | "y" | "radius">, W: number, H: number): number[] {
  const out: number[] = [];
  const r = p.radius;
  for (let yy = p.y - r; yy <= p.y + r; yy++)
    for (let xx = p.x - r; xx <= p.x + r; xx++) if (inMap(W, H, xx, yy) && (xx - p.x) * (xx - p.x) + (yy - p.y) * (yy - p.y) <= r * r) out.push(yy * W + xx);
  return out;
}

export const secondDistrict: SetPieceBuilder = {
  kind: "secondDistrict",
  request: {
    type: "object",
    required: ["at"],
    properties: { at: POINT_SCHEMA },
  },
  plan: (req: PlanRecord, ctx: PlanContext) => planDistrict(req, ctx),
  check(plan: PlanRecord, W: number, H: number): string[] {
    const p = plan as unknown as DistrictPlan;
    if (!Number.isInteger(p.x) || !Number.isInteger(p.y) || !inMap(W, H, p.x, p.y)) return ["the district site must be on the map"];
    if (!Number.isInteger(p.radius) || p.radius < 1 || p.radius > 32) return ["the district site's radius is 1–32"];
    return [];
  },
  rasterize(): void {
    // a site, not terrain: nothing to build
  },
  footprint(): Rect | "all" | null {
    return null;
  },
  area(feature: SetPieceFeature, W: number, H: number): number[] {
    return districtTiles(feature.params.plan as unknown as DistrictPlan, W, H);
  },
};

export type { BuildTarget };
