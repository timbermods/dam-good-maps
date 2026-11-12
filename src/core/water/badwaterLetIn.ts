// The shared badwater check (the force audit's S3): does a change let badwater into water that was clean?
// Headless, plain data (D342). Every force's keep asks it (worker `forceStop`); any other change to the land
// can ask it the same way.
//
// It reads the water the way the canonical settle starts it (sim/prefill.ts `flowThrough`: every running
// source's water walked downhill or level on the filled surface, with its badwater part), on the land before
// and after the change. No new simulation: two walks, a few milliseconds on 256². A tile is let in when it
// held clean water before (the map's water as shown: deep enough to count, contamination under the game's
// badwater line), the walk before did not already bring badwater to it, and the walk after does. So a map
// whose water was already mixed is not blamed on the change, and water the change only drains or buries is
// not counted (no water reaches it after). The answer is a count and a place for a one-line note; the
// change itself is kept as it is (the audit: a force adjusts, never refuses).

import { BAD as CLEAN_LIMIT, WET } from "../validate/playability";
import { toMapObject } from "../features/build";
import { waterModel } from "../sim/model";
import { flowThrough } from "../sim/prefill";
import type { EntitySpec } from "../format/entities";

/** Water shallower than this (levels) is not counted as water a beaver drinks. */
export const LET_IN_DEPTH = WET;
/** Fewer tiles let in than this is the walk's noise at an edit's edge, not an event. */
export const LET_IN_MIN = 4;
/** A tile within this many tiles of the start counts as the start's water (the start's 20 tiles, PLAN §5.6). */
export const START_NEAR = 20;

/** The land as the check reads it. */
export interface LandWithSources {
  W: number;
  H: number;
  heights: Uint8Array;
  entities: readonly EntitySpec[];
}

/** What the change let badwater into. */
export interface BadwaterLetIn {
  /** Tiles of clean water badwater now reaches. */
  tiles: number;
  /** One of them, near their middle (where the note's place is). */
  at: { x: number; y: number };
  /** Some of them lie within `START_NEAR` of the start. */
  start: boolean;
  /** The one-line note the page shows. */
  note: string;
}

/** The flow walk's badwater reading of a land: 1 where the water that reaches a tile is badwater. */
export function badFlow(m: LandWithSources): Uint8Array {
  const flow = flowThrough(waterModel(m.W, m.H, m.heights, m.entities.map(toMapObject)));
  const out = new Uint8Array(m.W * m.H);
  for (let i = 0; i < out.length; i++) if (flow.path[i] && flow.qBad[i] > 0 && flow.qBad[i] >= CLEAN_LIMIT * flow.q[i]) out[i] = 1;
  return out;
}

/** Whether `after` lets badwater into water that was clean in `before` (its water as shown, `water`), or
 *  null. `badBefore` is `badFlow(before)` when the caller has it already. */
export function badwaterLetIn(
  before: LandWithSources & { water: { depth: ArrayLike<number>; contamination: ArrayLike<number> } },
  after: Pick<LandWithSources, "heights" | "entities">,
  badBefore: Uint8Array = badFlow(before),
): BadwaterLetIn | null {
  const { W, H } = before;
  const { depth, contamination } = before.water;
  const N = W * H;
  // (no clean water before, or no badwater source after: nothing to let in, no walk)
  let clean = false;
  for (let i = 0; i < N && !clean; i++) clean = depth[i] >= LET_IN_DEPTH && contamination[i] < CLEAN_LIMIT && !badBefore[i];
  if (!clean || !after.entities.some(isBadwater)) return null;
  const badAfter = badFlow({ W, H, heights: after.heights, entities: after.entities });
  const start = before.entities.find((e) => e.template === "StartingLocation");
  let tiles = 0;
  let sx = 0;
  let sy = 0;
  let near = false;
  const found: number[] = [];
  for (let i = 0; i < N; i++) {
    if (!badAfter[i] || badBefore[i] || !(depth[i] >= LET_IN_DEPTH) || !(contamination[i] < CLEAN_LIMIT)) continue;
    const x = i % W;
    const y = (i - x) / W;
    tiles++;
    sx += x;
    sy += y;
    found.push(i);
    if (start && Math.abs(x - start.x) <= START_NEAR && Math.abs(y - start.y) <= START_NEAR) near = true;
  }
  if (tiles < LET_IN_MIN) return null;
  // (the tile nearest their mean: a place that is one of them, as a water note's centre is)
  const mx = sx / tiles;
  const my = sy / tiles;
  let best = found[0];
  let bestD = Infinity;
  for (const i of found) {
    const x = i % W;
    const d = (x - mx) * (x - mx) + ((i - x) / W - my) * ((i - x) / W - my);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  const at = { x: best % W, y: (best - (best % W)) / W };
  return { tiles, at, start: near, note: badwaterNote(tiles, at, near) };
}

const isBadwater = (e: EntitySpec) => e.template === "BadwaterSource" || e.template === "BadwaterSeep";

const badwaterNote = (tiles: number, at: { x: number; y: number }, start: boolean): string =>
  `Badwater now reaches ${start ? "the start's water" : "clean water"}: ${tiles} tiles, at X ${at.x} · Y ${at.y}.`;
