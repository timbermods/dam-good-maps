import { describe, expect, it } from "vitest";
import { distanceFrom } from "../../src/core/math/grid";
import { mineDistance, mineFootDistance } from "../../src/core/resources/mineGround";
import { objectKeepOff } from "../../src/core/gen/extras";
import { strip } from "../contract/minePairGround";

describe("one mine ground rule for reservation and placement", () => {
  it("measures the nearest footprint tile in every direction, exactly as placement's distance field", () => {
    const W = 96, H = 96, sx = 24, sy = 35;
    const start = new Uint8Array(W * H);
    for (let y = sy - 1; y <= sy + 1; y++) for (let x = sx - 1; x <= sx + 1; x++) start[y * W + x] = 1;
    const sd = distanceFrom(start, W, H);
    for (let y = 3; y < H - 3; y++) for (let x = 3; x < W - 3; x++)
      expect(mineDistance(sx, sy, x, y)).toBeCloseTo(mineFootDistance(sd, W, x - 2, y - 2), 11);
  });

  it("keeps the map border, the square water margin, channels, occupied and protected ground", () => {
    const b = strip();
    b.water[40 * b.W + 40] = 1;
    b.channel[50 * b.W + 50] = 1;
    b.occupied[51 * b.W + 50] = 1;
    b.cache.terrain.protect[52 * b.W + 50] = 1;
    const avoid = new Uint8Array(b.W * b.H);
    const protect = avoid.slice();
    avoid[53 * b.W + 50] = 1;
    protect[54 * b.W + 50] = 1;
    const mask = objectKeepOff(b, [], protect, avoid);
    expect(mask[2 * b.W + 1]).toBe(1);
    expect(mask[2 * b.W + 2]).toBe(0);
    expect(mask[43 * b.W + 43]).toBe(1);
    expect(mask[44 * b.W + 44]).toBe(0);
    for (let y = 50; y <= 54; y++) expect(mask[y * b.W + 50]).toBe(1);
  });
});
