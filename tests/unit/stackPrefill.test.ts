// The canonical settle on stacked columns (D120; src/core/sim/stackPrefill.ts): on a heightfield it
// gives today's pre-fill and settle bit for bit (sim/prefill.ts), sealed basins included; in slices
// it gives the same water as in one go; a cave under a lake starts full and under pressure.

import { describe, expect, it } from "vitest";
import { heightMasks } from "../../src/core/sim/columns";
import { waterModel } from "../../src/core/sim/model";
import { canonicalSettle, prefill } from "../../src/core/sim/prefill";
import { StackSim, PRESSURE } from "../../src/core/sim/stack";
import { stackModel } from "../../src/core/sim/stackModel";
import { canonicalStackRun, canonicalStackSettle, stackPrefill } from "../../src/core/sim/stackPrefill";
import type { RetainedWater } from "../../src/core/sim/water";
import { caveValley, object, source, valley } from "./stackMaps";

describe("the 3D pre-fill and canonical settle", () => {
  it("give today's numbers on a heightfield, bit for bit", () => {
    const W = 40;
    const H = 32;
    const h = valley(W, H);
    // a badwater source stands on flat ground, as the game places it
    for (let y = H / 2 + 3; y < H / 2 + 6; y++) for (let x = 1; x < 4; x++) h[y * W + x] = 7;
    const objects = [source(2, H / 2, h[(H / 2) * W + 2], 3), source(1, H / 2 + 3, 7, 2, "BadwaterSource"), object("NaturalDam", 30, H / 2, h[(H / 2) * W + 30])];
    const hm = waterModel(W, H, h, objects);
    const sm = stackModel(heightMasks(W, H, h), objects);
    const a = prefill(hm);
    const b = stackPrefill(new StackSim(sm, "port"));
    let differ = 0;
    for (let i = 0; i < W * H; i++) if (a.depth[i] !== b.depth[i] || a.contamination[i] !== b.contamination[i] || b.overflow[i] !== 0) differ++;
    expect(differ).toBe(0);
    const ca = canonicalSettle(hm);
    const cb = canonicalStackSettle(sm, { mode: "port" });
    expect(cb.ticks).toBe(ca.ticks);
    expect(cb.settled).toBe(ca.settled);
    for (let i = 0; i < W * H; i++) if (ca.depth[i] !== cb.depth[i] || ca.contamination[i] !== cb.contamination[i] || ca.sat[i] !== cb.sat[i]) differ++;
    expect(differ).toBe(0);
  });

  it("start a sealed basin with the water it kept, and settle it as today", () => {
    const W = 40;
    const H = 32;
    const h = valley(W, H);
    // a pit in the valley's side, cut off from the stream, holding 3 levels of kept water
    const tiles: number[] = [];
    for (let y = 3; y <= 6; y++)
      for (let x = 30; x <= 35; x++) {
        h[y * W + x] = 5;
        tiles.push(y * W + x);
      }
    const retained: RetainedWater[] = [{ tiles, floor: tiles.map(() => 5), depth: tiles.map(() => 3), contamination: tiles.map((_, k) => (k % 3 === 0 ? 0.5 : 0)) }];
    const objects = [source(2, H / 2, h[(H / 2) * W + 2], 3)];
    const hm = { ...waterModel(W, H, h, objects), retained };
    const sm = { ...stackModel(heightMasks(W, H, h), objects), retained };
    const ca = canonicalSettle(hm);
    const cb = canonicalStackSettle(sm, { mode: "port" });
    expect(cb.ticks).toBe(ca.ticks);
    expect(cb.settled).toBe(ca.settled);
    expect(cb.steadyTicks).toBe(ca.steadyTicks);
    expect(ca.steadyTicks).toBeDefined();
    let differ = 0;
    for (let i = 0; i < W * H; i++) if (ca.depth[i] !== cb.depth[i] || ca.contamination[i] !== cb.contamination[i]) differ++;
    expect(differ).toBe(0);
  });

  it("gives the same water in slices as in one go, with progress up to 1", () => {
    const m = caveValley();
    const sm = stackModel(m, m.objects);
    const whole = canonicalStackSettle(sm);
    const run = canonicalStackRun(sm);
    let r = null;
    let last = -1;
    let slices = 0;
    while (!r) {
      expect(run.progress).toBeGreaterThanOrEqual(last);
      last = run.progress;
      r = run.advance(37);
      slices++;
    }
    expect(run.progress).toBe(1);
    expect(slices).toBeGreaterThan(5);
    expect(r.ticks).toBe(whole.ticks);
    let differ = 0;
    for (let c = 0; c < whole.depth.length; c++) if (whole.depth[c] !== r.depth[c] || whole.overflow[c] !== r.overflow[c] || whole.contamination[c] !== r.contamination[c]) differ++;
    expect(differ).toBe(0);
  });

  it("starts a cave beside a lake full and under the lake's pressure, and leaves a sealed cave dry", () => {
    // a plateau at 10; a lake basin at floor 2 with a source, spilling east down a channel at 6; a
    // cave at z 2-4 beside the lake under a roof from 5; a sealed cave elsewhere
    const W = 30;
    const H = 20;
    const h = new Uint8Array(W * H).fill(10);
    for (let y = 5; y <= 14; y++) for (let x = 5; x <= 12; x++) h[y * W + x] = 2;
    for (let y = 9; y <= 10; y++) for (let x = 13; x < W; x++) h[y * W + x] = 6;
    const { mask } = heightMasks(W, H, h);
    const cave: number[] = [];
    for (let y = 5; y <= 8; y++)
      for (let x = 13; x <= 16; x++) {
        mask[y * W + x] = (mask[y * W + x] & ~(0b111 << 2)) >>> 0;
        cave.push(y * W + x);
      }
    const sealed: number[] = [];
    for (let y = 2; y <= 5; y++)
      for (let x = 20; x <= 24; x++) {
        mask[y * W + x] = (mask[y * W + x] & ~(0b111 << 3)) >>> 0;
        sealed.push(y * W + x);
      }
    const sm = stackModel({ W, H, mask }, [source(8, 10, 2, 4)]);
    const sim = new StackSim(sm);
    const pf = stackPrefill(sim);
    // the lake starts at its spill level 6; the cave full to its roof at 5, with (6 - 5)/8 of overflow
    expect(pf.depth[10 * W + 8]).toBe(4);
    for (const i of cave) {
      expect(pf.depth[i]).toBe(3);
      expect(pf.overflow[i]).toBe(1 / PRESSURE);
    }
    for (const i of sealed) expect(pf.depth[i]).toBe(0);
    const r = canonicalStackSettle(sm);
    expect(r.settled).toBe(true);
    // the cave stays full, its pressure the lake's head over its roof: (surface - 5)/8
    const lake = 7 * W + 12;
    const head = (2 + r.depth[lake] - 5) / PRESSURE;
    expect(head).toBeGreaterThan(1 / PRESSURE);
    for (const i of cave) {
      expect(r.depth[i]).toBe(3);
      expect(Math.abs(r.overflow[i] - head)).toBeLessThan(0.01);
    }
    for (const i of sealed) expect(r.depth[i]).toBe(0);
  });
});
