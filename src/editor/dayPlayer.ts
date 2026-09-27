// The Drought and Badtide day strip's player (PLAN §20 D267 (2), D268): a hazard shown day by day,
// from Day 0 (the map as it is) to its last day. Stepping from one day to the next plays that
// day's water moving at the strip's Speed (slower, normal, faster); Instant jumps straight to the
// day. Any other move (back a day, a click on a day further on) goes straight there. Play runs
// through the days in order and stops on the last; nothing ever goes back on its own. Pause holds
// the step being played, Skip finishes it (while playing, straight to the last day).
//
// The worker keeps each day's water and a few frames within it (worker/session.ts `showHazard`);
// the player asks for them as it goes and blends between the frames, so a step is smooth at any
// speed.

import type { SoilView, WaterView } from "../render3d/model";
import { blendWater } from "./waterPlayer";

export type DaySpeed = "slower" | "normal" | "faster" | "instant";
export const DAY_SPEEDS: readonly DaySpeed[] = ["slower", "normal", "faster", "instant"];
/** How long a step from one day to the next plays, by speed (ms). */
export const STEP_MS: Record<DaySpeed, number> = { slower: 3000, normal: 1200, faster: 450, instant: 0 };
/** While playing at Instant, how long each day stays on screen before the next (ms). */
export const INSTANT_HOLD_MS = 500;
/** Frames a second while a step plays. */
const FPS = 30;

export interface DayHost {
  /** A day's water and soil (0: the map as it is), or null once the hazard has ended. */
  day(day: number): Promise<{ water: WaterView; soil: SoilView } | null>;
  /** The frames within a day (its last is the day's end), or null once the hazard has ended. */
  steps(day: number): Promise<WaterView[] | null>;
  /** Put water (and, at a day, its soil) on screen. */
  show(water: WaterView, soil?: SoilView): void;
  /** The player's state changed (for the strip). */
  changed(): void;
}

export class DayPlayer {
  /** The day on screen (while a step plays: the day it started from). */
  day: number;
  /** The day a step is playing to, or null. */
  target: number | null = null;
  playing = false;
  paused = false;
  speed: DaySpeed;
  /** Moves made; an older move's answers are dropped. */
  private move = 0;
  private timer: ReturnType<typeof setTimeout> | 0 = 0;
  /** The step playing: its frames (the day before first), and how far it has come (ms). */
  private step: { frames: WaterView[]; soil: SoilView | null; elapsed: number; t0: number } | null = null;
  private ended = false;
  /** The water of the day on screen. */
  private water: WaterView;

  constructor(
    private readonly host: DayHost,
    readonly days: number,
    speed: DaySpeed,
    /** The day on screen when the strip opens (the last: the worst day), with its water. */
    shown: { day: number; water: WaterView },
  ) {
    this.day = shown.day;
    this.speed = speed;
    this.water = shown.water;
  }

  /** How far the step playing has come (0–1), or null. */
  get stepProgress(): number | null {
    const s = this.step;
    if (!s || this.target === null) return null;
    const ms = STEP_MS[this.speed];
    return ms > 0 ? Math.min(1, s.elapsed / ms) : 1;
  }

  /** Go to a day: the next one plays its water at the speed; any other goes straight there. */
  goTo(day: number): void {
    day = Math.max(0, Math.min(this.days, Math.round(day)));
    this.playing = false;
    this.paused = false;
    this.moveTo(day);
  }

  next(): void {
    if (this.target !== null) return this.goTo(this.target + 1);
    this.goTo(this.day + 1);
  }

  prev(): void {
    this.goTo((this.target ?? this.day) - 1);
  }

  /** Run through the days in order to the last (from Day 0 when on the last), or stop. */
  play(): void {
    if (this.playing) {
      this.playing = false;
      this.host.changed();
      return;
    }
    const held = this.paused;
    this.paused = false;
    this.playing = true;
    if (this.target === null && this.day >= this.days) {
      // from the start again: Day 0 at once, then each day in turn
      this.moveTo(0);
      return;
    }
    if (this.target === null) return this.moveTo(this.day + 1);
    // a step under way carries on (held: from where it was held)
    if (held && this.step) {
      this.step.t0 = performance.now();
      this.tick();
    }
    this.host.changed();
  }

  /** Hold the step playing, or carry on. */
  pause(on: boolean): void {
    this.paused = on;
    const s = this.step;
    if (on) {
      this.stopTimer();
      if (s) s.elapsed += performance.now() - s.t0;
    } else if (s) {
      s.t0 = performance.now();
      this.tick();
    } else if (this.playing) this.continuePlay();
    this.host.changed();
  }

  /** Finish the step playing at once; while playing, straight to the last day. */
  skip(): void {
    const to = this.playing ? this.days : this.target;
    this.playing = false;
    this.paused = false;
    if (to === null) return;
    this.jump(to, ++this.move);
  }

  setSpeed(speed: DaySpeed): void {
    const s = this.step;
    if (s && !this.paused) {
      s.elapsed += performance.now() - s.t0;
      s.t0 = performance.now();
    }
    // (the step playing keeps how far it has come, as a share of its new length)
    if (s) s.elapsed = (s.elapsed / Math.max(1, STEP_MS[this.speed])) * STEP_MS[speed];
    this.speed = speed;
    if (speed === "instant" && this.target !== null) return this.jump(this.target, ++this.move);
    this.host.changed();
  }

  /** The strip closes: nothing more is shown. */
  end(): void {
    this.ended = true;
    this.move++;
    this.stopTimer();
    this.step = null;
    this.target = null;
    this.playing = false;
  }

  private moveTo(day: number): void {
    const m = ++this.move;
    this.stopTimer();
    this.step = null;
    if (day === this.day + 1 && this.speed !== "instant") void this.animate(day, m);
    else this.jump(day, m);
  }

  /** Straight to a day, and it stays there. */
  private jump(day: number, m: number): void {
    this.stopTimer();
    this.step = null;
    this.target = day;
    this.host.changed();
    void this.host.day(day).then((d) => {
      if (m !== this.move || this.ended || !d) return;
      this.arrive(day, d.water, d.soil);
    });
  }

  /** The step to the next day: its water moving, at the speed. */
  private async animate(day: number, m: number): Promise<void> {
    this.target = day;
    this.host.changed();
    const [frames, d] = await Promise.all([this.host.steps(day), this.host.day(day)]);
    if (m !== this.move || this.ended || !frames || !d) return;
    this.step = { frames: [this.water, ...frames.slice(0, -1), d.water], soil: d.soil, elapsed: 0, t0: performance.now() };
    if (!this.paused) this.tick();
  }

  private tick(): void {
    const s = this.step;
    if (!s || this.ended || this.paused || this.target === null) return;
    const ms = STEP_MS[this.speed];
    const t = ms > 0 ? Math.min(1, (s.elapsed + performance.now() - s.t0) / ms) : 1;
    const n = s.frames.length - 1;
    if (t >= 1) {
      this.arrive(this.target, s.frames[n], s.soil ?? undefined);
      return;
    }
    const x = t * n;
    const k = Math.floor(x);
    this.host.show(blendWater(s.frames[k], s.frames[k + 1], x - k));
    this.host.changed();
    this.timer = setTimeout(() => {
      this.timer = 0;
      this.tick();
    }, 1000 / FPS);
  }

  /** On a day: its water and soil, and it stays; while playing, the next day follows. */
  private arrive(day: number, water: WaterView, soil?: SoilView): void {
    this.step = null;
    this.target = null;
    this.day = day;
    this.water = water;
    this.host.show(water, soil);
    if (this.playing && day >= this.days) this.playing = false;
    this.host.changed();
    if (this.playing && !this.paused) this.continuePlay();
  }

  private continuePlay(): void {
    if (this.day >= this.days) {
      this.playing = false;
      this.host.changed();
      return;
    }
    const m = this.move;
    const go = () => {
      if (m !== this.move || !this.playing || this.paused || this.ended) return;
      this.moveTo(this.day + 1);
    };
    if (this.speed === "instant") this.timer = setTimeout(go, INSTANT_HOLD_MS);
    else go();
  }

  private stopTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = 0;
  }
}
