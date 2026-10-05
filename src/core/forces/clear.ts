// Forces can clear sources (PLAN §20 D474, amending D257's "no force changes shelf objects except by
// riding the ground" for sources only): every force takes a Sources choice, Ride (its sources move with
// the ground) or Clear (the default, also for an operation without the choice: every water and badwater
// source and seep on a tile whose ground the force changes goes; a multi-tile one if any of its tiles
// changes). The sources a force places itself always stay (Carve's river, Glaciate's meltwater, an
// unleashed source); every other object keeps riding the ground. Carve and Glaciate take what they
// reach themselves under Clear (in Rust: `removed`, as their head or ice arrives) and keep it riding
// under Ride; the other forces' sources ride in Rust and Clear takes them here.
//
// No pop: a cleared source goes at the step its showing first changes one of its tiles, never all at
// the end; the force's operation keeps each one's id and that step (`cleared`).

import type { EntitySpec } from "../format/entities";
import { EMITTERS, objectTile } from "../sim/model";
import { footprint } from "./objects";

/** The Sources choice: Ride or Clear. */
export type SourcesRule = "ride" | "clear";
export const SOURCES_RULES: readonly SourcesRule[] = ["ride", "clear"];
/** A force's choice when it says none: Clear (start.ts `planForce` writes it into the request). */
export const SOURCES_DEFAULT: SourcesRule = "clear";
/** Whether a force with this choice clears its sources (none given: Clear). */
export const clears = (rule: SourcesRule | undefined): boolean => rule !== "ride";

/** What Clear takes and Ride keeps: water and badwater sources and seeps (aquifers stay as they are). */
export const CLEARABLE: ReadonlySet<string> = new Set(["WaterSource", "BadwaterSource", "WaterSeep", "BadwaterSeep"]);

/** The tiles whose ground a force's result changes, its working area's feather applied (`ease`: how
 *  many levels each tile may move, D254; null for none), as its operation keeps them (keep.ts
 *  `featherForce`): the showing and the operation clear from the same tiles. */
export function changedGround(before: ArrayLike<number>, after: ArrayLike<number>, ease: ArrayLike<number> | null): (i: number) => boolean {
  return ease ? (i) => Math.max(before[i] - ease[i], Math.min(before[i] + ease[i], after[i])) !== before[i] : (i) => after[i] !== before[i];
}

/** A source a force cleared, and the step of its showing that took it: the frame whose `shown` is
 *  `step` is the first without it. */
export interface ClearedSource {
  id: string;
  step: number;
}

/** The sources Clear takes from the map `before` (its objects at their places then): those with a
 *  tile in their footprint the force changed (`changed`), save the ones `stays` names (the force's
 *  own, and those it took itself). */
export function clearable(before: { W: number; H: number; entities: readonly EntitySpec[] }, changed: (i: number) => boolean, stays: (id: string) => boolean): EntitySpec[] {
  return before.entities.filter((e) => CLEARABLE.has(e.template) && !stays(e.id) && footprint(before, e).some(changed));
}

/** A force's showing, clearing its sources step by step: each goes at the first step whose land
 *  differs from the land it started on at one of its tiles, and stays gone. */
export class SourceClearing {
  /** Each source cleared so far, in the order they went. */
  readonly record: ClearedSource[] = [];
  private readonly gone = new Set<string>();
  private pending: { id: string; tiles: number[] }[];

  constructor(
    private readonly ground: ArrayLike<number>,
    before: { W: number; H: number },
    sources: readonly EntitySpec[],
  ) {
    this.pending = sources.map((e) => ({ id: e.id, tiles: footprint(before, e) }));
  }

  /** The frame shown at `step`, its land `heights`: the sources it reaches now recorded at `step`
   *  (every one still standing, at its `last` step), and its objects `entities` without every source
   *  cleared so far. */
  show(heights: ArrayLike<number>, entities: EntitySpec[], step: number, last = false): EntitySpec[] {
    if (this.pending.length) {
      const left: typeof this.pending = [];
      for (const p of this.pending)
        if (last || p.tiles.some((i) => heights[i] !== this.ground[i])) {
          this.record.push({ id: p.id, step });
          this.gone.add(p.id);
        } else left.push(p);
      this.pending = left;
    }
    return this.gone.size && entities.some((e) => this.gone.has(e.id)) ? entities.filter((e) => !this.gone.has(e.id)) : entities;
  }
}

/** Each source's and seep's emitter in a water model made from `entities` (features/build.ts `modelOf`,
 *  the same order: one emitter for each object with a tile on the map), by id: a force's own water
 *  stops a source's emitter at the step it leaves the land shown, so its water drains as the game's
 *  would; a source that rides keeps running. */
export function emittersById(W: number, H: number, entities: readonly EntitySpec[]): Map<string, number> {
  const out = new Map<string, number>();
  let k = 0;
  for (const e of entities) {
    const rule = EMITTERS[e.template];
    if (!rule) continue;
    const on = rule.tiles.some(([lx, ly]) => {
      const [x, y] = objectTile(e as Parameters<typeof objectTile>[0], lx, ly);
      return x >= 0 && y >= 0 && x < W && y < H;
    });
    if (!on) continue;
    if (CLEARABLE.has(e.template)) out.set(e.id, k);
    k++;
  }
  return out;
}
