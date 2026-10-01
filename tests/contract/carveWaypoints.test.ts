// Carve through waypoints (PLAN §20 D312): the carve steers along a smooth curve through them,
// finding its own way near the line (its own wander and physics); the waypoints are kept in its
// operation; Try another keeps them; the project replays to the same bytes.

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { DEFAULTS as CARVE_DEFAULTS } from "../../src/core/forces/carve/run";
import type { ForceResultParams } from "../../src/core/forces/op";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 96;

describe("Carve through waypoints (D312)", () => {
  it("passes near each waypoint, keeps them in its operation and in Try another, and replays exactly", async () => {
    await runGenerate(makeSpec({ seed: 3, theme: "highlands", size: { x: W, y: W } }));
    ed.setEditorWaterMode("defer");
    ed.refine();
    const s0 = MapSession.open(decodeProject(ed.project().bytes));
    const st = s0.built.start!;
    // a dog-leg away from the start: across, down, across back
    const y0 = st.y < W / 2 ? 60 : 20;
    const origin: [number, number] = [20, y0];
    const via: [number, number][] = [
      [50, y0],
      [56, y0 + (st.y < W / 2 ? 18 : -18)],
    ];
    const end: [number, number] = [78, via[1][1]];
    const before = s0.built.heights.slice();
    const r = ed.forceStart({ verb: "carve", settings: { ...CARVE_DEFAULTS, mode: "aim", defyGravity: true, power: 70, dry: true, width: 5 }, origin, end, via, cut: null });
    expect(r.errors).toEqual([]);
    for (let k = 0; k < 2000 && !ed.forceAdvance(8)!.done; k++);
    expect(ed.forceStop().errors).toEqual([]);
    const s1 = MapSession.open(decodeProject(ed.project().bytes));
    const op = s1.state.sculpts.filter((o) => o.op === "forceResult").at(-1)!.params as ForceResultParams;
    expect(op.where.path).toEqual([origin, ...via, end]);
    // the channel it cut passes within a few tiles of each waypoint
    const cut = new Set<number>();
    for (let i = 0; i < W * W; i++) if (s1.built.heights[i] < before[i]) cut.add(i);
    for (const [x, y] of via) {
      let near = Infinity;
      for (const i of cut) near = Math.min(near, Math.hypot((i % W) - x, Math.floor(i / W) - y));
      expect(near, `waypoint (${x}, ${y})`).toBeLessThanOrEqual(4);
    }
    // Try another: the same waypoints, another way
    const again = ed.forceAgain();
    expect(again.errors).toEqual([]);
    for (let k = 0; k < 2000 && !ed.forceAdvance(8)!.done; k++);
    expect(ed.forceStop().errors).toEqual([]);
    const s2 = MapSession.open(decodeProject(ed.project().bytes));
    const op2 = s2.state.sculpts.filter((o) => o.op === "forceResult").at(-1)!.params as ForceResultParams;
    expect(op2.where.path).toEqual([origin, ...via, end]);
    // replayed from the project: the same land
    expect(Array.from(MapSession.open(decodeProject(s2.project())).built.heights)).toEqual(Array.from(s2.built.heights));
    // a waypoint off the map is refused
    expect(ed.forceStart({ verb: "carve", settings: { ...CARVE_DEFAULTS, mode: "aim", defyGravity: true }, origin, end, via: [[W + 4, 3]], cut: null }).errors).not.toEqual([]);
  }, 120_000);
});
