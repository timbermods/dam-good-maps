// Waterfall (PLAN §9.2): one builder, two modes.
// - On a river (what the generator makes): a step in the river's bed profile. The river's own flow
//   goes over it, so its terrain is the river's carve; the set piece holds the lip's place and drop
//   so the editor and Claude can grab it, and the river's step names it.
// - Standalone (a landmark): its own cliff, a header pool one level below the lip, springs feeding
//   the pool, the lip, the plunge pool and an outflow to a map edge or a river. The header pool is
//   what spreads the water over the whole lip: without it a thin sheet wets only a few lip tiles
//   (PLAN §9.2), with it every lip tile carries about 0.3·S/W.
//
// Limits (PLAN §9.10): the drop is at most 15 levels (a lip bed at 15 with banks at 16 over a plunge
// pool at 0), whatever the map size; 12 is practical and 3–8 typical. The lip is at most 40% of the
// map side it runs along. A standalone fall takes at most the map's whole Normal flow budget in
// springs (PLAN §20, D6): beyond it, it builds the thinner sheet and says so; an exact flow set by
// hand may exceed it, with a warning.

import * as portable from "../../math/portable";
import { bedAt } from "../geometry";
import { carveChannel, channelBounds, channelTiles, channelWidth, checkChannel, routeChannel, type ChannelPlan } from "../route";
import { boundsOf, clipRect, type BuildTarget, type Rect } from "../target";
import type { RiverFeature, SetPieceFeature } from "../schema";
import {
  clampReported,
  clearsText,
  FACINGS,
  flowBudget,
  flowOf,
  fmt,
  inMap,
  local,
  nearStart,
  pairs,
  POINT_SCHEMA,
  pointOf,
  round2,
  sideAcross,
  type AchievableRanges,
  type Facing,
  type PlanContext,
  type PlanOutcome,
  type PlanRecord,
} from "./common";
import type { SetPieceBuilder, SetPieceSource } from "./index";

/** Header pool rows behind the lip, plunge pool rows below it, and wall thickness. */
export const POOL = 3;
export const PLUNGE = 4;
const WALL = 2;
/** The editor-safe hard maximum drop (PLAN §9.2): lip bed 15, banks 16, plunge pool 0. */
export const MAX_DROP = 15;
/** Springs are WaterSources of at most this strength, as on official maps. */
const SPRING = 0.5;
/** Evaporation of a header pool tile, blocks per second (PLAN §9.2). */
const POOL_EVAPORATION = 0.00012;

export interface OnRiverPlan {
  mode: "on-river";
  river: string;
  /** Arc position of the lip along the river. */
  at: number;
  /** Levels the bed drops at the lip. */
  drop: number;
}

/** A standalone fall as the rasterizer builds it. */
export interface StandalonePlan {
  mode: "standalone";
  /** The lip's middle tile (after fitting the map), and the way the water falls. */
  lip: [number, number];
  facing: Facing;
  width: number;
  drop: number;
  /** Lip bed level; the plunge pool is `lipLevel − drop`. */
  lipLevel: number;
  flow: number;
  /** Spring tiles in the header pool (x0, y0, …), each of `springStrength`. */
  springs: number[];
  springStrength: number;
  outflow: number[];
  outflowLevels: number[];
  outflowWidth: number;
  outflowTo: string;
}

/** The lip's first and last tile across the fall (v, relative to the lip's middle tile). */
export function lipSpan(width: number): [number, number] {
  const v0 = -Math.floor(width / 2);
  return [v0, v0 + width - 1];
}

/** The lip's tiles, first to last across the fall. */
export function lipTiles(p: Pick<StandalonePlan, "lip" | "facing" | "width">): [number, number][] {
  const [v0, v1] = lipSpan(p.width);
  const out: [number, number][] = [];
  for (let v = v0; v <= v1; v++) out.push(local(p.lip[0], p.lip[1], p.facing, 0, v));
  return out;
}

interface Body {
  /** Tiles raised to at least the lip + 1: the cliff top around the header pool. */
  block: number[];
  pool: number[];
  lip: number[];
  plunge: number[];
  /** Raised to at least the plunge level + 1 round the plunge pool, except the outflow. */
  walls: number[];
}

function body(p: Pick<StandalonePlan, "lip" | "facing" | "width">, W: number, H: number): Body {
  const [v0, v1] = lipSpan(p.width);
  const [cx, cy] = p.lip;
  const out: Body = { block: [], pool: [], lip: [], plunge: [], walls: [] };
  const add = (list: number[], u: number, v: number) => {
    const [x, y] = local(cx, cy, p.facing, u, v);
    if (inMap(W, H, x, y)) list.push(y * W + x);
  };
  for (let u = -POOL - WALL; u <= 0; u++)
    for (let v = v0 - WALL; v <= v1 + WALL; v++) {
      if (u === 0 && v >= v0 && v <= v1) add(out.lip, u, v);
      else if (u < 0 && u >= -POOL && v >= v0 && v <= v1) add(out.pool, u, v);
      else add(out.block, u, v);
    }
  for (let u = 1; u <= PLUNGE + 1; u++)
    for (let v = v0 - WALL; v <= v1 + WALL; v++) {
      if (u <= PLUNGE && v >= v0 - 1 && v <= v1 + 1) add(out.plunge, u, v);
      else add(out.walls, u, v);
    }
  return out;
}

function channelOf(p: StandalonePlan): ChannelPlan {
  return { tiles: p.outflow, levels: p.outflowLevels, width: p.outflowWidth, to: p.outflowTo };
}

/** The limits a standalone fall has on this map (PLAN §9.10), for a lip across `facing`. */
export function standaloneLimits(W: number, H: number, facing: Facing, width = 20): AchievableRanges {
  const side = sideAcross(facing, W, H);
  return {
    width: { min: 2, max: Math.floor(0.4 * side), typical: [2, 8] },
    drop: { min: 2, max: MAX_DROP, typical: [3, 8] },
    flow: { min: minFlow(width), max: flowBudget(W, H), typical: [round2(0.1 * width), round2(0.4 * width)] },
  };
}

/** The least flow that keeps a lip of `width` tiles wet: 0.025·W plus the header pool's
 *  evaporation (PLAN §9.2). */
export function minFlow(width: number): number {
  return Math.ceil((0.025 * width + POOL_EVAPORATION * POOL * width) * 1000) / 1000;
}

// -------------------------------------------------------------------------------------- planning

function planOnRiver(req: PlanRecord, ctx: PlanContext, id: string | null): PlanOutcome {
  const river = ctx.features.find((f): f is RiverFeature => f.kind === "river" && f.id === req.river);
  if (!river) return { ok: false, errors: [`there is no river ${String(req.river)} to put the fall on`] };
  const report: string[] = [];
  const at = Number(req.at);
  const length = pathLength(river.params.path);
  if (!(at > 0.5 && at < length - 0.5)) return { ok: false, errors: ["the lip must be on the river, away from its ends"] };
  for (const s of river.params.bedProfile.steps) {
    if (s.setPiece !== id && Math.abs(s.at - at) < 12) return { ok: false, errors: ["another fall is less than 12 tiles away on this river (PLAN §5.3)"] };
  }
  // the bed below the lip drops by `drop`: every level downstream must stay at 0 or above
  const own = river.params.bedProfile.steps.find((s) => s.setPiece === id);
  const lowest = bedAt(river.params.bedProfile, length + 1) + (own ? own.drop : 0);
  let drop = Number(req.drop);
  drop = clampReported("Drop", drop, { min: 1, max: Math.min(MAX_DROP, Math.max(1, lowest)) }, report, lowest < MAX_DROP ? "the river's bed allows downstream" : "the terrain allows");
  if (lowest < 1) return { ok: false, errors: ["the river's bed is already at the bottom (level 0) downstream: there is no room for a fall"] };
  return { ok: true, request: req, plan: { mode: "on-river", river: river.id, at: round2(at), drop }, report };
}

function pathLength(path: readonly [number, number][]): number {
  let l = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const dx = path[i + 1][0] - path[i][0];
    const dy = path[i + 1][1] - path[i][1];
    l += portable.sqrt(dx * dx + dy * dy);
  }
  return l;
}

function planStandalone(req: PlanRecord, ctx: PlanContext, id: string | null): PlanOutcome {
  const { W, H } = ctx;
  const report: string[] = [];
  const at = pointOf(req.lip);
  const facing = req.facing as Facing;
  if (!at) return { ok: false, errors: ["a standalone fall needs the tile of its lip"] };
  const lim = standaloneLimits(W, H, facing, Number(req.width));
  const width = clampReported("Width", Math.round(Number(req.width)), lim.width, report, "this map allows (40% of the map side along the lip)");
  const drop = clampReported("Drop", Math.round(Number(req.drop)), lim.drop, report, "the game's terrain allows (level 16 is the in-game editor's limit)");
  // fit the whole piece on the map, one tile in from the edges
  const [v0, v1] = lipSpan(width);
  const corners: [number, number][] = [];
  for (const u of [-POOL - WALL, PLUNGE + 1]) for (const v of [v0 - WALL, v1 + WALL]) corners.push(local(0, 0, facing, u, v));
  const b = boundsOf(corners)!;
  const cx = Math.min(W - 2 - b.x1, Math.max(1 - b.x0, Math.round(at[0])));
  const cy = Math.min(H - 2 - b.y1, Math.max(1 - b.y0, Math.round(at[1])));
  if (cx + b.x0 < 1 || cy + b.y0 < 1) return { ok: false, errors: ["the map is too small for this fall"] };
  const moved = Math.max(Math.abs(cx - Math.round(at[0])), Math.abs(cy - Math.round(at[1])));
  if (moved > 0) report.push(`moved ${moved} tile${moved > 1 ? "s" : ""} from where it was placed, to fit on the map`);
  const shape = { lip: [cx, cy] as [number, number], facing, width };
  const bd = body(shape, W, H);
  const all = [...bd.block, ...bd.pool, ...bd.lip, ...bd.plunge, ...bd.walls];
  for (const i of all) {
    const x = i % W;
    const y = (i - x) / W;
    if (nearStart(ctx, x, y, 1)) return { ok: false, errors: ["it would cover the start's area: place it farther from the start"] };
    if (ctx.locked?.[i]) return { ok: false, errors: ["it would touch a locked area"] };
    if (ctx.channel?.[i]) return { ok: false, errors: ["it would dam a river here: place it beside the river, or on the river as an on-river fall"] };
  }
  // the plunge pool sits on the ground in front of the lip; the lip is `drop` above it
  let ground = Infinity;
  for (const i of bd.plunge) ground = Math.min(ground, ctx.heights[i]);
  const plungeLevel = Math.max(0, Math.min(ground, MAX_DROP - drop));
  const lipLevel = plungeLevel + drop;
  // flow: at most the map's whole budget in springs, unless set exactly by hand
  const budget = flowBudget(W, H);
  const exact = req.exactFlow === true;
  let flow = flowOf(req.flow, 2);
  const least = minFlow(width);
  if (flow < least) {
    report.push(`flow ${fmt(flow)} raised to ${fmt(least)}: a lip ${width} wide dries out below that`);
    flow = least;
  }
  if (flow > budget) {
    if (exact) report.push(`flow ${fmt(flow)} is more than the map's whole flow budget of ${fmt(budget)} blocks/s (set by hand)`);
    else {
      report.push(`flow ${fmt(flow)} reduced to ${fmt(budget)}, the map's whole flow budget: the sheet over the lip is thinner`);
      flow = budget;
    }
  }
  flow = round2(flow);
  // springs of at most 0.5 in the header pool, spread across it, back row first
  const poolTiles = POOL * width;
  let n = Math.max(1, Math.ceil(flow / SPRING - 1e-9));
  if (n > poolTiles) n = poolTiles;
  const each = Math.round((flow / n) * 1000) / 1000;
  if (each > 8) return { ok: false, errors: [`flow ${fmt(flow)} needs more than 8 blocks/s per pool tile, the game's limit`] };
  const springs: number[] = [];
  const perRow = Math.min(width, n);
  for (let k = 0; k < n; k++) {
    const row = Math.floor(k / perRow);
    const inRow = Math.min(perRow, n - row * perRow);
    const v = v0 + Math.floor(((k % perRow) + 0.5) * width / inRow);
    const [x, y] = local(cx, cy, facing, -POOL + row, v);
    springs.push(x, y);
  }
  // the outflow: from the plunge pool to a map edge, a river or a lake
  const blocked = new Uint8Array(W * H);
  for (const i of [...bd.block, ...bd.pool, ...bd.lip]) blocked[i] = 1;
  if (ctx.start) {
    const r = ctx.start.radius + 2;
    for (let y = ctx.start.y - r; y <= ctx.start.y + r; y++)
      for (let x = ctx.start.x - r; x <= ctx.start.x + r; x++) if (inMap(W, H, x, y)) blocked[y * W + x] = 1;
  }
  if (ctx.locked) for (let i = 0; i < W * H; i++) if (ctx.locked[i]) blocked[i] = 1;
  if (ctx.protect) for (let i = 0; i < W * H; i++) if (ctx.protect[i]) blocked[i] = 1;
  const cw = channelWidth(flow);
  const route = routeChannel({ W, H, heights: ctx.heights, features: ctx.features, channel: ctx.channel, occupied: ctx.occupied }, bd.plunge, plungeLevel, cw, blocked, id);
  if (!route) return { ok: false, errors: ["its water has no way to a map edge, a river or a lake from here"] };
  const target = route.to === "edge" ? "the map edge" : `the ${ctx.features.find((f) => f.id === route.to)?.kind === "lake" ? "lake" : "river"}`;
  report.push(`${n} spring${n > 1 ? "s" : ""} of ${fmt(each)} blocks/s feed its header pool; the lip carries a sheet about ${fmt(round2((0.3 * flow) / width))} deep`);
  report.push(`its water leaves by a channel ${route.levels.length} tiles long to ${target}`);
  const touched = new Set(all);
  for (const i of channelTiles(route, W, H).bed.keys()) touched.add(i);
  const cleared = clearsText(ctx, touched);
  if (cleared) report.push(`clears ${cleared}`);
  const plan: StandalonePlan = {
    mode: "standalone",
    lip: [cx, cy],
    facing,
    width,
    drop,
    lipLevel,
    flow,
    springs,
    springStrength: each,
    outflow: route.tiles,
    outflowLevels: route.levels,
    outflowWidth: route.width,
    outflowTo: route.to,
  };
  return { ok: true, request: req, plan: plan as unknown as PlanRecord, report };
}

// ------------------------------------------------------------------------------------- the builder

export const waterfall: SetPieceBuilder = {
  kind: "waterfall",
  request: {
    type: "object",
    required: ["mode"],
    properties: {
      mode: { enum: ["on-river", "standalone"] },
      river: { type: "string" },
      at: { type: "number", minimum: 0 },
      lip: POINT_SCHEMA,
      facing: { enum: FACINGS },
      width: { type: "integer", minimum: 1, maximum: 256 },
      drop: { type: "integer", minimum: 1, maximum: 22 },
      flow: { type: ["number", "string"] },
      exactFlow: { type: "boolean" },
    },
    allOf: [
      { if: { required: ["mode"], properties: { mode: { const: "on-river" } } }, then: { required: ["river", "at", "drop"] } },
      { if: { required: ["mode"], properties: { mode: { const: "standalone" } } }, then: { required: ["lip", "facing", "width", "drop"] } },
    ],
  },
  // PLAN §9.10: the drop does not depend on map size; the width is capped at 40% of the side
  limits: (ctx: PlanContext, req?: PlanRecord) =>
    req?.mode === "standalone" ? standaloneLimits(ctx.W, ctx.H, (req.facing as Facing) ?? "north", Number(req.width ?? 20)) : { drop: { min: 1, max: MAX_DROP, typical: [3, 8] } },
  plan(req: PlanRecord, ctx: PlanContext, id: string | null): PlanOutcome {
    if (typeof req.flow === "string" && !["gentle", "steady", "strong"].includes(req.flow)) return { ok: false, errors: [`flow must be a number or gentle, steady or strong`] };
    return req.mode === "standalone" ? planStandalone(req, ctx, id) : planOnRiver(req, ctx, id);
  },
  check(plan: PlanRecord, W: number, H: number): string[] {
    if (plan.mode === "on-river") {
      if (typeof plan.river !== "string" || typeof plan.at !== "number" || !Number.isInteger(plan.drop) || Number(plan.drop) < 1 || Number(plan.drop) > MAX_DROP) return ["an on-river fall needs its river, lip position and a drop of 1–15"];
      return [];
    }
    if (plan.mode !== "standalone") return [`unknown waterfall mode ${String(plan.mode)}`];
    const p = plan as unknown as StandalonePlan;
    const errors: string[] = [];
    const lip = pointOf(plan.lip);
    if (!lip || !FACINGS.includes(p.facing)) errors.push("a standalone fall needs its lip tile and facing");
    if (!Number.isInteger(p.width) || p.width < 1 || p.width > 256) errors.push("the lip width must be 1–256");
    if (!Number.isInteger(p.drop) || p.drop < 1 || p.drop > MAX_DROP) errors.push("the drop must be 1–15");
    if (!Number.isInteger(p.lipLevel) || p.lipLevel - p.drop < 0 || p.lipLevel > MAX_DROP) errors.push("the lip must stay at level 15 or below, over a plunge pool at 0 or above");
    if (!(p.springStrength > 0 && p.springStrength <= 8)) errors.push("each spring is at most 8 blocks/s");
    if (!Array.isArray(p.springs) || p.springs.length % 2 || pairs(p.springs).some(([x, y]) => !inMap(W, H, x, y))) errors.push("the springs must be on the map");
    errors.push(...checkChannel(channelOf(p), W, H));
    return errors;
  },
  rasterize(feature: SetPieceFeature, t: BuildTarget): void {
    const plan = feature.params.plan;
    if (plan.mode !== "standalone") return rasterizeOnRiver(feature, t);
    const p = plan as unknown as StandalonePlan;
    const bd = body(p, t.W, t.H);
    const h = t.heights;
    const L = p.lipLevel;
    const P = L - p.drop;
    const put = (i: number, v: number, raise = false) => {
      if (!t.inRegion(i) || !t.writable(i, feature)) return;
      if (!raise || h[i] < v) h[i] = v;
      t.protect(i);
    };
    // the cliff top, then the outflow, then the pools and the lip exactly, then the plunge walls
    for (const i of bd.block) put(i, L + 1, true);
    const own = new Set([...bd.block, ...bd.pool, ...bd.lip, ...bd.plunge]);
    carveChannel(channelOf(p), t, feature, (i) => own.has(i));
    for (const i of bd.pool) put(i, L - 1);
    for (const i of bd.lip) put(i, L);
    for (const i of bd.plunge) put(i, P);
    const beds = channelTiles(channelOf(p), t.W, t.H).bed;
    for (const i of bd.walls) if (!beds.has(i)) put(i, P + 1, true);
  },
  footprint(feature: SetPieceFeature, t: Pick<BuildTarget, "W" | "H">): Rect | "all" | null {
    const plan = feature.params.plan;
    if (plan.mode !== "standalone") return null; // an on-river fall writes no terrain of its own
    const p = plan as unknown as StandalonePlan;
    const bd = body(p, t.W, t.H);
    const pts: [number, number][] = [...bd.block, ...bd.walls].map((i) => [i % t.W, Math.floor(i / t.W)]);
    const c = channelBounds(channelOf(p));
    if (c) pts.push([c.x0, c.y0], [c.x1, c.y1]);
    const r = boundsOf(pts);
    return r && clipRect(r, t.W, t.H, 1);
  },
  sources(feature: SetPieceFeature): SetPieceSource[] {
    const p = feature.params.plan;
    if (p.mode !== "standalone") return [];
    const strength = Number(p.springStrength);
    return pairs(p.springs).map(([x, y]) => ({ template: "WaterSource" as const, x, y, strength, tiles: [[0, 0]] as [number, number][] }));
  },
  clears(feature: SetPieceFeature, W: number, H: number): number[] {
    const plan = feature.params.plan;
    if (plan.mode !== "standalone") return [];
    const p = plan as unknown as StandalonePlan;
    const bd = body(p, W, H);
    const out = new Set([...bd.block, ...bd.pool, ...bd.lip, ...bd.plunge, ...bd.walls]);
    for (const i of channelTiles(channelOf(p), W, H).bed.keys()) out.add(i);
    return [...out].sort((a, b) => a - b);
  },
  area(feature: SetPieceFeature, W: number, H: number): number[] {
    const plan = feature.params.plan;
    if (plan.mode !== "standalone") return [];
    const bd = body(plan as unknown as StandalonePlan, W, H);
    return [...bd.pool, ...bd.lip, ...bd.plunge];
  },
};

function rasterizeOnRiver(feature: SetPieceFeature, t: BuildTarget): void {
  const p = feature.params.plan as unknown as OnRiverPlan;
  const river = t.river(p.river);
  if (!river) return;
  // The river carries the step (its bedProfile step names this set piece). Check the two agree so
  // an edit cannot split them silently.
  const step = river.params.bedProfile.steps.find((s) => s.setPiece === feature.id);
  if (!step || step.drop !== p.drop || Math.abs(step.at - p.at) > 1e-9) {
    t.note(`waterfall ${feature.id} and river ${p.river} disagree about the step at ${p.at}`);
  }
}

// ---------------------------------------------------------------------------------- measuring

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
