// The plain pointer picks and drags every object on the map (PLAN §20 D360 a; D342): the rule for what is
// pickable, which object wins where several stand under the pointer (a bigger object over a tree or a bush),
// and that a move of any of them is one operation with the placement's own rules.

import { describe, expect, it } from "vitest";
import { isPickable, pickWinner } from "../../src/core/features/objects";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 96;

describe("what the plain pointer picks (D360 a)", () => {
  it("every object but the ones with their own grab: trees, bushes and ruin columns too", () => {
    for (const t of ["Pine", "Birch", "Oak", "Succulent", "BlueberryBush", "RuinColumnH3", "UndergroundRuins", "SmallRelic", "GeothermalField", "NaturalDam", "Blockage", "Thorns"]) expect(isPickable(t), t).toBe(true);
    // (sources and the start are grabbed by their own rules; a slope is derived from the ground)
    for (const t of ["WaterSource", "BadwaterSource", "StartingLocation", "Slope"]) expect(isPickable(t), t).toBe(false);
  });

  it("a bigger object wins over a tree or a bush under the pointer", () => {
    expect(pickWinner(["Pine", "UndergroundRuins"])).toBe(1);
    expect(pickWinner(["UndergroundRuins", "Pine"])).toBe(0);
    expect(pickWinner(["BlueberryBush", "GeothermalField", "Oak"])).toBe(1);
    // of equal size, what is not a plant wins; of two plants, the first
    expect(pickWinner(["Pine", "RuinColumnH2"])).toBe(1);
    expect(pickWinner(["Pine", "BlueberryBush"])).toBe(0);
  });
});

describe("a tree, a bush and a ruin column move like any object (D360 a)", () => {
  it("one step each, refused where they can't stand, undone in one", async () => {
    await runGenerate(makeSpec({ seed: 4, theme: "riverValley", size: { x: W, y: W } }));
    ed.setEditorWaterMode("defer");
    ed.refine();
    for (const [pattern, name] of [[/^(Pine|Birch|Oak)$/, "a tree"], [/^BlueberryBush$/, "a bush"], [/^RuinColumnH/, "a ruin column"]] as const) {
      const e = ed.sessionView().view.entities;
      let from: [number, number] | null = null;
      let to: [number, number] | null = null;
      const taken = new Set<number>();
      for (let k = 0; k < e.count; k++) taken.add(e.y[k] * W + e.x[k]);
      for (let k = 0; k < e.count && !to; k++) {
        if (!pattern.test(e.templates[e.template[k]])) continue;
        for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) {
          const x = e.x[k] + dx;
          const y = e.y[k] + dy;
          if (x < 3 || y < 3 || x >= W - 3 || y >= W - 3 || taken.has(y * W + x)) continue;
          from = [e.x[k], e.y[k]];
          to = [dx, dy];
          break;
        }
      }
      expect(from, `${name} with room beside it`).not.toBeNull();
      const rec = (await Promise.resolve(ed.entitiesAt(from![0], from![1]))).find((r) => pattern.test(r.template))!;
      const steps = ed.sessionView().info.history.filter((h) => h.applied).length;
      const r = ed.moveObjectBy(rec.id, to![0], to![1]);
      expect(r.ok, `${name}: ${JSON.stringify(r.errors)}`).toBe(true);
      expect(ed.sessionView().info.history.filter((h) => h.applied).length).toBe(steps + 1);
      expect(ed.entitiesAt(from![0] + to![0], from![1] + to![1]).some((x) => x.id === rec.id), `${name} is at its new place`).toBe(true);
      ed.undo();
      expect(ed.entitiesAt(from![0], from![1]).some((x) => x.id === rec.id), `${name} is back`).toBe(true);
    }
    // a start, a source and a slope are not moved this way
    const st = ed.sessionView().view.entities;
    for (let k = 0; k < st.count; k++) {
      const t = st.templates[st.template[k]];
      if (t !== "StartingLocation" && t !== "WaterSource") continue;
      const rec = ed.entitiesAt(st.x[k], st.y[k]).find((r) => r.template === t)!;
      expect(ed.moveObjectBy(rec.id, 2, 0).ok, t).toBe(false);
    }
  }, 120000);
});
