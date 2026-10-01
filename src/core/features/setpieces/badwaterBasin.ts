// Badwater (PLAN §9.5). One builder, two modes.
// - `marsh` (River Valley, PLAN §20 D24): a BadwaterSource 3×3 beside the river below the falls, as
//   far from the start as the valley allows. The source sits in a pit one level below the
//   floodplain, and a one-tile ditch at the same level runs from the pit to the river, so the
//   badwater drains straight into the river downstream of the start instead of spreading as a sheet
//   over the flat floodplain.
// - `basin` (§9.5, for the editor and, from roadmap M6, the badwater settings): the source sits in a
//   side basin, a 7×7 floor with a rim two levels above it, and its water leaves through one outlet
//   1–3 tiles wide whose sill is one level above the floor, then by a channel to a river or a map
//   edge, kept away from the start. A levee across the outlet turns the badwater back into the
//   basin; a basin has no other way out below its rim.

import * as portable from "../../math/portable";
import { arcAtX, floorAt } from "../geometry";
import { carveChannel, channelBounds, channelTiles, channelWidth, checkChannel, routeChannel, type ChannelPlan } from "../route";
import { boundsOf, clipRect, type BuildTarget, type Rect } from "../target";
import type { Point, RiverFeature, SetPieceFeature } from "../schema";
import { clampReported, clearsText, fmt, inMap, nearStart, POINT_SCHEMA, pointOf, type PlanContext, type PlanOutcome, type PlanRecord } from "./common";
import type { SetPieceBuilder, SetPieceSource } from "./index";

export interface MarshPlan {
  mode: "marsh";
  /** Minimum corner of the 3×3 source (it is placed Cw0, so this is its Coordinates). */
  x: number;
  y: number;
  /** The level of the pit floor and the ditch (one below the floodplain around them). */
  level: number;
  /** BadwaterSource strength, blocks per second over its 9 tiles (1–3, PLAN §5.4). */
  strength: number;
  /** Ditch tiles from the pit to the river, as a flat list x0, y0, x1, y1, ... */
  ditch: number[];
}

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

function pitTiles(p: MarshPlan): [number, number][] {
  const out: [number, number][] = [];
  for (let y = p.y; y < p.y + 3; y++) for (let x = p.x; x < p.x + 3; x++) out.push([x, y]);
  for (let k = 0; k + 1 < p.ditch.length; k += 2) out.push([p.ditch[k], p.ditch[k + 1]]);
  return out;
}

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

/** The river's centreline y at column x, for a river running west to east (the marsh search). */
function yAtX(path: readonly Point[], x: number): number {
  for (let i = 0; i + 1 < path.length; i++) {
    const [ax, ay] = path[i];
    const [bx, by] = path[i + 1];
    if (x <= bx || i + 2 === path.length) {
      const t = bx !== ax ? Math.max(0, Math.min(1, (x - ax) / (bx - ax))) : 0;
      return ay + t * (by - ay);
    }
  }
  return path[path.length - 1][1];
}

function distToPath(path: readonly Point[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < path.length; i++) {
    const [ax, ay] = path[i];
    const vx = path[i + 1][0] - ax;
    const vy = path[i + 1][1] - ay;
    const l2 = vx * vx + vy * vy;
    let t = l2 > 0 ? ((x - ax) * vx + (y - ay) * vy) / l2 : 0;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const px = ax + t * vx - x;
    const py = ay + t * vy - y;
    const d = px * px + py * py;
    if (d < best) best = d;
  }
  return portable.sqrt(best);
}

// -------------------------------------------------------------------------------------- planning

/** The marsh: flat floodplain beside the river from column `fromX` on, the site farthest from the
 *  `far` tile (the start); the nearest offset from the channel that has a site. */
function planMarsh(req: PlanRecord, ctx: PlanContext): PlanOutcome {
  const river = ctx.features.find((f): f is RiverFeature => f.kind === "river" && f.id === req.river);
  if (!river) return { ok: false, errors: [`there is no river ${String(req.river)} for the marsh`] };
  const { W, H, heights } = ctx;
  if (heights.length !== W * H) return { ok: false, errors: ["a marsh is planned on the layout's terrain"] };
  const path = river.params.path;
  const riverW = river.params.width;
  const far = pointOf(req.far) ?? [0, 0];
  const fromX = Number(req.fromX);
  const strength = Number(req.strength);
  let best = -1;
  let site: { x: number; y: number; level: number; sgn: number } | null = null;
  // the nearest offset from the channel that has a site (the prototype's 4 tiles on a 5-wide river)
  for (let off = Math.ceil(riverW / 2) + 1; off <= Math.ceil(riverW / 2) + 4 && !site; off++)
    for (let x = fromX; x < W - 4; x++) {
      const level = floorAt(river.params, arcAtX(path, x), 1);
      for (const sgn of [1, -1]) {
        const y = Math.round(yAtX(path, x) + sgn * off - (sgn < 0 ? 2 : 0));
        if (y < 1 || y >= H - 3) continue;
        let flat = true;
        for (let yy = y; yy < y + 3 && flat; yy++)
          for (let xx = x; xx < x + 3 && flat; xx++) {
            const i = yy * W + xx;
            if (heights[i] !== level || ctx.occupied?.[i] || ctx.locked?.[i]) flat = false;
          }
        if (!flat) continue;
        const d2 = (x + 1 - far[0]) * (x + 1 - far[0]) + (y + 1 - far[1]) * (y + 1 - far[1]);
        if (d2 > best) {
          best = d2;
          site = { x, y, level, sgn };
        }
      }
    }
  if (!site) return { ok: false, errors: ["no flat floodplain beside the river for a marsh"] };
  // the ditch: from the pit's middle column toward the river until it meets the channel
  const ditch: number[] = [];
  const dx = site.x + 1;
  for (let y = site.sgn > 0 ? site.y - 1 : site.y + 3; y >= 0 && y < H && distToPath(path, dx, y) >= riverW / 2; y -= site.sgn) ditch.push(dx, y);
  const plan: MarshPlan = { mode: "marsh", x: site.x, y: site.y, level: site.level - 1, strength, ditch };
  return { ok: true, request: req, plan: plan as unknown as PlanRecord, report: [] };
}

function planBasin(req: PlanRecord, ctx: PlanContext, id: string | null): PlanOutcome {
  const { W, H } = ctx;
  if (ctx.heights.length !== W * H) return { ok: false, errors: ["a badwater basin is planned on a map's terrain"] };
  const at = pointOf(req.at);
  if (!at) return { ok: false, errors: ["a badwater basin needs the tile of its source"] };
  const report: string[] = [];
  const strength = clampReported("Strength", Number(req.strength ?? 1.5), { min: 1, max: 3 }, report, "a badwater source has on generated maps (PLAN §5.4)");
  // fit the basin with its rim on the map, one tile in from the edges
  const reach = 3 + RIM;
  const cx = Math.min(W - 2 - reach, Math.max(1 + reach, Math.round(at[0])));
  const cy = Math.min(H - 2 - reach, Math.max(1 + reach, Math.round(at[1])));
  const shape = { x: cx - 1, y: cy - 1 };
  const { floor, rim } = basinTiles(shape, W, H);
  for (const i of [...floor, ...rim]) {
    const x = i % W;
    const y = (i - x) / W;
    if (nearStart(ctx, x, y, 4)) return { ok: false, errors: ["it would be next to the start: badwater belongs far from it"] };
    if (ctx.locked?.[i]) return { ok: false, errors: ["it would touch a locked area"] };
    if (ctx.channel?.[i]) return { ok: false, errors: ["it would sit in a river: place it beside the river"] };
  }
  let ground = Infinity;
  for (const i of floor) ground = Math.min(ground, ctx.heights[i]);
  const level = Math.max(0, ground - 1);
  const sill = level + 1;
  if (sill + 1 > 16) return { ok: false, errors: ["the ground here is too high for a basin's rim (16 is the limit)"] };
  // the outlet: through the rim, then a channel to a river or a map edge, kept away from the start
  const blocked = new Uint8Array(W * H);
  if (ctx.start) {
    const r = ctx.start.radius + 12;
    for (let y = ctx.start.y - r; y <= ctx.start.y + r; y++)
      for (let x = ctx.start.x - r; x <= ctx.start.x + r; x++) if (inMap(W, H, x, y)) blocked[y * W + x] = 1;
  }
  if (ctx.locked) for (let i = 0; i < W * H; i++) if (ctx.locked[i]) blocked[i] = 1;
  if (ctx.protect) for (let i = 0; i < W * H; i++) if (ctx.protect[i]) blocked[i] = 1;
  for (const i of floor) blocked[i] = 0;
  const route = routeChannel({ W, H, heights: ctx.heights, features: ctx.features, channel: ctx.channel, occupied: ctx.occupied }, floor, sill, channelWidth(strength), blocked, id);
  if (!route) return { ok: false, errors: ["its water has no way to a river or a map edge that keeps away from the start"] };
  const plan: BasinPlan = { mode: "basin", x: shape.x, y: shape.y, floor: level, strength, outlet: route.tiles, outletLevels: route.levels, outletWidth: route.width, outletTo: route.to };
  if (cx !== Math.round(at[0]) || cy !== Math.round(at[1])) report.push("moved to fit on the map");
  const target = route.to === "edge" ? "the map edge" : `the ${ctx.features.find((f) => f.id === route.to)?.kind === "lake" ? "lake" : "river"}`;
  report.push(`a badwater source of ${fmt(strength)} blocks/s in a basin whose one outlet, ${route.width} tile${route.width > 1 ? "s" : ""} wide, drains by a channel ${route.levels.length} tiles long to ${target}`);
  report.push("a levee across the outlet turns the badwater back into the basin");
  const touched = new Set([...floor, ...rim, ...channelTiles(route, W, H).bed.keys()]);
  const cleared = clearsText(ctx, touched);
  if (cleared) report.push(`clears ${cleared}`);
  return { ok: true, request: req, plan: plan as unknown as PlanRecord, report };
}

// ------------------------------------------------------------------------------------- the builder

export const badwaterBasin: SetPieceBuilder = {
  kind: "badwaterBasin",
  request: {
    type: "object",
    required: ["mode"],
    properties: {
      mode: { enum: ["marsh", "basin"] },
      badwater: { type: "string" },
      river: { type: "string" },
      fromX: { type: "integer", minimum: 0, maximum: 256 },
      far: { type: "array", minItems: 2, maxItems: 2, items: { type: "number" } },
      at: POINT_SCHEMA,
      strength: { type: "number", minimum: 0.1, maximum: 24 },
    },
  },
  limits: () => ({ strength: { min: 1, max: 3 } }),
  plan(req: PlanRecord, ctx: PlanContext, id: string | null): PlanOutcome {
    return req.mode === "basin" ? planBasin(req, ctx, id) : planMarsh(req, ctx);
  },
  check(plan: PlanRecord, W: number, H: number): string[] {
    const x = Number(plan.x);
    const y = Number(plan.y);
    if (!Number.isInteger(x) || !Number.isInteger(y) || !inMap(W, H, x, y) || !inMap(W, H, x + 2, y + 2)) return ["the badwater source's 3×3 must be on the map"];
    if (!(Number(plan.strength) > 0 && Number(plan.strength) <= 24)) return ["the source's strength is at most 24 (8 per tile)"];
    if (plan.mode === "marsh") {
      if (!Number.isInteger(plan.level) || Number(plan.level) < 0 || Number(plan.level) > 16) return ["the pit's level is 0–16"];
      return [];
    }
    if (plan.mode !== "basin") return [`unknown badwater mode ${String(plan.mode)}`];
    const p = plan as unknown as BasinPlan;
    if (!Number.isInteger(p.floor) || p.floor < 0 || p.floor + RIM > 16) return ["the basin's rim stays at level 16 or below"];
    return checkChannel(outletOf(p), W, H);
  },
  rasterize(feature: SetPieceFeature, t: BuildTarget): void {
    const plan = feature.params.plan;
    if (plan.mode === "basin") {
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
      return;
    }
    if (plan.mode !== "marsh") return t.note(`badwater basin ${feature.id}: mode ${String(plan.mode)} is not built by this version`);
    const p = plan as unknown as MarshPlan;
    for (const [x, y] of pitTiles(p)) {
      if (x < 0 || x >= t.W || y < 0 || y >= t.H) continue;
      const i = y * t.W + x;
      if (!t.inRegion(i) || !t.writable(i, feature)) continue;
      t.heights[i] = p.level;
      t.protect(i);
    }
  },
  footprint(feature: SetPieceFeature, t: Pick<BuildTarget, "W" | "H">): Rect | "all" | null {
    const plan = feature.params.plan;
    if (plan.mode === "basin") {
      const p = plan as unknown as BasinPlan;
      const { floor, rim } = basinTiles(p, t.W, t.H);
      const pts: [number, number][] = [...floor, ...rim].map((i) => [i % t.W, Math.floor(i / t.W)]);
      const c = channelBounds(outletOf(p));
      if (c) pts.push([c.x0, c.y0], [c.x1, c.y1]);
      const b = boundsOf(pts);
      return b && clipRect(b, t.W, t.H, 1);
    }
    if (plan.mode !== "marsh") return null;
    const b = boundsOf(pitTiles(plan as unknown as MarshPlan));
    return b && clipRect(b, t.W, t.H, 1);
  },
  sources(feature: SetPieceFeature): SetPieceSource[] {
    const p = feature.params.plan;
    if (p.mode !== "marsh" && p.mode !== "basin") return [];
    const x = Number(p.x);
    const y = Number(p.y);
    const tiles: [number, number][] = p.mode === "marsh" ? pitTiles(p as unknown as MarshPlan).map(([a, b]) => [a - x, b - y]) : [];
    if (p.mode === "basin") for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++) tiles.push([dx, dy]);
    return [{ template: "BadwaterSource", x, y, strength: Number(p.strength), tiles }];
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
    if (plan.mode === "basin") return basinTiles(plan as unknown as BasinPlan, W, H).floor;
    const x = Number(plan.x);
    const y = Number(plan.y);
    const out: number[] = [];
    for (let yy = y; yy < y + 3; yy++) for (let xx = x; xx < x + 3; xx++) if (inMap(W, H, xx, yy)) out.push(yy * W + xx);
    return out;
  },
};
