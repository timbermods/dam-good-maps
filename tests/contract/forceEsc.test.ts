// Esc or undo at any moment of a force leaves the map exactly as it was before the gesture, and
// nothing lands afterwards (PLAN §20 D341; D266: "Esc and undo still revert at once"; D321, item 29).
//
// The page's way, headless: the force driver on a stepped clock, the page's one queue of worker calls,
// each call a message there and a message back, and the editor's worker session itself. A whole run is
// traced first; then the force is run again for each chosen moment of that trace (its start on its way,
// while it is worked out, while it is shown, its last frame, its keep sent, kept in the worker with the
// answer on its way back) and Esc comes exactly then. Every force: Carve (and its Try another path),
// Craterize, Quake (a Slide, a painted Lift), Erupt, Glaciate. In Watch, Esc jumps to the final land
// (the same land Fast keeps, one step) and undo takes it back at any moment; once the force is kept its
// show plays on and undo takes it back, nothing of it landing later. Erode has no force of its own on
// this branch yet: it gets these through the forces core (D321) when it is wired.
//
// Before D341, Esc while the force was being kept did nothing and the force landed anyway: the moments
// "keep:sent", "keep:done" and "keep:back" failed here.

import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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

/** The worker's own time moves a quarter of a millisecond a call, so its slices (a carve worked out
 *  24 ms at a time) are the same every run and a traced moment is the same moment when run again. */
let tick = 0;
beforeAll(() => {
  vi.spyOn(performance, "now").mockImplementation(() => (tick += 0.25));
});
afterAll(() => {
  vi.restoreAllMocks();
});

/** The map as it stands in the worker: its ground, its objects, and its whole history (Redo's too). */
function state(): { heights: string; objects: string; history: string[]; forcing: boolean } {
  const e = ed.sessionView().view.entities;
  const objects = createHash("sha256").update(JSON.stringify(e.templates)).update(e.template).update(e.x).update(e.y).update(e.z).update(e.orientation).digest("hex");
  return {
    heights: createHash("sha256").update(ed.terrainNow().heights).digest("hex"),
    objects,
    history: ed.sessionInfo().history.map((h) => `${h.applied ? "+" : "-"}${h.label}#${h.seq}`),
    forcing: ed.forcing(),
  };
}

const hash = (h: Uint8Array) => createHash("sha256").update(h).digest("hex");

/** The page: its queue of worker calls, each one a message there and back on the clock; what the map
 *  shows; how the force ended. `hook` hears every message, in order. */
function page(clock: StepClock, speed: ForceSpeed, req: ed.ForceRequest) {
  const trace: string[] = [];
  const ended: string[] = [];
  let hook: ((e: string, n: number) => void) | null = null;
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = queue.then(fn);
    queue = next.catch(() => undefined);
    return next;
  };
  const shown: { heights: Uint8Array } = { heights: ed.terrainNow().heights.slice() };
  const note = (e: string) => {
    trace.push(e);
    hook?.(e, trace.length);
  };
  const call = async <T>(name: string, fn: () => T): Promise<T> => {
    note(`${name}:sent`);
    await clock.sleep(1);
    const r = fn();
    note(`${name}:done`);
    await clock.sleep(1);
    note(`${name}:back`);
    return r;
  };
  const host: ForceHost = {
    start: (again, gesture) => enqueue(() => call("start", () => (again ? ed.forceAgain(undefined, gesture) : ed.forceStart({ ...req, gesture })))),
    advance: (n) => enqueue(() => call("advance", () => ed.forceAdvance(n))),
    paint: (path, side) => enqueue(() => call("paint", () => ed.forcePaint(path, side))),
    keep: (gesture, wanted) =>
      enqueue(async () => {
        if (!wanted()) return;
        const u = await call("keep", () => ed.forceStop(gesture));
        if (!wanted()) return;
        if (u.view.heights) shown.heights = u.view.heights;
      }),
    drop: (gesture) =>
      enqueue(async () => {
        const v = await call("drop", () => ed.forceCancel(gesture));
        if (v.heights) shown.heights = v.heights;
      }),
    renderer: () => null,
    show: (f) => {
      if (f.heights) shown.heights = f.heights;
    },
    changed: () => undefined,
    error: (t) => void trace.push(`error:${t}`),
    moment: () => undefined,
    ended: (kept) => void ended.push(kept ? "kept" : "dropped"),
    speed: () => speed,
  };
  const driver = new ForceDriver(host, clock);
  return {
    driver,
    trace,
    ended,
    shown,
    listen(fn: (e: string, n: number) => void) {
      hook = fn;
    },
    idle: () => queue,
  };
}

interface Gesture {
  name: string;
  req: ed.ForceRequest;
  again?: boolean;
  /** A painted Lift: the stroke painted on, then let go. */
  paint?: { path: Point[]; side: 1 | -1 };
}

/** Make the gesture on the page (the driver's start, as the page's click or drag does). */
function go(p: ReturnType<typeof page>, g: Gesture): void {
  if (!g.paint) {
    void p.driver.start(!!g.again);
    return;
  }
  const { path, side } = g.paint;
  void p.driver.start(false, true).then((ok) => {
    if (!ok) return;
    p.driver.paint(path, side);
    void p.driver.stop();
  });
}

/** Run it to its end on a fresh clock (nothing pressed); the page settles too. */
async function whole(g: Gesture, speed: ForceSpeed = "fast") {
  const clock = new StepClock();
  const p = page(clock, speed, g.req);
  go(p, g);
  await clock.until(() => !p.driver.running);
  await clock.run(5_000);
  await p.idle();
  return p;
}

/** The moments to press at, from a whole run's trace: every message but the frames', and the frames
 *  at their first, their last and a few between (a carve shows 60 and more). */
function moments(trace: readonly string[]): number[] {
  const frames = trace.map((e, i) => (e.startsWith("advance:") ? i + 1 : 0)).filter(Boolean);
  const pick = new Set<number>([0]);
  trace.forEach((e, i) => {
    if (!e.startsWith("advance:")) pick.add(i + 1);
  });
  for (const k of [0, 1, 2, 3, 5]) if (frames[k]) pick.add(frames[k]);
  for (let k = 1; k <= 6; k++) if (frames.length - k >= 0) pick.add(frames[frames.length - k]);
  for (let q = 1; q < 6; q++) pick.add(frames[Math.floor((q * frames.length) / 6)]);
  return [...pick].filter((n) => n !== undefined).sort((a, b) => a - b);
}

/** Press at the `at`-th message of the page (0: straight after the gesture): `key` is Esc's action,
 *  cancel (Esc in Fast, undo anywhere) or jump (Esc in Watch). Whether the force was at work then. */
async function pressAt(g: Gesture, at: number, key: "cancel" | "jump", speed: ForceSpeed) {
  const clock = new StepClock();
  const p = page(clock, speed, g.req);
  let atWork = false;
  let pressed = false;
  const press = () => {
    pressed = true;
    atWork = p.driver.running;
    if (key === "cancel") p.driver.cancel();
    else void p.driver.jump();
  };
  p.listen((_, n) => {
    if (n === at && !pressed) press();
  });
  go(p, g);
  if (at === 0) press();
  await clock.until(() => pressed && !p.driver.running);
  // (and on: nothing of it lands later)
  await clock.run(10_000);
  await p.idle();
  return { p, atWork, pressed };
}

/** The land a map shows: its ground, its objects, the labels of its applied steps. */
const landOf = (s: ReturnType<typeof state>) => ({ heights: s.heights, objects: s.objects, steps: s.history.filter((h) => h.startsWith("+")).map((h) => h.replace(/#\d+$/, "")) });

/** A force kept, its show playing on: undo takes it back, and nothing of it lands later; then back
 *  (redo, and the worker takes it back by its gesture), so the map is exactly `before`, Redo too. */
async function undoWhileItShows(p: ReturnType<typeof page>, before: ReturnType<typeof state>, where: string) {
  const heard = p.trace.length;
  ed.undo();
  await p.idle();
  expect(p.trace.length, where).toBe(heard);
  expect(state().heights, where).toBe(before.heights);
  expect(state().objects, where).toBe(before.objects);
  ed.redo();
  expect(ed.forceCancel(p.driver.lastGesture).taken, where).toBe("kept");
  expect(state(), where).toEqual(before);
}

/** Every chosen moment of `g` in `speed`, pressing `key`: at work, Esc (or undo) takes all of it back
 *  (`cancel`), or Watch's Esc keeps the final land `kept` as one step (`jump`); over already, the force
 *  was kept, and undo takes it back. The map is left as `before` each time. */
async function everyMoment(g: Gesture, speed: ForceSpeed, key: "cancel" | "jump", before: ReturnType<typeof state>, kept: ReturnType<typeof state>, trace: readonly string[]) {
  const beforeShown = hash(ed.terrainNow().heights);
  let atWork = 0;
  for (const at of moments(trace)) {
    const r = await pressAt(g, at, key, speed);
    const where = `${g.name} (${speed}): ${key} at message ${at} (${trace[at - 1] ?? "the gesture"})`;
    if (!r.pressed) {
      // (Try another takes the next personality each time: this one ended before that message)
      expect(g.again, where).toBe(true);
      expect(ed.forceCancel(r.p.driver.lastGesture).taken, where).toBe("kept");
      expect(state(), where).toEqual(before);
      continue;
    }
    if (r.atWork && key === "cancel") {
      atWork++;
      expect(r.p.ended, where).toEqual(["dropped"]);
      expect(state(), where).toEqual(before);
      expect(hash(r.p.shown.heights), where).toBe(beforeShown);
      continue;
    }
    if (r.atWork) atWork++;
    // kept: the final land, one step (Watch's Esc jumps to it; or it was over when the key came)
    expect(r.p.ended, where).toEqual(["kept"]);
    expect(landOf(state()), where).toEqual(g.again ? landOf(state()) : landOf(kept));
    expect(state().history.length, where).toBe(before.history.length + 1);
    await undoWhileItShows(r.p, before, where);
  }
  // (the moments reached the force at work: its start, its working out, its frames, its keep)
  expect(atWork, g.name).toBeGreaterThan(8);
}

describe("Esc or undo at any moment of a force (D341)", () => {
  const gestures: Gesture[] = [];
  beforeAll(async () => {
    await runGenerate(makeSpec({ seed: 21, theme: "highlands", size: { x: W, y: W } }));
    ed.setEditorWaterMode("defer");
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
    gestures.push(
      { name: "Carve", req: { verb: "carve", settings: { ...CARVE_DEFAULTS, power: 60 }, origin: at, cut: null, natural: true } },
      { name: "Craterize", req: { verb: "craterize", settings: { ...CRATER_DEFAULTS, power: 45 }, origin: at, cut: null, natural: true } },
      { name: "Quake, Slide", req: { verb: "quake", settings: { ...QUAKE_DEFAULTS, mode: "slide", power: 60 }, ...fault, cut: null, natural: true } },
      { name: "Quake, painted Lift", req: { verb: "quake", settings: QUAKE_DEFAULTS, path: fault.path.slice(0, 2), side: fault.side, cut: null, painting: true, natural: true }, paint: fault },
      { name: "Erupt", req: { verb: "erupt", settings: { ...ERUPT_DEFAULTS, power: 45 }, origin: at, cut: null, natural: true } },
      { name: "Glaciate", req: { verb: "glaciate", settings: { ...GLACIATE_DEFAULTS, power: 50 }, origin: at, cut: null, natural: true } },
    );
  });

  /** A whole run of `g`: its trace, and the map it keeps (then taken back by its gesture: exactly the
   *  map before, Redo included). */
  async function traced(g: Gesture, speed: ForceSpeed) {
    const before = state();
    const run = await whole(g, speed);
    expect(run.ended, g.name).toEqual(["kept"]);
    const kept = state();
    expect(kept.heights, g.name).not.toBe(before.heights);
    expect(kept.history.length, g.name).toBe(before.history.length + 1);
    // (kept, its show playing on: undo takes it back, nothing lands later; then exactly as before)
    await undoWhileItShows(run, before, `${g.name} (${speed}), kept`);
    return { before, kept, trace: run.trace };
  }

  for (const name of ["Carve", "Craterize", "Quake, Slide", "Quake, painted Lift", "Erupt", "Glaciate"]) {
    it(`${name}, Fast: Esc at each moment until it is kept takes all of it back; after that undo does, and nothing lands later`, async () => {
      const g = gestures.find((k) => k.name === name)!;
      const { before, kept, trace } = await traced(g, "fast");
      await everyMoment(g, "fast", "cancel", before, kept, trace);
    });
  }

  it("Carve's Try another path: Esc at each moment leaves the first carve exactly as it was", async () => {
    const first = gestures[0];
    const start = state();
    const run = await whole(first);
    expect(run.ended).toEqual(["kept"]);
    const again: Gesture = { ...first, name: "Try another path", again: true };
    const { before, kept, trace } = await traced(again, "fast");
    expect(kept.history.at(-1)).toMatch(/^\+Try another path#/);
    await everyMoment(again, "fast", "cancel", before, kept, trace);
    // (the first carve's gesture is spent once another force was kept: undo takes it back)
    expect(ed.forceCancel(run.driver.lastGesture).taken).toBe(null);
    ed.undo();
    expect(landOf(state())).toEqual(landOf(start));
  });

  for (const name of ["Carve", "Craterize", "Quake, Slide", "Erupt", "Glaciate"]) {
    it(`${name}, Watch: undo at each moment takes all of it back; Esc jumps to the final land Fast keeps, one step`, async () => {
      const g = gestures.find((k) => k.name === name)!;
      const fast = await traced(g, "fast");
      const { before, kept, trace } = await traced(g, "watch");
      expect(landOf(kept)).toEqual(landOf(fast.kept));
      await everyMoment(g, "watch", "cancel", before, kept, trace);
      await everyMoment(g, "watch", "jump", before, kept, trace);
    });
  }
});

describe("taking a kept force back in the worker (D341)", () => {
  it("only while its step is the latest: after another edit it stays, and undo takes it back", async () => {
    await runGenerate(makeSpec({ seed: 21, theme: "highlands", size: { x: W, y: W } }));
    ed.setEditorWaterMode("defer");
    ed.refine();
    const before = state();
    const st = ed.forceStart({ verb: "craterize", settings: { ...CRATER_DEFAULTS, power: 45 }, origin: [W >> 1, W >> 1], cut: null, gesture: 900 });
    expect(st.errors).toEqual([]);
    expect(st.gesture).toBe(900);
    for (let k = 0; k < 400 && !ed.forceAdvance(4)!.done; k++);
    // (a keep for another gesture keeps nothing)
    expect(ed.forceStop(899).kept).toBe(false);
    expect(ed.forceStop(900).kept).toBe(true);
    const kept = state();
    ed.undo();
    ed.redo();
    expect(state()).toEqual(kept);
    // another step since: it stays, with a reason; undo takes both back
    const id = MapSession.open(decodeProject(ed.project().bytes)).built.entities.find((e) => e.template !== "StartingLocation")!.id;
    expect(ed.apply({ op: "deleteEntities", params: { entities: [id] } }).ok).toBe(true);
    const r = ed.forceCancel(900);
    expect(r.taken).toBe(null);
    expect(r.reason).toMatch(/undo takes it back/);
    ed.undo();
    // (and the gesture's name is spent: Esc again does nothing)
    expect(ed.forceCancel(900).taken).toBe(null);
    expect(landOf(state())).toEqual(landOf(kept));
    ed.undo();
    expect(state().heights).toBe(before.heights);
  });

  it("a gesture taken back before its start reached the worker never starts, and a keep after Esc keeps nothing", async () => {
    await runGenerate(makeSpec({ seed: 21, theme: "highlands", size: { x: W, y: W } }));
    ed.setEditorWaterMode("defer");
    ed.refine();
    const before = state();
    expect(ed.forceCancel(5000).taken).toBe(null);
    const st = ed.forceStart({ verb: "craterize", settings: { ...CRATER_DEFAULTS, power: 45 }, origin: [W >> 1, W >> 1], cut: null, gesture: 5000 });
    expect(st.ok).toBe(false);
    expect(ed.forcing()).toBe(false);
    const next = ed.forceStart({ verb: "craterize", settings: { ...CRATER_DEFAULTS, power: 45 }, origin: [W >> 1, W >> 1], cut: null, gesture: 5001 });
    expect(next.ok).toBe(true);
    expect(ed.forceCancel(5001).taken).toBe("work");
    expect(ed.forceStop(5001).kept).toBe(false);
    expect(state()).toEqual(before);
  });
});

describe("MapSession.takeBack (D341): a step taken back as if never taken", () => {
  it("the map, the history and Redo exactly as at the mark; never once another step came", async () => {
    await runGenerate(makeSpec({ seed: 21, theme: "highlands", size: { x: W, y: W } }));
    ed.setEditorWaterMode("defer");
    ed.refine();
    const s = MapSession.open(decodeProject(ed.project().bytes));
    const ids = s.built.entities.filter((e) => e.template !== "StartingLocation").map((e) => e.id);
    const remove = (k: number) => s.apply({ op: "deleteEntities", params: { entities: [ids[k]] } });
    const objects = () => s.built.entities.map((e) => e.id).join();
    // a step to redo, then a mark
    expect(remove(0).ok).toBe(true);
    s.undo();
    const before = objects();
    const history = JSON.stringify(s.history());
    const mark = s.mark();
    expect(remove(1).ok).toBe(true);
    const step = s.stepSince(mark)!;
    expect(step).not.toBe(null);
    expect(s.canRedo).toBe(false);
    expect(s.takeBack(step)).toBe(true);
    expect(objects()).toBe(before);
    expect(JSON.stringify(s.history())).toBe(history);
    expect(s.canRedo).toBe(true);
    // once the history moved on, never
    const mark2 = s.mark();
    expect(remove(2).ok).toBe(true);
    const step2 = s.stepSince(mark2)!;
    expect(remove(3).ok).toBe(true);
    expect(s.stepSince(mark2)).toBe(null);
    expect(s.takeBack(step2)).toBe(false);
    s.undo();
    s.undo();
    expect(remove(4).ok).toBe(true);
    // (undone, then another step in its place: not the step it named)
    expect(s.takeBack(step2)).toBe(false);
  });
});
