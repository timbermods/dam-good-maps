// A river through a planned lake keeps its channel (Codex's River Valley prototype; D363's round):
// the hydrology's carve skipped the tiles it had already marked as lake, so where the lake settles
// smaller than planned, the river's course across the lake's dry part had no channel, its ground
// left above the river's bed, and the water spread or stood there instead of running on (River
// Valley 96² seed 5: 107 tiles of its courses above the bed, 84 of them dry once settled).
import { describe, expect, it } from "vitest";
import { bedAt, pointAtArc } from "../../src/core/features/geometry";
import type { RiverFeature } from "../../src/core/features/schema";
import { generate } from "../../src/core/gen/generate";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";

/** Tiles of each river's course on planned-lake tiles of the shown land that stand above the
 *  river's bed there, and how many of the course's planned-lake tiles there are. */
function lakeCourse(theme: ThemeId, seed: number, size: number): { onLake: number; above: number } {
  let plan: Uint8Array | null = null;
  let shown: Uint8Array | null = null;
  const r = generate(makeSpec({ seed, theme, size: { x: size, y: size } }), {
    onLand: (l) => {
      if (plan) return;
      plan = Uint8Array.from(l.water as ArrayLike<number>);
      shown = l.heights.slice();
    },
  });
  const W = size;
  let onLake = 0;
  let above = 0;
  for (const f of r.features) {
    if (f.kind !== "river" || (f as RiverFeature).params.badwater) continue;
    const { path, bedProfile } = (f as RiverFeature).params;
    let L = 0;
    for (let k = 1; k < path.length; k++) L += Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]);
    const seen = new Set<number>();
    for (let s = 0; s <= L; s += 0.5) {
      const [x, y] = pointAtArc(path, s).p;
      const xi = Math.round(x);
      const yi = Math.round(y);
      if (xi < 0 || yi < 0 || xi >= W || yi >= W) continue;
      const i = yi * W + xi;
      if (seen.has(i) || plan![i] !== 2) continue;
      seen.add(i);
      onLake++;
      if (shown![i] > bedAt(bedProfile, s)) above++;
    }
  }
  return { onLake, above };
}

describe("a river through a planned lake", () => {
  it("keeps its channel at its bed across the lake, continuous where the lake settles smaller than planned", () => {
    for (const [theme, seed] of [
      ["riverValley", 5],
      ["riverValley", 8],
      ["lakeBasin", 1],
    ] as const) {
      const { onLake, above } = lakeCourse(theme, seed, 96);
      expect(onLake, `${theme} ${seed}: a course through a planned lake`).toBeGreaterThan(0);
      expect(above, `${theme} ${seed}: course tiles above the bed`).toBe(0);
    }
  });
});
