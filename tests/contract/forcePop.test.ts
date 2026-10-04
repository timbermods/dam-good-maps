// Nothing pops in after a force's animation (PLAN §20 D368 (9); item 30: nothing changes before the
// force reaches it, and nothing pops in after). Every force and mode, run the page's way (the force
// driver on a stepped clock, the editor's worker session), in Fast and in Slow forces: the last frame
// it shows is the land it keeps, and that last frame changes no more of the land than the busiest frame
// before it, so no part of the result (Carve's banks, say) is laid as a separate step once the
// animation is over. A painted Lift shows its whole result as it is painted: only its first half holds.
// Before D368 (9) it failed for Carve with Banks (its banks, about 1000 tiles, all in the last frame)
// and Quake's Slide (its rivers joined again and its tear, with the block's last move).

import { beforeAll, describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { DEFAULTS as CARVE_DEFAULTS } from "../../src/core/forces/carve/run";
import { CRATER_DEFAULTS } from "../../src/core/forces/craterize";
import { ERUPT_DEFAULTS } from "../../src/core/forces/erupt";
import { GLACIATE_DEFAULTS } from "../../src/core/forces/glaciate/model";
import { QUAKE_DEFAULTS, type Point } from "../../src/core/forces/quake";
import { makeSpec } from "../../src/core/spec/mapspec";
import { ForceDriver, type ForceHost, type ForceSpeed } from "../../src/editor/forceDriver";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";
import { StepClock } from "../stepClock";

const W = 96;

interface Gesture {
  name: string;
  req: ed.ForceRequest;
  /** A painted Lift: the stroke painted on, then let go. */
  paint?: { path: Point[]; side: 1 | -1 };
}

/** Run `g` to its end the page's way: every frame's land as shown, and the land kept (then taken
 *  back, so the next run starts from the same map). */
async function run(g: Gesture, speed: ForceSpeed): Promise<{ frames: Uint8Array[]; kept: Uint8Array; before: Uint8Array }> {
  const clock = new StepClock();
  const before = ed.terrainNow().heights.slice();
  const frames: Uint8Array[] = [];
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(fn: () => T): Promise<T> => {
    const next = queue.then(async () => {
      await clock.sleep(1);
      return fn();
    });
    queue = next.catch(() => undefined);
    return next;
  };
  const ended: boolean[] = [];
  const host: ForceHost = {
    start: (again, gesture) => enqueue(() => ed.forceStart({ ...g.req, gesture })),
    advance: (n) => enqueue(() => ed.forceAdvance(n)),
    paint: (path, side) => enqueue(() => ed.forcePaint(path, side)),
    keep: (gesture, wanted) =>
      enqueue(() => {
        if (wanted()) ed.forceStop(gesture);
      }),
    drop: (gesture) => enqueue(() => void ed.forceCancel(gesture)),
    renderer: () => null,
    show: (f) => {
      if (f.heights) frames.push(f.heights.slice());
    },
    changed: () => undefined,
    error: () => undefined,
    moment: () => undefined,
    ended: (kept) => void ended.push(kept),
    speed: () => speed,
  };
  const driver = new ForceDriver(host, clock);
  if (g.paint) {
    const { path, side } = g.paint;
    void driver.start(false, true).then((ok) => {
      if (!ok) return;
      driver.paint(path, side);
      void driver.stop();
    });
  } else void driver.start(false);
  await clock.until(() => ended.length > 0, 600_000);
  await clock.run(5_000);
  await queue;
  expect(ended, g.name).toEqual([true]);
  const kept = ed.terrainNow().heights.slice();
  ed.undo();
  expect(Array.from(ed.terrainNow().heights).every((v, i) => v === before[i]), `${g.name}: undo`).toBe(true);
  return { frames, kept, before };
}

const changed = (a: Uint8Array, b: Uint8Array) => {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
};

describe("nothing pops in after a force's animation (D368 (9))", () => {
  const gestures: Gesture[] = [];
  beforeAll(async () => {
    await runGenerate(makeSpec({ seed: 21, theme: "highlands", size: { x: W, y: W } }));
    ed.refine();
    const b = MapSession.open(decodeProject(ed.project().bytes)).built;
    const st = b.start!;
    // dry, high ground far from the start, and a fault across the far half
    let at: [number, number] = [W >> 1, W >> 1];
    let far = -1;
    for (let y = 16; y < W - 16; y += 4)
      for (let x = 16; x < W - 16; x += 4) {
        const i = y * W + x;
        if (b.water[i] > 0) continue;
        const d = Math.hypot(x - st.x, y - st.y) + b.heights[i];
        if (d > far) {
          far = d;
          at = [x, y];
        }
      }
    const fy = st.y < W / 2 ? Math.round(W * 0.72) : Math.round(W * 0.28);
    const fault = { path: [{ x: 4, y: fy }, { x: W * 0.5, y: fy + 1.5 }, { x: W - 5, y: fy }], side: (st.y < fy ? 1 : -1) as 1 | -1 };
    const end: [number, number] = [Math.max(6, Math.min(W - 6, at[0] + (at[0] < W / 2 ? 40 : -40))), at[1]];
    const mid: [number, number] = [Math.round((at[0] + end[0]) / 2), Math.round(at[1] + 3)];
    const carve = { ...CARVE_DEFAULTS, power: 60, banks: 5, riverDepth: 2 };
    gestures.push(
      { name: "Carve, clicked, with Banks", req: { verb: "carve", settings: carve, origin: at, cut: null, natural: true } },
      { name: "Carve, drawn, with Banks", req: { verb: "carve", settings: { ...carve, mode: "aim" }, origin: at, end, via: [mid], cut: null, natural: true } },
      { name: "Craterize", req: { verb: "craterize", settings: { ...CRATER_DEFAULTS, power: 45 }, origin: at, cut: null, natural: true } },
      { name: "Quake, Slide", req: { verb: "quake", settings: { ...QUAKE_DEFAULTS, mode: "slide", power: 60 }, ...fault, cut: null, natural: true } },
      { name: "Quake, Lift", req: { verb: "quake", settings: { ...QUAKE_DEFAULTS, mode: "lift", power: 60 }, ...fault, cut: null, natural: true } },
      { name: "Quake, painted Lift", req: { verb: "quake", settings: QUAKE_DEFAULTS, path: fault.path.slice(0, 2), side: fault.side, cut: null, painting: true, natural: true }, paint: fault },
      { name: "Erupt, vent", req: { verb: "erupt", settings: { ...ERUPT_DEFAULTS, power: 45 }, origin: at, cut: null, natural: true } },
      { name: "Erupt, fissure", req: { verb: "erupt", settings: { ...ERUPT_DEFAULTS, mode: "fissure", power: 45 }, origin: at, path: [{ x: at[0], y: at[1] }, { x: mid[0], y: mid[1] }, { x: end[0], y: end[1] }], cut: null, natural: true } },
      { name: "Glaciate, flowing", req: { verb: "glaciate", settings: { ...GLACIATE_DEFAULTS, power: 50 }, origin: at, cut: null, natural: true } },
      { name: "Glaciate, drawn", req: { verb: "glaciate", settings: { ...GLACIATE_DEFAULTS, mode: "aim", power: 80 }, origin: at, end, via: [mid], cut: null, natural: true } },
    );
  });

  for (const speed of ["fast", "watch"] as const)
    for (const name of ["Carve, clicked, with Banks", "Carve, drawn, with Banks", "Craterize", "Quake, Slide", "Quake, Lift", "Quake, painted Lift", "Erupt, vent", "Erupt, fissure", "Glaciate, flowing", "Glaciate, drawn"])
      it(`${name}, ${speed === "fast" ? "Fast" : "Slow forces"}: its last frame is the land it keeps, and changes no more than its busiest frame before`, async () => {
        const g = gestures.find((k) => k.name === name)!;
        const { frames, kept, before } = await run(g, speed);
        const last = frames.at(-1)!;
        expect(changed(last, kept), `${name}: the last frame differs from the land kept`).toBe(0);
        // (a painted Lift shows its whole result as it is painted: there is no animation after it)
        if (g.paint) return;
        expect(frames.length, name).toBeGreaterThan(2);
        let busiest = 0;
        let prev = before;
        for (const f of frames.slice(0, -1)) {
          busiest = Math.max(busiest, changed(prev, f));
          prev = f;
        }
        const end = changed(prev, last);
        expect(end, `${name}: the last frame changes ${end} tiles, the busiest before it ${busiest} (of ${changed(before, kept)} in all, ${frames.length} frames)`).toBeLessThanOrEqual(busiest);
      }, 600_000);
});
