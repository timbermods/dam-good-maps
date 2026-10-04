// A source's one number (PLAN §20 D368 (4)): its label on the map, the settings row and its real strength always
// show the same number, live with every Ctrl+scroll notch. The page's copy of the objects is the one value the
// label and the row read, so every change of a source's strength reaches it, notch by notch, however quickly they
// come: the worker sends the objects again whenever a strength changed, not only when an object moved or went.

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { makeSpec } from "../../src/core/spec/mapspec";
import type { EntityView } from "../../src/render3d/model";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 64;
const ID = (k: number) => `00000000-0000-4000-8000-00000000000${k}`;

/** A source's strength in the page's copy of the objects. */
function strengthIn(v: EntityView, x: number, y: number): number | undefined {
  for (let k = 0; k < v.count; k++) if (v.x[k] === x && v.y[k] === y && v.templates[v.template[k]] === "WaterSource") return v.strength[k];
  return undefined;
}

describe("a source's one number (D368 (4))", () => {
  it("every notch's new strength reaches the page's copy of the objects, alone and in a row", async () => {
    await runGenerate(makeSpec({ seed: 3, theme: "highlands", size: { x: W, y: W } }));
    ed.refine();
    const s0 = MapSession.open(decodeProject(ed.project().bytes));
    const st = s0.built.start!;
    // dry level ground away from the start: one source alone, and a row of three
    const spots: [number, number][] = [];
    for (let y = 8; y < W - 8 && spots.length < 2; y++)
      for (let x = 8; x < W - 12 && spots.length < 2; x++) {
        if (Math.hypot(x - st.x, y - st.y) < 14 || spots.some(([a, b]) => Math.hypot(a - x, b - y) < 12)) continue;
        const h = s0.built.heights[y * W + x];
        let ok = true;
        for (let d = -1; d <= 3 && ok; d++) if (s0.built.heights[y * W + x + d] !== h || s0.built.water[y * W + x + d] > 0) ok = false;
        if (ok && !s0.built.entities.some((e) => Math.abs(e.x - x) <= 4 && Math.abs(e.y - y) <= 2)) spots.push([x, y]);
      }
    expect(spots.length).toBe(2);
    const [[ax, ay], [rx, ry]] = spots;
    const place = (id: string, x: number, y: number) =>
      ed.applyStep({ op: "placeEntity", params: { id, template: "WaterSource", x, y, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 1, CurrentStrength: 1 } } } }, "Place water source", `place:${id}`);
    expect(place(ID(0), ax, ay).errors).toEqual([]);
    for (let k = 1; k <= 3; k++) expect(place(ID(k), rx + k - 1, ry).errors).toEqual([]);

    for (const [id, x, y] of [
      [ID(0), ax, ay],
      [ID(2), rx + 1, ry],
    ] as const) {
      // several notches in quick succession, as Ctrl+scroll sends them: each one's answer carries the objects
      // with the new strength, so the label and the row read it at once
      for (const v of [2, 3, 4, 3]) {
        const u = ed.applyStep({ op: "setEntityProps", params: { id, components: { WaterSource: { SpecifiedStrength: v, CurrentStrength: v } } } }, `Water source: ${v} water/s`, `strength:${id}`);
        expect(u.errors).toEqual([]);
        expect(u.view.entities, `${id} at ${v}: the objects come with the answer`).toBeTruthy();
        expect(strengthIn(u.view.entities!, x, y), `${id} at ${v}`).toBe(v);
      }
    }
  });
});
