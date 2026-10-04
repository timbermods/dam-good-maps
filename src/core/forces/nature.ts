// A force's character from the land and its seed (PLAN §20 D289, D309). Every force's row is Power,
// Size, at most one signature choice and Try another, with everything else behind its More button:
// Carve's wander, walls and depth; Craterize's walls, centre, debris and rays; Erupt's shape, summit,
// flows and ridges; Quake's scarp; Glaciate's benches, steps, tarn and scree. Every detail starts on Auto (absent from its settings): drawn here
// from the ground round where the force acts and the series' seed. A detail the player pinned (its
// settings already carry a value) keeps that value; nature draws only what is still absent, so Try
// another (the next seed) re-rolls only the ones still on Auto. The land leans each Auto choice:
// rugged ground carves straighter gorges between steep walls and raises steeper cones; open ground
// lets a river wander and shows an impact's rays. The drawn settings are what the force runs with and
// what its operation keeps, so a saved project replays exactly (its result is literal).

import { stream } from "../math/rng";
import type { CarveSettings } from "./carve/run";
import type { CraterSettings } from "./craterize";
import type { EruptSettings } from "./erupt";
import type { QuakeSettings } from "./quake";
import type { GlaciateSettings } from "./glaciate/model";
import type { Verb } from "./op";
import { clamp } from "./random";

/** The ground a force acts on: the map's heights and the tile it acts round. */
export interface ForceGround {
  W: number;
  H: number;
  heights: ArrayLike<number>;
  /** The tile it acts round: an origin, or a painted stroke's middle. */
  at: number;
}

/** How rugged the ground round the tile is, 0 (flat) to 1 (eight levels or more of relief within
 *  eight tiles). */
export function ruggedness(g: ForceGround, r = 8): number {
  const x0 = g.at % g.W;
  const y0 = Math.floor(g.at / g.W);
  let lo = Infinity;
  let hi = -Infinity;
  for (let y = Math.max(0, y0 - r); y <= Math.min(g.H - 1, y0 + r); y++)
    for (let x = Math.max(0, x0 - r); x <= Math.min(g.W - 1, x0 + r); x++) {
      const h = g.heights[y * g.W + x];
      if (h < lo) lo = h;
      if (h > hi) hi = h;
    }
  return hi > lo ? Math.min(1, (hi - lo) / 8) : 0;
}

const chance = (rng: { float(): number }, p: number) => rng.float() < clamp(p, 0, 1);
/** The draws for one force at one place and seed (the ground's own height and relief lean them). */
function draws(verb: string, seed: number, g: ForceGround) {
  const rough = ruggedness(g);
  return { rough, rng: stream(seed >>> 0, "nature", verb, g.at, Number(g.heights[g.at] ?? 0), Math.round(rough * 8)) };
}

/** A detail behind More, loosened so it may be absent (Auto: nature draws it) as well as set (a
 *  pin: nature leaves it, D309). */
type Draft<T, K extends keyof T> = Omit<T, K> & { [P in K]?: T[P] | null };

/** Carve's details, before nature draws the ones still on Auto (D309). */
export type CarveDraft = Draft<CarveSettings, "wander" | "walls" | "depth" | "banks">;
/** Every one of Carve's details, reset to Auto: the default for Try another when the caller sends no
 *  pins (Unleash, and callers outside the row), and what a pinned subset is applied over. */
export const AUTO_CARVE_DETAILS = { wander: null, walls: null, depth: null, banks: null } as const;

/** Carve: its wander (open ground meanders, rugged ground runs straighter), its walls (rugged
 *  ground a gorge, open ground broad terraces) and its banks (D321 item 18: open ground leaves wide
 *  farmable banks, a gorge few or none); its depth (D226: absent, it follows Power and width, the
 *  run's own default) passes through untouched either way. A carve asked for without banks (a plain
 *  caller: `banks` absent) keeps none, as before. */
export function carveNature(s: CarveDraft, g: ForceGround): CarveSettings {
  const { rough, rng } = draws("carve", s.seed ?? 0, g);
  const wander = s.wander ?? Math.round(clamp(55 - 30 * rough + rng.range(-15, 15), 5, 90) / 5) * 5;
  const walls = s.walls ?? (chance(rng, 0.3 + 0.55 * rough) ? "steep" : "wide");
  const banks = s.banks === null ? Math.round(clamp(6 - 4 * rough + rng.range(-1.5, 1.5), 1, 8)) : s.banks;
  return { ...s, wander, walls, ...(banks !== undefined ? { banks } : {}) } as CarveSettings;
}

/** Craterize's details, before nature draws the ones still on Auto (D309). */
export type CraterDraft = Draft<CraterSettings, "walls" | "centre" | "debris" | "rays">;
export const AUTO_CRATER_DETAILS = { walls: null, centre: null, debris: null, rays: null } as const;

/** Craterize: its walls, centre, debris and rays (a harder hit throws more debris; open ground
 *  shows the rays). */
export function craterNature(s: CraterDraft, g: ForceGround): CraterSettings {
  const { rough, rng } = draws("craterize", s.seed, g);
  const walls = s.walls ?? (chance(rng, 0.4) ? "steep" : "terraced");
  const centre: CraterSettings["centre"] = s.centre ?? (chance(rng, 0.75) ? "auto" : rng.pick(["bowl", "peak", "ring", "flat"] as const));
  const debris = s.debris ?? (chance(rng, 0.3 + 0.5 * (s.power / 100)) ? "heavy" : "light");
  const rays = s.rays ?? chance(rng, 0.15 + 0.3 * (1 - rough));
  return { ...s, walls, centre, debris, rays } as CraterSettings;
}

/** Erupt's details, before nature draws the ones still on Auto (D309). */
export type EruptDraft = Draft<EruptSettings, "shape" | "summit" | "flows" | "ridges">;
export const AUTO_ERUPT_DETAILS = { shape: null, summit: null, flows: null, ridges: null } as const;

/** Erupt: its shape (rugged ground a steep cone, open ground a broad shield), its summit, its flows
 *  (a stronger eruption runs further) and its ridges. */
export function eruptNature(s: EruptDraft, g: ForceGround): EruptSettings {
  const { rough, rng } = draws("erupt", s.seed, g);
  const shape = s.shape ?? (chance(rng, 0.35 + 0.45 * rough) ? "steep" : "broad");
  const summit: EruptSettings["summit"] = s.summit ?? (chance(rng, 0.7) ? "auto" : rng.pick(["peak", "crater", "caldera"] as const));
  const flows = s.flows ?? (chance(rng, 0.25 + 0.5 * (s.power / 100)) ? "heavy" : "light");
  const ridges = s.ridges ?? chance(rng, 0.5);
  return { ...s, shape, summit, flows, ridges } as EruptSettings;
}

/** Quake's details, before nature draws the ones still on Auto (D309). */
export type QuakeDraft = Draft<QuakeSettings, "scarp">;
export const AUTO_QUAKE_DETAILS = { scarp: null } as const;

/** Quake: its scarp (rugged ground breaks in one sheer cliff more often, open ground in benches). */
export function quakeNature(s: QuakeDraft, g: ForceGround): QuakeSettings {
  const { rough, rng } = draws("quake", s.seed, g);
  const scarp = s.scarp ?? (chance(rng, 0.45 + 0.35 * rough) ? "sheer" : "stepped");
  return { ...s, scarp } as QuakeSettings;
}

/** Glaciate's details, before nature draws the ones still on Auto (D309). */
export type GlaciateDraft = Draft<GlaciateSettings, "benches" | "steps" | "tarn" | "scree">;
export const AUTO_GLACIATE_DETAILS = { benches: null, steps: null, tarn: null, scree: null } as const;

/** Glaciate: its benches (rugged ground leaves more soft rock to bench), its steps (steep ground
 *  drops by more of them), a tarn in its cirque (most glaciers keep one), scree at its walls' feet
 *  (more on rugged ground). Round 4's (some, some, a tarn, scree) the likeliest. */
export function glaciateNature(s: GlaciateDraft, g: ForceGround): GlaciateSettings {
  const { rough, rng } = draws("glaciate", s.seed, g);
  const pick3 = <T>(lo: T, mid: T, hi: T, lean: number): T => {
    const u = rng.float();
    return u < 0.2 - 0.1 * lean ? lo : u > 0.8 - 0.1 * lean ? hi : mid;
  };
  const benches = s.benches ?? pick3("none", "some", "many", rough);
  const steps = s.steps ?? pick3("few", "some", "many", rough);
  const tarn = s.tarn ?? chance(rng, 0.85);
  const scree = s.scree ?? chance(rng, 0.6 + 0.3 * rough);
  return { ...s, benches, steps, tarn, scree } as GlaciateSettings;
}

/** Every detail behind `verb`'s More, reset to Auto (D309): `forceAgain`'s default when the caller
 *  sends no pins, and the base a pinned subset is applied over. */
export function autoDetailsOf(verb: Verb): Record<string, null> {
  switch (verb) {
    case "carve":
      return AUTO_CARVE_DETAILS;
    case "craterize":
      return AUTO_CRATER_DETAILS;
    case "erupt":
      return AUTO_ERUPT_DETAILS;
    case "quake":
      return AUTO_QUAKE_DETAILS;
    case "glaciate":
      return AUTO_GLACIATE_DETAILS;
  }
}
