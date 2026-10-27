// What the set-piece builders share (PLAN §19.3): the context a plan is made in, a request's point,
// the plain-words numbers of a report, and the map's flow budget (the settings page shows it).

import { density } from "../../gen/calibrated";
import featuresSchema from "../features.schema.json" with { type: "json" };
import type { Feature, Point } from "../schema";

/** The map a plan is made on (PLAN §19.3 `BuildContext`): the generation's map once its ground and
 *  water are built (a second district's site is planned last). */
export interface PlanContext {
  W: number;
  H: number;
  seed: number;
  features: readonly Feature[];
  /** The surface the piece is planned on. */
  heights: Uint8Array;
  /** River channel tiles of that surface, when known. */
  channel?: Uint8Array | null;
  /** The start's centre: a builder never moves it and keeps off its zone. */
  start?: { x: number; y: number; radius: number } | null;
  /** The settled water, when the map has it (a second district's site looks for water to pump). */
  water?: ArrayLike<number> | null;
  contamination?: ArrayLike<number> | null;
}

/** A value a plan resolved, or asked for: numbers, words, flags and flat lists of numbers. */
export type PlanValue = number | string | boolean | number[];
export type PlanRecord = Record<string, PlanValue>;

export type PlanOutcome = { ok: true; request: PlanRecord; plan: PlanRecord; report: string[] } | { ok: false; errors: string[] };

/** The map's Normal flow budget in blocks per second (PLAN §5.3, §9.10): the size-aware official
 *  median of clean source strength. 48² 1.2, 96² 3.0, 128² 3.6, 192² 4.4, 256² 7.2. */
export function flowBudget(W: number, H: number): number {
  const area = W * H;
  return Math.round(density("water_strength_per_10k", area) * (area / 1e4) * 100) / 100;
}

export function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}

export function inMap(W: number, H: number, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < W && y < H;
}

/** A request's point (a tile it is asked at): the feature schema's own point, with the same bounds. */
export const POINT_SCHEMA: Record<string, unknown> = featuresSchema.$defs.point;

export function pointOf(v: PlanValue | undefined): Point | null {
  return Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === "number" && Number.isFinite(n)) ? [v[0], v[1]] : null;
}
