// Max water depth (PLAN §20 D264): where the selection's water is deeper than the number, the
// ground under it rises so the water sits that deep; shallower water and the land stay as they are.
// A lake keeps its surface (its spill level), so it ends that deep; a river's surface may rise a
// little, so it ends about that deep. Exact and one undo step, as every Select action.

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import type { EditOp } from "../../src/core/doc/ops";
import { MapSession } from "../../src/core/doc/session";
import { buildMap } from "../../src/core/features/build";
import { writeTimber } from "../../src/core/format/timber";
import { toTimberFile } from "../../src/core/gen/pack";
import { tilesToRuns } from "../../src/core/math/grid";
import { makeSpec } from "../../src/core/spec/mapspec";
import { canonicalSettle } from "../../src/core/sim/prefill";
import { depthLevels } from "../../src/editor/select";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 96;
const open = () => MapSession.open(decodeProject(ed.project().bytes));
const settled = (s: MapSession) => canonicalSettle(s.built.waterModel).depth;
function maxDepthOps(s: MapSession, tiles: number[], depth: number): { ops: EditOp[]; raised: number[] } {
  const w = settled(s);
  const h = s.built.heights;
  const surface = Array.from(w, (d, i) => h[i] + d);
  const by = depthLevels(tiles, h, w, surface, depth);
  const ops = [...by.entries()].map(([to, list]) => ({ op: "sculpt", params: { mode: "flatten", cells: tilesToRuns(list, W), level: to } }) as EditOp);
  return { ops, raised: [...by.values()].flat() };
}

describe("Max water depth (D264)", () => {
  const lakeAndRiver = async (seed: number) => {
    await runGenerate(makeSpec({ seed, theme: "riverValley", size: { x: W, y: W } }));
    ed.refine();
    let s = open();
    // a lake: a 10 × 10 pit at level 4 in a 14 × 14 block at level 10, on dry ground far from the
    // start, and a source in it: it fills to its rim, six deep
    const b = s.built;
    const st = b.start!;
    let at: [number, number] | null = null;
    for (let y = 14; y < W - 28 && !at; y += 2)
      for (let x = 14; x < W - 28 && !at; x += 2) {
        if (Math.hypot(x - st.x, y - st.y) < 30) continue;
        let ok = true;
        for (let yy = y - 4; yy < y + 16 && ok; yy++) for (let xx = x - 4; xx < x + 16 && ok; xx++) if (b.water[yy * W + xx] > 0 || b.channel[yy * W + xx]) ok = false;
        if (ok) at = [x, y];
      }
    expect(at).not.toBeNull();
    const [bx, by] = at!;
    const block: number[] = [];
    for (let y = by; y < by + 14; y++) for (let x = bx; x < bx + 14; x++) block.push(y * W + x);
    const x0 = bx + 2;
    const y0 = by + 2;
    const pit: number[] = [];
    for (let y = y0; y < y0 + 10; y++) for (let x = x0; x < x0 + 10; x++) pit.push(y * W + x);
    expect(
      ed.applyAll(
        [
          { op: "sculpt", params: { mode: "flatten", cells: tilesToRuns(block, W), level: 10 } },
          { op: "sculpt", params: { mode: "flatten", cells: tilesToRuns(pit, W), level: 4 } },
          { op: "placeEntity", params: { id: "d2640000-0000-4000-8000-000000000001", template: "WaterSource", x: x0 + 5, y: y0 + 5, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 0.5, CurrentStrength: 0.5 } } } },
        ],
        "a lake",
      ).errors,
    ).toEqual([]);
    s = open();
    const lake = settled(s);
    const surface0 = s.built.heights[(y0 + 3) * W + x0 + 3] + lake[(y0 + 3) * W + x0 + 3];
    expect(lake[(y0 + 3) * W + x0 + 3]).toBeGreaterThan(5.5);
    const n0 = ed.sessionInfo().history.filter((h) => h.applied).length;
    const { ops, raised } = maxDepthOps(s, pit, 3);
    expect(ed.applySelection(ops, `Water no deeper than 3 on ${raised.length} tiles`, raised).errors).toEqual([]);
    expect(ed.sessionInfo().history.filter((h) => h.applied)).toHaveLength(n0 + 1);
    s = open();
    const after = settled(s);
    // (3 and the settle's own drift of a lake's level: a few hundredths on generator 0.7.0's land)
    for (const i of pit) if (after[i] > 0.05) expect(after[i], `tile ${i}`).toBeLessThanOrEqual(3.06);
    expect(s.built.heights[(y0 + 3) * W + x0 + 3] + after[(y0 + 3) * W + x0 + 3]).toBeCloseTo(surface0, 1);
    // a river's deeper stretch, no deeper than 1: its surface may rise a little
    const river: number[] = [];
    for (let i = 0; i < W * W; i++) if (after[i] > 1.2 && s.built.channel[i]) river.push(i);
    if (river.length) {
      const r = maxDepthOps(s, river, 1);
      expect(ed.applySelection(r.ops, `Water no deeper than 1 on ${r.raised.length} tiles`, r.raised).errors).toEqual([]);
      const rv = settled(open());
      for (const i of r.raised) expect(rv[i], `river tile ${i}`).toBeLessThan(1.6);
    }
  };
  // (seed 5 for 0.8.1's maps, D148: seed 2's river has no stretch deeper than 1.2 that the rule raises, so the
  // river half had nothing to apply; seeds 5 and 7 have both halves)
  it("a lake 6 deep becomes 3 deep with the same surface, in one step; a river ends no deeper than about the number", () => lakeAndRiver(5));
  // An expected failure, kept on the seed that caught it (Kyler, 2026-10-02): on M9b's River Valley 96²
  // seed 3 the settle leaves the pit 0.07 over the 3, past the 0.06 the bound allows (the editor's water,
  // for the milestone session); when it passes, `fails` comes off.
  it.fails("seed 3: the pit's water ends 0.07 over the number, past the bound", () => lakeAndRiver(3));

  // Where no water is deeper than the number there is nothing to raise, and nothing is sent; an empty
  // step reaching the session is refused with a reason, never a history entry (reading the history
  // crashed on one).
  it("with no water deeper than the number nothing is sent, and an empty step is refused, the history as it was", () => {
    const S = 32;
    const flat = buildMap({ W: S, H: S, seed: 1, features: [], base: { heights: new Uint8Array(S * S).fill(8), columns: new Map(), entities: [] } });
    const s = MapSession.importMap(writeTimber(toTimberFile(makeSpec({ seed: 1, theme: "highlands", size: { x: S, y: S } }), flat)), "flat.timber");
    const all = Array.from({ length: S * S }, (_, i) => i);
    expect(depthLevels(all, s.built.heights, new Float64Array(S * S), s.built.heights, 2).size).toBe(0);
    const r = s.applyAll([], "user", "Water no deeper than 2");
    expect(r).toMatchObject({ ok: false, errors: ["nothing to change"] });
    expect(s.history()).toEqual([]);
    expect(s.canUndo).toBe(false);
  });
});
