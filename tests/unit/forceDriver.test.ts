// A force at work on the page (D199, D202, D203, D206): the driver runs the worker's force a few steps
// at a time at the water's pace, shows every frame and its moment, holds a carve on Pause, keeps it
// on Stop (or when it ends by itself), and drops all of it on Esc; a refused start says why and
// leaves nothing running; a painted Lift sends only the latest stroke while the worker is busy, and
// is kept when the pointer lets go.

import { describe, expect, it } from "vitest";
import { CARVE_PACE, ForceDriver, forcePowerWord, paceOf, powerWord, type ForceHost } from "../../src/editor/forceDriver";
import type { Verb } from "../../src/core/forces/op";
import type { ForceFrame, ForceStarted } from "../../src/worker/session";

const head = { x: 5, y: 5, z: 3, dx: 1, dy: 0, width: 4, event: "surge" as const, cut: 3 };

function fakeHost(opts: { endAt?: number; refuse?: string; verb?: Verb; paintMs?: number } = {}) {
  let steps = 0;
  const log: string[] = [];
  const shown: number[] = [];
  const moments: string[] = [];
  const painted: number[] = [];
  const verb = opts.verb ?? "carve";
  const frame = (): ForceFrame => ({
    verb,
    steps,
    done: opts.endAt !== undefined && steps >= opts.endAt,
    reason: "lake",
    head,
    trail: [],
    cue: { verb, phase: verb === "craterize" ? (steps > 3 ? "impact" : "incoming") : "carve", progress: 0, x: 5, y: 5, z: 3, size: 4, power: 50 },
  });
  const host: ForceHost = {
    start: async (again) => {
      log.push(again ? "again" : "start");
      if (opts.refuse) return { ok: false, errors: [opts.refuse], frame: null, settings: null } as ForceStarted;
      return { ok: true, errors: [], frame: frame(), settings: { mode: "unleash", power: 50, walls: "steep", defyGravity: false, dry: false, layers: true, seed: again ? 1 : 0 }, verb };
    },
    advance: async (n) => {
      steps += n;
      return frame();
    },
    paint: async (path) => {
      painted.push(path.length);
      await new Promise((r) => setTimeout(r, opts.paintMs ?? 1));
      return frame();
    },
    keep: async () => void log.push(`keep@${steps}`),
    drop: async () => void log.push(`drop@${steps}`),
    renderer: () => null,
    show: (f) => void shown.push(f.steps),
    changed: () => undefined,
    error: (t) => void log.push(`error:${t}`),
    moment: (f) => void moments.push(f.cue.phase),
    ended: (kept) => void log.push(kept ? "ended:kept" : "ended:dropped"),
  };
  return { host, log, shown, moments, painted };
}

const until = async (f: () => boolean, ms = 3000) => {
  const t0 = Date.now();
  while (!f()) {
    if (Date.now() - t0 > ms) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
};

describe("the force driver", () => {
  it("runs frame by frame; Stop keeps what is carved", async () => {
    const h = fakeHost();
    const d = new ForceDriver(h.host);
    expect(await d.start()).toBe(true);
    await until(() => (d.status?.steps ?? 0) >= 30);
    await d.stop();
    expect(d.running).toBe(false);
    expect(h.log[0]).toBe("start");
    expect(h.log).toContain("ended:kept");
    expect(h.log.find((l) => l.startsWith("keep@"))).toBeTruthy();
    // every frame shown, in order, each with its moment
    expect(h.shown).toEqual([...h.shown].sort((a, b) => a - b));
    expect(h.moments.length).toBe(h.shown.length);
  });

  it("Pause holds it; Esc drops all of it", async () => {
    const h = fakeHost();
    const d = new ForceDriver(h.host);
    await d.start();
    await until(() => (d.status?.steps ?? 0) >= 10);
    d.pause(true);
    await new Promise((r) => setTimeout(r, 40));
    const held = d.status!.steps;
    await new Promise((r) => setTimeout(r, 120));
    expect(d.status!.steps).toBe(held);
    d.cancel();
    expect(d.running).toBe(false);
    await until(() => h.log.some((l) => l.startsWith("drop@")));
    expect(h.log.some((l) => l.startsWith("keep"))).toBe(false);
    expect(h.log).toContain("ended:dropped");
  });

  it("ending by itself keeps it; Try another starts again", async () => {
    const h = fakeHost({ endAt: 25 });
    const d = new ForceDriver(h.host);
    await d.start();
    await until(() => !d.running);
    // (a step a call at the force's own pace, D266: kept at the step it ended on)
    expect(h.log.filter((l) => l.startsWith("keep@")).at(-1)).toBe("keep@25");
    await d.start(true);
    expect(d.status!.seed).toBe(1);
    d.cancel();
  });

  it("a staged force (Craterize) runs to its end and is kept, its moments in order", async () => {
    const h = fakeHost({ endAt: 11, verb: "craterize" });
    const d = new ForceDriver(h.host);
    await d.start();
    expect(d.status!.verb).toBe("craterize");
    await until(() => !d.running);
    expect(h.log).toContain("ended:kept");
    expect(h.moments[0]).toBe("incoming");
    expect(h.moments.at(-1)).toBe("impact");
  });

  it("a painted Lift sends only the latest stroke while the worker is busy, and is kept when let go", async () => {
    const h = fakeHost({ verb: "quake", paintMs: 30 });
    const d = new ForceDriver(h.host);
    expect(await d.start(false, true)).toBe(true);
    expect(d.status!.painting).toBe(true);
    const path = [{ x: 1, y: 1 }];
    for (let k = 2; k < 12; k++) {
      path.push({ x: k, y: 1 });
      d.paint(path, 1);
    }
    await d.stop();
    // the first stroke, then only the latest: never every one
    expect(h.painted.length).toBeLessThan(10);
    expect(h.painted.at(-1)).toBe(11);
    expect(h.log.at(-1)).toBe("ended:kept");
  });

  it("a refused start says why and leaves nothing running", async () => {
    const h = fakeHost({ refuse: "Start here" });
    const d = new ForceDriver(h.host);
    expect(await d.start()).toBe(false);
    expect(d.running).toBe(false);
    expect(h.log).toContain("error:Start here");
  });

  it("keeps a force's own pace whatever the water's speed (D266): a carve at twice its ten steps a second, an eruption over about four seconds, a glacier over five", () => {
    expect((CARVE_PACE.steps * 1000) / CARVE_PACE.ms).toBe(20);
    expect(paceOf("craterize")).toEqual(CARVE_PACE);
    expect(paceOf("quake")).toEqual(CARVE_PACE);
    // (an eruption's 28 stages over about four seconds)
    expect((28 * paceOf("erupt").ms) / 1000).toBeCloseTo(3.9, 1);
    // (a glacier's 30 stages of advance and 20 of retreat: three seconds and two, D246)
    expect((50 * paceOf("glaciate").ms) / 1000).toBeCloseTo(5, 1);
    expect([0, 30, 60, 90].map((p) => forcePowerWord("glaciate", p))).toEqual(["Cirque", "Glacier", "Great glacier", "Ice age"]);
    expect([0, 30, 60, 90].map(powerWord)).toEqual(["Creek", "Torrent", "River", "Catastrophe"]);
    expect([0, 30, 60, 90].map((p) => forcePowerWord("craterize", p))).toEqual(["Pebble", "Meteor", "Asteroid", "Cataclysm"]);
  });
});
