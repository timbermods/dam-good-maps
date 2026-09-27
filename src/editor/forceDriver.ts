// A force at work on the page (PLAN §20 D194, D199, D202, D203, D206): the page drives the worker's
// run a step at a time, at the force's own pace whatever the water's speed (D266: ten steps are one
// second of a carve on every machine), and shows each frame as it comes: the ground that changed
// (only its chunks), the water moving with it, the objects. Each frame's moment goes to the effects
// and the sounds (a carve's surge; an impact, a fault's crack, an eruption's plume); the camera
// never moves by itself (D265). Pause holds a carve; Stop keeps what is carved; a staged
// force (Craterize, Erupt, Quake) is kept when it ends; Esc or undo drops all of it at once. A
// painted Lift is shown whole as it is painted (the page sends the latest stroke whenever the worker
// is free) and kept when the pointer lets go. Nothing on the page waits on it: the worker runs a step
// in a few milliseconds, between the frames.

import type { Verb } from "../core/forces/op";
import type { Point } from "../core/forces/quake";
import type { ForceFrame, ForceStarted } from "../worker/session";
import type { MapRenderer } from "../render3d";

/** Steps a worker call runs, and the time a call's frame stays on screen (ms): a force's own pace,
 *  the same whatever the water's speed (D266). */
export const FORCE_PACE = { steps: 1, ms: 50 };
/** (Carve's name for it.) */
export const CARVE_PACE = FORCE_PACE;

/** An eruption's pace (D226): its volcano swells over about four seconds, as the demo Kyler
 *  approved (eight pulses, each eased in over a fifth of a second), so the land rises with its
 *  plume and its glow instead of ending before them. */
export const ERUPT_PACE = { steps: 1, ms: 140 };

/** A force's own pace (D266: the water's speed doesn't change it). */
export function paceOf(verb: Verb): { steps: number; ms: number } {
  return verb === "erupt" ? ERUPT_PACE : FORCE_PACE;
}

export interface ForceStatus {
  verb: Verb;
  /** Steps run (ten a second). */
  steps: number;
  paused: boolean;
  /** It is being kept. */
  stopping: boolean;
  /** The personality it runs with (Try another takes the next). */
  seed: number;
  /** A painted Lift: it follows the stroke until the pointer lets go. */
  painting: boolean;
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
  /** Show a frame: the ground, the water, the objects. */
  show(f: ForceFrame): void;
  /** The status changed (the options row shows it). */
  changed(): void;
  error(text: string): void;
  /** A frame's moment: its effects and its sounds (a carve's surge is the driver's). */
  moment(f: ForceFrame): void;
  /** It is over: kept or dropped (its sounds stop, its effects' tails play or go). */
  ended(kept: boolean): void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class ForceDriver {
  status: ForceStatus | null = null;
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
    this.status = { verb: "carve", steps: 0, paused: false, stopping: false, seed: 0, painting };
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
    this.show(r.frame);
    if (painting) {
      void this.pump(token);
      return true;
    }
    void this.loop(token);
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

  /** Keep what it has done (it ended by itself: the same; a painted Lift let go). */
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
      this.finish(true);
    }
  }

  /** Esc or undo: all of it goes at once. */
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
    if (this.status) this.status.steps = f.steps;
    this.host.show(f);
    if (f.verb === "carve") this.host.renderer()?.setSurge(f.done ? null : f.head, f.trail);
    this.host.moment(f);
    this.host.changed();
  }

  private async loop(token: number): Promise<void> {
    for (;;) {
      const st = this.status;
      if (token !== this.token || !st) return;
      if (st.paused) {
        await sleep(80);
        continue;
      }
      const pace = paceOf(st.verb);
      const ms = pace.ms;
      const t0 = performance.now();
      let f: ForceFrame | null;
      try {
        f = await this.host.advance(pace.steps);
      } catch (e) {
        f = null;
        this.host.error(String(e instanceof Error ? e.message : e));
      }
      if (token !== this.token || !this.status) return;
      // (the worker failed: all of it goes back, as Esc would, never a half-risen land left behind)
      if (!f) {
        this.cancel();
        return;
      }
      // (a frame the page could not show never stops the force: its next frame shows the land)
      try {
        this.show(f);
      } catch (e) {
        this.host.error(String(e instanceof Error ? e.message : e));
      }
      if (f.done) {
        await this.stop();
        return;
      }
      // (at least a frame between calls, so the page draws each)
      await sleep(Math.max(ms - (performance.now() - t0), ms ? 0 : 16));
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
  return powerWord(power);
}
