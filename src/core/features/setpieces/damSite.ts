// Dam site (PLAN §9.1): a rock ridge across a river valley, cut by the channel, so one short dam
// across the gap holds the basin upstream. The ridge runs well past the valley floor into the
// terraces so the reservoir cannot leak round its ends, and its top stays at least two levels
// above the useful crest.
//
// The ridge is a straight band square to the valley's axis (the line from the river's source to its
// outlet), as in the prototype, so a river that runs along the axis crosses it exactly once. Each
// end runs on until it has gone SEAL tiles into ground at least as high as the useful crest
// (terrain from build step 2), so the reservoir cannot leak round it (PLAN §20, D25). A band that
// followed the river's arc position (M1) broke up on the inside of bends.
//
// `plan` takes the river and the place along it, and the crest the dam would have (1–3 useful, 4
// at most). On a map that exists (the editor), it also measures the reservoir a dam across the gap
// would hold, and says so in the report.

import * as portable from "../../math/portable";
import { damCandidate } from "../../analysis/damsites";
import { fbm } from "../../math/noise";
import { hash32 } from "../../math/hash";
import { bedAt, pathField, pointAtArc } from "../geometry";
import { boundsOf, BuildTarget, clipRect, fullRegion, type Rect } from "../target";
import type { Feature, RiverFeature, SetPieceFeature } from "../schema";
import { clampReported, fmt, nearStart, type PlanContext, type PlanOutcome, type PlanRecord } from "./common";
import type { SetPieceBuilder } from "./index";

export interface DamSitePlan {
  river: string;
  /** Arc position of the ridge centre along the river. */
  at: number;
  /** Ridge thickness along the river, in tiles. */
  thickness: number;
  /** The farthest the ridge reaches out from the river on each side, in tiles. */
  halfSpan: number;
  /** Level of the ridge top. */
  topLevel: number;
  /** Useful dam crest above the river bed, 1–3 (PLAN §9.1). */
  crest: number;
  /** Wiggle of the ridge faces, in tiles. */
  wobble: number;
}

/** Tiles the ridge runs on into ground above the crest. */
const SEAL = 4;
/** The ridge's thickness along the river and the wiggle of its faces, in tiles. */
const THICKNESS = 5;
const WOBBLE = 1.25;

export const damSite: SetPieceBuilder = {
  kind: "damSite",
  request: {
    type: "object",
    required: ["river", "at"],
    properties: {
      river: { type: "string" },
      at: { type: "number", minimum: 0 },
      crest: { type: "integer", minimum: 1, maximum: 15 },
      thickness: { type: "integer", minimum: 1, maximum: 20 },
    },
  },
  limits: () => ({
    crest: { min: 1, max: 4, typical: [1, 3] },
    thickness: { min: 3, max: 6 },
    topLevel: { min: 2, max: 16 },
  }),
  plan(req: PlanRecord, ctx: PlanContext, id: string | null): PlanOutcome {
    const river = ctx.features.find((f): f is RiverFeature => f.kind === "river" && f.id === req.river);
    if (!river) return { ok: false, errors: [`there is no river ${String(req.river)} to put the dam site on`] };
    const report: string[] = [];
    const at = Math.round(Number(req.at) * 100) / 100;
    const bed = bedAt(river.params.bedProfile, at);
    // a useful crest is 1–3 levels, 4 at most (PLAN §9.1); the ridge stands 3 above the crest and
    // never above 16
    let crest = clampReported("Crest", Number(req.crest ?? 2), { min: 1, max: 4 }, report, "a dam uses (pumps reach 2–6 levels down)");
    if (bed + crest + 2 > 16) {
      const c = 14 - bed;
      if (c < 1) return { ok: false, errors: ["the river's bed is too high here for a ridge above the crest (level 16 is the limit)"] };
      report.push(`crest ${crest} reduced to ${c}: the ridge above it must stay at level 16 or below`);
      crest = c;
    }
    const thickness = clampReported("Ridge thickness", Number(req.thickness ?? THICKNESS), { min: 3, max: 6 }, report, "a dam site has (PLAN §9.1)");
    const plan: DamSitePlan = { river: river.id, at, thickness, halfSpan: Math.max(ctx.W, ctx.H), topLevel: Math.min(16, bed + crest + 3), crest, wobble: WOBBLE };
    const c = pointAtArc(river.params.path, at).p;
    if (nearStart(ctx, Math.round(c[0]), Math.round(c[1]), plan.thickness)) return { ok: false, errors: ["it would cover the start's area: place it farther from the start"] };
    // the reservoir behind a dam across the gap, measured on the map with the ridge built (the
    // macro layout of a generation has no terrain yet: nothing to measure)
    if (ctx.heights.length === ctx.W * ctx.H) {
      const held = reservoirOf(plan, river, ctx, id);
      if (held) {
        const cap = Math.floor(0.15 * ctx.W * ctx.H);
        report.push(`a dam ${held.length} tiles long across the gap, ${crest} high, holds about ${fmt(Math.round(held.volume))} blocks of water over ${held.area} tiles`);
        if (held.area > cap) report.push(`the reservoir covers more than 15% of the map (${cap} tiles), more than a dam site plans for`);
      } else report.push("a dam across the gap would not hold water here: it reaches a map edge or walks round the dam");
    }
    return { ok: true, request: req, plan: plan as unknown as PlanRecord, report };
  },
  check(plan: PlanRecord, W: number, H: number): string[] {
    const p = plan as unknown as DamSitePlan;
    if (typeof p.river !== "string" || typeof p.at !== "number") return ["a dam site needs its river and place"];
    if (!(p.thickness >= 1 && p.thickness <= 20) || !(p.wobble >= 0 && p.wobble <= 4)) return ["the ridge is 1–20 tiles thick with a wobble of at most 4"];
    if (!Number.isInteger(p.topLevel) || p.topLevel < 1 || p.topLevel > 16) return ["the ridge top is at level 1–16"];
    if (!Number.isInteger(p.crest) || p.crest < 1 || p.crest > 15) return ["the crest is 1–15 levels"];
    if (!(p.halfSpan >= 1 && p.halfSpan <= Math.max(W, H) * 2)) return ["the ridge's reach is 1 to twice the map side"];
    return [];
  },
  rasterize(feature: SetPieceFeature, t: BuildTarget): void {
    const p = feature.params.plan as unknown as DamSitePlan;
    const river = t.river(p.river);
    if (!river) return;
    const field = t.pathField(p.river);
    const channelHalf = river.params.width / 2;
    const noiseSeed = hash32(t.seed, feature.id, "wobble");
    const { W, H, heights } = t;
    const path = river.params.path;
    const c = pointAtArc(path, p.at).p;
    const ax = path[path.length - 1][0] - path[0][0];
    const ay = path[path.length - 1][1] - path[0][1];
    const al = portable.sqrt(ax * ax + ay * ay) || 1;
    const tx = ax / al; // along the valley axis
    const ty = ay / al;
    const nx = -ty; // across it
    const ny = tx;
    const high = bedAt(river.params.bedProfile, p.at) + p.crest; // ground at the crest holds the water
    const half = p.thickness / 2 + p.wobble;
    // how far the ridge reaches on each side: SEAL tiles into high ground, at most halfSpan
    const reach = [0, 0];
    for (let side = 0; side < 2; side++) {
      const sgn = side === 0 ? 1 : -1;
      let run = 0;
      let k = Math.ceil(channelHalf);
      for (; k < p.halfSpan; k++) {
        let inside = true;
        let allHigh = true;
        for (let a = -Math.ceil(half); a <= Math.ceil(half); a++) {
          const x = Math.round(c[0] + sgn * k * nx + a * tx);
          const y = Math.round(c[1] + sgn * k * ny + a * ty);
          if (x < 0 || x >= W || y < 0 || y >= H) {
            inside = false;
            break;
          }
          if (heights[y * W + x] < high) allHigh = false;
        }
        if (!inside) break;
        run = allHigh ? run + 1 : 0;
        if (run >= SEAL) break;
      }
      reach[side] = k;
    }
    t.forEach((i, x, y) => {
      if (field.d[i] < channelHalf + 0.5 || !t.writable(i, feature)) return;
      const along = (x - c[0]) * tx + (y - c[1]) * ty;
      if (Math.abs(along) > half) return;
      const across = (x - c[0]) * nx + (y - c[1]) * ny;
      if (across > reach[0] || -across > reach[1]) return;
      const wob = p.wobble * fbm(noiseSeed, x, y, 24, 3);
      if (Math.abs(along + wob) > p.thickness / 2) return;
      if (heights[i] < p.topLevel) heights[i] = p.topLevel;
      t.protect(i);
    });
  },
  // the ridge's ends are found by reading the terrain along the whole band, and it is written
  // within it: a rebuild that touches the band rebuilds all of it
  footprint(feature: SetPieceFeature, t: Pick<BuildTarget, "W" | "H" | "river">): Rect | "all" | null {
    return damBand(feature, t);
  },
  area(feature: SetPieceFeature, W: number, H: number, features: readonly Feature[]): number[] {
    const p = feature.params.plan as unknown as DamSitePlan;
    const river = features.find((f): f is RiverFeature => f.kind === "river" && f.id === p.river);
    if (!river) return [];
    const { p: c, normal } = pointAtArc(river.params.path, p.at);
    const half = Math.ceil(river.params.width / 2) + 2;
    const out: number[] = [];
    for (let k = -half; k <= half; k++) {
      const x = Math.round(c[0] + normal[0] * k);
      const y = Math.round(c[1] + normal[1] * k);
      if (x >= 0 && y >= 0 && x < W && y < H) out.push(y * W + x);
    }
    return out;
  },
};

/** The rectangle around every tile the dam site reads or writes: the band across the valley
 *  through the ridge centre, as far as it may reach (halfSpan), plus the wobble. */
export function damBand(feature: SetPieceFeature, t: Pick<BuildTarget, "W" | "H" | "river">): Rect | null {
  const p = feature.params.plan as unknown as DamSitePlan;
  const river = t.river(p.river);
  if (!river) return null;
  const path = river.params.path;
  const c = pointAtArc(path, p.at).p;
  const ax = path[path.length - 1][0] - path[0][0];
  const ay = path[path.length - 1][1] - path[0][1];
  const al = portable.sqrt(ax * ax + ay * ay) || 1;
  const tx = ax / al;
  const ty = ay / al;
  const nx = -ty;
  const ny = tx;
  const a = Math.ceil(p.thickness / 2 + p.wobble) + 2;
  const corners: [number, number][] = [];
  for (const s of [-p.halfSpan - 1, p.halfSpan + 1]) for (const u of [-a, a]) corners.push([c[0] + s * nx + u * tx, c[1] + s * ny + u * ty]);
  return clipRect(boundsOf(corners)!, t.W, t.H, 2);
}

/** The reservoir a dam across the ridge's gap would hold, measured on the planning map with the
 *  ridge rasterized on it: the dam line runs across the valley through the channel tile at the
 *  ridge's centre, and the flood must not reach a map edge or walk round the dam. */
export function reservoirOf(plan: DamSitePlan, river: RiverFeature, ctx: PlanContext, id: string | null): { length: number; area: number; volume: number; line: [number, number][]; bed: number } | null {
  const { W, H } = ctx;
  const heights = ctx.heights.slice();
  const feature = { id: id ?? "planning", kind: "setPiece", origin: "user", locked: false, params: { kind: "damSite", request: {}, plan: plan as unknown as PlanRecord, report: [] } } as SetPieceFeature;
  const t = new BuildTarget({ W, H, seed: ctx.seed, features: ctx.features, heights, protectedMask: new Uint8Array(W * H), channel: new Uint8Array(W * H), region: fullRegion(W, H) });
  damSite.rasterize(feature, t);
  const path = river.params.path;
  const field = pathField(path, W, H);
  const half = river.params.width / 2;
  // the channel tile nearest the ridge's centre: the dam stands on the bed there
  let at = -1;
  let best = Infinity;
  for (let i = 0; i < W * H; i++) {
    if (field.d[i] >= half) continue;
    const d = Math.abs(field.s[i] - plan.at) + 0.01 * field.d[i];
    if (d < best) {
      best = d;
      at = i;
    }
  }
  if (at < 0) return null;
  // the dam runs across the valley: of the four dam directions (dy, dx), the one most square to
  // the valley's axis
  const ax = path[path.length - 1][0] - path[0][0];
  const ay = path[path.length - 1][1] - path[0][1];
  const dirs: [number, number][] = [[1, 0], [0, 1], [1, 1], [1, -1]];
  let dir = dirs[0];
  let least = Infinity;
  for (const d of dirs) {
    const dot = Math.abs(d[1] * ax + d[0] * ay) / portable.sqrt(d[0] * d[0] + d[1] * d[1]);
    if (dot < least) {
      least = dot;
      dir = d;
    }
  }
  // the upstream side is the higher one: the flood starts there
  const surface = new Float64Array(W * H);
  for (let i = 0; i < W * H; i++) surface[i] = field.d[i] < half ? heights[i] + (field.s[i] < plan.at ? 0.5 : 0) : heights[i];
  const stamp = { seen: new Int32Array(W * H), mark: 0, queue: new Int32Array(W * H) };
  const x = at % W;
  const y = (at - x) / W;
  const site = damCandidate(heights, surface, W, H, x, y, dir[0], dir[1], plan.crest, stamp, 20, Math.max(6000, Math.floor(0.3 * W * H)));
  if (!site) return null;
  // the dam's tiles: from the bed tile each way until the ground reaches the crest
  const crest = heights[at] + plan.crest;
  const line: [number, number][] = [[x, y]];
  for (const sgn of [1, -1])
    for (let k = 1; k <= 20; k++) {
      const xx = x + sgn * k * dir[1];
      const yy = y + sgn * k * dir[0];
      if (xx < 0 || yy < 0 || xx >= W || yy >= H || heights[yy * W + xx] >= crest) break;
      line.push([xx, yy]);
    }
  line.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return { length: site.length, area: site.area, volume: site.volume, line, bed: heights[at] };
}
