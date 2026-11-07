// Every force's water plays with its land (PLAN §20 D371): while a force is shown, the map's water flows on the
// land as each frame has it (into a crater or a rift as it opens, along with a Slide's block, a glacier's own
// water easing in as the ice melts back), and kept, the map's water flows on from exactly the water last shown:
// nothing jumps at the keep; a source the force clears stops feeding it at its step, one that rides runs on
// (D474). On a map with caves the page draws every column, a fed cave's water under its roof too, and that is kept
// as drawn (River Valley seed 1 at verticality 70: water in a cave fed by its sources, away from the forces).
// (Carve's own rules: carveBornAsItCuts.test.ts, caveForceWater.test.ts, forceClearSources.test.ts.)

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
import type { WaterView } from "../../src/render3d/model";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 96;
const N = W * W;

/** The map (River Valley seed 4242; `caves`: seed 1 at verticality 70, with a fed cave), and its river's tile nearest
 *  the middle. */
async function open(caves = false): Promise<{ river: [number, number]; ground: Uint8Array }> {
  ed.forceCancel();
  const spec = makeSpec({ seed: caves ? 1 : 4242, theme: "riverValley", size: { x: W, y: W } });
  if (caves) spec.settings.terrain.verticality = 70;
  await runGenerate(spec);
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

/** The tiles where two views' water differs by more than a film, column by column: the water on the ground and every
 *  cave's under its roof, each where it stands. */
function jumped(a: WaterView, b: WaterView): string[] {
  const of = (v: WaterView) => {
    const m = new Map<string, number>();
    for (let k = 0; k < v.count; k++) m.set(`${v.tile[k]}@${v.floor[k]}`, v.depth[k]);
    return m;
  };
  const ma = of(a);
  const mb = of(b);
  const out = new Set<string>();
  for (const key of new Set([...ma.keys(), ...mb.keys()]))
    if (Math.abs((ma.get(key) ?? 0) - (mb.get(key) ?? 0)) > 0.05) {
      const i = Number(key.split("@")[0]);
      out.add(`${i % W},${Math.floor(i / W)}`);
    }
  return [...out];
}

/** The columns of a view that hold water under the ground (a cave's, under its roof). */
function underRoof(v: WaterView, land: ArrayLike<number>): number {
  let n = 0;
  for (let k = 0; k < v.count; k++) if (v.floor[k] < land[v.tile[k]] && v.depth[k] > 0.05) n++;
  return n;
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
  it.each([
    ["", false],
    [" on a map with caves", true],
  ])("its water flows as it is shown, and what is kept is the water last shown%s", async (_, caves) => {
    const { river, ground } = await open(caves);
    if (caves) expect(ed.collabSession()!.built.waterModel.stacked, "the map has caves").toBeTruthy();
    for (const make of REQUESTS) {
      const req = make(river);
      expect(ed.forceStart(req).errors, req.verb).toEqual([]);
      let f = ed.forceAdvance(1)!;
      for (let k = 0; k < 400 && !f.planned; k++) f = ed.forceAdvance(1)!;
      let land = ground;
      let shown: Float64Array | null = null;
      // what the page draws: the force's water frames, every column of them (a cave's water under its roof too)
      let drawn: WaterView | null = null;
      ed.listen((e) => {
        if (e.kind === "water" && e.draft) drawn = e.water;
      });
      while (!f.done) {
        f = ed.forceAdvance(1)!;
        if (f.heights) land = f.heights.slice();
        shown = Float64Array.from(ed.flowForceWater(6) ?? []);
      }
      expect(shown?.length, `${req.verb}: its water flows as it is shown`).toBe(N);
      // (into a crater or a rift as it opens: some tile it lowered holds water)
      if (req.verb === "craterize" || req.verb === "rift") expect(shown!.some((d, i) => land[i] < ground[i] && d > 0.05), req.verb).toBe(true);
      const last = drawn as WaterView | null;
      ed.listen(null);
      expect(last, `${req.verb}: its water is drawn as it plays`).not.toBeNull();
      // (a cave's water is drawn under its roof as the force plays)
      if (caves) expect(underRoof(last!, land), `${req.verb}: a cave's water drawn`).toBeGreaterThan(0);
      const u = ed.forceStop();
      expect(u.errors, req.verb).toEqual([]);
      expect(jumped(last!, u.view.water!), `${req.verb}: tiles whose water jumped at the keep`).toEqual([]);
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
