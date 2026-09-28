// The settled water's outflows travel with the file (FORMAT.md §4.3). The game loads a map's water
// with the outflows the file stores; written as 0, it rebuilds the flow from rest, and a map whose
// flow can settle more than one way does not come back to the water it shipped with (M9a's probe
// batch 20260927-0853-batch: Delta 128² seed 1 kept 78.5% of its wet tiles within 0.1 after a day,
// exactly what the simulation gives restarted from rest). With the settle's own outflows written,
// the water the file shows is the water the game plays.

import { describe, expect, it } from "vitest";
import { readTimber } from "../../src/core/format/timber";
import { generate } from "../../src/core/gen/generate";
import { WaterSim, TICKS_PER_DAY } from "../../src/core/sim/water";
import { decodeSpecFragment } from "../../src/core/spec/codec";

/** The outflows a file stores, four per tile in the simulation's order (−y, −x, +y, +x), with each
 *  part's target checked against the game's padded grid (`MapIndexService`). */
function storedOutflows(bytes: Uint8Array, W: number, H: number): Float64Array {
  const world = readTimber(bytes).world;
  const wm = (world.singletons as Record<string, { ColumnOutflows: { Array: string } }>).WaterMapNew;
  const tokens = String(wm.ColumnOutflows.Array).split(" ");
  expect(tokens.length).toBe(W * H);
  const stride = W + 2;
  const out = new Float64Array(4 * W * H);
  tokens.forEach((tok, i) => {
    if (tok === "0") return;
    const x = i % W;
    const y = (i - x) / W;
    const targets = [y * stride + x + 1, (y + 1) * stride + x, (y + 2) * stride + x + 1, (y + 1) * stride + x + 2];
    const parts = tok.split(":");
    expect(parts.length, `tile (${x}, ${y})`).toBe(4);
    parts.forEach((p, k) => {
      if (p === "0") return;
      const [target, flow] = p.split("|");
      expect(Number(target), `tile (${x}, ${y}) direction ${k}`).toBe(targets[k]);
      out[4 * i + k] = Number(flow);
    });
  });
  return out;
}

describe("the settled water's outflows in the file (FORMAT.md §4.3)", () => {
  it("a generated map stores its settle's outflows, Bottom:Left:Top:Right to the neighbours in the game's grid", () => {
    const r = generate(decodeSpecFragment("s=1&t=any&z=96&d=n")!.spec);
    const { W, H } = r.built;
    const out = storedOutflows(r.bytes, W, H);
    const settled = r.built.settle.out!;
    let flowing = 0;
    for (let k = 0; k < out.length; k++) {
      const want = r.built.settle.depth[k >> 2] > 1e-6 && settled[k] > 1e-6 ? settled[k] : 0;
      expect(Math.abs(out[k] - want)).toBeLessThanOrEqual(1e-6 * Math.max(1, want));
      if (out[k] > 0) flowing++;
    }
    expect(flowing).toBeGreaterThan(100);
  });

  it("loaded with its outflows, as the game loads it, the stored water holds a day (Delta 128² seed 1)", () => {
    const r = generate(decodeSpecFragment("s=1&t=delta&z=128&d=n")!.spec);
    const { W, H } = r.built;
    const S = r.built.settle;
    const sim = new WaterSim(r.built.waterModel, { depth: S.depth.slice(), contamination: S.contamination.slice() });
    sim.out.set(storedOutflows(r.bytes, W, H));
    sim.run(TICKS_PER_DAY);
    let wet = 0;
    let within = 0;
    let v0 = 0;
    let v1 = 0;
    for (let i = 0; i < W * H; i++) {
      v0 += S.depth[i];
      v1 += sim.D[i];
      if (S.depth[i] > 0.05 || sim.D[i] > 0.05) {
        wet++;
        if (Math.abs(S.depth[i] - sim.D[i]) <= 0.1) within++;
      }
    }
    // (the probe's own measure: 95% of wet tiles within 0.1 after a day, the volume within 10%)
    expect(within / wet).toBeGreaterThan(0.99);
    expect(Math.abs(v1 / v0 - 1)).toBeLessThan(0.01);
  });
});
