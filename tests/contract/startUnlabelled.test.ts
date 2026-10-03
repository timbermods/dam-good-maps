// The settler never scores a place NaN (PLAN §20 D366: a NaN score sorts differently from engine to
// engine). The start's ground must join enough walkable land (`SettlerOptions.foot`, PLAN §5.2); the
// land analysis gives no label to the tiles it leaves out, water and the editor's locked ground among
// them (generate.ts `footComponents` on `keep`). A place on such a tile read its land as undefined:
// it passed the minimum (undefined < n is false) and scored NaN, and where one sorted first no place
// was "nearly as good" as it, so the settler picked nothing and threw. Such a tile joins no walkable
// land: it fails the minimum, and without one it fits not at all.

import { describe, expect, it } from "vitest";
import { footAt, pickStart } from "../../src/core/gen/settler";
import { footComponents } from "../../src/core/land/levels";
import { stream } from "../../src/core/math/rng";

const W = 64;
const H = 64;
const N = W * H;

/** Level land at 5 with a river along the left edge (at 4, half a level deep, clean), all of it moist,
 *  and the editor's locked ground over the top half (the first places the settler meets). */
function land() {
  const h = new Uint8Array(N).fill(5);
  const depth = new Float64Array(N);
  const river = new Uint8Array(N);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < 4; x++) {
      h[y * W + x] = 4;
      depth[y * W + x] = 0.5;
      river[y * W + x] = 1;
    }
  const moisture = new Float64Array(N);
  for (let i = 0; i < N; i++) if (!river[i]) moisture[i] = 1;
  const locked = new Uint8Array(N);
  for (let y = 0; y < H / 2; y++) for (let x = 4; x < W; x++) locked[y * W + x] = 1;
  // the analysis leaves out the water and the locked ground, as the generator's `keep` does
  const keep = new Uint8Array(N);
  for (let i = 0; i < N; i++) keep[i] = river[i] || locked[i] ? 1 : 0;
  const foot = footComponents(h, W, H, keep);
  return { h, depth, river, moisture, locked, foot };
}

describe("a start place on land without a walkable-land label (D366)", () => {
  const { h, depth, river, moisture, locked, foot } = land();
  const hydro = { water: river, lakes: [], falls: [], rivers: [] };
  const water = { depth, contamination: new Float64Array(N), moisture };
  const prefs = [1, 1, 1, 1, 1, 1];

  it("joins no walkable land", () => {
    const at = 16 * W + 10;
    expect(foot.lab[at]).toBe(-1);
    expect(footAt(foot, at)).toBe(0);
    expect(footAt(foot, 48 * W + 10)).toBe(foot.size[foot.lab[48 * W + 10]]);
    expect(footAt(foot, 48 * W + 10)).toBeGreaterThan(1000);
    expect(footAt(null, at)).toBe(0);
  });

  it("fails the start's minimum: the start stands on labelled land, whatever the seed", () => {
    for (let seed = 1; seed <= 12; seed++) {
      const pick = pickStart(h, W, H, water, hydro, prefs, stream(seed, "start-unlabelled"), 16, { foot, minFoot: 100, footWant: 400 });
      expect(pick, `seed ${seed}`).not.toBeNull();
      const i = pick!.y * W + pick!.x;
      expect(locked[i], `seed ${seed}: the start at ${pick!.x},${pick!.y} stands on locked ground`).toBe(0);
      expect(foot.lab[i]).toBeGreaterThanOrEqual(0);
    }
  });

  it("without a minimum, it fits not at all and still scores a number: the same seed picks the same place", () => {
    for (let seed = 1; seed <= 4; seed++) {
      const a = pickStart(h, W, H, water, hydro, prefs, stream(seed, "start-unlabelled"), 16, { foot, footWant: 400 });
      const b = pickStart(h, W, H, water, hydro, prefs, stream(seed, "start-unlabelled"), 16, { foot, footWant: 400 });
      expect(a).not.toBeNull();
      expect(a).toEqual(b);
      expect(Number.isFinite(a!.shoreWalk)).toBe(true);
    }
  });
});
