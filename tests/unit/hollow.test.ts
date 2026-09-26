// Where water put on dry ground ends up (a source placed in a hollow, Claude's addSource): it fills
// the hollow to the level of its lowest rim, or on a slope runs on downhill.

import { describe, expect, it } from "vitest";
import { hollowAt } from "../../src/core/features/hollow";

describe("hollowAt", () => {
  it("a hollow fills to the level of its lowest rim; on a slope, water runs on downhill", () => {
    // a bowl: level 5 ground, a 3×3 pit of level 2, and a level-3 channel from it to the east edge
    const n = 12;
    const h = new Uint8Array(n * n).fill(5);
    for (let y = 4; y <= 6; y++) for (let x = 4; x <= 6; x++) h[y * n + x] = 2;
    for (let x = 7; x < n; x++) h[5 * n + x] = 3;
    const bowl = hollowAt(h, null, n, n, 5, 5);
    expect(bowl.fills).toBe(true);
    expect(bowl.level).toBe(3);
    expect(bowl.tiles).toBeGreaterThanOrEqual(9);
    // a ramp: every tile a level lower to the west
    const r = new Uint8Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) r[y * n + x] = x;
    expect(hollowAt(r, null, n, n, 6, 6).fills).toBe(false);
  });
});
