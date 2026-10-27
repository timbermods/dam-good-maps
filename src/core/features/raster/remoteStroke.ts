// A Naturalize stroke weathered in the worker (PLAN §20 D422): the page sends its dabs as they come and
// shows the land the worker sends back, a frame or two behind the cursor, so painting stays smooth however
// long a dab takes. The worker runs the same preview the page would (strokePreview.ts, rule 3, dab by
// dab), so what the page shows is exactly what the operation builds. This is the page's side: the same
// surface as `StrokePreview` where the brushes read it, the land arriving through `onLand`.

import type { BrushParams } from "./brush";
import type { Rect } from "./brush";

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
  /** The stroke's heights before the integrity pass and its protected tiles, once its dabs are in. */
  end(): Promise<{ pre: Uint8Array; protect: Uint8Array } | null>;
  cancel(): void;
}

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
  private dabCount = 0;

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
    this.chain = channel.begin({ ...record }, ground);
  }

  /** More dabs: sent now, their land shown when it comes. Returns null (nothing changed yet). */
  add(dabs: ArrayLike<number>, pressure?: ArrayLike<number>): Rect | null {
    const d = Array.from(dabs);
    const p = pressure ? Array.from(pressure) : undefined;
    this.dabCount += d.length >> 1;
    this.chain = this.chain.then(() => this.channel.add(d, p)).then((land) => this.show(land));
    return null;
  }

  /** The pieces that ride the stroke whole (D249), once its dabs are all in. Returns null; the land
   *  comes as `add`'s does. */
  finish(rigid: readonly (readonly [number, number, number, number])[]): Rect | null {
    const r = rigid.map((v) => [v[0], v[1], v[2], v[3]] as [number, number, number, number]);
    this.chain = this.chain.then(() => this.channel.finish(r)).then((land) => {
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
   *  `protect`), once every dab is shown. */
  async done(): Promise<void> {
    await this.settled();
    const r = await this.channel.end();
    this.live = false;
    if (r) {
      this.pre = r.pre;
      this.protect = r.protect;
    }
  }

  /** The shown heights before the stroke, inside what changed (Esc): the worker forgets the stroke. */
  restore(): Rect | null {
    this.live = false;
    this.channel.cancel();
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
    // (the worker's record: the rule and where the water stood, as the operation keeps them)
    const s = land.settings;
    Object.assign(this.record, { weathering: s.weathering, ...(s.shore ? { shore: s.shore } : {}), ...(s.pools ? { pools: s.pools } : {}), ...(s.moist ? { moist: s.moist } : {}) });
    this.onLand(rect);
  }
}

function grow(a: Rect | null, b: Rect): Rect {
  return a ? { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) } : { ...b };
}
