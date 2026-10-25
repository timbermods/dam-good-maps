// The day each tile's water first goes in a drought, or first turns bad in a badtide (the Drought and Badtide views'
// hover, D133: "Dry on day 6", "Lasts the drought", and when water turns bad). Read from the days the views' runs keep
// (`weather.ts` `HazardRun`, kept by the worker day by day), one day after another, one pass over the map per day; never
// simulated here. Each day is read as the views draw it: on a map with caves or overhangs the water seen from above
// (`stackWater.ts` `surfaceWater`), as the drought line reads it.

import { PUMP_CLEAN, WATER_BODY } from "../analysis/walk";

/** The latest day an `Int16Array` can name; a tile first dry or bad later reads this day. */
export const LAST_DAY = 32767;

/** A day's water per tile, as the views read it. */
export interface DayWater {
  depth: ArrayLike<number>;
  contamination: ArrayLike<number>;
}

/** The first day per tile something happens to its water, from the days seen one after another. */
export interface FirstDays {
  /** Per tile: 0 when it has not happened on any day seen (Day 1 to `through`), else the first day it did. */
  readonly first: Int16Array;
  /** The last day seen (0: none yet). */
  readonly through: number;
  /** The next day's water (Day `through + 1`). */
  see(w: DayWater): void;
}

/**
 * When each tile's water goes in a drought. "Dry" is the Drought view's own and the drought line's: a tile holds water
 * exactly when its depth is over `WATER_BODY` (render3d/model.ts `WET`). `first[i]` is 0 when tile i holds no water on
 * Day 0, or still holds it on every day seen; else the first day it held none (a tile the drained water flows back over
 * later keeps that day).
 */
export class DryDays implements FirstDays {
  readonly first: Int16Array;
  through = 0;
  /** The tiles holding water on Day 0 (as this run reads it, never changed): a 0 in `first` over one of them is water that
   *  lasts, over any other no water at all (`dryWords`). */
  readonly wet0: Uint8Array;
  /** The tiles holding water on Day 0 and on every day seen since. */
  private readonly wet: Uint8Array;

  /** From Day 0's water (the water the run starts from). */
  constructor(day0: DayWater) {
    const N = day0.depth.length;
    this.first = new Int16Array(N);
    this.wet0 = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (day0.depth[i] > WATER_BODY) this.wet0[i] = 1;
    this.wet = this.wet0.slice();
  }

  see(w: DayWater): void {
    const day = Math.min(LAST_DAY, ++this.through);
    const { wet, first } = this;
    for (let i = 0; i < wet.length; i++)
      if (wet[i] && !(w.depth[i] > WATER_BODY)) {
        wet[i] = 0;
        first[i] = day;
      }
  }
}

/**
 * The Drought view's hover words for one tile (D133): "Dry on day 6" for water that goes on day 6, "Lasts the drought"
 * for water that holds through every day of the drought, else null (a tile with no water on Day 0 says nothing, and
 * neither does water whose fate is not worked out yet). `first` and `through` are `DryDays`' (the days worked out so
 * far), `days` the drought's length, `wet0` the run's own Day 0 water (`DryDays.wet0`, as the run reads it: never the
 * page's). Water that goes after the drought's last day lasts the drought. A 0 in `first` only means "lasts" once the days
 * are worked out to the drought's end; before that it says nothing.
 */
export function dryWords(first: ArrayLike<number>, through: number, days: number, i: number, wet0: ArrayLike<number>): string | null {
  if (!wet0[i]) return null;
  const day = first[i];
  if (day > days) return "Lasts the drought";
  if (day > 0) return `Dry on day ${day}`;
  return through >= days ? "Lasts the drought" : null;
}

/**
 * The Badtide view's hover words for one tile (D133): "Turns bad on day 4" for water that first holds badwater on day 4
 * (the hover's own "badwater" shows only from 95% bad, so the words say "turns bad"), else null: a 0 in `first` is
 * water that stays clean, water already bad on Day 0 or a day not worked out yet, and none of them is said.
 */
export function badWords(first: ArrayLike<number>, i: number): string | null {
  const day = first[i];
  return day > 0 ? `Turns bad on day ${day}` : null;
}

/** Whether a tile's water is badwater as the Badtide view and the hover read it: water there (depth over `WATER_BODY`)
 *  with contamination at `PUMP_CLEAN` (0.05) or more, the line between the water a pump draws and badwater, where the
 *  hover's "badwater" begins. */
export function badWater(depth: number, contamination: number): boolean {
  return depth > WATER_BODY && contamination >= PUMP_CLEAN;
}

/**
 * When each tile's water turns bad in a badtide (`badWater`). `first[i]` is 0 when tile i holds no badwater on any day
 * seen, or already held badwater on Day 0 (the map's own badwater, which the page reads from Day 0's water); else the
 * first day it held badwater (water the badtide drives off later keeps that day).
 */
export class BadDays implements FirstDays {
  readonly first: Int16Array;
  through = 0;
  /** The tiles whose water has not been bad on Day 0 or on any day seen since. */
  private readonly clean: Uint8Array;

  constructor(day0: DayWater) {
    const N = day0.depth.length;
    this.first = new Int16Array(N);
    this.clean = new Uint8Array(N);
    for (let i = 0; i < N; i++) if (!badWater(day0.depth[i], day0.contamination[i])) this.clean[i] = 1;
  }

  see(w: DayWater): void {
    const day = Math.min(LAST_DAY, ++this.through);
    const { clean, first } = this;
    for (let i = 0; i < clean.length; i++)
      if (clean[i] && badWater(w.depth[i], w.contamination[i])) {
        clean[i] = 0;
        first[i] = day;
      }
  }
}
