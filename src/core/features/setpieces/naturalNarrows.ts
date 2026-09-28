// A natural narrows on a river (#63: no Dam site tool in the editor; D111: dam opportunities are the
// land's own): two hillside spurs close in on the river from its two banks (land/narrows.ts, design
// version 2's builder), so a short dam across the gap they leave holds the river back. It never
// reads as a wall: the plan refuses a result the dam-wall check flags. No editor tool places it;
// it is the operation M12's Claude asks for (docs/m9-design.md §16, place_narrows).
//
// The plan stores the ground the spurs raise, tile by tile, so a rebuild never plans again.

import { hash32 } from "../../math/hash";
import { polygonMask } from "../geometry";
import { planNarrows } from "../../land/narrows";
import type { SetPieceFeature } from "../schema";
import { clipRect, type BuildTarget, type Rect } from "../target";
import type { PlanContext, PlanOutcome, PlanRecord } from "./common";
import type { SetPieceBuilder } from "./index";

export interface NarrowsPlan {
  river: string;
  at: number;
  /** The raised tiles and their levels, in step. */
  tiles: number[];
  levels: number[];
  /** Tiles across the channel the spurs leave open. */
  gap: number;
  /** The channel tile at the narrows (its middle). */
  x: number;
  y: number;
}

function planIt(req: PlanRecord, ctx: PlanContext, id: string | null): PlanOutcome {
  const { W, H } = ctx;
  const river = ctx.features.find((f) => f.id === req.river);
  if (!river || river.kind !== "river") return { ok: false, errors: ["pick a river"] };
  const at = typeof req.at === "number" ? req.at : 0.5;
  if (!(at >= 0 && at <= 1)) return { ok: false, errors: ["at is where along the river, 0 at its head to 1 at its end"] };
  const reach = typeof req.reach === "number" ? req.reach : 0.8;
  const rise = typeof req.rise === "number" ? Math.round(req.rise) : 2;
  // the water the spurs keep out of: the settled water when the context has it, else the river
  // channels and the lakes
  let water: ArrayLike<number> | null = ctx.water ?? null;
  if (!water) {
    const w = new Float64Array(W * H);
    if (ctx.channel) for (let i = 0; i < W * H; i++) if (ctx.channel[i]) w[i] = 1;
    for (const f of ctx.features) if (f.kind === "lake") polygonMask(f.params.outline, W, H).forEach((v, i) => v && (w[i] = 1));
    water = w;
  }
  const seed = hash32(ctx.seed, "naturalNarrows", id ?? String(req.river), Math.round(at * 1000));
  const p = planNarrows(ctx.heights, W, H, water, { path: river.params.path, width: river.params.width, at, reach, rise, seed });
  if (!p.ok) return { ok: false, errors: p.errors };
  if (ctx.locked) for (const i of p.raise.keys()) if (ctx.locked[i]) return { ok: false, errors: ["the spurs would reach into a locked area"] };
  if (ctx.start)
    for (const i of p.raise.keys()) {
      const x = i % W;
      const y = (i - x) / W;
      if (Math.abs(x - ctx.start.x) <= ctx.start.radius && Math.abs(y - ctx.start.y) <= ctx.start.radius) return { ok: false, errors: ["the spurs would reach the start"] };
    }
  const tiles = [...p.raise.keys()].sort((a, c) => a - c);
  // the channel's middle at the narrows
  let cx = 0;
  let cy = 0;
  let best = Infinity;
  const L = river.params.path.reduce((s, q, k, a) => (k ? s + Math.hypot(q[0] - a[k - 1][0], q[1] - a[k - 1][1]) : 0), 0);
  let acc = 0;
  for (let k = 1; k < river.params.path.length; k++) {
    const [ax, ay] = river.params.path[k - 1];
    const [bx, by] = river.params.path[k];
    const l = Math.hypot(bx - ax, by - ay);
    const want = at * L;
    if (acc + l >= want && l > 0 && best === Infinity) {
      const u = (want - acc) / l;
      cx = Math.round(ax + u * (bx - ax));
      cy = Math.round(ay + u * (by - ay));
      best = 0;
    }
    acc += l;
  }
  const plan: NarrowsPlan = { river: String(req.river), at, tiles, levels: tiles.map((i) => p.raise.get(i)!), gap: p.gap, x: Math.min(W - 1, Math.max(0, cx)), y: Math.min(H - 1, Math.max(0, cy)) };
  return { ok: true, request: req, plan: plan as unknown as PlanRecord, report: [...p.report, `the river keeps a gap of ${p.gap} tiles between the spurs: a dam across it is the player's to build`] };
}

export const naturalNarrows: SetPieceBuilder = {
  kind: "naturalNarrows",
  request: {
    type: "object",
    required: ["river"],
    properties: {
      river: { type: "string" },
      at: { type: "number", minimum: 0, maximum: 1 },
      reach: { type: "number", minimum: 0.5, maximum: 1 },
      rise: { type: "integer", minimum: 1, maximum: 4 },
    },
  },
  limits: () => ({ at: { min: 0, max: 1 }, reach: { min: 0.5, max: 1 }, rise: { min: 1, max: 4 } }),
  plan: (req: PlanRecord, ctx: PlanContext, id: string | null) => planIt(req, ctx, id),
  check(plan: PlanRecord, W: number, H: number): string[] {
    const p = plan as unknown as NarrowsPlan;
    if (!Array.isArray(p.tiles) || !Array.isArray(p.levels) || p.tiles.length !== p.levels.length) return ["the narrows' tiles and levels must match"];
    for (let k = 0; k < p.tiles.length; k++) {
      const i = p.tiles[k];
      if (!Number.isInteger(i) || i < 0 || i >= W * H) return ["the narrows' tiles must be on the map"];
      if (!Number.isInteger(p.levels[k]) || p.levels[k] < 1 || p.levels[k] > 22) return ["the narrows' levels are 1–22"];
    }
    return [];
  },
  rasterize(feature: SetPieceFeature, t: BuildTarget): void {
    const p = feature.params.plan as unknown as NarrowsPlan;
    for (let k = 0; k < p.tiles.length; k++) {
      const i = p.tiles[k];
      if (!t.inRegion(i) || !t.writable(i, feature)) continue;
      if (t.heights[i] < p.levels[k]) t.heights[i] = p.levels[k];
    }
  },
  footprint(feature: SetPieceFeature, t: Pick<BuildTarget, "W" | "H">): Rect | "all" | null {
    const p = feature.params.plan as unknown as NarrowsPlan;
    if (!p.tiles.length) return null;
    let x0 = t.W;
    let y0 = t.H;
    let x1 = -1;
    let y1 = -1;
    for (const i of p.tiles) {
      const x = i % t.W;
      const y = (i - x) / t.W;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
    return clipRect({ x0, y0, x1, y1 }, t.W, t.H, 1);
  },
  area(feature: SetPieceFeature): number[] {
    return (feature.params.plan as unknown as NarrowsPlan).tiles.slice();
  },
};
