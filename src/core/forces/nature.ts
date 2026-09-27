// A force's character from the land and its seed (PLAN §20 D289). Every force's row is Power, Size,
// at most one signature choice and Try another; what used to be a control (Carve's wander and walls;
// Craterize's walls, centre, debris and rays; Erupt's shape, summit, flows and ridges; Quake's scarp)
// is natural variation drawn here, from the ground round where the force acts and the series' seed,
// so Try another (the next seed) re-rolls it. The land leans each choice: rugged ground carves
// straighter gorges with steep walls and raises steeper cones; open ground lets a river wander and
// shows an impact's rays. The drawn settings are what the force runs with and what its operation
// keeps, so a saved project replays exactly (its result is literal).

import { stream } from "../math/rng";
import type { CarveSettings } from "./carve/run";
import type { CraterSettings } from "./craterize";
import type { EruptSettings } from "./erupt";
import type { QuakeSettings } from "./quake";

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

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const chance = (rng: { float(): number }, p: number) => rng.float() < clamp(p, 0, 1);
/** The draws for one force at one place and seed (the ground's own height and relief lean them). */
function draws(verb: string, seed: number, g: ForceGround) {
  const rough = ruggedness(g);
  return { rough, rng: stream(seed >>> 0, "nature", verb, g.at, Number(g.heights[g.at] ?? 0), Math.round(rough * 8)) };
}

/** Carve: its wander (open ground meanders, rugged ground runs straighter) and its walls (rugged
 *  ground a gorge, open ground broad terraces); its depth follows its Power and width. */
export function carveNature(s: CarveSettings, g: ForceGround): CarveSettings {
  const { rough, rng } = draws("carve", s.seed ?? 0, g);
  const wander = Math.round(clamp(55 - 30 * rough + rng.range(-15, 15), 5, 90) / 5) * 5;
  const walls = chance(rng, 0.3 + 0.55 * rough) ? "steep" : "wide";
  const { depth: _depth, ...rest } = s as CarveSettings & { depth?: number | null };
  return { ...rest, wander, walls };
}

/** Craterize: its walls, centre, debris and rays (a harder hit throws more debris; open ground
 *  shows the rays). */
export function craterNature(s: CraterSettings, g: ForceGround): CraterSettings {
  const { rough, rng } = draws("craterize", s.seed, g);
  const walls = chance(rng, 0.4) ? "steep" : "terraced";
  const centre: CraterSettings["centre"] = chance(rng, 0.75) ? "auto" : rng.pick(["bowl", "peak", "ring", "flat"] as const);
  const debris = chance(rng, 0.3 + 0.5 * (s.power / 100)) ? "heavy" : "light";
  const rays = chance(rng, 0.15 + 0.3 * (1 - rough));
  return { ...s, walls, centre, debris, rays };
}

/** Erupt: its shape (rugged ground a steep cone, open ground a broad shield), its summit, its flows
 *  (a stronger eruption runs further) and its ridges. */
export function eruptNature(s: EruptSettings, g: ForceGround): EruptSettings {
  const { rough, rng } = draws("erupt", s.seed, g);
  const shape = chance(rng, 0.35 + 0.45 * rough) ? "steep" : "broad";
  const summit: EruptSettings["summit"] = chance(rng, 0.7) ? "auto" : rng.pick(["peak", "crater", "caldera"] as const);
  const flows = chance(rng, 0.25 + 0.5 * (s.power / 100)) ? "heavy" : "light";
  const ridges = chance(rng, 0.5);
  return { ...s, shape, summit, flows, ridges };
}

/** Quake: its scarp (rugged ground breaks in one sheer cliff more often, open ground in benches). */
export function quakeNature(s: QuakeSettings, g: ForceGround): QuakeSettings {
  const { rough, rng } = draws("quake", s.seed, g);
  return { ...s, scarp: chance(rng, 0.45 + 0.35 * rough) ? "sheer" : "stepped" };
}
