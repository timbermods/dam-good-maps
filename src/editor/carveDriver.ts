// Carve at work on the page (PLAN §20 D194, D199): the page drives the worker's run a few steps at a
// time, at the pace of the water's speed control (ten steps are one second of the carve on every
// machine; the pace only changes how fast it is shown), and shows each frame as it comes: the
// ground near the head first (only the chunks that changed), the water with its muddy ribbon, the
// objects that lost their ground. With motion welcome, the surge plays round the head, the camera
// may follow it (Follow), and breakthroughs and falls get a little more time on screen. Pause holds
// it; Stop keeps what is carved as one undo step; Esc or undo drops all of it at once. Nothing on
// the page waits on it: the worker runs a step in a few milliseconds, between the frames.
//
// Other forces (Craterize, Quake, Erupt; D203, D206) drive their runs the same way.

import type { ForceHead } from "../core/forces/force";
import type { ForceFrame, ForceStarted } from "../worker/session";
import type { MapRenderer } from "../render3d";
import type { WaterSpeed } from "./waterPlayer";

/** Steps a worker call runs, and the time a call's frame stays on screen (ms), at each speed:
 *  slower is the carve's own time (ten steps a second). */
export const CARVE_PACE: Record<WaterSpeed, { steps: number; ms: number }> = {
  slower: { steps: 1, ms: 100 },
  normal: { steps: 1, ms: 50 },
  faster: { steps: 2, ms: 40 },
  instant: { steps: 10, ms: 0 },
};

/** The head's moments that get half as long again on screen when the camera follows. */
const DRAMATIC = new Set<ForceHead["event"]>(["breakthrough", "waterfall", "oxbow", "split"]);

export interface CarveStatus {
  /** Steps run (ten a second). */
  steps: number;
  paused: boolean;
  /** Stop was pressed: the carve is being kept. */
  stopping: boolean;
  /** The personality it runs with (Try another path takes the next). */
  seed: number;
}

export interface CarveHost {
  /** Start it in the worker (a new carve, or Try another path), after the calls before it. */
  start(again: boolean): Promise<ForceStarted>;
  advance(steps: number): Promise<ForceFrame | null>;
  /** Keep it (one undo step), or drop it; each applies the worker's answer to the page. */
  keep(): Promise<void>;
  drop(): Promise<void>;
  renderer(): MapRenderer | null;
  speed(): WaterSpeed;
  follow(): boolean;
  /** Show a frame: the ground, the water, the objects. */
  show(f: ForceFrame): void;
  /** The status changed (the options row shows it). */
  changed(): void;
  error(text: string): void;
  /** The head is cutting at tile (x, y), `size` tiles wide (its sound and its dust). */
  feel(x: number, y: number, size: number): void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class CarveDriver {
  status: CarveStatus | null = null;
  private token = 0;
  private head: ForceHead | null = null;
  private followFrame = 0;

  constructor(private readonly host: CarveHost) {}

  get running(): boolean {
    return this.status !== null;
  }

  /** Start a carve (`again`: Try another path). False when the worker refused it (its reason is
   *  shown). */
  async start(again = false): Promise<boolean> {
    if (this.status) return false;
    const token = ++this.token;
    this.status = { steps: 0, paused: false, stopping: false, seed: 0 };
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
    this.status.seed = r.settings?.seed ?? 0;
    this.show(r.frame);
    void this.loop(token);
    this.followHead(token);
    return true;
  }

  pause(on: boolean): void {
    if (!this.status || this.status.stopping) return;
    this.status.paused = on;
    this.host.changed();
  }

  /** Stop: keep what is carved (it ended by itself: the same). */
  async stop(): Promise<void> {
    const st = this.status;
    if (!st || st.stopping) return;
    st.stopping = true;
    this.token++;
    this.host.changed();
    try {
      await this.host.keep();
    } finally {
      this.finish();
    }
  }

  /** Esc or undo: all of it goes at once. */
  cancel(): void {
    if (!this.status || this.status.stopping) return;
    this.token++;
    this.finish();
    void this.host.drop();
  }

  private finish(): void {
    this.status = null;
    this.head = null;
    if (this.followFrame) cancelAnimationFrame(this.followFrame);
    this.followFrame = 0;
    this.host.renderer()?.setSurge(null);
    this.host.changed();
  }

  private motion(): boolean {
    return !!this.host.renderer()?.motion;
  }

  private show(f: ForceFrame): void {
    this.head = f.head;
    if (this.status) this.status.steps = f.steps;
    this.host.show(f);
    const r = this.host.renderer();
    r?.setSurge(f.done ? null : f.head, f.trail);
    if (f.head.cut > 0) this.host.feel(Math.round(f.head.x), Math.round(f.head.y), f.head.width);
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
      const pace = CARVE_PACE[this.host.speed()] ?? CARVE_PACE.normal;
      const dramatic = !!this.head && DRAMATIC.has(this.head.event) && this.host.follow() && this.motion();
      const ms = pace.ms * (dramatic ? 1.5 : 1);
      const t0 = performance.now();
      let f: ForceFrame | null;
      try {
        f = await this.host.advance(pace.steps);
      } catch (e) {
        f = null;
        this.host.error(String(e instanceof Error ? e.message : e));
      }
      if (token !== this.token || !this.status) return;
      if (!f) {
        this.finish();
        return;
      }
      this.show(f);
      if (f.done) {
        await this.stop();
        return;
      }
      // (at least a frame between calls, so the page draws each)
      await sleep(Math.max(ms - (performance.now() - t0), ms ? 0 : 16));
    }
  }

  /** The camera eases after the head while Follow is on (not with reduced motion). */
  private followHead(token: number): void {
    if (typeof requestAnimationFrame !== "function") return;
    let last = performance.now();
    const step = (t: number) => {
      if (token !== this.token || !this.status) return;
      const dt = Math.min(0.05, Math.max(0, (t - last) / 1000));
      last = t;
      const r = this.host.renderer();
      const h = this.head;
      if (r && h && this.host.follow() && r.motion && !this.status.paused) {
        const v = r.getView();
        const to = [h.x + 0.5, h.z, -(h.y + 0.5)];
        const k = 1 - Math.exp(-dt * 1.4);
        r.setView({ target: [v.target[0] + (to[0] - v.target[0]) * k, v.target[1] + (to[1] - v.target[1]) * k, v.target[2] + (to[2] - v.target[2]) * k] });
      }
      this.followFrame = requestAnimationFrame(step);
    };
    this.followFrame = requestAnimationFrame(step);
  }
}

/** The carve's words for its Power (D194): a creek to a catastrophe. */
export function powerWord(power: number): string {
  return power < 25 ? "Creek" : power < 55 ? "Torrent" : power < 85 ? "River" : "Catastrophe";
}

/** The words for its Wander. */
export function wanderWord(wander: number): string {
  return wander < 20 ? "Straight" : wander < 50 ? "Gentle" : wander < 80 ? "Winding" : "Meandering";
}
