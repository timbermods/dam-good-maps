// A renderer's own time (render3d/clock.ts): on a recording's clock, a force's moments, a placed object's pop and the
// land's puffs advance by the video's time alone. The wall clock is held still here, and no animation frame comes: each
// frame is the recording's, moved on by `advance` as the renderer does before it draws one.

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Scene, type InstancedMesh } from "three";
import type { Clock } from "../../src/render3d/clock";
import { Effects } from "../../src/render3d/effects";
import { ForceEffects, type ForceMoment } from "../../src/render3d/forces";
import { POP_MS, Pops, popScale } from "../../src/render3d/pops";

vi.spyOn(performance, "now").mockReturnValue(123_456);
const frames: (() => void)[] = [];
vi.stubGlobal("requestAnimationFrame", (f: () => void) => frames.push(f));
vi.stubGlobal("cancelAnimationFrame", () => {});
afterAll(() => vi.unstubAllGlobals());

/** A recording's clock: its time is the test's. */
let video = 0;
const clock: Clock = { now: () => video, driven: true };

beforeEach(() => {
  video = 0;
  frames.length = 0;
});

function moment(verb: ForceMoment["verb"], phase: string): ForceMoment {
  const m: ForceMoment = { verb, phase, progress: 0, x: 10, y: 12, z: 5, size: 12, power: 60 };
  if (verb === "craterize") m.crater = { a: 3, b: 3, angle: 0, glance: 0, radius: 6, datum: 5 };
  if (verb === "erupt") m.erupt = { vents: [{ x: 10, y: 12 }], radius: 6, fissure: false, line: [] };
  return m;
}

describe("a recording's clock", () => {
  it("plays a force's moments on the video's time, with no frames of their own", () => {
    let asked = 0;
    const fx = new ForceEffects(new Scene(), () => asked++, () => 5, () => null, clock);
    fx.set(moment("erupt", "rumble"));
    // (each change asks the renderer for a frame; none of its own)
    expect(asked).toBe(1);
    video = 500;
    expect(fx.advance()).toBe(true);
    expect(fx.showing().erupt).toMatchObject({ age: expect.closeTo(0.5, 6), cooling: 0 });
    expect(fx.heat(clock.now())).toEqual({ age: expect.closeTo(0.5, 6), cooling: 0 });
    fx.finish();
    video = 2500;
    expect(fx.showing().erupt).toMatchObject({ age: expect.closeTo(2.5, 6), cooling: expect.closeTo(2, 6) });
    // its lava cools for 6.5 s of video, then it is over
    video = 500 + 6400;
    expect(fx.advance()).toBe(true);
    video = 500 + 6600;
    expect(fx.advance()).toBe(false);
    expect(fx.showing().erupt).toBeNull();
    expect(frames).toHaveLength(0);
  });

  it("strikes a crater when the video says, not the wall clock", () => {
    const fx = new ForceEffects(new Scene(), () => {}, () => 5, () => null, clock);
    video = 1000;
    fx.set(moment("craterize", "incoming"));
    video = 1240;
    fx.set(moment("craterize", "impact"));
    video = 1340;
    fx.advance();
    expect(fx.showing().craterize).toEqual({ x: 10, y: 12, struck: expect.closeTo(0.1, 6) });
    // its dust settles 1.85 s of video after it struck
    video = 1240 + 1800;
    expect(fx.advance()).toBe(true);
    video = 1240 + 1900;
    expect(fx.advance()).toBe(false);
    expect(frames).toHaveLength(0);
  });

  it("pops a placed object on the video's time", () => {
    const array = new Float32Array(16).fill(2);
    const mesh = { instanceMatrix: { array, needsUpdate: false } } as unknown as InstancedMesh;
    const base = array.slice();
    let asked = 0;
    const pops = new Pops(() => asked++, clock);
    video = 2000;
    pops.add([{ mesh, i: 0, base }], () => false);
    // (it starts a little smaller, at once)
    expect(array[0]).toBeCloseTo(2 * popScale(0), 6);
    expect(asked).toBe(1);
    video = 2000 + POP_MS / 2;
    expect(pops.advance()).toBe(true);
    expect(array[0]).toBeCloseTo(2 * popScale(0.5), 6);
    expect(array[5]).toBeCloseTo(2 * popScale(0.5), 6);
    // (the translation is never scaled)
    expect(array[12]).toBe(2);
    video = 2000 + POP_MS;
    expect(pops.advance()).toBe(false);
    expect(array[0]).toBeCloseTo(2, 6);
    expect(frames).toHaveLength(0);
  });

  it("puts a puff away once its time on the video is over", () => {
    const scene = new Scene();
    const fx = new Effects(scene, () => {}, clock);
    fx.puff(4, 4, 3, 2);
    expect(scene.children).toHaveLength(1);
    video = 600;
    expect(fx.advance()).toBe(true);
    video = 700;
    expect(fx.advance()).toBe(false);
    expect(scene.children).toHaveLength(0);
    expect(frames).toHaveLength(0);
  });

  it("leaves the player's view on the wall clock, with its own frames", () => {
    const fx = new ForceEffects(new Scene(), () => {}, () => 5);
    fx.set(moment("erupt", "rumble"));
    expect(frames).toHaveLength(1);
    expect(fx.showing().erupt).toMatchObject({ age: 0 });
  });
});
