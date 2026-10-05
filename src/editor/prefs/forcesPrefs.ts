// The forces' settings the viewer pinned, kept between visits.

import { RIVER_DEPTH_DEFAULT, type CarveUi } from "../CarveRow";
import type { CraterUi, EruptUi, QuakeUi } from "../ForceRows";
import type { DepositUi, GlaciateUi, RiftUi } from "../ForceRows";
import type { Verb } from "../../core/forces/op";
import { FLOOR_DEFAULT, floorProblem } from "../../core/forces/floor";
import { SOURCES_DEFAULT, type ForceSources } from "../ForceRows";

export const FORCES_KEY = "dgm.forces";

/** Each force's More (open or closed), and the details the player has pinned (D309); a detail still
 *  on Auto is null. Power, Size, dry and mode last only the visit, as before. */
export interface ForcesPrefs {
  /** Slow forces (D321, item 29): off, Fast. */
  watch: boolean;
  /** The forces' Floor (D321, item 40): 1 unless set. */
  floor: number;
  more: Partial<Record<Verb, boolean>>;
  carve: Pick<CarveUi, "wander" | "walls" | "depth" | "riverDepth" | "banks" | "sources">;
  craterize: Pick<CraterUi, "walls" | "centre" | "debris" | "rays" | "sources">;
  erupt: Pick<EruptUi, "shape" | "summit" | "flows" | "ridges" | "sources">;
  quake: Pick<QuakeUi, "scarp" | "sources">;
  glaciate: Pick<GlaciateUi, "benches" | "steps" | "tarn" | "scree" | "sources">;
  rift: Pick<RiftUi, "walls" | "sources">;
  deposit: Pick<DepositUi, "channels" | "sources">;
}

export const AUTO_FORCES_PREFS: ForcesPrefs = {
  watch: false,
  floor: FLOOR_DEFAULT,
  more: {},
  carve: { wander: null, walls: null, depth: null, riverDepth: RIVER_DEPTH_DEFAULT, banks: null, sources: SOURCES_DEFAULT },
  craterize: { walls: null, centre: null, debris: null, rays: null, sources: SOURCES_DEFAULT },
  erupt: { shape: null, summit: null, flows: null, ridges: null, sources: SOURCES_DEFAULT },
  quake: { scarp: null, sources: SOURCES_DEFAULT },
  glaciate: { benches: null, steps: null, tarn: null, scree: null, sources: SOURCES_DEFAULT },
  rift: { walls: null, sources: SOURCES_DEFAULT },
  deposit: { channels: null, sources: SOURCES_DEFAULT },
};

/** `v` if it is one of `options`, else `null` (a detail left on Auto: a stray or outdated value
 *  never reaches the row). */
export function among<T>(v: unknown, options: readonly T[]): T | null {
  return (options as readonly unknown[]).includes(v) ? (v as T) : null;
}

/** A force's remembered Sources: Ride only when it was chosen, else the default (Clear). */
const sourcesOf = (f: Record<string, unknown> | undefined): ForceSources => (f?.sources === "ride" ? "ride" : SOURCES_DEFAULT);

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
        sources: sourcesOf(s.carve),
      },
      craterize: { walls: among(s.craterize?.walls, ["steep", "terraced"]), centre: among(s.craterize?.centre, ["auto", "bowl", "peak", "ring", "flat"]), debris: among(s.craterize?.debris, ["light", "heavy"]), rays: typeof s.craterize?.rays === "boolean" ? s.craterize.rays : null , sources: sourcesOf(s.craterize) },
      erupt: { shape: among(s.erupt?.shape, ["steep", "broad"]), summit: among(s.erupt?.summit, ["auto", "peak", "crater", "caldera"]), flows: among(s.erupt?.flows, ["light", "heavy"]), ridges: typeof s.erupt?.ridges === "boolean" ? s.erupt.ridges : null , sources: sourcesOf(s.erupt) },
      quake: { scarp: among(s.quake?.scarp, ["sheer", "stepped"]) , sources: sourcesOf(s.quake) },
      glaciate: { benches: among(s.glaciate?.benches, ["none", "some", "many"]), steps: among(s.glaciate?.steps, ["few", "some", "many"]), tarn: typeof s.glaciate?.tarn === "boolean" ? s.glaciate.tarn : null, scree: typeof s.glaciate?.scree === "boolean" ? s.glaciate.scree : null , sources: sourcesOf(s.glaciate) },
      rift: { walls: among(s.rift?.walls, ["sheer", "stepped"]) , sources: sourcesOf(s.rift) },
      deposit: { channels: among(s.deposit?.channels, ["few", "many"]) , sources: sourcesOf(s.deposit) },
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
