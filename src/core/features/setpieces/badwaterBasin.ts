// Badwater (PLAN §9.5): the generator's badwater hollows (land/hazards.ts), built from their stored
// plan. The source sits in a 7×7 floor with a rim two levels above it, and its water leaves through
// one outlet 1–3 tiles wide whose sill is one level above the floor, then by a channel to a river
// or a map edge. (The older `marsh` mode, a pit beside a River Valley's river, and the editor's
// basin planner are gone: no map this version makes holds them.)

import { carveChannel, channelBounds, channelTiles, checkChannel, type ChannelPlan } from "../route";
import { boundsOf, clipRect, type BuildTarget, type Rect } from "../target";
import type { SetPieceFeature } from "../schema";
import { inMap, POINT_SCHEMA, type PlanRecord } from "./common";
import type { SetPieceBuilder, SetPieceSource } from "./index";

export interface BasinPlan {
  mode: "basin";
  /** Minimum corner of the 3×3 source, in the middle of the 7×7 floor. */
  x: number;
  y: number;
  /** Basin floor level; the outlet's sill is one above it, the rim two. */
  floor: number;
  strength: number;
  outlet: number[];
  outletLevels: number[];
  outletWidth: number;
  outletTo: string;
}

const RIM = 2;

/** The basin's floor (7×7 round the source) and rim (two rings round the floor). */
function basinTiles(p: Pick<BasinPlan, "x" | "y">, W: number, H: number): { floor: number[]; rim: number[] } {
  const floor: number[] = [];
  const rim: number[] = [];
  const cx = p.x + 1;
  const cy = p.y + 1;
  for (let dy = -3 - RIM; dy <= 3 + RIM; dy++)
    for (let dx = -3 - RIM; dx <= 3 + RIM; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (!inMap(W, H, x, y)) continue;
      (Math.max(Math.abs(dx), Math.abs(dy)) <= 3 ? floor : rim).push(y * W + x);
    }
  return { floor, rim };
}

function outletOf(p: BasinPlan): ChannelPlan {
  return { tiles: p.outlet, levels: p.outletLevels, width: p.outletWidth, to: p.outletTo };
}

// ------------------------------------------------------------------------------------- the builder

export const badwaterBasin: SetPieceBuilder = {
  kind: "badwaterBasin",
  request: {
    type: "object",
    required: ["mode"],
    properties: {
      mode: { enum: ["basin"] },
      at: POINT_SCHEMA,
      strength: { type: "number", minimum: 0.1, maximum: 24 },
    },
  },
  check(plan: PlanRecord, W: number, H: number): string[] {
    const x = Number(plan.x);
    const y = Number(plan.y);
    if (!Number.isInteger(x) || !Number.isInteger(y) || !inMap(W, H, x, y) || !inMap(W, H, x + 2, y + 2)) return ["the badwater source's 3×3 must be on the map"];
    if (!(Number(plan.strength) > 0 && Number(plan.strength) <= 24)) return ["the source's strength is at most 24 (8 per tile)"];
    if (plan.mode !== "basin") return [`unknown badwater mode ${String(plan.mode)}`];
    const p = plan as unknown as BasinPlan;
    if (!Number.isInteger(p.floor) || p.floor < 0 || p.floor + RIM > 16) return ["the basin's rim stays at level 16 or below"];
    return checkChannel(outletOf(p), W, H);
  },
  rasterize(feature: SetPieceFeature, t: BuildTarget): void {
    const plan = feature.params.plan;
    if (plan.mode !== "basin") return t.note(`badwater basin ${feature.id}: mode ${String(plan.mode)} is not built by this version`);
    const p = plan as unknown as BasinPlan;
    const { floor, rim } = basinTiles(p, t.W, t.H);
    const h = t.heights;
    const own = new Set(floor);
    for (const i of rim) {
      if (!t.inRegion(i) || !t.writable(i, feature)) continue;
      if (h[i] < p.floor + RIM) h[i] = p.floor + RIM;
      t.protect(i);
    }
    carveChannel(outletOf(p), t, feature, (i) => own.has(i));
    for (const i of floor) {
      if (!t.inRegion(i) || !t.writable(i, feature)) continue;
      h[i] = p.floor;
      t.protect(i);
    }
  },
  footprint(feature: SetPieceFeature, t: Pick<BuildTarget, "W" | "H">): Rect | "all" | null {
    const plan = feature.params.plan;
    if (plan.mode !== "basin") return null;
    const p = plan as unknown as BasinPlan;
    const { floor, rim } = basinTiles(p, t.W, t.H);
    const pts: [number, number][] = [...floor, ...rim].map((i) => [i % t.W, Math.floor(i / t.W)]);
    const c = channelBounds(outletOf(p));
    if (c) pts.push([c.x0, c.y0], [c.x1, c.y1]);
    const b = boundsOf(pts);
    return b && clipRect(b, t.W, t.H, 1);
  },
  sources(feature: SetPieceFeature): SetPieceSource[] {
    const p = feature.params.plan;
    if (p.mode !== "basin") return [];
    const tiles: [number, number][] = [];
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) tiles.push([dx, dy]);
    return [{ template: "BadwaterSource", x: Number(p.x), y: Number(p.y), strength: Number(p.strength), tiles }];
  },
  clears(feature: SetPieceFeature, W: number, H: number): number[] {
    const plan = feature.params.plan;
    if (plan.mode !== "basin") return [];
    const p = plan as unknown as BasinPlan;
    const { floor, rim } = basinTiles(p, W, H);
    const out = new Set([...floor, ...rim, ...channelTiles(outletOf(p), W, H).bed.keys()]);
    return [...out].sort((a, b) => a - b);
  },
  area(feature: SetPieceFeature, W: number, H: number): number[] {
    const plan = feature.params.plan;
    return plan.mode === "basin" ? basinTiles(plan as unknown as BasinPlan, W, H).floor : [];
  },
};
