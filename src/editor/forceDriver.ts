// A force at work on the page (PLAN §20 D194, D199, D202, D203, D206; paced by D321, item 29): the
// worker works the force out first, a slice a call (the page shows its gathering meanwhile: a carve's
// surge at its origin, an impactor falling, the ground stirring, the ice gathering), then shows it at
// the pace the player chose. **Fast** (the default): the land is final within about two seconds of
// the gesture, however long or large the result; a force whose own pace is quicker keeps it. **Watch**:
// about four times as long, to be watched; a click, a new gesture or Esc jumps it to its final land.
// Each frame shows the ground that changed (only its chunks) and the objects, and its moment goes to
// the effects and the sounds (a carve's surge; an impact, a fault's crack, an eruption's plume); the
// water stays as it was until the land is final (item 30), then flows on as after any edit; the camera
// never moves by itself (D265). Pause holds a carve; a force is kept when it ends; Esc (in Fast) or undo
// drops all of it at once. A painted Lift is shown whole as it is painted (the page sends the latest
// stroke whenever the worker is free) and kept when the pointer lets go. Nothing on the page waits on
// it: the effects that are only a show (the water filling a channel, dust, lava's glow) play on after
// the land is final, and the player can act again at once.

import type { Verb } from "../core/forces/op";
import type { Point } from "../core/forces/quake";
import type { AnyForceSettings, ForceFrame, ForceStarted } from "../worker/session";
import type { MapRenderer } from "../render3d";

/** How a force is shown (D321, item 29): Fast, or Watch. */
export type ForceSpeed = "fast" | "watch";

/** Fast: the land final within about this long of the gesture (ms). */
export const FAST_MS = 2000;
/** Watch plays a force out about this many times as long as Fast. */
export const WATCH_FACTOR = 4;
/** The shortest a Fast showing takes, however long the force took to work out (ms). */
export const MIN_SHOW_MS = 450;
/** A frame of the showing (ms). */
export const FRAME_MS = 30;

/** Each force's own pace, a shown step at a time (D266; a force shown quicker than FAST_MS keeps it):
 *  a carve's run, an impact, a quake as tuned; an eruption's 28 stages in about 1.5 seconds (D312); a
 *  glacier's 50 in five (D246). */
export const FORCE_PACE = { steps: 1, ms: 50 };
/** (Carve's name for it.) */
export const CARVE_PACE = FORCE_PACE;
export const ERUPT_PACE = { steps: 1, ms: 55 };
export const GLACIATE_PACE = { steps: 1, ms: 100 };

/** A force's own pace (D266: the water's speed doesn't change it). */
export function paceOf(verb: Verb): { steps: number; ms: number } {
  return verb === "erupt" ? ERUPT_PACE : verb === "glaciate" ? GLACIATE_PACE : FORCE_PACE;
}

/** How long a force's showing takes (ms), once it is worked out: its `total` steps at its own pace,
 *  compressed to Fast's two seconds from the gesture (`workedMs` already gone working it out, never
 *  below MIN_SHOW_MS); Watch four times Fast's own. */
export function showMs(verb: Verb, total: number, speed: ForceSpeed, workedMs: number): number {
  const fast = Math.min(total * paceOf(verb).ms, FAST_MS);
  return speed === "watch" ? WATCH_FACTOR * fast : Math.min(fast, Math.max(MIN_SHOW_MS, FAST_MS - workedMs));
}

export interface ForceStatus {
  verb: Verb;
  /** Steps shown. */
  steps: number;
  paused: boolean;
  /** It is being kept. */
  stopping: boolean;
  /** The personality it runs with (Try another takes the next). */
  seed: number;
  /** A painted Lift: it follows the stroke until the pointer lets go. */
  painting: boolean;
  /** How it is shown. */
  speed: ForceSpeed;
}

export interface ForceHost {
  /** Start it in the worker (a new force, or Try another), after the calls before it. */
  start(again: boolean): Promise<ForceStarted>;
  advance(steps: number): Promise<ForceFrame | null>;
  /** A painted Lift's stroke as it is now. */
  paint?(path: Point[], side: 1 | -1): Promise<ForceFrame | null>;
  /** Keep it (one undo step), or drop it; each applies the worker's answer to the page. */
  keep(): Promise<void>;
  drop(): Promise<void>;
  renderer(): MapRenderer | null;
  /** Show a frame: the ground and the objects. */
  show(f: ForceFrame): void;
  /** The status changed (the options row shows it). */
  changed(): void;
  error(text: string): void;
  /** A frame's moment: its effects and its sounds (a carve's surge is the driver's). */
  moment(f: ForceFrame): void;
  /** It is over: kept or dropped (its sounds stop, its effects' tails play or go). */
  ended(kept: boolean): void;
  /** Fast or Watch (the view bar's Watch), read as each force starts. */
  speed?(): ForceSpeed;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class ForceDriver {
  status: ForceStatus | null = null;
  /** The settings each force last actually ran with, by verb (D309): what a detail still on Auto
   *  shows, with one click to pin it. Kept past the run's end (unlike `status`), so the row can show
   *  it once the force is kept or dropped. */
  lastSettings: Partial<Record<Verb, AnyForceSettings>> = {};
  /** The last force's times (ms from the gesture): worked out, its land final, and kept (0 until then). */
  timing: { worked: number; final: number; kept: number } | null = null;
  private t0 = 0;
  private token = 0;
  /** A painted stroke waiting for the worker (the latest wins), and one in flight. */
  private stroke: { path: Point[]; side: 1 | -1 } | null = null;
  private painting = false;

  constructor(private readonly host: ForceHost) {}

  get running(): boolean {
    return this.status !== null;
  }

  /** Start a force (`again`: Try another; `painting`: a Lift painted as it goes). False when the
   *  worker refused it (its reason is shown). */
  async start(again = false, painting = false): Promise<boolean> {
    if (this.status) return false;
    const token = ++this.token;
    const t0 = (this.t0 = performance.now());
    this.timing = null;
    this.status = { verb: "carve", steps: 0, paused: false, stopping: false, seed: 0, painting, speed: this.host.speed?.() ?? "fast" };
    this.host.changed();
    let r: ForceStarted;
    try {
      r = await this.host.start(again);
    } catch (e) {
      r = { ok: false, errors: [String(e instanceof Error ? e.message : e)], frame: null, settings: null };
    }
    if (token !== this.token) return false;
    if (!r.ok || !r.frame) {
      this.status = null;
      this.host.changed();
      if (r.errors[0]) this.host.error(r.errors[0]);
      return false;
    }
    this.status.verb = r.frame.verb;
    this.status.seed = r.settings?.seed ?? 0;
    if (r.settings) this.lastSettings[r.frame.verb] = r.settings;
    this.show(r.frame);
    if (painting) {
      void this.pump(token);
      return true;
    }
    void this.loop(token, t0, r.frame);
    return true;
  }

  /** A painted Lift's stroke as it is now: sent when the worker is free (only the latest). */
  paint(path: Point[], side: 1 | -1): void {
    if (!this.status?.painting || this.status.stopping) return;
    this.stroke = { path: path.map((p) => ({ ...p })), side };
    void this.pump(this.token);
  }

  private async pump(token: number): Promise<void> {
    if (this.painting || !this.host.paint) return;
    this.painting = true;
    try {
      while (this.stroke && token === this.token && this.status && !this.status.stopping) {
        const s = this.stroke;
        this.stroke = null;
        const f = await this.host.paint(s.path, s.side);
        if (token !== this.token || !this.status) return;
        if (f) this.show(f);
      }
    } finally {
      this.painting = false;
    }
  }

  pause(on: boolean): void {
    if (!this.status || this.status.stopping || this.status.painting) return;
    this.status.paused = on;
    this.host.changed();
  }

  /** Keep it: it ended by itself, a painted Lift was let go, or Watch jumped to its final land (a
   *  click, a new gesture, Esc): the whole result, at once. */
  async stop(): Promise<void> {
    const st = this.status;
    if (!st || st.stopping) return;
    // a painted stroke still on its way goes first
    if (st.painting) {
      while (this.painting) await sleep(4);
      if (this.stroke) await this.pump(this.token);
    }
    st.stopping = true;
    this.token++;
    this.host.changed();
    try {
      await this.host.keep();
    } finally {
      if (this.timing) this.timing.kept = Math.round(performance.now() - this.t0);
      this.finish(true);
    }
  }

  /** Watch's way out (D321, item 29): straight to its final land, kept. */
  jump(): Promise<void> {
    return this.stop();
  }

  /** Esc (in Fast) or undo: all of it goes at once. */
  cancel(): void {
    if (!this.status || this.status.stopping) return;
    this.token++;
    this.stroke = null;
    this.finish(false);
    void this.host.drop();
  }

  private finish(kept: boolean): void {
    this.status = null;
    this.host.renderer()?.setSurge(null);
    this.host.ended(kept);
    this.host.changed();
  }

  private show(f: ForceFrame): void {
    if (this.status) this.status.steps = f.shown;
    this.host.show(f);
    if (f.verb === "carve") this.host.renderer()?.setSurge(f.done ? null : f.head, f.trail);
    this.host.moment(f);
    this.host.changed();
  }

  private async loop(token: number, t0: number, first: ForceFrame): Promise<void> {
    let f: ForceFrame = first;
    /** When its showing began, how long it takes, and the time spent paused since. */
    let from = -1;
    let length = 0;
    let held = 0;
    for (;;) {
      const st = this.status;
      if (token !== this.token || !st) return;
      if (st.paused) {
        const p0 = performance.now();
        await sleep(80);
        held += performance.now() - p0;
        continue;
      }
      const t = performance.now();
      let n = 1;
      if (f.planned) {
        if (from < 0) {
          from = t;
          length = showMs(st.verb, f.total, st.speed, t - t0);
          this.timing = { worked: Math.round(t - t0), final: 0, kept: 0 };
        }
        const target = f.total * Math.min(1, (t - from - held) / Math.max(1, length));
        n = Math.max(0, Math.ceil(target - f.shown));
      }
      if (n > 0 || f.done) {
        let next: ForceFrame | null;
        try {
          next = await this.host.advance(n);
        } catch (e) {
          next = null;
          this.host.error(String(e instanceof Error ? e.message : e));
        }
        if (token !== this.token || !this.status) return;
        // (the worker failed: all of it goes back, as Esc would, never a half-risen land left behind)
        if (!next) {
          this.cancel();
          return;
        }
        f = next;
        // (a frame the page could not show never stops the force: its next frame shows the land)
        try {
          this.show(f);
        } catch (e) {
          this.host.error(String(e instanceof Error ? e.message : e));
        }
        if (f.done) {
          if (this.timing) this.timing.final = Math.round(performance.now() - t0);
          await this.stop();
          return;
        }
      }
      // (still being worked out: straight on, so the page draws between; then a frame at a time)
      await sleep(f.planned ? Math.max(0, FRAME_MS - (performance.now() - t)) : 0);
    }
  }
}

/** The carve's words for its Power (D194): a creek to a catastrophe. */
export function powerWord(power: number): string {
  return power < 25 ? "Creek" : power < 55 ? "Torrent" : power < 85 ? "River" : "Catastrophe";
}

/** The words for a carve's Wander. */
export function wanderWord(wander: number): string {
  return wander < 20 ? "Straight" : wander < 50 ? "Gentle" : wander < 80 ? "Winding" : "Meandering";
}

/** The words for the other forces' Power: how big an impact, a quake or an eruption is. */
export function forcePowerWord(verb: Verb, power: number): string {
  if (verb === "craterize") return power < 25 ? "Pebble" : power < 55 ? "Meteor" : power < 85 ? "Asteroid" : "Cataclysm";
  if (verb === "quake") return power < 25 ? "Tremor" : power < 55 ? "Rift" : power < 85 ? "Upheaval" : "Cataclysm";
  if (verb === "erupt") return power < 25 ? "Cinder" : power < 55 ? "Cone" : power < 85 ? "Volcano" : "Cataclysm";
  if (verb === "glaciate") return power < 25 ? "Cirque" : power < 55 ? "Glacier" : power < 85 ? "Great glacier" : "Ice age";
  return powerWord(power);
}
