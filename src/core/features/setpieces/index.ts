// Shared set-piece builders (PLAN §19.3): one module per kind, used by the generator's planner, the
// editor's tools and Claude's proposals alike.
// - `request` holds the hard bounds of what may be asked (a JSON Schema): outside them, rejected.
// - `limits` publishes the ranges this map allows (PLAN §9.10).
// - `plan` resolves a request on a map (the macro layout in generation, the current map in the
//   editor): its anchor and footprint, every value reduced to what the map allows, and a report of
//   every reduction, of what it clears and of every source it adds. A builder never moves the start
//   or touches a locked region: when it would have to, the plan fails with the reason.
// - `rasterize` builds the stored plan and never plans again (PLAN §19.7): a rebuild gives the same
//   map. `check` rejects a stored plan outside the hard bounds (an operation may bring one).

import type { Orientation } from "../../format/footprints";
import { checkSchema } from "../../spec/schema";
import type { BuildTarget, Rect } from "../target";
import type { Feature, Origin, SetPieceFeature, SetPieceKind } from "../schema";
import { badwaterBasin } from "./badwaterBasin";
import type { AchievableRanges, PlanContext, PlanOutcome, PlanRecord } from "./common";
import { damSite } from "./damSite";
import { gorge } from "./gorge";
import { naturalNarrows } from "./naturalNarrows";
import { obstaclePayoff } from "./obstaclePayoff";
import { plugSpillway } from "./plugSpillway";
import { secondDistrict } from "./secondDistrict";
import { terracedCliffs } from "./terracedCliffs";
import { waterfall } from "./waterfall";

export type { AchievableRanges, PlanContext, PlanOutcome, PlanRecord, PlanValue } from "./common";
export { clampReported, flowBudget } from "./common";

/** A water source a set piece adds (build step 9), at Cw0 with its Coordinates at (x, y). */
export interface SetPieceSource {
  template: "WaterSource" | "BadwaterSource";
  x: number;
  y: number;
  strength: number;
  /** Tiles it covers relative to (x, y); they are kept free of slopes and resources. */
  tiles: [number, number][];
}

/** A 1×1 object a set piece places itself (a spillway's Blockage plug), at build step 9 with the
 *  map objects; `turn` picks its orientation (Cw0…Cw270), as the map editor turns them at random. */
export interface SetPieceBlock {
  template: string;
  x: number;
  y: number;
  turn: number;
  flipped: boolean;
}

/** A slope a set piece places itself (a stair notch, a chain up terraces), on the low tile (x, y),
 *  its high side toward (x + high[0], y + high[1]). Its level is read on the built terrain. */
export interface SetPieceSlope {
  x: number;
  y: number;
  high: [number, number];
}

export interface SetPieceBuilder {
  kind: SetPieceKind;
  /** Hard bounds of a request (JSON Schema). */
  request: Record<string, unknown>;
  limits(ctx: PlanContext, req?: PlanRecord): AchievableRanges;
  /** Resolve a request. `id` is the feature's own id when it is planned again (an edit). */
  plan(req: PlanRecord, ctx: PlanContext, id: string | null): PlanOutcome;
  /** Problems of a stored plan against the hard bounds (empty when it may be built). */
  check(plan: PlanRecord, W: number, H: number): string[];
  rasterize(feature: SetPieceFeature, target: BuildTarget): void;
  /** Every tile the rasterizer reads or writes (a dirty-region rebuild widens to it), or "all". */
  footprint(feature: SetPieceFeature, target: Pick<BuildTarget, "W" | "H" | "river">): Rect | "all" | null;
  /** The sources the set piece adds, if any. */
  sources?(feature: SetPieceFeature): SetPieceSource[];
  /** Objects it places itself (a spillway's plug). */
  blocks?(feature: SetPieceFeature): SetPieceBlock[];
  /** The slopes it places itself, read on the built terrain. */
  slopes?(feature: SetPieceFeature, heights: ArrayLike<number>, W: number, H: number, features: readonly Feature[]): SetPieceSlope[];
  /** Tiles kept free of trees, bushes and ruins (its body and channels). */
  clears?(feature: SetPieceFeature, W: number, H: number, features: readonly Feature[]): number[];
  /** Tiles the editor shows as the piece. */
  area?(feature: SetPieceFeature, W: number, H: number, features: readonly Feature[]): number[];
}

export const BUILDERS: Partial<Record<SetPieceKind, SetPieceBuilder>> = {
  badwaterBasin,
  damSite,
  gorge,
  naturalNarrows,
  obstaclePayoff,
  plugSpillway,
  secondDistrict,
  terracedCliffs,
  waterfall,
};

/** Set-piece kinds this version builds. */
export const BUILT_KINDS = Object.keys(BUILDERS) as SetPieceKind[];

/** The orientation of a slope from its high side: Cw0 south, Cw90 west, Cw180 north, Cw270 east. */
export function orientationForHigh(dx: number, dy: number): Orientation {
  if (dx === 0 && dy === -1) return "Cw0";
  if (dx === -1 && dy === 0) return "Cw90";
  if (dx === 0 && dy === 1) return "Cw180";
  return "Cw270";
}

export type PlannedSetPiece = { ok: true; feature: SetPieceFeature } | { ok: false; errors: string[] };

/** Plan a set piece as a feature (PLAN §19.3): the request checked against the builder's hard
 *  bounds, then resolved on the map. `id` and `origin` are the feature's; an edit passes the id of
 *  the feature it plans again. */
export function planSetPiece(kind: SetPieceKind, request: PlanRecord, ctx: PlanContext, feature: { id: string; origin: Origin; role?: string; locked?: boolean }, replanning = false): PlannedSetPiece {
  const b = BUILDERS[kind];
  if (!b) return { ok: false, errors: [`${kind} set pieces are not built by this version`] };
  const errors = checkSchema(b.request, request).map((e) => `${kind}${e.path}: ${e.message}`);
  if (errors.length) return { ok: false, errors };
  const r = b.plan(request, ctx, replanning ? feature.id : null);
  if (!r.ok) return r;
  return {
    ok: true,
    feature: {
      id: feature.id,
      kind: "setPiece",
      origin: feature.origin,
      ...(feature.role ? { role: feature.role } : {}),
      locked: feature.locked ?? false,
      params: { kind, request: r.request, plan: r.plan, report: r.report },
    },
  };
}

/** Why a set-piece feature cannot be built as it stands (its request or plan out of bounds). */
export function checkSetPiece(f: SetPieceFeature, W: number, H: number): string[] {
  const b = BUILDERS[f.params.kind];
  if (!b) return [`${f.params.kind} set pieces are not built by this version`];
  const errors = checkSchema(b.request, f.params.request).map((e) => `request${e.path}: ${e.message}`);
  if (errors.length) return errors;
  return b.check(f.params.plan, W, H);
}
