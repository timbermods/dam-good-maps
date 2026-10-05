// The forces' settings the viewer pinned, kept between visits.

import { RIVER_DEPTH_DEFAULT, type CarveUi } from "../CarveRow";
import type { CraterUi, EruptUi, QuakeUi } from "../ForceRows";
import type { DepositUi, GlaciateUi, RiftUi } from "../ForceRows";
import type { Verb } from "../../core/forces/op";
import { FLOOR_DEFAULT, floorProblem } from "../../core/forces/floor";

export const FORCES_KEY = "dgm.forces";

/** Each force's More (open or closed), and the details the player has pinned (D309); a detail still
 *  on Auto is null. Power, Size, dry and mode last only the visit, as before. */
export interface ForcesPrefs {
  /** Slow forces (D321, item 29): off, Fast. */
  watch: boolean;
  /** The forces' Floor (D321, item 40): 1 unless set. */
  floor: number;
  more: Partial<Record<Verb, boolean>>;
  carve: Pick<CarveUi, "wander" | "walls" | "depth" | "riverDepth" | "banks" | "maturity">;
  craterize: Pick<CraterUi, "walls" | "centre" | "debris" | "rays">;
  erupt: Pick<EruptUi, "shape" | "summit" | "flows" | "ridges">;
  quake: Pick<QuakeUi, "scarp">;
  glaciate: Pick<GlaciateUi, "benches" | "steps" | "tarn" | "scree">;
  rift: Pick<RiftUi, "walls">;
  deposit: Pick<DepositUi, "channels">;
}

export const AUTO_FORCES_PREFS: ForcesPrefs = {
  watch: false,
  floor: FLOOR_DEFAULT,
  more: {},
  carve: { wander: null, walls: null, depth: null, riverDepth: RIVER_DEPTH_DEFAULT, banks: null, maturity: "young" },
  craterize: { walls: null, centre: null, debris: null, rays: null },
  erupt: { shape: null, summit: null, flows: null, ridges: null },
  quake: { scarp: null },
  glaciate: { benches: null, steps: null, tarn: null, scree: null },
  rift: { walls: null },
  deposit: { channels: null },
};

/** `v` if it is one of `options`, else `null` (a detail left on Auto: a stray or outdated value
 *  never reaches the row). */
export function among<T>(v: unknown, options: readonly T[]): T | null {
  return (options as readonly unknown[]).includes(v) ? (v as T) : null;
}

export function loadForcesPrefs(): ForcesPrefs {
  try {
    const s = JSON.parse(localStorage.getItem(FORCES_KEY) ?? "null") as Partial<{ watch: unknown; floor: unknown; more: unknown; carve: Record<string, unknown>; craterize: Record<string, unknown>; erupt: Record<string, unknown>; quake: Record<string, unknown>; glaciate: Record<string, unknown>; rift: Record<string, unknown>; deposit: Record<string, unknown> }> | null;
    if (!s) return AUTO_FORCES_PREFS;
    const more: Partial<Record<Verb, boolean>> = {};
    if (s.more && typeof s.more === "object") for (const v of ["carve", "craterize", "erupt", "quake", "glaciate", "rift", "deposit"] as const) if ((s.more as Record<string, unknown>)[v] === true) more[v] = true;
    return {
      watch: s.watch === true,
      floor: floorProblem(s.floor) === null && typeof s.floor === "number" ? s.floor : FLOOR_DEFAULT,
      more,
      carve: {
        wander: typeof s.carve?.wander === "number" ? s.carve.wander : null,
        walls: among(s.carve?.walls, ["steep", "wide"]),
        depth: typeof s.carve?.depth === "number" ? s.carve.depth : null,
        riverDepth: s.carve?.riverDepth === null ? null : typeof s.carve?.riverDepth === "number" && Number.isInteger(s.carve.riverDepth) && s.carve.riverDepth >= 1 && s.carve.riverDepth <= 22 ? s.carve.riverDepth : RIVER_DEPTH_DEFAULT,
        banks: typeof s.carve?.banks === "number" && s.carve.banks >= 0 && s.carve.banks <= 10 ? s.carve.banks : null,
        // (Young unless Mature or Auto was chosen)
        maturity: s.carve?.maturity === null ? null : s.carve?.maturity === "mature" ? "mature" : "young",
      },
      craterize: { walls: among(s.craterize?.walls, ["steep", "terraced"]), centre: among(s.craterize?.centre, ["auto", "bowl", "peak", "ring", "flat"]), debris: among(s.craterize?.debris, ["light", "heavy"]), rays: typeof s.craterize?.rays === "boolean" ? s.craterize.rays : null },
      erupt: { shape: among(s.erupt?.shape, ["steep", "broad"]), summit: among(s.erupt?.summit, ["auto", "peak", "crater", "caldera"]), flows: among(s.erupt?.flows, ["light", "heavy"]), ridges: typeof s.erupt?.ridges === "boolean" ? s.erupt.ridges : null },
      quake: { scarp: among(s.quake?.scarp, ["sheer", "stepped"]) },
      glaciate: { benches: among(s.glaciate?.benches, ["none", "some", "many"]), steps: among(s.glaciate?.steps, ["few", "some", "many"]), tarn: typeof s.glaciate?.tarn === "boolean" ? s.glaciate.tarn : null, scree: typeof s.glaciate?.scree === "boolean" ? s.glaciate.scree : null },
      rift: { walls: among(s.rift?.walls, ["sheer", "stepped"]) },
      deposit: { channels: among(s.deposit?.channels, ["few", "many"]) },
    };
  } catch {
    return AUTO_FORCES_PREFS;
  }
}

export function saveForcesPrefs(p: ForcesPrefs): void {
  try {
    localStorage.setItem(FORCES_KEY, JSON.stringify(p));
  } catch {
    // the pins last for this visit only
  }
}
