// The entity view carries each object's stable id (the core entity's `id`) as a parallel array.

import { describe, expect, it } from "vitest";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

describe("the entity view's ids", () => {
  it("has one id per object, unique, matching the core's entities", async () => {
    await runGenerate(makeSpec({ seed: 4, theme: "riverValley", size: { x: 96, y: 96 } }));
    ed.setEditorWaterMode("defer");
    ed.refine();
    const e = ed.sessionView().view.entities;
    expect(e.ids.length).toBe(e.count);
    expect(e.ids.every((id) => id.length > 0)).toBe(true);
    expect(new Set(e.ids).size).toBe(e.count);
    let checked = 0;
    for (let k = 0; k < e.count && checked < 20; k++) {
      const here = ed.entitiesAt(e.x[k], e.y[k]);
      const hit = here.find((i) => i.id === e.ids[k]);
      if (hit) {
        expect(hit.template).toBe(e.templates[e.template[k]]);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});
