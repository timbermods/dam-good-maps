// The land's priority flood in Rust (rust/analysis/src/land.rs) is its TypeScript (land/drainage.ts `floodInTs`): the
// same filled levels, receivers, order and area, bit for bit, on whole levels and on the field's floats, side to side
// and eight ways, with and without an epsilon and outlets, at every shape.

import { describe, expect, it } from "vitest";
import { drainageInRust, executeInRust, frame } from "../../src/core/analysis/rust/bridge";
import { floodInTs } from "../../src/core/land/drainage";
import { fbm } from "../../src/core/math/noise";
import { Rng } from "../../src/core/math/rng";

const bits = (a: Float64Array) => Array.from(new Uint32Array(a.buffer, a.byteOffset, a.length * 2));

describe("the priority flood in Rust", () => {
  it("gives the TypeScript's drainage, bit for bit, at every size and setting", () => {
    const rng = new Rng(20261115);
    let cases = 0;
    for (const [W, H] of [[1, 1], [1, 9], [2, 2], [7, 3], [32, 32], [64, 40], [96, 96], [256, 256]]) {
      for (let k = 0; k < (W * H > 10000 ? 4 : 10); k++) {
        const s = rng.nextU32();
        const whole = k % 2 === 0;
        const h = new Float64Array(W * H);
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const v = 12 + 10 * fbm(s, x, y, 4 + (k % 3) * 10, 3);
          h[y * W + x] = whole ? Math.round(v) : v;
        }
        // (a zero of each sign: a border tile's filled level is its height as given)
        if (W * H > 4) { h[0] = 0; h[1] = -0; }
        const eight = rng.float() < 0.5;
        const eps = rng.pick([0, 0, 1e-6, 0.01]);
        const outlets = rng.float() < 0.4 ? Uint8Array.from({ length: W * H }, () => (rng.float() < 0.3 ? 1 : 0)) : null;
        const ts = floodInTs(h, W, H, eight, eps, outlets);
        const rs = drainageInRust(h, W, H, eight, eps, outlets);
        expect(bits(rs.filled)).toEqual(bits(ts.filled));
        expect(Array.from(rs.rcv)).toEqual(Array.from(ts.rcv));
        expect(Array.from(rs.order)).toEqual(Array.from(ts.order));
        expect(bits(rs.area)).toEqual(bits(ts.area));
        // (and the identity check's frame: kernel 11)
        const out = executeInRust(frame("drainage", W, H, [eight ? 1 : 0, eps], [h, outlets ?? []]));
        const N = W * H;
        const n = out[0];
        expect(n).toBe(ts.order.length);
        expect(bits(out.slice(1, 1 + N))).toEqual(bits(ts.filled));
        expect(Array.from(out.subarray(1 + 2 * N, 1 + 2 * N + n))).toEqual(Array.from(ts.order));
        cases++;
      }
    }
    expect(cases).toBeGreaterThan(50);
  });
});
