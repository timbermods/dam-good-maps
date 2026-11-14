// A Naturalize stroke weathered in a worker (PLAN §20 D422): the page sends its dabs as they come and
// shows the land the worker sends back, a frame or two behind the cursor, so painting stays smooth however
// long a dab takes. The worker runs the same preview the page would (strokePreview.ts, dab by dab) on the
// land the page sends with the stroke's start, the page's own terrain and shown heights as its other
// brushes read them, so what the page shows is exactly what the operation builds. `WeatherStroke` is the
// worker's side; the page's is the edit queue's `StrokeFeed` (core/doc/editQueue.ts, #922 step 3), its stroke a
// ticket from pointer-down.
//
// The worker is the weathering's own (worker/naturalize.worker.ts, #868), never the map's: on a map with
// caves the stroke's water (the stacked engine's draft, a quarter of a second to build, the whole map's
// engine rebuilt after every land change) ran on the map's worker, and each dab's answer waited behind it.
// The page sends the stroke's land to the map's worker for its water, as it does for the other brushes.
//
// One call is with the worker at a time (#868): the dabs that come while it works wait as one batch, sent
// whole when its land comes back. The worker presses a batch dab by dab as it pressed them one call each, so
// the land it sends back is the same. The stroke's record (its rule, where the water stood over its working
// rectangle) is the worker's, taken whole at the end (#873).
//
// A worker that never answers (it died, or hangs) would hold the stroke's landing forever, and with it every
// edit behind it (#884). Once let go, the stroke waits for each call only as long as the call can take
// (`answerBound`): the edit queue's one watchdog then takes it back, as Esc takes one back, and the worker is
// started again for the next stroke.

import type { BrushParams } from "./brush";
import type { Rect } from "./brush";
import type { Runs } from "../../math/grid";
import { StrokePreview, type TerrainState } from "./strokePreview";

/** What the worker sends back for dabs: the rectangle of shown heights that changed, those heights, and
 *  the stroke's settings as the worker's preview recorded them (its rule, where the water stood). */
export interface WeatheredLand {
  rect: Rect;
  heights: Uint8Array;
  settings: Omit<BrushParams, "dabs">;
}

/** What the page says when the worker never answered a stroke in time (#884), as Esc took it back. */
export const WEATHER_SILENT = "Naturalize stopped answering, so the stroke was taken back. Paint it again.";

/** How long the page waits for one call to the worker (ms, #884): a few seconds, plus the most a dab of this size
 *  can take for each dab the call carries. Measured warm in Node on canyon at Strength 10 (#884): at 256² a dab takes
 *  p50 3 / 12 / 25 / 74 ms at Size 5 / 32 / 64 / 128 (the slowest 327 ms, at 128) and a batch of 30 dabs at Size 128
 *  2.2 s (73 ms a dab); at 512², Size 128, p50 71 ms, the slowest 308 ms, a 30-dab batch 2.87 s (96 ms a dab); a
 *  stroke's start 4–23 ms and its end under a millisecond. A long press sends calls of over 100 dabs (the page adds
 *  30 a second while a call is out). The allowance per dab, 0.4 ms + Size² × 80 µs (1.3 s at Size 128), is 13.7 times
 *  a 512² batch's dab and 18 times a 256² one's, and 4 times the slowest single dab, so a CPU four times slower
 *  (D46) still lands. */
export function answerBound(dabs: number, size: number): number {
  return ANSWER_WAIT_MS + dabs * (0.4 + size * size * 0.08);
}
export const ANSWER_WAIT_MS = 4000;

/** The worker's side (D422, #868): the stroke's preview on the land the page sent with its start (`state`, the
 *  page's terrain; `heights`, its shown heights, kept and changed here), each call answered with the shown
 *  heights it changed and the record so far. */
export class WeatherStroke {
  private readonly preview: StrokePreview;
  /** The stroke's settings as the preview records them (its rule, where the water stood). */
  private readonly settings: Omit<BrushParams, "dabs">;

  constructor(
    settings: Omit<BrushParams, "dabs">,
    state: TerrainState,
    private readonly shown: Uint8Array,
    private readonly W: number,
    H: number,
    ground: Runs,
  ) {
    this.settings = { ...settings };
    this.preview = new StrokePreview(this.settings, state, shown, W, H, ground);
  }

  add(dabs: ArrayLike<number>, pressure?: ArrayLike<number>): WeatheredLand | null {
    return this.land(this.preview.add(dabs, pressure));
  }

  finish(rigid: readonly (readonly [number, number, number, number])[]): WeatheredLand | null {
    return this.land(this.preview.finish(rigid));
  }

  /** The stroke's dabs are all in: its heights before the integrity pass, its protected tiles and its whole
   *  record (a last call that changed no tile grew it with no land to carry it, #873). */
  end(): { pre: Uint8Array; protect: Uint8Array; settings: Omit<BrushParams, "dabs"> } {
    return { pre: this.preview.pre.slice(), protect: this.preview.protect.slice(), settings: { ...this.settings } };
  }

  /** What a call changed: the shown heights in the rectangle, and the settings as recorded so far. */
  private land(r: Rect | null): WeatheredLand | null {
    if (!r) return null;
    const W = this.W;
    const bw = r.x1 - r.x0 + 1;
    const heights = new Uint8Array(bw * (r.y1 - r.y0 + 1));
    for (let y = r.y0; y <= r.y1; y++) heights.set(this.shown.subarray(y * W + r.x0, y * W + r.x1 + 1), (y - r.y0) * bw);
    return { rect: r, heights, settings: { ...this.settings } };
  }
}

/** The Naturalize worker's side (worker/naturalize.worker.ts): the one stroke it holds, named by the page's id (its
 *  ticket in the edit queue, core/doc/editQueue.ts). A call that names another stroke changes nothing and answers
 *  nothing, so a call left over from a stroke taken back never reaches the next; a call with no id is the stroke held
 *  (the page as it calls it before the queue). */
export class WeatherHost {
  private stroke: WeatherStroke | null = null;
  private id: number | undefined = undefined;

  begin(settings: Omit<BrushParams, "dabs">, ground: Runs, state: TerrainState, heights: Uint8Array, W: number, H: number, id?: number): void {
    this.stroke = new WeatherStroke(settings, state, heights, W, H, ground);
    this.id = id;
  }

  add(dabs: ArrayLike<number>, pressure?: ArrayLike<number>, id?: number): WeatheredLand | null {
    return this.held(id)?.add(dabs, pressure) ?? null;
  }

  finish(rigid: readonly (readonly [number, number, number, number])[], id?: number): WeatheredLand | null {
    return this.held(id)?.finish(rigid) ?? null;
  }

  end(id?: number): { pre: Uint8Array; protect: Uint8Array; settings: Omit<BrushParams, "dabs"> } | null {
    const s = this.held(id);
    if (!s) return null;
    this.stroke = null;
    return s.end();
  }

  cancel(id?: number): void {
    if (this.held(id)) this.stroke = null;
  }

  private held(id: number | undefined): WeatherStroke | null {
    return id === undefined || id === this.id ? this.stroke : null;
  }
}
