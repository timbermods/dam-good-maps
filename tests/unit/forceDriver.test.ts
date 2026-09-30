// A force at work on the page (D199, D202, D203, D206; paced by D321, item 29): the driver asks the
// worker to work the force out (a slice a call), then shows it at the chosen pace: Fast, its land final
// within about two seconds of the gesture; Watch, about four times as long, and a jump straight to its
// final land keeps it at once. It shows every frame and its moment, holds a carve on Pause, keeps it
// when it ends, and drops all of it on Esc, at any moment until it is kept, its keep on its way
// included (D341); a refused start says why and leaves nothing running; a painted Lift sends only the
// latest stroke while the worker is busy, and is kept when the pointer lets go.
//
// Time is a stepped clock (D341): every pace and moment here is exact, never the machine's.

import { describe, expect, it } from "vitest";
import { CARVE_PACE, dueMs, FAST_MS, FRAME_MS, ForceDriver, forcePowerWord, MIN_SHOW_MS, paceOf, powerWord, showMs, WATCH_FACTOR, type ForceHost, type ForceSpeed } from "../../src/editor/forceDriver";
import type { Verb } from "../../src/core/forces/op";
import type { ForceFrame, ForceStarted } from "../../src/worker/session";
import { StepClock } from "../stepClock";

const head = { x: 5, y: 5, z: 3, dx: 1, dy: 0, width: 4, event: "surge" as const, cut: 3 };

/** A worker's force: worked out over `workCalls` calls (each taking `workMs`), then `total` steps;
 *  each call takes `latency` ms there and back. The keep lands unless Esc's drop takes it back. */
function fakeHost(clock: StepClock, opts: { total?: number; workCalls?: number; workMs?: number; refuse?: string; verb?: Verb; paintMs?: number; speed?: ForceSpeed; latency?: number } = {}) {
  const total = opts.total ?? 400;
  const latency = opts.latency ?? 1;
  let calls = 0;
  let shownSteps = 0;
  const log: string[] = [];
  const shown: number[] = [];
  const moments: string[] = [];
  const painted: number[] = [];
  /** What the worker kept, by gesture (a drop takes it back). */
  const landed = new Set<number>();
  const verb = opts.verb ?? "carve";
  const planned = () => calls >= (opts.workCalls ?? 3);
  const frame = (): ForceFrame => ({
    verb,
    steps: shownSteps,
    done: planned() && shownSteps >= total,
    reason: "lake",
    planned: planned(),
    total: planned() ? total : 0,
    shown: shownSteps,
    head,
    trail: [],
    cue: { verb, phase: verb === "craterize" ? (shownSteps > 3 ? "impact" : "incoming") : "carve", progress: 0, x: 5, y: 5, z: 3, size: 4, power: 50 },
  });
  const host: ForceHost = {
    start: async (again, gesture) => {
      log.push(`${again ? "again" : "start"}#${gesture}`);
      await clock.sleep(latency);
      if (opts.refuse) return { ok: false, errors: [opts.refuse], frame: null, settings: null } as ForceStarted;
      return { ok: true, errors: [], frame: frame(), settings: { mode: "unleash", power: 50, walls: "steep", defyGravity: false, dry: false, layers: true, seed: again ? 1 : 0 }, verb, gesture };
    },
    advance: async (n) => {
      if (!planned()) {
        calls++;
        await clock.sleep(opts.workMs ?? 1);
      } else {
        shownSteps = Math.min(total, shownSteps + n);
        await clock.sleep(latency);
      }
      return frame();
    },
    paint: async (path) => {
      painted.push(path.length);
      await clock.sleep(opts.paintMs ?? 1);
      return frame();
    },
    keep: async (gesture, wanted) => {
      await clock.sleep(latency);
      if (!wanted()) return void log.push(`keep#${gesture}:skipped`);
      landed.add(gesture);
      log.push(`keep@${shownSteps}`);
      await clock.sleep(latency);
    },
    drop: async (gesture) => {
      await clock.sleep(latency);
      landed.delete(gesture);
      log.push(`drop@${shownSteps}`);
    },
    renderer: () => null,
    show: (f) => void shown.push(f.shown),
    changed: () => undefined,
    error: (t) => void log.push(`error:${t}`),
    moment: (f) => void moments.push(f.cue.phase),
    ended: (kept) => void log.push(kept ? "ended:kept" : "ended:dropped"),
    speed: () => opts.speed ?? "fast",
  };
  return { host, log, shown, moments, painted, landed };
}

describe("the force driver", () => {
  it("Fast: worked out first, then its land final within about two seconds of the gesture, however long the force; every frame shown in order with its moment", async () => {
    const clock = new StepClock();
    const h = fakeHost(clock, { total: 800, workCalls: 5, workMs: 20 });
    const d = new ForceDriver(h.host, clock);
    const started = d.start();
    await clock.until(() => !d.running);
    expect(await started).toBe(true);
    // (worked out in five calls of 20 ms, then shown in what is left of the two seconds)
    expect(d.timing!.worked).toBeGreaterThanOrEqual(5 * 20 + 1);
    expect(d.timing!.worked).toBeLessThan(5 * 20 + 1 + FRAME_MS);
    expect(d.timing!.due).toBe(FAST_MS);
    expect(d.timing!.show).toBe(FAST_MS - d.timing!.worked);
    expect(d.timing!.final).toBeGreaterThanOrEqual(FAST_MS);
    expect(d.timing!.final).toBeLessThanOrEqual(FAST_MS + 2 * FRAME_MS);
    expect(h.log).toContain("keep@800");
    expect(h.log).toContain("ended:kept");
    expect(h.shown).toEqual([...h.shown].sort((a, b) => a - b));
    expect(h.moments.length).toBe(h.shown.length);
  });

  it("Fast keeps a quicker force's own pace; a slow working-out still leaves it a short showing", () => {
    expect(showMs("craterize", 11, "fast", 20)).toBe(11 * CARVE_PACE.ms);
    expect(showMs("carve", 800, "fast", 300)).toBe(FAST_MS - 300);
    expect(showMs("glaciate", 50, "fast", 1900)).toBe(MIN_SHOW_MS);
    expect(dueMs("carve", 800, "fast", 300)).toBe(FAST_MS);
    expect(dueMs("glaciate", 50, "fast", 1900)).toBe(1900 + MIN_SHOW_MS);
    // Watch: four times Fast's own, whatever the working-out took
    expect(showMs("carve", 800, "watch", 300)).toBe(WATCH_FACTOR * FAST_MS);
    expect(showMs("craterize", 11, "watch", 20)).toBe(WATCH_FACTOR * 11 * CARVE_PACE.ms);
  });

  it("Watch plays it out about four times as long; a jump keeps its whole result at once", async () => {
    const clock = new StepClock();
    const h = fakeHost(clock, { total: 800, workCalls: 2, speed: "watch" });
    const d = new ForceDriver(h.host, clock);
    void d.start();
    await clock.settle();
    expect(d.status!.speed).toBe("watch");
    await clock.run(1500);
    expect(d.running).toBe(true);
    const part = h.shown.at(-1)!;
    expect(part).toBeGreaterThan(0);
    expect(part).toBeLessThan(400);
    const jumped = d.jump();
    await clock.until(() => !d.running);
    await jumped;
    expect(h.log).toContain("ended:kept");
    expect(h.log.some((l) => l.startsWith("keep@"))).toBe(true);
    expect(d.timing!.show).toBe(WATCH_FACTOR * FAST_MS);
  });

  it("Pause holds it; Esc drops all of it", async () => {
    const clock = new StepClock();
    const h = fakeHost(clock, { total: 800 });
    const d = new ForceDriver(h.host, clock);
    void d.start();
    await clock.until(() => (d.status?.steps ?? 0) >= 10);
    d.pause(true);
    await clock.run(60);
    const held = d.status!.steps;
    await clock.run(5000);
    expect(d.status!.steps).toBe(held);
    d.cancel();
    expect(d.running).toBe(false);
    await clock.run(100);
    expect(h.log.some((l) => l.startsWith("drop@"))).toBe(true);
    expect(h.log.some((l) => l.startsWith("keep"))).toBe(false);
    expect(h.log).toContain("ended:dropped");
  });

  it("Esc at every moment until it is kept, its keep on its way included, takes all of it back, and nothing lands afterwards (D341)", async () => {
    // every clock moment of a whole run, the keep's round trip among them
    const whole = new StepClock();
    const w = fakeHost(whole, { total: 60, workCalls: 3, latency: 3 });
    const wd = new ForceDriver(w.host, whole);
    void wd.start();
    const moments: number[] = [];
    while (wd.running) {
      moments.push(whole.elapsed);
      if (!(await whole.tick())) break;
    }
    expect(moments.length).toBeGreaterThan(20);
    for (const at of moments) {
      const clock = new StepClock();
      const h = fakeHost(clock, { total: 60, workCalls: 3, latency: 3 });
      const d = new ForceDriver(h.host, clock);
      void d.start();
      await clock.until(() => clock.elapsed >= at || !d.running);
      const was = d.running;
      d.cancel();
      await clock.run(10_000);
      if (was) {
        expect(h.log, `Esc at ${at} ms`).toContain("ended:dropped");
        expect(h.log, `Esc at ${at} ms`).not.toContain("ended:kept");
        expect([...h.landed], `Esc at ${at} ms: nothing lands`).toEqual([]);
      }
      expect(d.running).toBe(false);
    }
  });

  it("Esc while it is being kept (its keep sent, or on its way back) takes it back: the keep never shows, and it never ends kept (D341)", async () => {
    for (const late of [false, true]) {
      const clock = new StepClock();
      const h = fakeHost(clock, { total: 20, latency: 5 });
      const d = new ForceDriver(h.host, clock);
      void d.start();
      await clock.until(() => !!d.status?.stopping);
      // (late: the worker has kept it; its answer is on its way back)
      if (late) await clock.until(() => h.landed.size > 0);
      expect(d.running).toBe(true);
      d.cancel();
      expect(d.running).toBe(false);
      await clock.run(1000);
      expect(h.landed.size).toBe(0);
      expect(h.log).toContain("ended:dropped");
      expect(h.log).not.toContain("ended:kept");
      if (!late) expect(h.log.some((l) => l.endsWith(":skipped"))).toBe(true);
    }
  });

  it("a force Esc took back, still being kept, never takes over the next one", async () => {
    const clock = new StepClock();
    const h = fakeHost(clock, { total: 20, latency: 5 });
    const d = new ForceDriver(h.host, clock);
    void d.start();
    await clock.until(() => !!d.status?.stopping);
    const first = d.lastGesture;
    d.cancel();
    // a new force at once: the old keep's end leaves it running
    void d.start();
    await clock.settle();
    expect(d.status!.gesture).toBe(first + 1);
    await clock.run(12);
    expect(d.status?.gesture).toBe(first + 1);
    await clock.until(() => !d.running);
    expect([...h.landed]).toEqual([first + 1]);
  });

  it("ending by itself keeps it; Try another starts again", async () => {
    const clock = new StepClock();
    const h = fakeHost(clock, { total: 25 });
    const d = new ForceDriver(h.host, clock);
    void d.start();
    await clock.until(() => !d.running);
    expect(h.log.filter((l) => l.startsWith("keep@")).at(-1)).toBe("keep@25");
    void d.start(true);
    await clock.settle();
    await clock.tick();
    expect(d.status!.seed).toBe(1);
    d.cancel();
  });

  it("a staged force (Craterize) runs to its end and is kept, its moments in order", async () => {
    const clock = new StepClock();
    const h = fakeHost(clock, { total: 11, verb: "craterize" });
    const d = new ForceDriver(h.host, clock);
    void d.start();
    await clock.tick();
    expect(d.status!.verb).toBe("craterize");
    await clock.until(() => !d.running);
    expect(h.log).toContain("ended:kept");
    expect(h.moments[0]).toBe("incoming");
    expect(h.moments.at(-1)).toBe("impact");
    // (its own pace: quicker than Fast's two seconds)
    expect(d.timing!.show).toBe(11 * CARVE_PACE.ms);
  });

  it("a painted Lift sends only the latest stroke while the worker is busy, and is kept when let go", async () => {
    const clock = new StepClock();
    const h = fakeHost(clock, { verb: "quake", paintMs: 30 });
    const d = new ForceDriver(h.host, clock);
    const started = d.start(false, true);
    await clock.tick();
    expect(await started).toBe(true);
    expect(d.status!.painting).toBe(true);
    const path = [{ x: 1, y: 1 }];
    for (let k = 2; k < 12; k++) {
      path.push({ x: k, y: 1 });
      d.paint(path, 1);
    }
    const stopped = d.stop();
    await clock.until(() => !d.running);
    await stopped;
    // the first stroke, then only the latest: never every one
    expect(h.painted.length).toBeLessThan(10);
    expect(h.painted.at(-1)).toBe(11);
    expect(h.log.at(-1)).toBe("ended:kept");
  });

  it("a painted Lift let go and taken back at once is dropped, never kept", async () => {
    const clock = new StepClock();
    const h = fakeHost(clock, { verb: "quake", paintMs: 30 });
    const d = new ForceDriver(h.host, clock);
    void d.start(false, true);
    await clock.tick();
    d.paint([{ x: 1, y: 1 }, { x: 5, y: 1 }], 1);
    void d.stop();
    d.cancel();
    await clock.run(1000);
    expect(h.landed.size).toBe(0);
    expect(h.log).not.toContain("ended:kept");
  });

  it("a refused start says why and leaves nothing running", async () => {
    const clock = new StepClock();
    const h = fakeHost(clock, { refuse: "Start here" });
    const d = new ForceDriver(h.host, clock);
    const started = d.start();
    await clock.run(10);
    expect(await started).toBe(false);
    expect(d.running).toBe(false);
    expect(h.log).toContain("error:Start here");
  });

  it("each force keeps its own pace, whatever the water's speed (D266): an eruption's 28 stages in about 1.5 seconds (D312), a glacier's 50 in five (D246); Fast compresses the longer ones to two (D321)", () => {
    expect((CARVE_PACE.steps * 1000) / CARVE_PACE.ms).toBe(20);
    expect(paceOf("craterize")).toEqual(CARVE_PACE);
    expect(paceOf("quake")).toEqual(CARVE_PACE);
    expect((28 * paceOf("erupt").ms) / 1000).toBeLessThanOrEqual(2);
    expect((28 * paceOf("erupt").ms) / 1000).toBeGreaterThan(1.2);
    expect((50 * paceOf("glaciate").ms) / 1000).toBeCloseTo(5, 1);
    expect(showMs("glaciate", 50, "fast", 0)).toBe(FAST_MS);
    expect([0, 30, 60, 90].map((p) => forcePowerWord("glaciate", p))).toEqual(["Cirque", "Glacier", "Great glacier", "Ice age"]);
    expect([0, 30, 60, 90].map(powerWord)).toEqual(["Creek", "Torrent", "River", "Catastrophe"]);
    expect([0, 30, 60, 90].map((p) => forcePowerWord("craterize", p))).toEqual(["Pebble", "Meteor", "Asteroid", "Cataclysm"]);
  });
});
