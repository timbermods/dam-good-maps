// The Drought and Badtide day strip's player (PLAN §20 D267 (2)): stepping to the next day plays its
// water at the strip's Speed and ends on the day; Instant jumps straight to the day and stays there;
// any other move goes straight there; Play runs through the days and stops on the last; Pause holds
// a step and Skip finishes it; nothing ever goes back on its own.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DayPlayer, INSTANT_HOLD_MS, STEP_MS, type DayHost } from "../../src/editor/dayPlayer";
import type { SoilView, WaterView } from "../../src/render3d/model";

/** A day's water: one tile, as deep as its day (the frames within day d go from d − 1 to d). */
const water = (depth: number): WaterView => ({ count: 1, tile: Int32Array.of(0), floor: Float32Array.of(0), depth: Float32Array.of(depth), contamination: Float32Array.of(0) });
const soil: SoilView = { moisture: new Uint8Array(1), contamination: new Uint8Array(1) };

function host() {
  const shown: number[] = [];
  const h: DayHost & { shown: number[] } = {
    shown,
    day: async (d) => ({ water: water(d), soil }),
    steps: async (d) => [0.25, 0.5, 0.75, 1].map((f) => water(d - 1 + f)),
    show: (w) => void shown.push(w.depth[0]),
    changed: () => undefined,
  };
  return h;
}

/** Let the player's promises and timers run for `ms`. */
async function pass(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
}

describe("the day strip's player", () => {
  beforeEach(() => void vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] }));
  afterEach(() => void vi.useRealTimers());

  it("opens on the worst day, and at Instant a step jumps to the next day and stays there", async () => {
    const h = host();
    const p = new DayPlayer(h, 9, "instant", { day: 9, water: water(9) });
    expect(p.day).toBe(9);
    p.goTo(3);
    await pass(10);
    expect(p.day).toBe(3);
    p.next();
    await pass(10);
    expect(p.day).toBe(4);
    expect(h.shown.at(-1)).toBe(4);
    // nothing goes back on its own
    await pass(60_000);
    expect(p.day).toBe(4);
    expect(p.target).toBeNull();
    expect(h.shown.at(-1)).toBe(4);
  });

  it("at normal speed the next day's water moves over the step, then the day stays", async () => {
    const h = host();
    const p = new DayPlayer(h, 9, "normal", { day: 3, water: water(3) });
    p.next();
    await pass(STEP_MS.normal / 2);
    expect(p.day).toBe(3);
    expect(p.target).toBe(4);
    const mid = h.shown.at(-1)!;
    expect(mid).toBeGreaterThan(3);
    expect(mid).toBeLessThan(4);
    await pass(STEP_MS.normal);
    expect(p.day).toBe(4);
    expect(h.shown.at(-1)).toBe(4);
    await pass(30_000);
    expect(p.day).toBe(4);
  });

  it("back a day, or a click further on, goes straight there", async () => {
    const h = host();
    const p = new DayPlayer(h, 9, "slower", { day: 5, water: water(5) });
    p.prev();
    await pass(10);
    expect(p.day).toBe(4);
    p.goTo(8);
    await pass(10);
    expect(p.day).toBe(8);
    expect(h.shown).toEqual([4, 8]);
  });

  it("Pause holds a step and Skip finishes it", async () => {
    const h = host();
    const p = new DayPlayer(h, 9, "slower", { day: 0, water: water(0) });
    p.next();
    await pass(STEP_MS.slower / 3);
    p.pause(true);
    const held = h.shown.at(-1);
    await pass(STEP_MS.slower * 2);
    expect(h.shown.at(-1)).toBe(held);
    expect(p.day).toBe(0);
    p.skip();
    await pass(10);
    expect(p.day).toBe(1);
    expect(p.paused).toBe(false);
  });

  it("Play runs through the days in order and stops on the last; from the last, it starts at Day 0", async () => {
    const h = host();
    const p = new DayPlayer(h, 3, "faster", { day: 3, water: water(3) });
    p.play();
    await pass(10);
    expect(p.day).toBe(0);
    await pass(STEP_MS.faster * 3 + 500);
    expect(p.day).toBe(3);
    expect(p.playing).toBe(false);
    // every day came in order (each step starts from the day before, so a day shows twice in a row)
    const days = h.shown.filter((d, k) => Number.isInteger(d) && d !== h.shown[k - 1]);
    expect(days).toEqual([0, 1, 2, 3]);
  });

  it("while the days are worked out, only those ready can be shown; the page follows them until the player picks a day", async () => {
    const h = host();
    const p = new DayPlayer(h, 9, "normal", { day: 0, water: water(0) }, 0);
    p.setReady(2);
    p.jumpTo(2);
    await pass(10);
    expect(p.day).toBe(2);
    expect(p.touched).toBe(false);
    // a day not ready yet: the last one ready
    p.goTo(5);
    await pass(10);
    expect(p.day).toBe(2);
    expect(p.touched).toBe(true);
    // Play waits at the last day ready, and carries on when the next one is
    p.play();
    await pass(STEP_MS.normal * 3);
    expect(p.day).toBe(2);
    expect(p.playing).toBe(true);
    p.setReady(3);
    await pass(STEP_MS.normal + 200);
    expect(p.day).toBe(3);
  });

  it("Play at Instant holds each day for a beat; Skip while playing goes straight to the last day", async () => {
    const h = host();
    const p = new DayPlayer(h, 6, "instant", { day: 0, water: water(0) });
    p.play();
    await pass(10);
    expect(p.day).toBe(1);
    await pass(INSTANT_HOLD_MS + 10);
    expect(p.day).toBe(2);
    p.skip();
    await pass(10);
    expect(p.day).toBe(6);
    expect(p.playing).toBe(false);
  });
});
