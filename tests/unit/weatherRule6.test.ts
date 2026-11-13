// Naturalize's rule 6 at a cliff (D399, D514; `features/raster/weather.ts` `shed`): a cliff sheds where this stroke
// presses harder than the strokes before it on either of its sides, and holds where both its sides are worn. A cliff
// with one side worn and the other fresh (Naturalize, then Raise or Flatten a cliff beside it and Naturalize again; or
// strokes dragged side by side) sheds as on fresh land (the review of #1066 at 166f66af: it stayed a wall).

import { describe, expect, it } from "vitest";
import { weather } from "../../src/core/features/raster/weather";

const W = 48;
const H = 48;

/** A 6-level cliff between x 23 and x 24 (west 12, east 6), the whole map pressed at full intensity, Strength 10,
 *  rule 6, with `earlier` sixteenths on the tiles `worn` says. The tiles that changed. */
function run(worn: (x: number) => boolean): number {
  const before = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) before[y * W + x] = x <= 23 ? 12 : 6;
  const earlier = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (worn(x)) earlier[y * W + x] = 16;
  const out = before.slice();
  weather(
    { W, H, box: { x0: 0, y0: 0, x1: W - 1, y1: H - 1 }, before, intensity: new Float32Array(W * H).fill(1), size: 24, strength: 10, write: () => true, top: 32, earlier, rule: 6 },
    out,
  );
  let n = 0;
  for (let i = 0; i < W * H; i++) if (out[i] !== before[i]) n++;
  return n;
}

describe("Naturalize rule 6 at a cliff", () => {
  it("sheds a cliff with one side worn as on fresh land, and holds one with both sides worn", () => {
    const fresh = run(() => false);
    expect(fresh).toBeGreaterThan(100);
    // (the foot's side worn, then the top's)
    expect(run((x) => x >= 24)).toBeGreaterThan(fresh / 2);
    expect(run((x) => x <= 23)).toBeGreaterThan(fresh / 2);
    // (both worn: a true repeat rests)
    expect(run(() => true)).toBe(0);
  });
});
