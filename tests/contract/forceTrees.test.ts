// No force ever leaves a tree leaning (PLAN §20 D321, item 7): after any force, however hard or
// repeated, every tree stands upright on its tile (its level the ground's), a tree a force knocked
// down stands dead where its ground held, and a tree whose ground the force broke is gone. The view
// draws no tree lying down.

import { describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import { decodeProject } from "../../src/core/doc/document";
import { CRATER_DEFAULTS } from "../../src/core/forces/craterize";
import { ERUPT_DEFAULTS } from "../../src/core/forces/erupt";
import type { ForceResultParams } from "../../src/core/forces/op";
import { QUAKE_DEFAULTS } from "../../src/core/forces/quake";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 96;
const TREES = /^(Pine|Birch|Oak|BlueberryBush)$/;

describe("trees after the forces (D321, item 7)", () => {
  it("heavy, repeated quakes, an impact and an eruption: every tree upright on its own tile; a knocked-down one only where its ground held", async () => {
    await runGenerate(makeSpec({ seed: 7, theme: "highlands", size: { x: W, y: W } }));
    ed.setEditorWaterMode("defer");
    ed.refine();
    const run = (req: ed.ForceRequest) => {
      const before = MapSession.open(decodeProject(ed.project().bytes)).built.heights.slice();
      expect(ed.forceStart(req).errors).toEqual([]);
      for (let k = 0; k < 2000 && !ed.forceAdvance(8)!.done; k++);
      expect(ed.forceStop().kept).toBe(true);
      const s = MapSession.open(decodeProject(ed.project().bytes));
      const op = s.state.sculpts.filter((o) => o.op === "forceResult").at(-1)!.params as ForceResultParams;
      // a tree it knocked down stands where the force left its ground's level as it was
      const at = new Map(s.built.entities.map((e) => [e.id, e]));
      for (const f of op.felled ?? []) {
        const e = at.get(f.id);
        if (e) expect(s.built.heights[e.y * W + e.x], `${req.verb}: ${f.id}`).toBe(before[e.y * W + e.x]);
      }
      return s;
    };
    for (let k = 0; k < 8; k++) {
      const y = 12 + ((k * 23) % 70);
      run({ verb: "quake", settings: { ...QUAKE_DEFAULTS, mode: k % 2 ? "slide" : "lift", power: 100, seed: k + 1 }, path: [{ x: 2, y }, { x: W / 2, y: y + 6 * Math.sin(k) }, { x: W - 3, y: y + 3 }], side: k % 3 ? 1 : -1, cut: null });
    }
    run({ verb: "craterize", settings: { ...CRATER_DEFAULTS, power: 90 }, origin: [40, 40], cut: null });
    const s = run({ verb: "erupt", settings: { ...ERUPT_DEFAULTS, power: 90 }, origin: [60, 60], cut: null });
    const trees = s.built.entities.filter((e) => TREES.test(e.template));
    // (the crater takes most of the map's trees, and none grows back on its new ground: D368 (10),
    // D404; enough stand to check)
    expect(trees.length).toBeGreaterThan(20);
    for (const e of trees) expect(e.z, `${e.template} at ${e.x}, ${e.y}`).toBe(s.built.heights[e.y * W + e.x]);
    // the view draws each of them standing: no heading to lie along
    const view = ed.sessionView().view.entities!;
    expect("fall" in view).toBe(false);
    ed.settleWater();
  });
});
