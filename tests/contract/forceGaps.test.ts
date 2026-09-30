// The gaps D356's check found, closed (PLAN §20 D360 (1)): (a) Carve clicked where its water would run
// straight off the map carves inward, a channel into the map even at low Power, the operation keeping
// the aimed carve; a click inland is untouched. (b) A Quake click, Lift or Slide, makes a short natural
// fault at the click point, the land choosing its way; Try another varies it; the operation keeps it.

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { edgeAim, runsOffEdge } from "../../src/core/forces/carve/edge";
import { DEFAULTS as CARVE_DEFAULTS, type CarveSettings } from "../../src/core/forces/carve/run";
import type { ForceResultParams } from "../../src/core/forces/op";
import { clickFault, QUAKE_DEFAULTS, strokeLength, type QuakeSettings } from "../../src/core/forces/quake";
import * as ed from "../../src/worker/session";
import { openMap } from "./forceEverywhere";

const lastOp = () => MapSession.open(decodeProject(ed.project().bytes)).state.sculpts.filter((o) => o.op === "forceResult").at(-1)!.params as ForceResultParams;

function runToEnd(): Uint8Array {
  for (let k = 0; k < 20000; k++) {
    const f = ed.forceAdvance(64);
    if (!f || f.done) break;
  }
  expect(ed.forceStop().errors).toEqual([]);
  return ed.terrainNow().heights.slice();
}

describe("Carve clicked at the map's edge carves inward (D360 (1a))", () => {
  it("a creek at the edge cuts a channel into the map, aimed and kept as such; a click inland is left to the land", async () => {
    const b = await openMap("islands", 128, 5);
    const W = b.W;
    const origin: [number, number] = [127, 9];
    expect(runsOffEdge(b.heights, W, b.H, origin[1] * W + origin[0])).toBe(true);
    const settings = { ...CARVE_DEFAULTS, mode: "unleash", power: 10, width: null, wander: null, walls: null, depth: null, riverDepth: 2, banks: null, dry: false, seed: 0 } as unknown as CarveSettings;
    const before = b.heights.slice();
    expect(ed.forceStart({ verb: "carve", settings, origin, cut: null, natural: true }).errors).toEqual([]);
    const after = runToEnd();
    const changed: number[] = [];
    for (let i = 0; i < after.length; i++) if (after[i] !== before[i]) changed.push(i);
    expect(changed.length).toBeGreaterThanOrEqual(9);
    // into the map: its channel's middle well inside the edge it began at
    const mx = changed.reduce((a, i) => a + (i % W), 0) / changed.length;
    expect(W - 1 - mx).toBeGreaterThan(4);
    const op = lastOp();
    expect((op.settings as CarveSettings).mode).toBe("aim");
    expect(op.where.end).toBeDefined();
    ed.undo();
    // inland, where the water runs into the map by itself: no aim
    let inland = -1;
    for (let i = 0; i < W * b.H && inland < 0; i++) {
      const x = i % W;
      const y = Math.floor(i / W);
      if (x > 30 && y > 30 && x < W - 30 && y < b.H - 30) inland = i;
    }
    expect(edgeAim(b.heights, W, b.H, inland, 50)).toBe(null);
  }, 120_000);
});

describe("a Quake click makes a short natural fault (D360 (1b))", () => {
  it("Lift and Slide: visible, the fault kept in the operation, and Try another turns it", async () => {
    const b = await openMap("highlands", 96, 5);
    const at = { x: 40, y: 50 };
    for (const mode of ["lift", "slide"] as const) {
      const settings = { ...QUAKE_DEFAULTS, mode, power: 40, scarp: null } as unknown as QuakeSettings;
      const before = ed.terrainNow().heights.slice();
      expect(ed.forceStart({ verb: "quake", settings, path: [at, { ...at }], side: 1, cut: null, natural: true }).errors).toEqual([]);
      const after = runToEnd();
      expect(after.reduce((n, v, i) => n + (Math.abs(v - before[i]) >= 1 ? 1 : 0), 0), mode).toBeGreaterThanOrEqual(9);
      const first = (lastOp().where.path ?? []).map(([x, y]) => ({ x, y }));
      expect(strokeLength(first), mode).toBeGreaterThan(8);
      // Try another: another fault from the same land
      expect(ed.forceAgain().errors).toEqual([]);
      runToEnd();
      const second = (lastOp().where.path ?? []).map(([x, y]) => ({ x, y }));
      expect(second, mode).not.toEqual(first);
      ed.undo();
      ed.undo();
      expect(Array.from(ed.terrainNow().heights), mode).toEqual(Array.from(before));
    }
    // the land turns it: on a slope it runs along the contour, the same land and seed the same fault
    expect(clickFault(b.heights, b.W, b.H, at, 40, 3)).toEqual(clickFault(b.heights, b.W, b.H, at, 40, 3));
  }, 120_000);
});
