// A clock the tests step (PLAN §20 D341): the force driver's time and timers, moved on by hand, so
// every moment of a force can be reached exactly and nothing waits on the wall clock.

import type { ForceClock } from "../src/editor/forceDriver";

export class StepClock implements ForceClock {
  private t = 0;
  private seq = 0;
  private timers: { at: number; seq: number; resolve: () => void }[] = [];

  now = (): number => this.t;

  sleep = (ms: number): Promise<void> =>
    new Promise<void>((resolve) => {
      this.timers.push({ at: this.t + Math.max(0, ms), seq: this.seq++, resolve });
    });

  /** Let every promise that can settle now settle (no timer fires). */
  async settle(): Promise<void> {
    for (let k = 0; k < 3; k++) await new Promise<void>((r) => setImmediate(r));
  }

  /** Fire the next timer, time moving on to it; false when none is waiting. */
  async tick(): Promise<boolean> {
    await this.settle();
    if (!this.timers.length) return false;
    this.timers.sort((a, b) => a.at - b.at || a.seq - b.seq);
    const next = this.timers.shift()!;
    this.t = Math.max(this.t, next.at);
    next.resolve();
    await this.settle();
    return true;
  }

  /** Step until `done()` (or nothing is waiting any more); `limit` ms of the clock at most. */
  async until(done: () => boolean, limit = 120_000): Promise<void> {
    const end = this.t + limit;
    while (!done()) {
      if (this.t > end) throw new Error(`the clock ran ${limit} ms without it happening`);
      if (!(await this.tick())) return;
    }
  }

  /** Step on for `ms` of the clock (or until nothing is waiting). */
  async run(ms: number): Promise<void> {
    const end = this.t + ms;
    for (;;) {
      await this.settle();
      this.timers.sort((a, b) => a.at - b.at || a.seq - b.seq);
      if (!this.timers.length || this.timers[0].at > end) break;
      await this.tick();
    }
    this.t = Math.max(this.t, end);
  }

  get elapsed(): number {
    return this.t;
  }
}
