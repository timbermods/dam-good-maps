// The words beside the pointer while a brush is out (D322): one label, three sources. While F sizes
// the brush, its size shows and nothing replaces it; a word flashed for a moment (a strength, a size
// stepped with { or }) shows next, then the brush's own words come back (its target level, "up to
// 8"). A flash's moment is counted from the frame that first shows it, not from the key: a page busy
// for longer than the moment (a preview rebuilt where the browser draws in software took 1.4 s) would
// otherwise end the flash before it was ever drawn. Pure logic, with its timers handed in, so the
// order is tested without a browser (tests/unit/pointerWords.test.ts).

export interface Timers {
  set(fn: () => void, ms: number): unknown;
  /** Stop what `set` or `painted` started. */
  clear(t: unknown): void;
  /** Run `fn` once the page has drawn a frame after this call (none: at once). */
  painted?(fn: () => void): unknown;
}

interface Waiting {
  cancel(): void;
}

const WINDOW_TIMERS: Timers = {
  set: (fn, ms) => window.setTimeout(fn, ms),
  clear: (t) => (typeof t === "number" ? window.clearTimeout(t) : (t as Waiting).cancel()),
  // (the first frame after the call draws the words; the one after it finds them drawn)
  painted: (fn) => {
    let id = window.requestAnimationFrame(() => {
      id = window.requestAnimationFrame(fn);
    });
    return { cancel: () => window.cancelAnimationFrame(id) } satisfies Waiting;
  },
};

export class PointerWords {
  private brushText: string | null = null;
  private flashText: string | null = null;
  private sizeText: string | null = null;
  private timer: unknown = null;

  constructor(
    /** Show these words beside the pointer, or none. */
    private readonly show: (text: string | null) => void,
    /** Whether a brush is out (its own words show only then). */
    private readonly active: () => boolean,
    private readonly timers: Timers = WINDOW_TIMERS,
    private readonly ms = 1200,
  ) {}

  /** The brush's own words (its target), or none. */
  brush(text: string | null): void {
    this.brushText = text;
    if (this.flashText === null && this.sizeText === null) this.show(text);
  }

  /** A word for a moment (`ms`: longer, for a reason to read). */
  flash(text: string, ms = this.ms): void {
    if (this.timer !== null) this.timers.clear(this.timer);
    this.flashText = text;
    this.show(text);
    const end = () => {
      this.timer = null;
      this.flashText = null;
      this.show(this.sizeText ?? (this.brushText && this.active() ? this.brushText : null));
    };
    const start = () => {
      this.timer = this.timers.set(end, ms);
    };
    // (the moment starts once the words are on the screen)
    if (this.timers.painted) this.timer = this.timers.painted(start);
    else start();
  }

  /** F held (D205, D322): the size, or null when it is set. */
  sizing(text: string | null): void {
    this.sizeText = text;
    // (a flash still showing gives way to the size, and never comes back over it)
    if (text !== null && this.timer !== null) {
      this.timers.clear(this.timer);
      this.timer = null;
      this.flashText = null;
    }
    this.show(text ?? (this.brushText && this.active() ? this.brushText : null));
  }
}
