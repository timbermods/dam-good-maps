// The stacked-column water engine (D120; src/core/sim/stack.ts, sim/columns.ts), before it is wired
// into anything: "port" mode gives exactly the heightfield port's bits on a heightfield, and the
// game's pressure rules hold in a sealed cave.

import { describe, expect, it } from "vitest";
import { OPEN_CEILING, heightMasks, slotAt, waterColumns } from "../../src/core/sim/columns";
import { StackSim, PRESSURE, type StackMode } from "../../src/core/sim/stack";
import { openFieldModel, stackModel } from "../../src/core/sim/stackModel";
import { WaterSim, type WaterModel } from "../../src/core/sim/water";
import { prefill } from "../../src/core/sim/prefill";
import type { MapObject } from "../../src/core/sim/model";

const object = (template: string, x: number, y: number, z: number, components: MapObject["components"] = {}): MapObject => ({ template, x, y, z, orientation: "Cw0", flipped: false, components });
const source = (x: number, y: number, z: number, strength: number) => object("WaterSource", x, y, z, { WaterSource: { SpecifiedStrength: strength } });

/** The valley with a stone bridge over its stream (a roof at z 8–9 over every tile lower than 8
 *  from x 14 to 18), a sealed cave with a source in the valley's side, and a NaturalDam in the
 *  stream: every kind of column beside one-column tiles. */
function caveValley(): { W: number; H: number; mask: Uint32Array; objects: MapObject[] } {
  const W = 40;
  const H = 32;
  const h = valley(W, H);
  const { mask } = heightMasks(W, H, h);
  for (let y = 0; y < H; y++)
    for (let x = 14; x <= 18; x++) {
      const i = y * W + x;
      if (h[i] < 8) mask[i] = (mask[i] | (0b11 << 8)) >>> 0;
    }
  for (let y = 1; y <= 3; y++)
    for (let x = 22; x <= 26; x++) mask[y * W + x] = (mask[y * W + x] & ~(0b111 << 3)) >>> 0;
  const objects = [source(2, H / 2, h[(H / 2) * W + 2], 3), source(24, 2, 3, 1), object("NaturalDam", 30, H / 2, h[(H / 2) * W + 30])];
  return { W, H, mask, objects };
}

/** Two runs of the same model agree on every bit: depth, overflow, contamination and momentum. */
function sameBits(a: StackSim, b: StackSim): void {
  let differ = 0;
  for (let c = 0; c < a.M; c++) if (a.D[c] !== b.D[c] || a.O[c] !== b.O[c] || a.C[c] !== b.C[c]) differ++;
  for (let e = 0; e < a.out.length; e++) if (a.out[e] !== b.out[e]) differ++;
  expect(differ).toBe(0);
  expect(a.volume()).toBe(b.volume());
}

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

describe("the fast path for one-column tiles", () => {
  it("gives the general loop's bits on a map with caves, in both modes", () => {
    const m = caveValley();
    const model = stackModel(m, m.objects);
    expect(openFieldModel(model)).toBeNull();
    for (const mode of ["game", "port"] as StackMode[]) {
      const fast = new StackSim(model, mode);
      const general = new StackSim(model, mode, { fast: false });
      let fastTiles = 0;
      for (let i = 0; i < fast.N; i++) fastTiles += fast.fast![i];
      // most tiles are fast; the bridge, the cave, the dam and their neighbours are not
      expect(fastTiles).toBeGreaterThan(0.6 * fast.N);
      expect(fastTiles).toBeLessThan(fast.N);
      fast.run(900);
      general.run(900);
      sameBits(fast, general);
      // water runs under the bridge, and the sealed cave is under pressure
      const W = m.W;
      const under = (m.H / 2) * W + 16;
      expect(fast.cols.count[under]).toBe(2);
      expect(fast.D[under]).toBeGreaterThan(0.05);
      expect(fast.O[2 * W + 24]).toBeGreaterThan(0);
    }
  });

  it("gives the general loop's bits on a heightfield, and on an open field the heightfield engine's (level 1)", () => {
    const W = 40;
    const H = 32;
    const h = valley(W, H);
    const objects = [source(2, H / 2, h[(H / 2) * W + 2], 3), object("NaturalDam", 30, H / 2, h[(H / 2) * W + 30])];
    const model = stackModel(heightMasks(W, H, h), objects);
    const field = openFieldModel(model);
    expect(field).not.toBeNull();
    const pf = prefill(field!);
    const state = { depth: pf.depth, overflow: new Float64Array(W * H), contamination: pf.contamination };
    for (const mode of ["game", "port"] as StackMode[]) {
      const fast = new StackSim(model, mode);
      const general = new StackSim(model, mode, { fast: false });
      fast.setState(state);
      general.setState(state);
      fast.run(400);
      general.run(400);
      sameBits(fast, general);
      if (mode !== "port") continue;
      const flat = new WaterSim(field!, pf).run(400);
      let differ = 0;
      for (let i = 0; i < W * H; i++) if (flat.D[i] !== fast.D[i] || flat.C[i] !== fast.C[i]) differ++;
      expect(differ).toBe(0);
    }
  });
});
