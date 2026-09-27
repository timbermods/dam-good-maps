// The stacked-column water engine (D120; src/core/sim/stack.ts, sim/columns.ts), before it is wired
// into anything: "port" mode gives exactly the heightfield port's bits on a heightfield, and the
// game's pressure rules hold in a sealed cave.

import { describe, expect, it } from "vitest";
import { OPEN_CEILING, slotAt, waterColumns } from "../../src/core/sim/columns";
import { StackSim, PRESSURE } from "../../src/core/sim/stack";
import { WaterSim, type WaterModel } from "../../src/core/sim/water";
import { prefill } from "../../src/core/sim/prefill";

/** A small valley: a stream from a source at the west, draining off the east edge. */
function valley(W: number, H: number): Uint8Array {
  const h = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const across = Math.abs(y - H / 2);
      h[y * W + x] = Math.min(12, 3 + Math.floor(across / 2) + ((x * 7 + y * 3) % 5 === 0 ? 1 : 0) + (x < 4 ? 2 : 0) - (x > W - 6 ? 1 : 0));
    }
  return h;
}

describe("stacked water", () => {
  it("in port mode gives the heightfield port's bits on a heightfield", () => {
    const W = 40;
    const H = 32;
    const N = W * H;
    const h = valley(W, H);
    const src = (H / 2) * W + 2;
    const m: WaterModel = { W, H, floor: Float64Array.from(h), dam: null, emitters: [{ cells: [src], strength: 3, contamination: 0 }] };
    const mask = new Uint32Array(N);
    for (let i = 0; i < N; i++) mask[i] = 2 ** h[i] - 1;
    const cols = waterColumns({ W, H, mask }, []);
    expect(cols.L).toBe(1);
    const pf = prefill(m);
    const a = new WaterSim(m, pf).run(300);
    const b = new StackSim({ cols, emitters: [{ cols: [src], tiles: [src], strength: 3, contamination: 0 }] }, "port");
    b.setState({ depth: pf.depth, overflow: new Float64Array(N), contamination: pf.contamination });
    b.run(300);
    let differ = 0;
    for (let i = 0; i < N; i++) if (a.D[i] !== b.D[i] || a.C[i] !== b.C[i]) differ++;
    expect(differ).toBe(0);
    expect(b.volume()).toBe(a.volume());
    // game mode moves only the water's last digits here
    const g = new StackSim({ cols, emitters: [{ cols: [src], tiles: [src], strength: 3, contamination: 0 }] }, "game");
    g.setState({ depth: pf.depth, overflow: new Float64Array(N), contamination: pf.contamination });
    g.run(300);
    for (let i = 0; i < N; i++) {
      expect(a.D[i] > 0.05).toBe(g.D[i] > 0.05);
      expect(Math.abs(a.D[i] - g.D[i])).toBeLessThan(0.05);
    }
  });

  it("fills a sealed cave with a source to its roof and caps the pressure", () => {
    // a block of rock 10 high with a sealed chamber at z 3..5 (3 high) over tiles 4..7 × 4..7
    const W = 12;
    const H = 12;
    const N = W * H;
    const mask = new Uint32Array(N);
    const inCave = (x: number, y: number) => x >= 4 && x <= 7 && y >= 4 && y <= 7;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        let m = 2 ** 10 - 1;
        if (inCave(x, y)) m &= ~(0b111 << 3);
        mask[y * W + x] = m >>> 0;
      }
    const cols = waterColumns({ W, H, mask }, []);
    const tile = 5 * W + 5;
    expect(cols.count[tile]).toBe(2);
    const slot = slotAt(cols, tile, 3);
    expect(slot).toBe(0);
    expect(cols.floor[tile]).toBe(3);
    expect(cols.ceil[tile]).toBe(6);
    expect(cols.floor[N + tile]).toBe(10);
    expect(cols.ceil[N + tile]).toBe(OPEN_CEILING);
    const sim = new StackSim({ cols, emitters: [{ cols: [tile], tiles: [tile], strength: 4, contamination: 0 }] });
    sim.run(3 * 768);
    const cap = (OPEN_CEILING - 6) / PRESSURE;
    for (let y = 4; y <= 7; y++)
      for (let x = 4; x <= 7; x++) {
        const c = y * W + x;
        expect(sim.D[c]).toBe(3);
        expect(sim.O[c]).toBeGreaterThan(0);
        expect(sim.O[c]).toBeLessThanOrEqual(cap);
      }
    // nothing leaks into the open columns on top
    for (let i = 0; i < N; i++) expect(sim.D[(cols.count[i] - 1) * N + i]).toBe(0);
  });
});
