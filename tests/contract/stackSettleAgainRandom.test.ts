// Random chained edits on maps with caves: the settle at once after an edit away from the water
// (sim/stackWater.ts `settledAgain`, D453) gives the same file, settled hash and stacked water as a
// session that always settles from cold. Top, deep and side digs, block adds, the map's edges and
// hollows dug into hillsides, from a fixed seed. Hollows runs only where the official maps were copied.

import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

const flag = vi.hoisted(() => ({ off: false, hits: 0 }));
vi.mock("../../src/core/sim/stackWater", async (orig) => {
  const m = await orig<typeof import("../../src/core/sim/stackWater")>();
  return {
    ...m,
    settledAgain: (...a: Parameters<typeof m.settledAgain>) => {
      if (flag.off) return null;
      const r = m.settledAgain(...a);
      if (r) flag.hits++;
      return r;
    },
  };
});

import { settledHash } from "../../src/core/collab";
import { MapSession } from "../../src/core/doc/session";
import { generate } from "../../src/core/gen/generate";
import type { StackSettle } from "../../src/core/sim/stackWater";
import { makeSpec } from "../../src/core/spec/mapspec";
import { dig, hillsides } from "./caveMap";

type Blocks = ReturnType<typeof dig>;
type Params = Blocks["params"];

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How far (Chebyshev, in tiles) (x, y) lies from every column the settle wet; -1 with no reach. */
function fromReach(st: StackSettle | undefined, x: number, y: number): number {
  if (!st?.reach) return -1;
  const N = st.W * st.H;
  let best = Infinity;
  for (let c = 0; c < st.reach.length; c++) {
    if (!st.reach[c]) continue;
    const i = c % N;
    best = Math.min(best, Math.max(Math.abs((i % st.W) - x), Math.abs(Math.floor(i / st.W) - y)));
  }
  return best;
}

const blocks = (p: Params): Blocks => ({ op: "blocks", params: p });

/** A random Block edit the map takes, mostly away from the water (where the shortcut may answer). */
function randomEdit(s: MapSession, R: () => number): Blocks | null {
  const b = s.built;
  const { W, H } = b;
  const held = new Set(b.entities.map((e) => e.y * W + e.x));
  const hs = hillsides(s);
  for (let tries = 0; tries < 400; tries++) {
    let x: number;
    let y: number;
    if (R() < 0.25) {
      // a tile on the map's edge
      const side = Math.floor(R() * 4);
      const t = Math.floor(R() * (side < 2 ? W : H));
      x = side < 2 ? t : side === 2 ? 0 : W - 1;
      y = side === 0 ? 0 : side === 1 ? H - 1 : t;
    } else {
      x = Math.floor(R() * W);
      y = Math.floor(R() * H);
    }
    const i = y * W + x;
    if (held.has(i) || b.water[i] > 0) continue;
    const d = fromReach(b.settle.stack, x, y);
    if (d >= 0 && d < 4 && R() < 0.85) continue;
    const h = b.heights[i];
    const size = 1 + Math.floor(R() * 3);
    const k = R();
    let op: Blocks;
    if (k < 0.3) op = blocks({ mode: "remove", side: "+z", at: [[x, y, h - 1]], size });
    else if (k < 0.5) op = blocks({ mode: "remove", side: "+z", at: [[x, y, Math.max(1, h - 2 - Math.floor(R() * 4))]], size: 1 });
    else if (k < 0.7) op = blocks({ mode: "add", side: "+z", at: [[x, y, h - 1]], size });
    else if (k < 0.85 && hs.length) {
      const f = hs[Math.floor(R() * hs.length)];
      op = dig(f.x, f.y, f.z, "-x");
    } else {
      const side = (["+x", "-x", "+y", "-y"] as const)[Math.floor(R() * 4)];
      op = blocks({ mode: "remove", side, at: [[x, y, Math.max(1, h - 1 - Math.floor(R() * 3))]], size: 1 });
    }
    if (!s.blockFalls(op.params).reason) return op;
  }
  return null;
}

const bytes = (a: ArrayBufferView) => Buffer.from(a.buffer, a.byteOffset, a.byteLength);

/** `make`'s map in two sessions, one settling from cold every time: `setup`, then `edits` random edits
 *  applied to both, each compared. Returns how often the shortcut answered. */
function lockstep(make: () => MapSession, setup: Blocks, edits: number, seed: number): number {
  const fast = make();
  flag.off = true;
  const cold = make();
  flag.off = false;
  const both = (op: Blocks) => {
    const e = fast.apply(op).errors;
    flag.off = true;
    expect(cold.apply(op).errors).toEqual(e);
    flag.off = false;
    return e;
  };
  expect(both(setup)).toEqual([]);
  const R = rng(seed);
  const hits = flag.hits;
  for (let n = 0; n < edits; n++) {
    const op = randomEdit(fast, R);
    if (!op) break;
    if (both(op).length) continue;
    const a = fast.exportTimber().bytes;
    flag.off = true;
    const c = cold.exportTimber().bytes;
    flag.off = false;
    const what = `edit ${n}: ${JSON.stringify(op.params)}`;
    expect(Buffer.from(a).equals(Buffer.from(c)), `${what}, the file`).toBe(true);
    expect(settledHash(fast), `${what}, the settled hash`).toBe(settledHash(cold));
    const sa = fast.built.settle.stack!;
    const sc = cold.built.settle.stack!;
    for (const k of ["count", "floor", "ceil", "depth", "overflow", "contamination", "sat", "reach"] as const) expect(bytes(sa[k]!).equals(bytes(sc[k]!)), `${what}, ${k}`).toBe(true);
    expect([sa.settled, sa.ticks]).toEqual([sc.settled, sc.ticks]);
  }
  return flag.hits - hits;
}

/** The official maps, copied locally (the dedicated machine's copy unless DGM_OFFICIAL says where). */
const OFFICIAL = process.env.DGM_OFFICIAL ?? "C:/Users/krams/code/DamGoodMaps/.scratch/official/";
const HOLLOWS = OFFICIAL + "builtin_18_MapMetadataHollowsName.timber";

describe("random edits on a map with caves: the settle at once is the settle from cold (D453)", () => {
  it("a generated 64² map, hollowed", () => {
    const r = generate(makeSpec({ seed: 3, theme: "riverValley", size: { x: 64, y: 64 } }));
    const make = () => MapSession.fromGenerated(r, r.file);
    const f = hillsides(make())[0];
    expect(lockstep(make, dig(f.x, f.y, f.z, "-x"), 25, 11)).toBeGreaterThanOrEqual(5);
  }, 120_000);

  it.skipIf(!existsSync(HOLLOWS))("Hollows (local only)", () => {
    const file = new Uint8Array(readFileSync(HOLLOWS));
    const make = () => MapSession.importMap(file, "Hollows.timber");
    // a first edit at a dry tile, for a canonical settle with its reach
    const s = make();
    const W = s.built.W;
    let first: Blocks | null = null;
    for (let i = 0; i < W * s.built.H && !first; i += 37) {
      if (s.built.water[i] > 0) continue;
      const op = blocks({ mode: "remove", side: "+z", at: [[i % W, Math.floor(i / W), s.built.heights[i] - 1]], size: 1 });
      if (!s.blockFalls(op.params).reason) first = op;
    }
    expect(lockstep(make, first!, 3, 33)).toBeGreaterThanOrEqual(1);
  }, 300_000);
});
