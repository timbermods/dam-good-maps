// Terraced cliffs (PLAN §9.3): a stair of 3–6 bands, each 1 level high and 6–12 tiles deep, facing
// water, with a slope chain climbing it at one end. It gives wide flat benches at several levels for
// tall builds with water close below.
//
// The plan takes the middle tile of the front (the water side), the way the front faces, the number
// of bands, their depth and the width along the front. The front band sits one level above the
// ground in front of it; the bands rise away from the water. The top stays at 16 or below.
//
// A `stair` is the narrow kind: steps 1–5 deep, 2–8 of them, a slope on each, climbing a cliff to
// the ground above it (Canyon's flight up the wall beside the start, PLAN §8). Steps 1 deep make a
// chain of slopes, each standing on the one below it.

import { boundsOf, clipRect, type BuildTarget, type Rect } from "../target";
import type { SetPieceFeature } from "../schema";
import { clampReported, clearsText, FACINGS, inMap, local, nearStart, POINT_SCHEMA, pointOf, sideAcross, STEP, type Facing, type PlanContext, type PlanOutcome, type PlanRecord } from "./common";
import type { SetPieceBuilder, SetPieceSlope } from "./index";

export interface TerracedCliffsPlan {
  /** Middle tile of the front band's front row, and the way the front faces (toward the water). */
  at: [number, number];
  facing: Facing;
  bands: number;
  depth: number;
  width: number;
  /** The ground level in front: band k (1…bands) stands at base + k. */
  base: number;
  /** The end the slope chain climbs (v across the front, relative to `at`). */
  chainV: number;
  /** A stair: its chain starts on the ground in front of it. */
  stair?: boolean;
}

function span(width: number): [number, number] {
  const v0 = -Math.floor(width / 2);
  return [v0, v0 + width - 1];
}

/** Every tile of the stair with its level. */
function stairTiles(p: TerracedCliffsPlan, W: number, H: number): [number, number][] {
  const [v0, v1] = span(p.width);
  const out: [number, number][] = [];
  for (let a = 0; a < p.bands * p.depth; a++)
    for (let v = v0; v <= v1; v++) {
      const [x, y] = local(p.at[0], p.at[1], p.facing, -a, v);
      if (inMap(W, H, x, y)) out.push([y * W + x, p.base + 1 + Math.floor(a / p.depth)]);
    }
  return out;
}

/** The positions across the front, starting at the chain's end. */
function acrossFrom(p: TerracedCliffsPlan): number[] {
  const [v0, v1] = span(p.width);
  const out: number[] = [];
  const step = p.chainV === v0 ? 1 : -1;
  for (let v = p.chainV; v >= v0 && v <= v1; v += step) out.push(v);
  return out;
}

export const terracedCliffs: SetPieceBuilder = {
  kind: "terracedCliffs",
  request: {
    type: "object",
    required: ["at", "facing"],
    properties: {
      at: POINT_SCHEMA,
      facing: { enum: FACINGS },
      bands: { type: "integer", minimum: 1, maximum: 16 },
      depth: { type: "integer", minimum: 1, maximum: 64 },
      width: { type: "integer", minimum: 1, maximum: 256 },
      stair: { type: "boolean" },
    },
  },
  limits(ctx: PlanContext, req?: PlanRecord) {
    const side = sideAcross((req?.facing as Facing) ?? "north", ctx.W, ctx.H);
    if (req?.stair === true) return { bands: { min: 2, max: 8 }, depth: { min: 1, max: 5 }, width: { min: 1, max: 12, typical: [1, 4] } };
    return { bands: { min: 3, max: 6 }, depth: { min: 6, max: 12 }, width: { min: 6, max: Math.max(6, side - 4), typical: [12, 30] } };
  },
  plan(req: PlanRecord, ctx: PlanContext): PlanOutcome {
    const { W, H } = ctx;
    const at = pointOf(req.at);
    const facing = req.facing as Facing;
    if (!at) return { ok: false, errors: ["terraced cliffs need the tile of their front"] };
    if (ctx.heights.length !== W * H) return { ok: false, errors: ["terraced cliffs are planned on a map's terrain"] };
    const report: string[] = [];
    const lim = terracedCliffs.limits(ctx, req);
    const what = req.stair === true ? "a stair has" : "terraced cliffs have (PLAN §9.3)";
    let bands = clampReported(req.stair === true ? "Steps" : "Bands", Math.round(Number(req.bands ?? 4)), lim.bands, report, what);
    const depth = clampReported(req.stair === true ? "Step depth" : "Band depth", Math.round(Number(req.depth ?? 8)), lim.depth, report, what);
    const width = clampReported("Width", Math.round(Number(req.width ?? 16)), lim.width, report, "fits along this side of the map");
    // fit on the map
    const [v0, v1] = span(width);
    const corners: [number, number][] = [];
    for (const a of [0, bands * depth - 1]) for (const v of [v0, v1]) corners.push(local(0, 0, facing, -a, v));
    const b = boundsOf(corners)!;
    const cx = Math.min(W - 1 - b.x1, Math.max(-b.x0, Math.round(at[0])));
    const cy = Math.min(H - 1 - b.y1, Math.max(-b.y0, Math.round(at[1])));
    if (cx + b.x0 < 0 || cy + b.y0 < 0) {
      // too deep for the map: fewer bands
      return { ok: false, errors: ["the map is too small for these terraces here"] };
    }
    const moved = Math.max(Math.abs(cx - Math.round(at[0])), Math.abs(cy - Math.round(at[1])));
    if (moved) report.push(`moved ${moved} tile${moved > 1 ? "s" : ""} from where it was placed, to fit on the map`);
    // the ground in front: the lowest tile along the front row
    let base = 16;
    for (let v = v0; v <= v1; v++) {
      const [x, y] = local(cx, cy, facing, 1, v);
      if (inMap(W, H, x, y)) base = Math.min(base, ctx.heights[y * W + x]);
    }
    if (base + bands > 16) {
      const nb = 16 - base;
      if (nb < 1) return { ok: false, errors: ["the ground here is at the top already (level 16)"] };
      report.push(`${bands} bands reduced to ${nb}: the top band must stay at level 16 or below`);
      bands = nb;
    }
    // the slope chain climbs at the end nearer the start
    let chainV = v0;
    if (ctx.start) {
      const a = local(cx, cy, facing, 0, v0);
      const z = local(cx, cy, facing, 0, v1);
      const da = Math.abs(a[0] - ctx.start.x) + Math.abs(a[1] - ctx.start.y);
      const dz = Math.abs(z[0] - ctx.start.x) + Math.abs(z[1] - ctx.start.y);
      if (dz < da) chainV = v1;
    }
    const plan: TerracedCliffsPlan = { at: [cx, cy], facing, bands, depth, width, base, chainV, ...(req.stair === true ? { stair: true } : {}) };
    const tiles = stairTiles(plan, W, H);
    const set = new Set<number>();
    for (const [i] of tiles) {
      const x = i % W;
      const y = (i - x) / W;
      if (nearStart(ctx, x, y, 1)) return { ok: false, errors: ["it would cover the start's area: place it farther from the start"] };
      if (ctx.locked?.[i]) return { ok: false, errors: ["it would touch a locked area"] };
      if (ctx.channel?.[i]) return { ok: false, errors: ["it would bury a river: place its front beside the water"] };
      set.add(i);
    }
    report.push(req.stair === true ? `a stair of ${bands} steps ${depth} deep, from level ${base + 1} to ${base + bands}, a slope on each` : `${bands} bands ${depth} deep, from level ${base + 1} to ${base + bands}, with a slope chain at one end`);
    const cleared = clearsText(ctx, set);
    if (cleared) report.push(`clears ${cleared}`);
    return { ok: true, request: req, plan: plan as unknown as PlanRecord, report };
  },
  check(plan: PlanRecord, W: number, H: number): string[] {
    const p = plan as unknown as TerracedCliffsPlan;
    const at = pointOf(plan.at);
    if (!at || !inMap(W, H, at[0], at[1]) || !FACINGS.includes(p.facing)) return ["terraced cliffs need their front tile on the map and a facing"];
    if (!Number.isInteger(p.bands) || p.bands < 1 || !Number.isInteger(p.base) || p.base < 0 || p.base + p.bands > 16) return ["the bands stay between level 1 and 16"];
    if (!Number.isInteger(p.depth) || p.depth < (p.stair ? 1 : 2) || p.depth > 64) return ["a band is 2–64 tiles deep (a stair's step 1 or more)"];
    if (!Number.isInteger(p.width) || p.width < 1 || p.width > 256) return ["the terraces are 1–256 tiles wide"];
    return [];
  },
  rasterize(feature: SetPieceFeature, t: BuildTarget): void {
    const p = feature.params.plan as unknown as TerracedCliffsPlan;
    for (const [i, lv] of stairTiles(p, t.W, t.H)) {
      if (!t.inRegion(i) || !t.writable(i, feature)) continue;
      t.heights[i] = lv;
      t.protect(i);
    }
  },
  footprint(feature: SetPieceFeature, t: Pick<BuildTarget, "W" | "H">): Rect | "all" | null {
    const p = feature.params.plan as unknown as TerracedCliffsPlan;
    const pts = stairTiles(p, t.W, t.H).map(([i]) => [i % t.W, Math.floor(i / t.W)] as [number, number]);
    const b = boundsOf(pts);
    return b && clipRect(b, t.W, t.H, 1);
  },
  slopes(feature: SetPieceFeature, heights: ArrayLike<number>, W: number, H: number): SetPieceSlope[] {
    const p = feature.params.plan as unknown as TerracedCliffsPlan;
    const [bx, by] = STEP[p.facing];
    const high: [number, number] = [-bx, -by];
    const out: SetPieceSlope[] = [];
    // on the last row of each band, at the chain's end, the high side toward the next band (a
    // stair's chain starts on the ground in front of it)
    let below: SetPieceSlope | null = null;
    for (let j = p.stair ? 0 : 1; j < p.bands; j++) {
      // the slope stands on the band's last row, and the row behind its low side is the same band;
      // in front of a stair, the first spot across its width where the ground is flat two deep
      const vs = j === 0 ? acrossFrom(p) : [p.chainV];
      let placed: SetPieceSlope | null = null;
      for (const v of vs) {
        const [x, y] = local(p.at[0], p.at[1], p.facing, -(j * p.depth - 1), v);
        const [hx, hy] = [x + high[0], y + high[1]];
        const [lx, ly] = [x - high[0], y - high[1]];
        if (!inMap(W, H, x, y) || !inMap(W, H, hx, hy) || !inMap(W, H, lx, ly)) continue;
        // a slope's low side is ground at its level, or the slope below it in a chain (steps 1
        // deep), one this chain placed: when a brush has changed the ground at the chain's foot so
        // its first slope no longer fits, the slopes above it would join nothing (slopes.connect)
        const chained = p.depth === 1 && below !== null && below.x === lx && below.y === ly && heights[ly * W + lx] === heights[y * W + x] - 1;
        if (heights[hy * W + hx] !== heights[y * W + x] + 1 || (heights[ly * W + lx] !== heights[y * W + x] && !chained)) continue;
        placed = { x, y, high };
        break;
      }
      if (placed) out.push(placed);
      below = placed;
    }
    return out;
  },
  clears(feature: SetPieceFeature, W: number, H: number): number[] {
    return stairTiles(feature.params.plan as unknown as TerracedCliffsPlan, W, H).map(([i]) => i);
  },
  area(feature: SetPieceFeature, W: number, H: number): number[] {
    return stairTiles(feature.params.plan as unknown as TerracedCliffsPlan, W, H).map(([i]) => i);
  },
};
