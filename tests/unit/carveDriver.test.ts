// Carve at work on the page (D199): the driver runs the worker's carve a few steps at a time at the
// water's pace, shows every frame, holds it on Pause, keeps it on Stop (or when it ends by itself),
// and drops all of it on Esc; a refused start says why and leaves nothing running.

import { describe, expect, it } from "vitest";
import { CARVE_PACE, CarveDriver, powerWord, type CarveHost } from "../../src/editor/carveDriver";
import type { ForceFrame, ForceStarted } from "../../src/worker/session";
import type { WaterSpeed } from "../../src/editor/waterPlayer";

const head = { x: 5, y: 5, z: 3, dx: 1, dy: 0, width: 4, event: "surge" as const, cut: 3 };

function fakeHost(opts: { endAt?: number; refuse?: string } = {}) {
  let steps = 0;
  const log: string[] = [];
  const shown: number[] = [];
  let speed: WaterSpeed = "instant";
  const frame = (): ForceFrame => ({ steps, done: opts.endAt !== undefined && steps >= opts.endAt, reason: "lake", head, trail: [] });
  const host: CarveHost = {
    start: async (again) => {
      log.push(again ? "again" : "start");
      if (opts.refuse) return { ok: false, errors: [opts.refuse], frame: null, settings: null } as ForceStarted;
      return { ok: true, errors: [], frame: frame(), settings: { mode: "unleash", power: 50, walls: "steep", defyGravity: false, dry: false, layers: true, seed: again ? 1 : 0 } };
    },
    advance: async (n) => {
      steps += n;
      return frame();
    },
    keep: async () => void log.push(`keep@${steps}`),
    drop: async () => void log.push(`drop@${steps}`),
    renderer: () => null,
    speed: () => speed,
    follow: () => false,
    show: (f) => void shown.push(f.steps),
    changed: () => undefined,
    error: (t) => void log.push(`error:${t}`),
    feel: () => undefined,
  };
  return { host, log, shown, setSpeed: (s: WaterSpeed) => (speed = s) };
}

const until = async (f: () => boolean, ms = 3000) => {
  const t0 = Date.now();
  while (!f()) {
    if (Date.now() - t0 > ms) throw new Error("timed out");
    await new Promise((r) => setTimeout(r, 5));
  }
};

describe("the carve driver", () => {
  it("runs frame by frame; Stop keeps what is carved", async () => {
    const h = fakeHost();
    const d = new CarveDriver(h.host);
    expect(await d.start()).toBe(true);
    await until(() => (d.status?.steps ?? 0) >= 30);
    await d.stop();
    expect(d.running).toBe(false);
    expect(h.log[0]).toBe("start");
    expect(h.log.at(-1)).toMatch(/^keep@/);
    // every frame shown, in order
    expect(h.shown).toEqual([...h.shown].sort((a, b) => a - b));
  });

  it("Pause holds it; Esc drops all of it", async () => {
    const h = fakeHost();
    const d = new CarveDriver(h.host);
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
  });

  it("ending by itself keeps it; Try another path starts again", async () => {
    const h = fakeHost({ endAt: 25 });
    const d = new CarveDriver(h.host);
    await d.start();
    await until(() => !d.running);
    expect(h.log.at(-1)).toBe("keep@30");
    await d.start(true);
    expect(d.status!.seed).toBe(1);
    d.cancel();
  });

  it("a refused start says why and leaves nothing running", async () => {
    const h = fakeHost({ refuse: "The end point is uphill. Turn on Defy gravity to cut it down." });
    const d = new CarveDriver(h.host);
    expect(await d.start()).toBe(false);
    expect(d.running).toBe(false);
    expect(h.log).toContain("error:The end point is uphill. Turn on Defy gravity to cut it down.");
  });

  it("paces by the water's speed: ten steps a second at its slowest", () => {
    expect((CARVE_PACE.slower.steps * 1000) / CARVE_PACE.slower.ms).toBe(10);
    expect((CARVE_PACE.normal.steps * 1000) / CARVE_PACE.normal.ms).toBeGreaterThan(10);
    expect(CARVE_PACE.instant.steps).toBeGreaterThan(CARVE_PACE.faster.steps);
    expect([0, 30, 60, 90].map(powerWord)).toEqual(["Creek", "Torrent", "River", "Catastrophe"]);
  });
});
