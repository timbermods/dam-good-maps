// Every force's water plays with its land (PLAN §20 D371): while a force is shown, the map's water flows on the
// land as each frame has it (into a crater or a rift as it opens, along with a Slide's block, a glacier's own
// water easing in as the ice melts back), and kept, the map's water flows on from exactly the water last shown:
// nothing jumps at the keep; a source the force clears stops feeding it at its step, one that rides runs on
// (D474). (Carve's own rules: carveBornAsItCuts.test.ts, forceClearSources.test.ts.)

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { CRATER_DEFAULTS } from "../../src/core/forces/craterize";
import { DEPOSIT_DEFAULTS } from "../../src/core/forces/deposit";
import { ERUPT_DEFAULTS } from "../../src/core/forces/erupt";
import { GLACIATE_DEFAULTS } from "../../src/core/forces/glaciate/model";
import { QUAKE_DEFAULTS } from "../../src/core/forces/quake";
import { RIFT_DEFAULTS } from "../../src/core/forces/rift";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 96;
const N = W * W;

/** The map, and its river's tile nearest the middle. */
async function open(): Promise<{ river: [number, number]; ground: Uint8Array }> {
  ed.forceCancel();
  await runGenerate(makeSpec({ seed: 4242, theme: "riverValley", size: { x: W, y: W } }));
  ed.refine();
  ed.settleWater();
  const b = MapSession.open(decodeProject(ed.project().bytes)).built;
  let river: [number, number] = [W / 2, W / 2];
  let near = Infinity;
  for (let y = 16; y < W - 16; y++)
    for (let x = 16; x < W - 16; x++) {
      const d = Math.hypot(x - W / 2, y - W / 2);
      if (b.water[y * W + x] > 0.3 && d < near) {
        near = d;
        river = [x, y];
      }
    }
  return { river, ground: ed.terrainNow().heights.slice() };
}

const across = ([x, y]: [number, number], half: number) => [
  { x: x - half, y: y - half },
  { x: x + half, y: y + half },
];

const REQUESTS: ((r: [number, number]) => ed.ForceRequest)[] = [
  (r) => ({ verb: "craterize", settings: { ...CRATER_DEFAULTS, size: 14 }, origin: r, cut: null }),
  (r) => ({ verb: "erupt", settings: { ...ERUPT_DEFAULTS, size: 16 }, origin: r, cut: null }),
  (r) => ({ verb: "quake", settings: { ...QUAKE_DEFAULTS, mode: "slide" }, path: across(r, 14), side: 1, cut: null }),
  (r) => ({ verb: "glaciate", settings: { ...GLACIATE_DEFAULTS, size: 10 }, origin: [r[0] - 20, r[1]], end: [r[0] + 8, r[1]], cut: null }),
  (r) => ({ verb: "rift", settings: { ...RIFT_DEFAULTS, size: 10 }, path: across(r, 14), cut: null }),
  (r) => ({ verb: "deposit", settings: { ...DEPOSIT_DEFAULTS, size: 14 }, path: across(r, 10), cut: null }),
];

describe("every force's water plays with its land (D371)", () => {
  it("its water flows as it is shown, and what is kept is the water last shown", async () => {
    const { river, ground } = await open();
    for (const make of REQUESTS) {
      const req = make(river);
      expect(ed.forceStart(req).errors, req.verb).toEqual([]);
      let f = ed.forceAdvance(1)!;
      for (let k = 0; k < 400 && !f.planned; k++) f = ed.forceAdvance(1)!;
      let land = ground;
      let shown: Float64Array | null = null;
      while (!f.done) {
        f = ed.forceAdvance(1)!;
        if (f.heights) land = f.heights.slice();
        shown = Float64Array.from(ed.flowForceWater(6) ?? []);
      }
      expect(shown?.length, `${req.verb}: its water flows as it is shown`).toBe(N);
      // (into a crater or a rift as it opens: some tile it lowered holds water)
      if (req.verb === "craterize" || req.verb === "rift") expect(shown!.some((d, i) => land[i] < ground[i] && d > 0.05), req.verb).toBe(true);
      const u = ed.forceStop();
      expect(u.errors, req.verb).toEqual([]);
      const kept = new Float64Array(N);
      const w = u.view.water!;
      for (let k = 0; k < w.count; k++) kept[w.tile[k]] += w.depth[k];
      let jumps = 0;
      // (a film under the view's own threshold is shown dry)
      for (let i = 0; i < N; i++) if (Math.abs(kept[i] - (shown![i] > 0.001 ? shown![i] : 0)) > 0.05) jumps++;
      expect(jumps, `${req.verb}: tiles whose water jumped at the keep`).toBe(0);
      ed.undo();
      ed.settleWater();
    }
  });

  it("a source the force clears stops feeding its water as the force reaches it; one that rides runs on (D474)", async () => {
    const { river } = await open();
    // a source of our own on dry ground beside the river, for an impact to land on
    const b = MapSession.open(decodeProject(ed.project().bytes)).built;
    let spot: [number, number] | null = null;
    for (let r = 10; r < 30 && !spot; r++)
      for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]] as const) {
        const [x, y] = [river[0] + dx, river[1] + dy];
        if (!spot && x > 8 && y > 8 && x < W - 8 && y < W - 8 && !(b.water[y * W + x] > 0) && !b.entities.some((e) => Math.abs(e.x - x) < 3 && Math.abs(e.y - y) < 3)) spot = [x, y];
      }
    expect(spot, "a dry spot").not.toBeNull();
    const [sx, sy] = spot!;
    expect(ed.apply({ op: "placeEntity", params: { id: "aaaaaaaa-bbbb-4ccc-8ddd-000000000311", template: "WaterSource", x: sx, y: sy, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 4, CurrentStrength: 4 } } } } as never).errors).toEqual([]);
    ed.settleWater();
    const play = (sources: "ride" | "clear") => {
      expect(ed.forceStart({ verb: "craterize", settings: { ...CRATER_DEFAULTS, size: 12, sources }, origin: spot!, cut: null } as ed.ForceRequest).errors).toEqual([]);
      let f = ed.forceAdvance(1)!;
      for (let k = 0; k < 400 && !f.planned; k++) f = ed.forceAdvance(1)!;
      let total = 0;
      while (!f.done) {
        f = ed.forceAdvance(1)!;
        ed.flowForceWater(40);
      }
      const d = ed.flowForceWater(200)!;
      for (let i = 0; i < N; i++) total += d[i];
      ed.forceCancel();
      return total;
    };
    expect(play("ride"), "the ridden source feeds the water as it plays").toBeGreaterThan(play("clear") + 1);
  });
});
