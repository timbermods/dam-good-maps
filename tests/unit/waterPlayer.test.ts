// The water bar's state (PLAN §20 D345, B14): a journey begun by an edit reads "flowing" until its settled water
// arrives; when the worker says the water is already settled (an undo, a redo), the bar reads settled at once,
// with no journey left waiting for frames that will not come.

import { afterEach, describe, expect, it, vi } from "vitest";
import { WaterPlayer } from "../../src/editor/waterPlayer";
import { WATCH_STRIDE_MS } from "../../src/editor/forceDriver";
import type { WaterView } from "../../src/render3d/model";

const empty: WaterView = { count: 0, tile: new Int32Array(0), floor: new Float32Array(0), depth: new Float32Array(0), contamination: new Float32Array(0) };
const player = () => new WaterPlayer({ show: () => undefined, changed: () => undefined });

describe("the water player's state after undo, redo and an edit (D345, B14)", () => {
  it("an edit's journey reads flowing until its settled water comes", () => {
    const p = player();
    p.begin({ water: empty, done: 0 });
    expect(p.progress).toBe(0);
    expect(p.playing).toBe(true);
  });
  it("an update the worker calls settled ends any journey: nothing is flowing", () => {
    const p = player();
    p.begin({ water: empty, done: 0 });
    p.settled();
    expect(p.progress).toBeNull();
    expect(p.playing).toBe(false);
    // and it stays so: an undo after an undo
    p.settled();
    expect(p.progress).toBeNull();
  });
  it("an update settled from the start leaves the bar settled", () => {
    const p = player();
    p.settled();
    expect(p.progress).toBeNull();
    expect(p.playing).toBe(false);
  });
});

describe("the water's journey on a slow page (WATCH_STRIDE_MS, as Slow forces)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
  it("a frame held seconds counts only a stride of the wait: the water is seen on its way, never at its end in one step", () => {
    vi.stubGlobal("window", globalThis);
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let now = 1000;
    vi.spyOn(performance, "now").mockImplementation(() => now);
    const at: number[] = [];
    const frames: { water: WaterView; done: number }[] = [];
    for (let k = 0; k <= 100; k++) frames.push({ water: empty, done: k / 100 });
    const p = new WaterPlayer({ show: (f) => (at.push(frames.indexOf(f as (typeof frames)[number])), undefined), changed: () => undefined });
    p.begin(frames[0]);
    for (let k = 1; k <= 100; k++) p.push(frames[k]);
    // each frame put on screen 3 s after the one before, as software drawing holds a page
    for (let k = 0; k < 40 && p.playing; k++) {
      now += 3000;
      vi.advanceTimersByTime(20);
    }
    // normal speed is 60 frames a second, so a stride moves 15 frames on at most, however long the wait
    const most = (WATCH_STRIDE_MS * 60) / 1000 + 1;
    for (let k = 1; k < at.length; k++) expect(at[k] - at[k - 1]).toBeLessThanOrEqual(most);
    expect(at.length).toBeGreaterThanOrEqual(100 / most);
    expect(at[at.length - 1]).toBe(100);
    p.clear();
  });
});
