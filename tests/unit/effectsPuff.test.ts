// The dust puff of a Lower stroke (D205 (2)) keeps its material once it has gone, for the next puff (#858): a disposed
// material gives its GPU program back once nothing else uses it, so the first puff after a pause (the first dab of
// every Lower stroke) compiled and linked the program again in the frame that drew it, a hitch of tens of
// milliseconds (in Chrome, one program linked for each Lower stroke begun 0.7 s or more after the last).

import { describe, expect, it, vi } from "vitest";
import { Points, PointsMaterial, Scene } from "three";
import { Effects } from "../../src/render3d/effects";
import { JUICE } from "../../src/render3d/palette";

function setUp() {
  const scene = new Scene();
  const clock = { t: 0, now: () => clock.t, driven: true };
  const fx = new Effects(scene, () => {}, clock);
  const puffs = () => scene.children.filter((o): o is Points => o instanceof Points);
  return { scene, clock, fx, puffs };
}

describe("the dust puff's material", () => {
  it("is kept when its puff has gone, never disposed, and the next puff takes it", () => {
    const { clock, fx, puffs } = setUp();
    fx.puff(4, 4, 2, 3);
    const first = puffs()[0].material as PointsMaterial;
    let disposed = 0;
    first.addEventListener("dispose", () => disposed++);
    clock.t = 400;
    fx.advance();
    expect(first.opacity).toBeLessThan(0.5);
    clock.t = 2000;
    expect(fx.advance()).toBe(false);
    expect(puffs()).toHaveLength(0);
    expect(disposed).toBe(0);
    fx.puff(9, 9, 2, 3);
    const again = puffs()[0].material as PointsMaterial;
    expect(again).toBe(first);
    // (as a new one: full and small until its first step, the dust's colour)
    expect(again.opacity).toBe(1);
    expect(again.size).toBe(0.5);
    expect(again.color.getHexString()).toBe(new PointsMaterial({ color: `rgb(${JUICE.dust.map((v) => Math.round(v * 255)).join(",")})` }).color.getHexString());
  });

  it("puffs that overlap each have their own, and putting the effects away disposes the kept ones", () => {
    const { clock, fx, puffs } = setUp();
    fx.puff(1, 1, 0, 2);
    clock.t = 100;
    fx.puff(2, 1, 0, 2);
    const [a, b] = puffs().map((p) => p.material as PointsMaterial);
    expect(a).not.toBe(b);
    clock.t = 5000;
    fx.advance();
    let disposed = 0;
    for (const m of [a, b]) m.addEventListener("dispose", () => disposed++);
    vi.stubGlobal("cancelAnimationFrame", () => {});
    fx.dispose();
    vi.unstubAllGlobals();
    expect(disposed).toBe(2);
  });
});
