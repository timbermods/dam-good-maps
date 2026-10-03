// The canyon reading (analysis/signature.ts) finds a wide river's walls (Codex's Canyon audit, D370):
// it scanned 2–6 tiles from the course's middle, inside a wide river's own water, and missed the
// cliffs either side; it now looks from the first dry tile out, the same window as before for a narrow
// river.
import { describe, expect, it } from "vitest";
import { signatureOf } from "../../src/core/analysis/signature";
import type { RiverFeature } from "../../src/core/features/schema";

const W = 64;
const H = 64;

function gorge(half: number): { h: Uint8Array; D: Float64Array; river: RiverFeature } {
  const h = new Uint8Array(W * H).fill(9);
  const D = new Float64Array(W * H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const d = Math.abs(y - 32);
      if (d <= half) {
        h[y * W + x] = 3;
        D[y * W + x] = 1;
      }
    }
  const river = {
    id: "r",
    kind: "river",
    origin: "generated",
    role: "river/main",
    locked: false,
    params: { path: [[-1, 32], [64, 32]], width: 2 * half + 1, bedDepth: 1, bedProfile: { start: 3, steps: [] }, flow: 4, style: "straight", entry: { edge: "west" }, exit: { edge: "east" }, badwater: false },
  } as unknown as RiverFeature;
  return { h, D, river };
}

describe("the canyon reading", () => {
  it("finds a wide river's walls past its water", () => {
    const { h, D, river } = gorge(6);
    expect(signatureOf(W, H, h, D, [river]).canyon).toBeGreaterThan(40);
  });
  it("reads a narrow river's walls as before", () => {
    const { h, D, river } = gorge(1);
    expect(signatureOf(W, H, h, D, [river]).canyon).toBeGreaterThan(40);
  });
});
