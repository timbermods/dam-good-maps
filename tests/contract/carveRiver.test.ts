// Carve's river (PLAN §20 D321, items 17, 18 and 25; core/forces/carve/river.ts): its water is never
// deeper than River depth (Off: as deep as it cuts; a dry canyon has no river to limit), the canyon's
// walls as tall as before; Banks leave flat, dry land at the waterline on each side, the river's surface
// just below their top, wider inside a bend than outside; the operation keeps both settings.

import { describe, expect, it } from "vitest";
import { DEFAULTS, CarveRun } from "../../src/core/forces/carve/run";
import { modelOf } from "../../src/core/forces/runs";
import type { ForceMap } from "../../src/core/forces/force";
import { forceSettingsProblems } from "../../src/core/forces/op";
import { canonicalSettle } from "../../src/core/sim/prefill";

const W = 96;
const H = 96;

/** A long slope, a little uneven across: a carve runs down it and backs up behind its own fan. */
function slope(): ForceMap {
  const heights = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) heights[y * W + x] = Math.round(16 - (y / H) * 10 + 0.8 * Math.sin(x * 0.2));
  return { W, H, heights, entities: [], water: { depth: new Float64Array(W * H), contamination: new Float64Array(W * H) }, maxHeight: 22 };
}

function carve(extra: Partial<typeof DEFAULTS>) {
  const m = slope();
  const r = new CarveRun(m, { ...DEFAULTS, mode: "aim", defyGravity: true, power: 60, width: 4, wander: 40, ...extra }, { origin: 4 * W + 48, end: 92 * W + 40 });
  while (!r.done) r.step();
  return { m, r, water: canonicalSettle(modelOf(r.map)) };
}

/** The deepest water over ground the carve cut. */
function deepest(c: ReturnType<typeof carve>): number {
  let d = 0;
  for (let i = 0; i < W * H; i++) if (c.r.map.heights[i] < c.m.heights[i]) d = Math.max(d, c.water.depth[i]);
  return d;
}

describe("Carve's river (D321, items 17, 18, 25)", () => {
  it("River depth: its water never deeper than the setting over the ground it cut; Off, as deep as the carve made it; the walls as tall", () => {
    const off = carve({});
    const two = carve({ riverDepth: 2 });
    const one = carve({ riverDepth: 1 });
    expect(deepest(off)).toBeGreaterThan(2.1);
    expect(deepest(two)).toBeLessThanOrEqual(2.05);
    expect(deepest(one)).toBeLessThanOrEqual(1.05);
    // the walls: as much cut as before above the river (the limit only raises the bed under water)
    let lowered = 0;
    for (let i = 0; i < W * H; i++) if (two.r.map.heights[i] > off.r.map.heights[i] && off.water.depth[i] < 0.05) lowered++;
    expect(lowered).toBe(0);
    // a dry canyon is left as it cuts
    const dry = carve({ dry: true, riverDepth: 2 });
    const dryOff = carve({ dry: true });
    expect(Array.from(dry.r.map.heights)).toEqual(Array.from(dryOff.r.map.heights));
  });

  it("Banks: flat, dry land at the waterline beside the river, wider inside its bends; none at 0", () => {
    const flatDry = (c: ReturnType<typeof carve>) => {
      // tiles the carve cut, dry, level with a neighbour and beside the river's water
      let n = 0;
      for (let y = 1; y < H - 1; y++)
        for (let x = 1; x < W - 1; x++) {
          const i = y * W + x;
          if (c.r.map.heights[i] >= c.m.heights[i] || c.water.depth[i] > 0.02) continue;
          const wet = [i - 1, i + 1, i - W, i + W].some((j) => c.water.depth[j] > 0.05 && c.r.map.heights[j] < c.r.map.heights[i]);
          const level = [i - 1, i + 1, i - W, i + W].some((j) => c.r.map.heights[j] === c.r.map.heights[i]);
          if (wet && level) n++;
        }
      return n;
    };
    const none = carve({ riverDepth: 2, banks: 0 });
    const wide = carve({ riverDepth: 2, banks: 6 });
    expect(flatDry(wide)).toBeGreaterThan(flatDry(none) + 40);
    // the river's surface stays under the banks' top: no thin standing sheet on them
    let sheet = 0;
    for (let i = 0; i < W * H; i++) if (wide.r.map.heights[i] < wide.m.heights[i] && wide.water.depth[i] > 0.01 && wide.water.depth[i] < 0.12) sheet++;
    expect(sheet).toBeLessThan(40);
    expect(deepest(wide)).toBeLessThanOrEqual(2.05);
  });

  it("the operation's settings take them; the schema's bounds and the engine's agree", () => {
    expect(forceSettingsProblems("carve", { ...DEFAULTS, riverDepth: 2, banks: 5 })).toEqual([]);
    expect(forceSettingsProblems("carve", { ...DEFAULTS, riverDepth: null, banks: 0 })).toEqual([]);
    expect(forceSettingsProblems("carve", { ...DEFAULTS, riverDepth: 0 }).length).toBe(1);
    expect(forceSettingsProblems("carve", { ...DEFAULTS, banks: 11 }).length).toBe(1);
    expect(() => carve({ riverDepth: 0 })).toThrow();
  });
});
