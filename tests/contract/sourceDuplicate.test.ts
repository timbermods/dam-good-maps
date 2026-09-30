// A source is never placed twice on the same tile (PLAN §20 D345, B4): a click on an existing source with
// the shelf's source is refused by the core with a plain reason, so the page can select it instead.

import { describe, expect, it } from "vitest";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

describe("no duplicate source (D345, B4)", () => {
  it("a source placed on an existing source's tile is refused, and its strength is not touched", async () => {
    await runGenerate(makeSpec({ seed: 4, theme: "riverValley", size: { x: 96, y: 96 } }));
    ed.setEditorWaterMode("defer");
    ed.refine();
    const e = ed.sessionView().view.entities;
    let at: [number, number] | null = null;
    for (let k = 0; k < e.count && !at; k++) if (e.templates[e.template[k]] === "WaterSource") at = [e.x[k], e.y[k]];
    expect(at).not.toBeNull();
    const req = { tool: "entity" as const, template: "WaterSource", x: at![0], y: at![1], orientation: "Cw0" as const, components: { WaterSource: { SpecifiedStrength: 1, CurrentStrength: 1 } } };
    expect(ed.footprintCheck(req).problem).toMatch(/water source stands there/);
    const steps = ed.sessionView().info.history.filter((h) => h.applied).length;
    const r = ed.applyTool(req, crypto.randomUUID());
    expect(r.ok).toBe(false);
    expect(ed.sessionView().info.history.filter((h) => h.applied).length).toBe(steps);
  }, 60000);
});
