// Glaciate's Power and Size (PLAN §20 D368 (3)): Power is how deep the ice carves, from a light scour
// to a deep U-shaped valley; Size is how wide. Each makes a clear difference on its own, and neither
// drives the other: at a fixed Size, Power deepens its walls, its deepest cut and its floor while the
// width holds; at a fixed Power, Size widens the valley while the level its floor is cut to holds (a
// wider valley reaches higher up the old slopes, so its walls stand taller there: the land's, not
// Size's). Measured on the land the editor's worker leaves (the page's way, nature drawing the
// details), across the glacier's path (`glacierSections`), on the stretch of valley every run shares.

import { beforeAll, describe, expect, it } from "vitest";
import { GLACIATE_DEFAULTS } from "../../src/core/forces/glaciate/model";
import { glacierSections, type GlacierSection } from "../../tools/lib/glaciate";
import * as ed from "../../src/worker/session";
import { openMap } from "./forceEverywhere";

const W = 128;
const SEED = 21;
let at: [number, number] = [W >> 1, W >> 1];

beforeAll(async () => {
  await openMap("highlands", W, SEED);
  // (D148, M9b's maps: the head is re-picked from the map. The old pick, the highest dry ground, is on
  // seed 21 a tile near the north rim whose ice runs 16 tiles and stops, so the comparisons had no
  // stretch to share; (80, 24), level 14, sends its ice 70 tiles at the narrowest Size, and every check
  // below holds from there)
  at = [80, 24];
});

interface Run {
  sections: GlacierSection[];
  /** The most any tile was lowered. */
  deepest: number;
}

/** A click that Flows from the head at `power` and `size`, run to its end and dropped. */
function glacier(power: number, size: number): Run {
  const before = ed.terrainNow().heights.slice();
  const r = ed.forceStart({ verb: "glaciate", settings: { ...GLACIATE_DEFAULTS, power, size, benches: null, steps: null, tarn: null, scree: null } as never, origin: at, cut: null, natural: true });
  expect(r.errors).toEqual([]);
  let shown = r.frame?.heights ?? before;
  let path: { x: number; y: number }[] = [];
  for (let k = 0; k < 20000; k++) {
    const f = ed.forceAdvance(64);
    if (!f) break;
    if (f.heights) shown = f.heights;
    if (f.cue.glaciate?.path) path = f.cue.glaciate.path;
    if (f.done) break;
  }
  ed.forceCancel();
  let deepest = 0;
  for (let i = 0; i < shown.length; i++) deepest = Math.max(deepest, before[i] - shown[i]);
  return { sections: glacierSections(before, shown, W, W, path), deepest };
}

/** The runs' sections on the stretch they all share, past the widest one's cirque and short of the
 *  shortest one's snout, as medians: the width, the floor's cut and level at the centreline, the
 *  walls' height (each section's deepest cut) and the levels taken out across a section. */
function compare(runs: Run[], widest: number) {
  const to = Math.min(...runs.map((r) => (r.sections.at(-1)?.arc ?? 0) * 0.85));
  const med = (v: number[]) => [...v].sort((a, b) => a - b)[v.length >> 1] ?? 0;
  return runs.map((r) => {
    const s = r.sections.filter((q) => q.arc >= widest && q.arc <= to);
    return { sections: s.length, width: med(s.map((q) => q.width)), floor: med(s.map((q) => q.floor)), level: med(s.map((q) => q.level)), walls: med(s.map((q) => q.deepest)), area: med(s.map((q) => q.area)), deepest: r.deepest };
  });
}

describe("Glaciate: Power is how deep, Size how wide (D368 (3))", () => {
  it("at a fixed Size, Power alone deepens it from a light scour to a deep valley, its width the same", () => {
    const [p0, p50, p100] = compare([0, 50, 100].map((p) => glacier(p, 24)), 24);
    const where = JSON.stringify({ p0, p50, p100 });
    for (const r of [p0, p50, p100]) expect(r.sections, where).toBeGreaterThanOrEqual(10);
    // a light scour at Power 0 (D361 (3): still visible, at most 4 levels anywhere)
    expect(p0.walls, where).toBeGreaterThanOrEqual(1);
    // (its sides worn a level, its river's channel two more: D368 (3), amended)
    expect(p0.walls, where).toBeLessThanOrEqual(3);
    expect(p0.deepest, where).toBeLessThanOrEqual(4);
    // its walls, its deepest cut and the levels taken out of a section grow clearly with Power
    expect(p50.walls, where).toBeGreaterThanOrEqual(p0.walls + 3);
    expect(p100.walls, where).toBeGreaterThanOrEqual(p50.walls + 3);
    expect(p50.deepest, where).toBeGreaterThanOrEqual(p0.deepest + 3);
    expect(p100.deepest, where).toBeGreaterThanOrEqual(p50.deepest + 4);
    expect(p50.area, where).toBeGreaterThanOrEqual(p0.area * 1.5);
    expect(p100.area, where).toBeGreaterThanOrEqual(p50.area * 1.3);
    // and its floor is cut lower
    expect(p100.level, where).toBeLessThan(p0.level);
    // the width is Size's: Power leaves it within a fifth
    for (const r of [p50, p100]) expect(Math.abs(r.width - p0.width), where).toBeLessThanOrEqual(Math.max(2, p0.width * 0.2));
  }, 300_000);

  it("at a fixed Power, Size alone widens it, its floor cut to the same level", () => {
    for (const power of [20, 60, 100]) {
      const [narrow, wide] = compare([glacier(power, 10), glacier(power, 40)], 40);
      const where = `Power ${power}: ${JSON.stringify({ narrow, wide })}`;
      for (const r of [narrow, wide]) expect(r.sections, where).toBeGreaterThanOrEqual(10);
      expect(wide.width, where).toBeGreaterThanOrEqual(narrow.width * 2.5);
      // the floor is Power's: Size leaves its level and its cut within a level
      expect(Math.abs(wide.level - narrow.level), where).toBeLessThanOrEqual(1);
      expect(Math.abs(wide.floor - narrow.floor), where).toBeLessThanOrEqual(1);
    }
  }, 300_000);
});
