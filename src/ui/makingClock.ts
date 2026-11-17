// A map being made is bounded and keeps the screen on (the owner's 512×128 River Valley ran 32 minutes on a phone, its
// card counting while the locked screen held the worker still): its clock counts only the time the page was shown, the
// screen is held on from the start to the end, and after `OFFER_AFTER_S` of that time the card offers the nearest thing
// that works, after `STOP_AFTER_S` the generate stops itself.

/** Running seconds without a kept map before the card offers the nearest thing that works (with Easy start on: the same
 *  settings without it). */
export const OFFER_AFTER_S = 30;
/** Running seconds after which the generate stops by itself and the card says why. */
export const STOP_AFTER_S = 300;

/** Where a generate stands against its bounds. */
export type Bound = "trying" | "offer" | "stop";

export function boundOf(seconds: number): Bound {
  return seconds >= STOP_AFTER_S ? "stop" : seconds >= OFFER_AFTER_S ? "offer" : "trying";
}

/** The time a generate was actually running: time while the page was hidden (a locked phone, a tab put away, where the
 *  browser holds the worker still) does not count. `rate` speeds it for the end-to-end tests (1 for players). */
export class RunningClock {
  private ran = 0;
  private last: number;
  private hidden: boolean;
  /** The page came back after being hidden: the card says so until the next attempt begins. */
  paused = false;

  constructor(
    private readonly now: () => number,
    hidden = false,
    private readonly rate: () => number = () => 1,
  ) {
    this.last = now();
    this.hidden = hidden;
  }

  private sample(): void {
    const t = this.now();
    if (!this.hidden) this.ran += Math.max(0, t - this.last) * this.rate();
    this.last = t;
  }

  hide(): void {
    this.sample();
    this.hidden = true;
  }

  show(): void {
    this.sample();
    if (this.hidden) this.paused = true;
    this.hidden = false;
  }

  /** The next attempt began: the pause is behind it. */
  attemptBegan(): void {
    this.paused = false;
  }

  seconds(): number {
    this.sample();
    return this.ran / 1000;
  }
}

interface Sentinel {
  release(): Promise<void>;
}
interface WakeNavigator {
  wakeLock?: { request(type: "screen"): Promise<Sentinel> };
}

/** A generate under way: its running clock, and the screen held on (where the browser can) until `end`; the browser drops
 *  the lock while the page is hidden, so it is taken again when the page comes back. Nothing is held after `end`. */
export function startMaking(opts: { now?: () => number; rate?: () => number; doc?: Document; nav?: WakeNavigator } = {}): { clock: RunningClock; end(): void } {
  const doc = opts.doc ?? document;
  const nav = opts.nav ?? (navigator as WakeNavigator);
  const clock = new RunningClock(opts.now ?? (() => performance.now()), doc.visibilityState === "hidden", opts.rate);
  let on = true;
  let lock: Sentinel | null = null;
  let asking = false;
  const take = () => {
    if (!on || lock || asking || doc.visibilityState !== "visible" || !nav.wakeLock) return;
    asking = true;
    nav.wakeLock.request("screen").then(
      (l) => {
        asking = false;
        if (on) lock = l;
        else void l.release().catch(() => {});
      },
      () => (asking = false),
    );
  };
  const seen = () => {
    if (doc.visibilityState === "hidden") {
      clock.hide();
      // (the browser has let it go)
      lock = null;
    } else {
      clock.show();
      take();
    }
  };
  doc.addEventListener("visibilitychange", seen);
  take();
  return {
    clock,
    end() {
      if (!on) return;
      on = false;
      doc.removeEventListener("visibilitychange", seen);
      const l = lock;
      lock = null;
      void l?.release().catch(() => {});
    },
  };
}
