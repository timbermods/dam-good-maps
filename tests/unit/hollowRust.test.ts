// The hydrology's hollow flood in Rust (rust/analysis/src/land.rs) is its TypeScript (land/hollow.ts `hollowInTs`):
// the same lake, its tiles in the same order, on smooth and rough ground of many shapes, with and without a budget,
// a highest sill and a sea.

import { describe, expect, it } from "vitest";
import { executeInRust, frame, hollowInRust } from "../../src/core/analysis/rust/bridge";
import { hollowInTs } from "../../src/core/land/hollow";
import { fbm } from "../../src/core/math/noise";
import { Rng } from "../../src/core/math/rng";

function ground(rng: Rng, W: number, H: number, rough: boolean): Uint8Array {
  const s = rng.nextU32();
  const h = new Uint8Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) h[y * W + x] = Math.max(0, Math.min(30, Math.round(12 + 10 * fbm(s, x, y, rough ? 4 : 24, rough ? 2 : 4))));
  return h;
}

describe("the hollow flood in Rust", () => {
  it("gives the TypeScript's lake, tile for tile, at every size and setting", () => {
    const rng = new Rng(20261114);
    let lakes = 0;
    let cases = 0;
    for (const [W, H] of [[1, 1], [1, 9], [7, 3], [32, 32], [64, 40], [96, 96], [256, 256]]) {
      for (let k = 0; k < (W * H > 10000 ? 3 : 12); k++) {
        const h = ground(rng, W, H, k % 2 === 1);
        for (let t = 0; t < 8; t++) {
          const seed = rng.int(0, W * H);
          const sill = h[seed] + rng.int(0, 6);
          const budget = rng.pick([Infinity, 6, 40, 0.02 * W * H, 0.1 * W * H]);
          const maxSill = rng.pick([Infinity, sill, sill - 2, h[seed] + 1]);
          const sea = rng.float() < 0.2;
          const ts = hollowInTs(h, W, H, seed, sill, budget, maxSill, sea);
          expect(hollowInRust(h, W, H, seed, sill, budget, maxSill, sea)).toEqual(ts);
          // (and the identity check's frame: kernel 10)
          const out = executeInRust(frame("hollow", W, H, [seed, sill, budget, maxSill, sea ? 1 : 0], [h]));
          expect(out.length ? { sill: out[0], tiles: Array.from(out.subarray(1)) } : null).toEqual(ts);
          cases++;
          if (ts) lakes++;
        }
      }
    }
    // (the cases hold lakes and refusals both)
    expect(lakes).toBeGreaterThan(cases / 5);
    expect(cases - lakes).toBeGreaterThan(cases / 5);
  });
});
