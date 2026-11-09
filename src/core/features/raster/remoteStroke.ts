// A Naturalize stroke weathered in a worker (PLAN §20 D422): the page sends its dabs as they come and
// shows the land the worker sends back, a frame or two behind the cursor, so painting stays smooth however
// long a dab takes. The worker runs the same preview the page would (strokePreview.ts, dab by dab) on the
// land the page sends with the stroke's start, the page's own terrain and shown heights as its other
// brushes read them, so what the page shows is exactly what the operation builds. `RemotePreview` is the
// page's side: the same surface as `StrokePreview` where the brushes read it, the land arriving through
// `onLand`. `WeatherStroke` is the worker's.
//
// The worker is the weathering's own (worker/naturalize.worker.ts, #868), never the map's: on a map with
// caves the stroke's water (the stacked engine's draft, a quarter of a second to build, the whole map's
// engine rebuilt after every land change) ran on the map's worker, and each dab's answer waited behind it.
// The page sends the stroke's land to the map's worker for its water, as it does for the other brushes.
//
// One call is with the worker at a time (#868): the dabs that come while it works wait as one batch, sent
// whole when its land comes back. A call a batch of dabs, each waiting behind the last, grew a queue the
// worker never caught up with (the land seconds behind the cursor); the worker presses a batch dab by dab
// as it pressed them one call each, so the land it sends back is the same.
//
// The stroke's record (its rule, where the water stood over its working rectangle) is the worker's, taken
// with each answer's land and again at the end (#873): dabs that reach over water but change no tile grow
// the worker's record with no land to carry it, and an operation keeping a shorter record weathered
// those tiles differently from the land the page showed.
//
// A worker that never answers (it died, or hangs) would hold the stroke's landing forever, and with it the undo,
// redo, History jump and new stroke that wait for it (#884). Once let go, the stroke waits for each call only as
// long as the call can take (`answerBound`): then it is taken back, as Esc takes one back, and the worker is
// started again for the next stroke (`WeatherChannel.restart`). The bound only arms a timer: a stroke that
// answers in time costs nothing more.

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

/** The worker's side, as the page calls it (each call answered in the order sent). */
export interface WeatherChannel {
  begin(settings: Omit<BrushParams, "dabs">, ground: readonly (readonly [number, number, number])[]): Promise<void>;
  add(dabs: number[], pressure?: number[]): Promise<WeatheredLand | null>;
  finish(rigid: [number, number, number, number][]): Promise<WeatheredLand | null>;
  /** The stroke's heights before the integrity pass, its protected tiles and its settings as the worker's
   *  preview recorded them, once its dabs are in. */
  end(): Promise<{ pre: Uint8Array; protect: Uint8Array; settings: Omit<BrushParams, "dabs"> } | null>;
  cancel(): void;
  /** The worker never answered (#884): a fresh one for the next stroke. */
  restart?(): void;
}

/** What the page says when the worker never answered a stroke in time (#884), as Esc took it back. */
export const WEATHER_SILENT = "Naturalize stopped answering, so the stroke was taken back. Paint it again.";

/** How long the page waits for one call to the worker (ms, #884): a few seconds, plus the most a dab of this size
 *  can take for each dab the call carries. Measured warm in Node on 256² canyon at Strength 10 (#884): a dab takes
 *  p50 3 / 12 / 25 / 74 ms at Size 5 / 32 / 64 / 128 (the slowest 327 ms, at 128), a batch of 30 dabs at Size 128
 *  2.2 s, a stroke's start 4–23 ms and its end under a millisecond; the allowance per dab, 0.4 ms + Size² × 20 µs,
 *  is 4.5 times the measured cost at Size 128 and more below it. */
export function answerBound(dabs: number, size: number): number {
  return ANSWER_WAIT_MS + dabs * (0.4 + size * size * 0.02);
}
export const ANSWER_WAIT_MS = 4000;

export class RemotePreview {
  readonly W: number;
  readonly H: number;
  /** The shown heights before the stroke. */
  readonly start: Uint8Array;
  /** The shown heights that changed so far, and those `finish` changed. */
  bounds: Rect | null = null;
  finished: Rect | null = null;
  /** After `done`: the heights before the integrity pass and the protected tiles. */
  pre: Uint8Array;
  protect: Uint8Array;
  private chain: Promise<unknown>;
  private live = true;
  /** Taken back (`restore`): `done` builds nothing. */
  private dropped = false;
  /** Taken back because the worker never answered in time (#884). */
  silent = false;
  /** When the call with the worker now must have answered by (`Date.now()` ms), or null when none is out. */
  private due: number | null = null;
  /** While `done` waits: sets its timer again when a call goes out or answers. */
  private alarm: (() => void) | null = null;
  /** While `done` waits: ends it, the stroke taken back. */
  private quit: (() => void) | null = null;
  private dabCount = 0;
  /** The dabs (and their pressures) waiting for the call before them to answer: sent as one call. */
  private waiting: { dabs: number[]; pressure: number[] | undefined } | null = null;

  /** `record` is the page's settings, given the worker's record as it comes (as `StrokePreview` does);
   *  `heights` the shown heights, changed in place as the land arrives. */
  constructor(
    private readonly record: Omit<BrushParams, "dabs">,
    private readonly heights: Uint8Array,
    W: number,
    H: number,
    ground: readonly (readonly [number, number, number])[],
    private readonly channel: WeatherChannel,
    private readonly onLand: (rect: Rect) => void,
    pre: Uint8Array,
    protect: Uint8Array,
  ) {
    this.W = W;
    this.H = H;
    this.start = heights.slice();
    this.pre = pre;
    this.protect = protect;
    this.chain = this.call(0, () => channel.begin({ ...record }, ground));
  }

  /** A call to the worker, with how long it may take (`answerBound`) while it is out. */
  private call<T>(dabs: number, send: () => Promise<T>): Promise<T> {
    this.due = Date.now() + answerBound(dabs, this.record.size);
    this.alarm?.();
    const answer = send();
    // (beside the chain, not in it: the answer reaches the stroke as soon as it did before)
    const answered = () => {
      this.due = null;
      this.alarm?.();
    };
    answer.then(answered, answered);
    return answer;
  }

  /** More dabs: sent once the call before them answers (with any that came meanwhile), their land shown
   *  when it comes. Returns null (nothing changed yet). */
  add(dabs: ArrayLike<number>, pressure?: ArrayLike<number>): Rect | null {
    const n = dabs.length >> 1;
    if (!n) return null;
    this.dabCount += n;
    const w = this.waiting;
    // (a batch either has a pressure for every dab or none: one without joins one with only as its own call)
    if (w && !w.pressure === !pressure) {
      for (let k = 0; k < 2 * n; k++) w.dabs.push(dabs[k]);
      if (w.pressure && pressure) for (let k = 0; k < n; k++) w.pressure.push(pressure[k]);
      return null;
    }
    const batch = { dabs: Array.from({ length: 2 * n }, (_, k) => dabs[k]), pressure: pressure ? Array.from({ length: n }, (_, k) => pressure[k]) : undefined };
    this.waiting = batch;
    this.chain = this.chain
      .then(() => {
        // (the batch goes: what comes from now on waits for its answer)
        if (this.waiting === batch) this.waiting = null;
        return this.live ? this.call(batch.dabs.length >> 1, () => this.channel.add(batch.dabs, batch.pressure)) : null;
      })
      .then((land) => this.show(land));
    return null;
  }

  /** The pieces that ride the stroke whole (D249), once its dabs are all in. Returns null; the land
   *  comes as `add`'s does. */
  finish(rigid: readonly (readonly [number, number, number, number])[]): Rect | null {
    const r = rigid.map((v) => [v[0], v[1], v[2], v[3]] as [number, number, number, number]);
    // (dabs after this go after it)
    this.waiting = null;
    this.chain = this.chain.then(() => (this.live ? this.call(r.length, () => this.channel.finish(r)) : null)).then((land) => {
      if (land) this.finished = grow(this.finished, land.rect);
      this.show(land);
    });
    return null;
  }

  /** Every dab sent so far has been shown. */
  settled(): Promise<void> {
    return this.chain.then(() => undefined);
  }

  /** The stroke is done: its heights before the integrity pass and its protected tiles (in `pre` and
   *  `protect`), and the worker's whole record, once every dab is shown; `beforeEnd` runs once they are (the
   *  pieces that ride the stroke whole go then, `finish`). False when it was taken back (`restore`) before it
   *  ended (an editor that closed while its last land was coming, #880), or when the worker never answered a call
   *  in time (`answerBound`; `silent`, #884: taken back as Esc takes a stroke back, and the worker started again):
   *  it builds no operation, and the worker is never asked for its end. */
  async done(beforeEnd?: () => void): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    // (taken back meanwhile, by the timer or by Esc or the editor closing: done at once, whether or not the worker
    // ever answers)
    const takenBack = new Promise<false>((resolve) => (this.quit = () => resolve(false)));
    this.alarm = () => {
      clearTimeout(timer);
      if (this.due === null || this.dropped) return;
      timer = setTimeout(() => {
        if (this.dropped) return;
        this.silent = true;
        this.restore();
        this.channel.restart?.();
      }, Math.max(0, this.due - Date.now()));
    };
    this.alarm();
    try {
      return this.dropped ? false : await Promise.race([this.land(beforeEnd), takenBack]);
    } finally {
      clearTimeout(timer);
      this.alarm = null;
      this.quit = null;
    }
  }

  private async land(beforeEnd?: () => void): Promise<boolean> {
    await this.settled();
    if (this.dropped) return false;
    if (beforeEnd) {
      beforeEnd();
      await this.settled();
      if (this.dropped) return false;
    }
    const r = await this.call(0, () => this.channel.end());
    this.live = false;
    if (this.dropped) return false;
    if (r) {
      this.pre = r.pre;
      this.protect = r.protect;
      this.take(r.settings);
    }
    return true;
  }

  /** The shown heights before the stroke, inside what changed (Esc, or the editor closing, #880): the
   *  worker forgets the stroke, and no land or end of it comes after. */
  restore(): Rect | null {
    this.live = false;
    this.dropped = true;
    this.channel.cancel();
    this.quit?.();
    const b = this.bounds;
    if (!b) return null;
    for (let y = b.y0; y <= b.y1; y++)
      for (let x = b.x0; x <= b.x1; x++) {
        const i = y * this.W + x;
        this.heights[i] = this.start[i];
      }
    return b;
  }

  /** How many shown tiles the stroke changed (0: none). */
  changed(): number {
    const b = this.bounds;
    if (!b) return 0;
    let n = 0;
    for (let y = b.y0; y <= b.y1; y++)
      for (let x: number = b.x0; x <= b.x1; x++) {
        const i = y * this.W + x;
        if (this.heights[i] !== this.start[i]) n++;
      }
    return n;
  }

  /** Dabs sent so far. */
  get dabs(): number {
    return this.dabCount;
  }

  private show(land: WeatheredLand | null): void {
    if (!land || !this.live) return;
    const { rect, heights } = land;
    const bw = rect.x1 - rect.x0 + 1;
    for (let y = rect.y0; y <= rect.y1; y++)
      for (let x = rect.x0; x <= rect.x1; x++) this.heights[y * this.W + x] = heights[(y - rect.y0) * bw + (x - rect.x0)];
    this.bounds = grow(this.bounds, rect);
    this.take(land.settings);
    this.onLand(rect);
  }

  /** The worker's record: the rule and where the water stood, as the operation keeps them. */
  private take(s: Omit<BrushParams, "dabs">): void {
    Object.assign(this.record, { weathering: s.weathering, ...(s.shore ? { shore: s.shore } : {}), ...(s.pools ? { pools: s.pools } : {}), ...(s.moist ? { moist: s.moist } : {}) });
  }
}

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

function grow(a: Rect | null, b: Rect): Rect {
  return a ? { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) } : { ...b };
}
