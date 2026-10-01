// Gorge (PLAN §9.9): a river's channel 3–9 tiles wide between walls at least 2 levels above the
// bed, 6–40 tiles long, with the river's bed profile running through it. The river is narrowed to
// the gorge's width along it (the river's rasterizer asks, `narrowsOf`), and the walls rise on both
// sides, 3 tiles thick. No roofs: slot canyons are out of scope (the water model has no roofs).
//
// Beavers cannot climb the walls. With `access: "stairs"` the builder cuts a stair notch in one
// wall: a two-tile landing beside the water at the floodplain level, then 1-level steps, each with a
// slope (a chained slope climbs them), up to the ground behind the wall. The notch runs square to
// the river, along the map's axes, so every step meets the next side to side.

import * as portable from "../../math/portable";
import { bedAt, pointAtArc } from "../geometry";
import { boundsOf, clipRect, type BuildTarget, type Rect } from "../target";
import type { Feature, RiverFeature, SetPieceFeature } from "../schema";
import { clampReported, fmt, inMap, nearStart, nearestFacing, round2, STEP, type PlanContext, type PlanOutcome, type PlanRecord } from "./common";
import type { SetPieceBuilder, SetPieceSlope } from "./index";

export interface GorgePlan {
  river: string;
  /** The stretch of the river it wraps, as arc positions. */
  from: number;
  to: number;
  /** Channel width between the walls, in tiles. */
  width: number;
  /** Wall top above the river's bed. */
  wallHeight: number;
  /** Wall thickness in tiles. */
  thickness: number;
  /** The stair notch: its arc position, and the side (+1 left of the flow, −1 right; 0: none). */
  notchAt: number;
  notchSide: number;
}

const THICKNESS = 3;
/** The farthest a notch reaches past the wall: a landing and up to 16 steps. */
const NOTCH_REACH = 18;

function riverOf(features: readonly Feature[] | ((id: string) => RiverFeature | undefined), id: string): RiverFeature | undefined {
  if (typeof features === "function") return features(id);
  return features.find((f): f is RiverFeature => f.kind === "river" && f.id === id);
}

/** The narrows a gorge puts on its river: the channel's half-width along the stretch. */
export function gorgeNarrows(p: GorgePlan): { from: number; to: number; half: number } {
  return { from: p.from, to: p.to, half: p.width / 2 };
}

/** Distance from (x, y) to a polyline, and the arc position of the nearest point. */
function nearest(path: readonly [number, number][], x: number, y: number): { d: number; s: number } {
  let best = Infinity;
  let bestS = 0;
  let acc = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const [ax, ay] = path[i];
    const vx = path[i + 1][0] - ax;
    const vy = path[i + 1][1] - ay;
    const l2 = vx * vx + vy * vy;
    const l = portable.sqrt(l2);
    let t = l2 > 0 ? ((x - ax) * vx + (y - ay) * vy) / l2 : 0;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const px = ax + t * vx - x;
    const py = ay + t * vy - y;
    const dd = px * px + py * py;
    if (dd < best) {
      best = dd;
      bestS = acc + t * l;
    }
    acc += l;
  }
  return { d: portable.sqrt(best), s: bestS };
}

/** The notch's tiles, from the first tile outside the channel outward, square to the river along
 *  the nearest map axis. */
export function notchTiles(p: GorgePlan, river: RiverFeature, W: number, H: number): { tiles: number[]; step: [number, number] } | null {
  if (!p.notchSide) return null;
  const { p: c, normal } = pointAtArc(river.params.path, p.notchAt);
  const dir = nearestFacing(p.notchSide * normal[0], p.notchSide * normal[1]);
  const [dx, dy] = STEP[dir];
  const half = Math.min(river.params.width, p.width) / 2;
  let x = Math.round(c[0]);
  let y = Math.round(c[1]);
  // step out of the channel
  for (let k = 0; k < 12 && inMap(W, H, x, y) && nearest(river.params.path, x, y).d < half; k++) {
    x += dx;
    y += dy;
  }
  const tiles: number[] = [];
  const reach = Math.ceil(p.width / 2) + p.thickness + NOTCH_REACH;
  for (let k = 0; k < reach && inMap(W, H, x, y); k++) {
    tiles.push(y * W + x);
    x += dx;
    y += dy;
  }
  return tiles.length >= 3 ? { tiles, step: [dx, dy] } : null;
}

/** Levels of the notch's tiles on terrain `h` (the rim read beyond the wall): the landing at the
 *  floodplain, then 1-level steps up to the rim. Tiles past the last step are left alone. */
function notchLevels(p: GorgePlan, river: RiverFeature, tiles: number[], h: ArrayLike<number>, W: number): number[] {
  const F = bedAt(river.params.bedProfile, p.notchAt) + river.params.bedDepth;
  // the rim: the first tile past the wall
  let rimAt = -1;
  for (let k = 0; k < tiles.length; k++) {
    const i = tiles[k];
    const x = i % W;
    const y = (i - x) / W;
    if (nearest(river.params.path, x, y).d >= p.width / 2 + p.thickness) {
      rimAt = k;
      break;
    }
  }
  const R = rimAt >= 0 ? h[tiles[rimAt]] : F;
  const out: number[] = [];
  if (R <= F) {
    // no stairs: a cut through the wall at the floodplain
    for (let k = 0; k < Math.max(rimAt, 2); k++) out.push(F);
    return out;
  }
  out.push(F, F);
  for (let lv = F + 1; lv < R && out.length < tiles.length - 1; lv++) out.push(lv);
  // the top: cut through what is left of the wall at the rim's level, to the rim
  do out.push(R);
  while (out.length <= rimAt && out.length < tiles.length);
  return out;
}

export const gorge: SetPieceBuilder = {
  kind: "gorge",
  request: {
    type: "object",
    required: ["river", "from", "length"],
    properties: {
      river: { type: "string" },
      from: { type: "number", minimum: 0 },
      length: { type: "number", minimum: 1, maximum: 256 },
      width: { type: "integer", minimum: 1, maximum: 20 },
      wallHeight: { type: "integer", minimum: 1, maximum: 16 },
      access: { enum: ["none", "stairs"] },
      side: { enum: [1, -1] },
    },
  },
  limits(ctx: PlanContext, req?: PlanRecord) {
    const river = req ? riverOf(ctx.features, String(req.river)) : undefined;
    let bed = 0;
    if (river && typeof req?.from === "number") bed = bedAt(river.params.bedProfile, Number(req.from));
    return {
      length: { min: 6, max: 40 },
      width: { min: 3, max: 9 },
      wallHeight: { min: 2, max: Math.max(2, 16 - bed), typical: [2, 6] },
    };
  },
  plan(req: PlanRecord, ctx: PlanContext): PlanOutcome {
    const river = riverOf(ctx.features, String(req.river));
    if (!river) return { ok: false, errors: [`there is no river ${String(req.river)} to put the gorge on`] };
    const report: string[] = [];
    const path = river.params.path;
    let total = 0;
    for (let i = 0; i + 1 < path.length; i++) total += portable.sqrt(portable.pow(path[i + 1][0] - path[i][0], 2) + portable.pow(path[i + 1][1] - path[i][1], 2));
    let length = clampReported("Length", Math.round(Number(req.length)), { min: 6, max: 40 }, report, "a gorge has (PLAN §9.9)");
    let from = Math.max(1, Number(req.from));
    if (from + length > total - 1) {
      from = Math.max(1, total - 1 - length);
      if (from + length > total - 1) return { ok: false, errors: ["the river is too short for a gorge"] };
      report.push("moved along the river to fit before its end");
    }
    from = round2(from);
    length = round2(length);
    const width = clampReported("Width", Math.round(Number(req.width ?? 5)), { min: 3, max: 9 }, report, "a gorge has (PLAN §9.9)");
    // the walls stand 2+ above the bed and stay at 16 or below over the whole stretch
    let maxBed = 0;
    for (let s = from; s <= from + length; s += 0.5) maxBed = Math.max(maxBed, bedAt(river.params.bedProfile, s));
    const wallHeight = clampReported("Wall height", Math.round(Number(req.wallHeight ?? 3)), { min: 2, max: 16 - maxBed }, report, "fits under level 16 here");
    if (16 - maxBed < 2) return { ok: false, errors: ["the river's bed is too high here for walls 2 levels above it (16 is the limit)"] };
    const mid = round2(from + length / 2);
    let side = 0;
    if (req.access === "stairs") {
      side = req.side === -1 ? -1 : req.side === 1 ? 1 : 1;
      if (req.side === undefined && ctx.start) {
        // the side facing the start
        const { p, normal } = pointAtArc(path, mid);
        side = (ctx.start.x - p[0]) * normal[0] + (ctx.start.y - p[1]) * normal[1] >= 0 ? 1 : -1;
      }
    }
    const plan: GorgePlan = { river: river.id, from, to: round2(from + length), width, wallHeight, thickness: THICKNESS, notchAt: mid, notchSide: side };
    // keep off the start and locks
    const { W, H } = ctx;
    const b = stretchBounds(plan, river, W, H);
    if (b) {
      for (let y = b.y0; y <= b.y1; y++)
        for (let x = b.x0; x <= b.x1; x++) {
          const n = nearest(path, x, y);
          if (n.s < plan.from || n.s > plan.to || n.d >= plan.width / 2 + plan.thickness) continue;
          if (nearStart(ctx, x, y, 1)) return { ok: false, errors: ["its walls would cover the start's area: place it farther from the start"] };
          if (ctx.locked?.[y * W + x]) return { ok: false, errors: ["it would touch a locked area"] };
        }
    }
    if (river.params.width > width) report.push(`narrows the river from ${fmt(river.params.width)} to ${width} tiles along ${fmt(length)} tiles`);
    report.push(`walls ${wallHeight} levels above the river's bed, ${THICKNESS} tiles thick`);
    if (side) report.push("a stair notch with slopes climbs one wall to a landing beside the water");
    return { ok: true, request: req, plan: plan as unknown as PlanRecord, report };
  },
  check(plan: PlanRecord): string[] {
    const p = plan as unknown as GorgePlan;
    if (typeof p.river !== "string" || !(p.from >= 0) || !(p.to > p.from)) return ["a gorge needs its river and a stretch along it"];
    if (!(p.width >= 1 && p.width <= 20)) return ["the gorge is 1–20 tiles wide"];
    if (!Number.isInteger(p.wallHeight) || p.wallHeight < 1 || p.wallHeight > 16) return ["the walls are 1–16 levels above the bed"];
    if (!Number.isInteger(p.thickness) || p.thickness < 1 || p.thickness > 8) return ["the walls are 1–8 tiles thick"];
    if (![0, 1, -1].includes(p.notchSide)) return ["the notch side is 1, −1 or 0"];
    return [];
  },
  rasterize(feature: SetPieceFeature, t: BuildTarget): void {
    const p = feature.params.plan as unknown as GorgePlan;
    const river = t.river(p.river);
    if (!river) return t.note(`gorge ${feature.id}: river ${p.river} not found`);
    const field = t.pathField(p.river);
    const h = t.heights;
    const half = p.width / 2;
    // the notch reads the rim beyond the wall first, before anything here changes it
    const notch = notchTiles(p, river, t.W, t.H);
    const levels = notch ? notchLevels(p, river, notch.tiles, h, t.W) : [];
    t.forEach((i) => {
      const s = field.s[i];
      const d = field.d[i];
      if (s < p.from || s > p.to || d < half || d >= half + p.thickness || !t.writable(i, feature)) return;
      const top = Math.min(16, bedAt(river.params.bedProfile, s) + p.wallHeight);
      if (h[i] < top) h[i] = top;
      t.protect(i);
    });
    if (notch) {
      for (let k = 0; k < levels.length; k++) {
        const i = notch.tiles[k];
        if (!t.inRegion(i) || !t.writable(i, feature)) continue;
        h[i] = levels[k];
        t.protect(i);
      }
    }
  },
  footprint(feature: SetPieceFeature, t: Pick<BuildTarget, "W" | "H" | "river">): Rect | "all" | null {
    const p = feature.params.plan as unknown as GorgePlan;
    const river = t.river(p.river);
    if (!river) return null;
    const b = stretchBounds(p, river, t.W, t.H);
    return b && clipRect(b, t.W, t.H, NOTCH_REACH + 1);
  },
  slopes(feature: SetPieceFeature, heights: ArrayLike<number>, W: number, H: number, features: readonly Feature[]): SetPieceSlope[] {
    const p = feature.params.plan as unknown as GorgePlan;
    const river = riverOf(features, p.river);
    if (!river) return [];
    const notch = notchTiles(p, river, W, H);
    if (!notch) return [];
    const tl = notch.tiles;
    const out: SetPieceSlope[] = [];
    // a chain: on each step whose next tile is one level higher, the first on the landing's
    // second tile (its low side is the landing's first tile, at its level)
    if (tl.length < 3 || heights[tl[0]] !== heights[tl[1]]) return out;
    for (let k = 1; k + 1 < tl.length; k++) {
      if (heights[tl[k + 1]] !== heights[tl[k]] + 1) break;
      out.push({ x: tl[k] % W, y: Math.floor(tl[k] / W), high: notch.step });
    }
    return out;
  },
  clears(feature: SetPieceFeature, W: number, H: number, features: readonly Feature[]): number[] {
    const p = feature.params.plan as unknown as GorgePlan;
    const river = riverOf(features, p.river);
    if (!river) return [];
    const out = new Set(wallTiles(p, river, W, H));
    const notch = notchTiles(p, river, W, H);
    if (notch) for (const i of notch.tiles.slice(0, NOTCH_REACH)) out.add(i);
    return [...out].sort((a, b) => a - b);
  },
  area(feature: SetPieceFeature, W: number, H: number, features: readonly Feature[]): number[] {
    const p = feature.params.plan as unknown as GorgePlan;
    const river = riverOf(features, p.river);
    return river ? wallTiles(p, river, W, H) : [];
  },
};

function stretchBounds(p: GorgePlan, river: RiverFeature, W: number, H: number): Rect | null {
  const pts: [number, number][] = [];
  for (let s = p.from; s <= p.to; s += 1) pts.push(pointAtArc(river.params.path, s).p);
  pts.push(pointAtArc(river.params.path, p.to).p);
  const b = boundsOf(pts);
  if (!b) return null;
  const m = Math.ceil(p.width / 2) + p.thickness + 1;
  return clipRect(b, W, H, m);
}

function wallTiles(p: GorgePlan, river: RiverFeature, W: number, H: number): number[] {
  const b = stretchBounds(p, river, W, H);
  const out: number[] = [];
  if (!b) return out;
  for (let y = b.y0; y <= b.y1; y++)
    for (let x = b.x0; x <= b.x1; x++) {
      const n = nearest(river.params.path, x, y);
      if (n.s >= p.from && n.s <= p.to && n.d < p.width / 2 + p.thickness) out.push(y * W + x);
    }
  return out;
}
