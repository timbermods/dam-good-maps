// Erode's moment on the land (D281, D240): a real erosion's cues, as its worker sends them, start its dust
// and stones from the voxels that went at a cliff's foot, and once it is kept they are gone within the
// moment's two to four seconds (src/render3d/forces.ts `Wear`, src/render3d/wear.ts).
//
// Time is held here: performance.now and the animation frames are the test's.

import { afterAll, expect, it, vi } from "vitest";
import { Scene } from "three";
import { ForceEffects } from "../../src/render3d/forces";
import { ERODE_DEFAULTS, ErodeRun, withMasks } from "../../src/core/forces/erode";
import type { FullForceMap } from "../../src/core/forces/force";

let now = 1000;
const frames: (() => void)[] = [];
vi.spyOn(performance, "now").mockImplementation(() => now);
vi.stubGlobal("requestAnimationFrame", (f: () => void) => frames.push(f));
vi.stubGlobal("cancelAnimationFrame", () => {});
afterAll(() => vi.unstubAllGlobals());

function wait(ms: number): void {
  now += ms;
  for (const f of frames.splice(0)) f();
}

it("an erosion at a cliff's foot starts its dust and stones from the rock that went, and they end once it is kept", () => {
  // a cliff: level 3 west of x = 20, level 12 from it
  const W = 40;
  const heights = new Uint8Array(W * W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) heights[y * W + x] = x < 20 ? 3 : 12;
  const map: FullForceMap = { W, H: W, heights, entities: [], water: { depth: new Float64Array(W * W), contamination: new Float64Array(W * W) }, maxHeight: 22, rockLayers: new Array(23).fill(0), lava: new Uint32Array(W * W), fallen: [] };
  const run = new ErodeRun(withMasks(map), { ...ERODE_DEFAULTS, power: 55 }, { path: [{ x: 19, y: 20 }] });
  run.planAll();
  const fx = new ForceEffects(new Scene(), () => {}, (x, y) => run.map.heights[y * W + x], () => ({ W, H: W, mask: (i) => run.map.masks![i] }));
  fx.set(run.cue());
  expect(run.cue().phase).toBe("rumble");
  expect(fx.showing().erode).toMatchObject({ x: run.cue().x, y: run.cue().y });
  let went = 0;
  let dust = 0;
  let stones = 0;
  while (!run.done) {
    run.step();
    const cue = run.cue();
    went += cue.erode!.went.length;
    fx.set(cue);
    wait(100);
    const s = fx.showing().erode;
    expect(s, `stage ${cue.progress}`).not.toBeNull();
    dust = Math.max(dust, s!.dust);
    stones = Math.max(stones, s!.stones);
  }
  expect(went).toBeGreaterThan(0);
  expect(dust).toBeGreaterThan(10);
  expect(stones).toBeGreaterThan(2);
  fx.finish();
  wait(1000);
  expect(fx.active).toBe(true);
  wait(2500);
  expect(fx.showing().erode).toBeNull();
  expect(fx.active).toBe(false);
});
