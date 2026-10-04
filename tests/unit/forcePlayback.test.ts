// The forces' moments on the land, clicked quickly (D378): a force started while the last one's tail
// still plays (a crater's dust, a fault's dust, an eruption's cooling, a glacier's melt) plays in full,
// from its own start, and the last one skips to its end. Every force, each after itself and after the
// others; within one force, its own later moments never start it again.
//
// Time is held here: performance.now and the animation frames are the test's.

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Scene } from "three";
import { ForceEffects, type ForceMoment } from "../../src/render3d/forces";

let now = 0;
const frames: (() => void)[] = [];
vi.spyOn(performance, "now").mockImplementation(() => now);
vi.stubGlobal("requestAnimationFrame", (f: () => void) => frames.push(f));
vi.stubGlobal("cancelAnimationFrame", () => {});
afterAll(() => vi.unstubAllGlobals());

/** Time goes on `ms`, the frames due drawn. */
function wait(ms: number): void {
  now += ms;
  for (const f of frames.splice(0)) f();
}

type Verb = ForceMoment["verb"];

/** A moment of `verb` at (x, y). */
function moment(verb: Verb, phase: string, x: number, y: number, progress = 0): ForceMoment {
  const m: ForceMoment = { verb, phase, progress, x, y, z: 5, size: 12, power: 60 };
  if (verb === "craterize") m.crater = { a: 3, b: 3, angle: 0, glance: 0, radius: 6, datum: 5 };
  if (verb === "erupt") m.erupt = { vents: [{ x, y }], radius: 6, fissure: false, line: [] };
  if (verb === "quake") m.quake = { path: [{ x, y }, { x: x + 4, y }, { x: x + 8, y }], slide: false, side: 1 };
  if (verb === "glaciate")
    m.glaciate = {
      seconds: phase === "gather" ? 0 : 3 * progress,
      ...(phase === "gather" ? {} : { path: [0, 0.5, 1].map((s) => ({ x: x + s * 8, y, s, r: 3, floor: 2 })) }),
    };
  return m;
}

/** A whole force at (x, y), as the page shows it in Fast: its moments over about a second, kept. */
function play(fx: ForceEffects, verb: Verb, x: number, y: number): void {
  const phases: Record<Verb, string[]> = {
    craterize: ["incoming", "incoming", "impact", "impact", "done"],
    erupt: ["rumble", "rise", "rise", "rise", "done"],
    quake: ["rumble", "crack", "crack", "slide", "done"],
    glaciate: ["gather", "advance", "advance", "retreat", "done"],
    carve: ["carve", "carve", "carve", "carve", "done"],
  };
  phases[verb].forEach((phase, k) => {
    fx.set(moment(verb, phase, x, y, k / 4));
    wait(220);
  });
  fx.finish();
}

/** The new force's moment as just begun: at (x, y), its clock at its start. */
function begun(fx: ForceEffects, verb: Verb, x: number, y: number): void {
  const s = fx.showing();
  if (verb === "craterize") expect(s.craterize).toEqual({ x, y, struck: null });
  if (verb === "erupt") expect(s.erupt).toMatchObject({ x, y, cooling: 0, age: expect.closeTo(0, 3) });
  if (verb === "quake") expect(s.quake).toMatchObject({ x, y, age: expect.closeTo(0, 3) });
  if (verb === "glaciate") expect(s.glaciate).toEqual({ x, y, seconds: null });
}

const FORCES: Exclude<Verb, "carve">[] = ["craterize", "erupt", "quake", "glaciate"];

describe("a force clicked quickly after another (D378)", () => {
  let fx: ForceEffects;
  beforeEach(() => {
    now = 1000;
    frames.length = 0;
    fx = new ForceEffects(new Scene(), () => {}, () => 5);
  });

  for (const first of [...FORCES, "carve" as const])
    for (const next of FORCES)
      it(`${next} after ${first}: the new one plays from its start, the last one skips to its end`, () => {
        play(fx, first, 10, 10);
        // (the last one's tail still playing: a crater's dust, a fault's, the lava cooling)
        const tail = first === "carve" || first === "glaciate" ? null : first;
        if (tail) expect(fx.showing()[tail]).not.toBeNull();
        wait(150);
        fx.set(moment(next, next === "glaciate" ? "gather" : next === "craterize" ? "incoming" : "rumble", 40, 30));
        begun(fx, next, 40, 30);
        for (const v of FORCES) if (v !== next) expect(fx.showing()[v], v).toBeNull();
        // and it goes on as its own: a crater strikes now, not when the last one did
        if (next === "craterize") {
          wait(240);
          fx.set(moment("craterize", "impact", 40, 30, 0.5));
          wait(100);
          expect(fx.showing().craterize).toEqual({ x: 40, y: 30, struck: expect.closeTo(0.1, 3) });
        }
      });

  it("a carve's first moment ends the last force's tail too", () => {
    play(fx, "erupt", 10, 10);
    expect(fx.showing().erupt).not.toBeNull();
    fx.set(moment("carve", "carve", 40, 30));
    expect(fx.showing()).toEqual({ craterize: null, quake: null, erupt: null, glaciate: null });
  });

  it("within one force, its later moments never start it again", () => {
    fx.set(moment("craterize", "incoming", 10, 10));
    wait(200);
    fx.set(moment("craterize", "impact", 10, 10, 0.5));
    wait(300);
    fx.set(moment("craterize", "impact", 10, 10, 0.75));
    fx.set(moment("craterize", "done", 10, 10, 1));
    expect(fx.showing().craterize).toEqual({ x: 10, y: 10, struck: expect.closeTo(0.3, 3) });
    fx.clear();
    fx.set(moment("erupt", "rumble", 10, 10));
    wait(500);
    fx.set(moment("erupt", "rise", 10, 10, 0.5));
    expect(fx.showing().erupt).toMatchObject({ age: expect.closeTo(0.5, 3), cooling: 0 });
  });

  for (const next of ["carve", "craterize", "quake", "glaciate", "erupt"] as const)
    it(`an eruption's heat never shows again once ${next} has begun, nor when it is kept`, () => {
      play(fx, "erupt", 10, 10);
      expect(fx.heat(now)).not.toBeNull();
      wait(500);
      play(fx, next, 40, 30);
      // (another eruption: only its own heat, from its own start)
      const own = next === "erupt" ? { age: expect.closeTo(0.88 + 0.22, 3), cooling: expect.closeTo(0.22, 3) } : null;
      expect(fx.heat(now)).toEqual(own);
      for (let k = 0; k < 8; k++) {
        wait(1000);
        if (next !== "erupt") expect(fx.heat(now), `${k + 1} s after ${next} was kept`).toBeNull();
      }
      expect(fx.heat(now)).toBeNull();
    });

  it("the last force's tail plays out when nothing follows it", () => {
    play(fx, "erupt", 10, 10);
    wait(3000);
    expect(fx.showing().erupt).toMatchObject({ x: 10, y: 10, cooling: expect.closeTo(3.22, 3) });
    wait(4000);
    expect(fx.showing().erupt).toBeNull();
  });
});
