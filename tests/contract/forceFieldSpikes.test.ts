// A force's last touches (forces/start.ts `buildTouches`) wear the ground as the build's integrity pass
// (step 7) wears it, so the map a force shows is the map its operation builds (CLAUDE.md: what you see is
// what you get; D455). On a generated map the build wears only the ground an edit changed from the
// field: a one-tile spike the generation grew stays. The forces' last touches wore every tile in the box
// round what the force changed, so a spike the force never touched was worn down and its operation
// recorded it worn: a Craterize at (42, 30) on Highlands 64², seed 7 (generator 0.10.6), with the layer
// cut at level 11, lowered four tiles above the layer 25 to 33 tiles away (D207: the ground above the
// layer showing is left as it was).

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import type { TerrainState } from "../../src/core/features/raster/strokePreview";
import { CRATER_DEFAULTS } from "../../src/core/forces/craterize";
import type { FullForceMap } from "../../src/core/forces/force";
import { buildTouches } from "../../src/core/forces/start";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

describe("a force wears the ground as the build does: a spike the generation grew stays (D207, D455)", () => {
  const W = 8;
  const at = (x: number, y: number) => y * W + x;
  // a generated map's terrain: level 5, and a spike at (2, 2) the field grew to 9
  const terrain = (): TerrainState => {
    const field = new Uint8Array(W * W).fill(5);
    field[at(2, 2)] = 9;
    return { pre: field.slice(), protect: new Uint8Array(W * W), channel: new Uint8Array(W * W), base: null, locked: null, columns: new Int32Array(0), field };
  };
  const touched = (state: TerrainState, changes: [number, number][]) => {
    const ground = state.pre.slice();
    const heights = ground.slice();
    for (const [i, h] of changes) heights[i] = h;
    const m = { W, H: W, heights, lava: new Uint32Array(W * W) } as unknown as FullForceMap;
    buildTouches(state, ground)(m);
    return m.heights;
  };

  it("a force that raises ground beside a spike the field grew leaves the spike as it stood", () => {
    const h = touched(terrain(), [[at(3, 2), 6], [at(5, 5), 7]]);
    expect(h[at(2, 2)]).toBe(9);
  });

  it("a spike an earlier edit left beside the force is worn to its neighbours, as the build wears it", () => {
    // (an earlier stroke raised (5, 5) from the field: the build's pass may wear it)
    const state = terrain();
    state.pre[at(5, 5)] = 8;
    const h = touched(state, [[at(6, 5), 6]]);
    expect(h[at(5, 5)]).toBe(6);
  });

  // (the bug as found on generator 0.10.6's map: a spike at (9, 15) of level 14, and three more near it,
  // the crater's reach raising the ground round them a level; on 0.10.5's map these tiles are no spikes)
  it("Highlands 64², seed 7: a Craterize (Power 44) at (42, 30) with the layer cut at level 11 leaves every tile above the layer as it was; its last frame is the map applied and reopened", async () => {
    const N = 64;
    await runGenerate(makeSpec({ seed: 7, theme: "highlands", size: { x: N, y: N } }));
    ed.refine();
    const cut = 11;
    const before = MapSession.open(decodeProject(ed.project().bytes)).built;

    expect(ed.forceStart({ verb: "craterize", settings: { ...CRATER_DEFAULTS, power: 44 }, origin: [42, 30], cut, natural: true }).errors).toEqual([]);
    let shown: Uint8Array | null = null;
    for (let k = 0; k < 4000; k++) {
      const f = ed.forceAdvance(16);
      if (f?.heights) shown = f.heights.slice();
      if (f?.done ?? true) break;
    }
    expect(ed.forceStop().kept).toBe(true);
    const applied = ed.terrainNow().heights;
    const reopened = MapSession.open(decodeProject(ed.project().bytes)).built.heights;

    const moved: string[] = [];
    for (let i = 0; i < N * N; i++) if (before.heights[i] > cut && reopened[i] !== before.heights[i]) moved.push(`(${i % N}, ${Math.floor(i / N)}) ${before.heights[i]} to ${reopened[i]}`);
    expect(moved).toEqual([]);
    expect(shown).not.toBeNull();
    expect(Array.from(applied)).toEqual(Array.from(shown!));
    expect(Array.from(reopened)).toEqual(Array.from(applied));
  }, 600_000);
});
