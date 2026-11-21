// The great form (D493's list of landmarks, land/greatForm.ts) on hand-made land: a tall cliff the opening view
// looks at is worn deep at its foot, the game's support rule kept (nothing falls) and the surface kept, its mouth's
// height wandering along the face; land with no such cliff in view keeps what it has.
import { describe, expect, it } from "vitest";
import { roofDepths, shelters } from "../../src/core/analysis/seeThrough";
import { GREAT, wearGreat, type GreatInput } from "../../src/core/land/greatForm";
import { stream } from "../../src/core/math/rng";
import { plainMask, surfaceOfMask } from "../../src/core/terrain/runs";
import { unsupportedVoxels } from "../../src/core/terrain/support";

const W = 128;
const H = 128;
const N = W * H;
// the start at level 3; the camera looks along (sin 35°, cos 35°) for Cw0, so a cliff ahead along y faces it
const start = { x: 50, y: 30, z: 3, orientation: "Cw0" as const };

function input(cliff: (x: number) => number, rise = 9, off?: (i: number) => boolean, away = false): GreatInput {
  const heights = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) heights[y * W + x] = (away ? y < cliff(x) : y >= cliff(x)) ? 3 + rise : 3;
  const mask = Uint32Array.from(heights, (z) => plainMask(z));
  const o = new Uint8Array(N);
  if (off) for (let i = 0; i < N; i++) if (off(i)) o[i] = 1;
  return { W, H, heights, water: new Float64Array(N), mask, off: o, trees: new Uint8Array(N), start };
}

const falls = (m: Uint32Array) => unsupportedVoxels({ W, H, mask: m });
const reads = (m: Uint32Array, tiles: Iterable<number>) => shelters(roofDepths(m, W, H, tiles));
// (a face that wanders a tile or two along its length, as the land's own do)
const WANDER = [0, 0, 0, 1, 1, 1, 2, 2, 2, 1, 1, 1];
const wander = (x: number) => 72 + WANDER[x % 12];

describe("the great form on hand-made land", () => {
  it("wears a tall cliff in the opening view deep at its foot: nothing falls, the surface kept, the mouth uneven", () => {
    const inp = input(wander);
    const got = wearGreat(inp, stream(1, "great-form"), falls, reads);
    if (typeof got === "string") throw new Error(got);
    const next = inp.mask.slice();
    for (const [i, m] of got.change) next[i] = m;
    expect(falls(next).every((v) => v === 0)).toBe(true);
    for (let i = 0; i < N; i++) expect(surfaceOfMask(next[i])).toBe(inp.heights[i]);
    expect(got.length).toBeGreaterThanOrEqual(GREAT.length);
    expect(got.high[1]).toBeGreaterThanOrEqual(4);
    expect(got.high[1]).toBeLessThanOrEqual(GREAT.tallest);
    expect(got.deep).toBeLessThanOrEqual(GREAT.deepest);
    // the mouth's height at the face wanders: never one band
    const mouths = new Set<number>();
    for (const i of got.tiles) {
      const air = inp.mask[i] & ~next[i];
      if (air) mouths.add(32 - Math.clz32(air) - 3);
    }
    expect(mouths.size).toBeGreaterThanOrEqual(3);
    // the rock kept over it: two levels or more
    for (const i of got.tiles) {
      const air = inp.mask[i] & ~next[i];
      expect(inp.heights[i] - (32 - Math.clz32(air))).toBeGreaterThanOrEqual(GREAT.roof);
    }
  });

  it("the same land and draw wear the same form", () => {
    const a = wearGreat(input(wander), stream(4, "great-form"), falls, reads);
    const b = wearGreat(input(wander), stream(4, "great-form"), falls, reads);
    if (typeof a === "string" || typeof b === "string") throw new Error("no form");
    expect([...a.change]).toEqual([...b.change]);
  });

  it("no cliff 7 high, a cliff out of the view, or one the forms stage keeps off: nothing is worn", () => {
    expect(wearGreat(input(wander, 6), stream(1, "great-form"), falls, reads)).toBe("no cliff 7 or more over level dry ground");
    // (its face turned away from the camera)
    expect(typeof wearGreat(input(wander, 9, undefined, true), stream(1, "great-form"), falls, reads)).toBe("string");
    expect(typeof wearGreat(input(wander, 9, (i) => Math.floor(i / W) >= 70), stream(1, "great-form"), falls, reads)).toBe("string");
  });
});
