// A carve's run as the document keeps it (D194, D199): the map a carve starts from (the open map as
// it stands), and the operation its result becomes. The editor's worker and Claude's carve step
// both make their carves here, so a carve made either way is the same operation.

import type { BuildResult } from "../../features/build";
import { DERIVED_SLOPES } from "../../features/ids";
import { placementOf, type EntitySpec } from "../../format/entities";
import { forceResult, type ForceMap } from "../force";
import type { CarveParams } from "./op";
import { sourceStrength, type CarveRun, type CarveSettings } from "./run";
import { oxbowLake } from "./water";

/** The map a force starts from: the build's ground and objects (those standing on the map), and
 *  the water as it stands (`water`: the water in flight, when there is some). */
export function forceMapOf(b: BuildResult, water?: { depth: ArrayLike<number>; contamination: ArrayLike<number> }): ForceMap {
  let top = 16;
  for (const h of b.heights) if (h > top) top = h;
  return {
    W: b.W,
    H: b.H,
    heights: b.heights.slice(),
    entities: b.entities.filter((e) => !e.raw || placementOf(e.raw)),
    water: { depth: Float64Array.from(water?.depth ?? b.water), contamination: Float64Array.from(water?.contamination ?? b.contamination) },
    maxHeight: Math.min(22, top),
  };
}

/** Objects a force never lists as removed: the start, and the slopes the build derives again. */
export const keptObject = (e: EntitySpec) => e.template === "StartingLocation" || e.owner === DERIVED_SLOPES || e.owner.startsWith("pinned:");

/** What the player asked of a carve (a record: replay never runs the carve). */
export interface CarveRecord {
  settings: CarveSettings;
  origin: [number, number];
  end?: [number, number];
  /** The layer showing when it ran (D207), or null. */
  cut: number | null;
  /** Try another path: the carve (its operation's seq) this one replaces. */
  replaces?: number;
}

/** The operation a run becomes, against the map it started from (null: it changed nothing). */
export function carveParams(before: ForceMap, run: CarveRun, rec: CarveRecord): CarveParams | null {
  const out = forceResult(before, run, keptObject);
  const src = run.source;
  if (!out.tiles.length && !src) return null;
  const set = rec.settings;
  const lake = oxbowLake(run);
  return {
    mode: set.mode,
    origin: rec.origin,
    ...(rec.end && set.mode === "aim" ? { end: rec.end } : {}),
    power: set.power,
    wander: set.wander ?? 35,
    width: set.width ?? null,
    seed: set.seed ?? 0,
    walls: set.walls,
    defyGravity: set.defyGravity,
    dry: set.dry,
    ...(rec.cut !== null ? { cut: rec.cut } : {}),
    steps: run.steps,
    reason: run.done ? run.reason : "stopped",
    tiles: out.tiles,
    heights: out.heights,
    removed: out.removed,
    ...(src ? { source: { id: src.id, x: src.x, y: src.y, strength: sourceStrength(set.power, set.width) } } : {}),
    ...(lake ? { lake } : {}),
    ...(rec.replaces !== undefined ? { replaces: rec.replaces } : {}),
  };
}
