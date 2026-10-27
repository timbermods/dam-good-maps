// The water the journey ends on (PLAN §20 D179 (2), D341): the worker's settled water, whatever order its news
// comes in and however far behind the page's playing is. A CI run once left the editor showing an earlier
// settled water (6% less than the worker's) with the bar reading "Water settled": the check's second answer, which
// carries no water because the page was already sent it, was given the page's last *applied* water, and the
// settled frames before it were still waiting to be shown. Nothing here waits on a clock: the page's timer is
// stepped by hand, and the worker's messages are made up.

import { describe, expect, it } from "vitest";
import { WaterJourney } from "../../src/editor/waterJourney";
import { WaterPlayer } from "../../src/editor/waterPlayer";
import type { WaterView } from "../../src/render3d/model";
import type { ViewUpdate } from "../../src/worker/session";

(globalThis as unknown as { window: unknown }).window = { setTimeout: () => 1, clearTimeout: () => undefined };

const water = (depth: number): WaterView => ({ count: 1, tile: Int32Array.of(7), floor: Float32Array.of(0), depth: Float32Array.of(depth), contamination: Float32Array.of(0) });

/** A page: a journey over a player, a screen that remembers the last water shown, and a mirror of the map's water
 *  that only a view put in place changes (as the editor's `applyView` does). */
function page(first: WaterView) {
  let shown = first;
  let mirror = first;
  const player = new WaterPlayer({ show: (f) => ((shown = f.water), undefined), changed: () => undefined });
  const journey = new WaterJourney(player, {
    applyView: (v: ViewUpdate) => {
      if (v.water) {
        shown = v.water;
        mirror = v.water;
      }
    },
    mapWater: () => mirror,
    settledInPlace: () => undefined,
  });
  return { player, journey, shown: () => shown.depth[0] };
}

describe("the water a journey ends on", () => {
  const A = water(1);
  const mid = water(2);
  const B = water(3);
  const start = (p: ReturnType<typeof page>) => p.journey.update({ ok: true, waterSettled: false, view: { water: A } }, 2);

  it("is the settled water that came first, when a later answer carries none", () => {
    const p = page(A);
    start(p);
    p.journey.news({ kind: "water", version: 2, water: mid, done: 0.5 });
    // (the settled event, then the background check's two answers: the page was sent the water by the first,
    // so the second has none; the frames are still being played)
    p.journey.news({ kind: "settled", version: 2, view: { water: B } });
    p.journey.check({ view: { water: B }, waterSettled: true });
    p.journey.check({ view: {}, waterSettled: true });
    p.player.skip();
    expect(p.shown()).toBe(3);
    expect(p.player.playing).toBe(false);
  });

  it("is the settled water when the settled event itself carries none", () => {
    const p = page(A);
    start(p);
    p.journey.news({ kind: "water", version: 2, water: mid, done: 0.5 });
    p.journey.news({ kind: "settled", version: 2, view: { water: B } });
    p.journey.news({ kind: "settled", version: 2, view: {} });
    p.player.skip();
    expect(p.shown()).toBe(3);
  });

  it("is the map's own water when the worker's word comes before any settled frame", () => {
    const p = page(A);
    start(p);
    p.journey.news({ kind: "water", version: 2, water: mid, done: 0.5 });
    p.journey.check({ view: {}, waterSettled: true });
    p.player.skip();
    expect(p.shown()).toBe(1);
    expect(p.player.playing).toBe(false);
  });
});

// A new edit while settled frames wait to be shown (D341). The worker diffs each view against what it has sent, so
// the settled view of an earlier version (the plants, the soil, the water) is not sent again: a journey that drops
// its waiting frames for the new edit's would lose those parts for good. Only the parts are applied, in the order the
// worker made them, before the new edit's view; no frame of the old journey is played again.
describe("an edit that comes while settled frames wait", () => {
  const A = water(1);
  const B = water(3);
  const tag = (name: string, w?: WaterView) => ({ name, ...(w ? { water: w } : {}) }) as unknown as ViewUpdate & { name: string };
  const names = (log: ViewUpdate[]) => log.map((v) => (v as unknown as { name: string }).name);

  function setup() {
    const log: ViewUpdate[] = [];
    const player = new WaterPlayer({ show: () => undefined, changed: () => undefined });
    const journey = new WaterJourney(player, { applyView: (v) => void log.push(v), mapWater: () => A, settledInPlace: () => undefined });
    journey.update({ ok: true, waterSettled: false, view: tag("edit 2", A) }, 2);
    journey.news({ kind: "water", version: 2, water: water(2), done: 0.5 });
    // (the settled water has come, but the page is still playing the frames before it)
    journey.news({ kind: "settled", version: 2, view: tag("settled 2", B) });
    return { log, player, journey };
  }

  it("applies the waiting settled view before the new edit's, once", () => {
    const { log, player, journey } = setup();
    expect(names(log)).toEqual(["edit 2"]);
    journey.update({ ok: true, waterSettled: true, view: tag("edit 3") }, 3);
    expect(names(log)).toEqual(["edit 2", "settled 2", "edit 3"]);
    // (and nothing of the old journey is left to apply or play)
    player.skip();
    journey.update({ ok: true, waterSettled: true, view: tag("edit 4") }, 4);
    expect(names(log)).toEqual(["edit 2", "settled 2", "edit 3", "edit 4"]);
  });

  it("applies a settled view that was shown before only that once", () => {
    const { log, player, journey } = setup();
    player.skip();
    expect(names(log)).toEqual(["edit 2", "settled 2"]);
    journey.update({ ok: true, waterSettled: true, view: tag("edit 3") }, 3);
    expect(names(log)).toEqual(["edit 2", "settled 2", "edit 3"]);
  });

  it("flush applies the waiting settled views when the journey is dropped for a stroke's water", () => {
    const { log, player, journey } = setup();
    journey.flush();
    player.clear();
    expect(names(log)).toEqual(["edit 2", "settled 2"]);
    journey.flush();
    expect(names(log)).toEqual(["edit 2", "settled 2"]);
  });
});

describe("a force starting while the journey still plays (Kyler, 2026-10-05)", () => {
  it("puts the waiting settled view in place but its water, so the force starts from the water on screen", () => {
    for (const forForce of [false, true]) {
      const p = page(water(1));
      p.journey.update({ ok: true, waterSettled: false, view: { water: water(1) } }, 2);
      p.journey.news({ kind: "water", version: 2, water: water(2), done: 0.5 });
      // (the worker has settled; the page is still playing the frames before it)
      p.journey.news({ kind: "settled", version: 2, view: { water: water(3) } });
      const before = p.shown();
      p.journey.flush(!forForce);
      expect(p.shown(), forForce ? "a force's flush leaves the water on screen" : "an edit's flush puts the settled water in place").toBe(forForce ? before : 3);
    }
  });
});
