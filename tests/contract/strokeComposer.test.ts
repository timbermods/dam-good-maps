// The one composer against the real session (#922 step 4): a stroke completed on the page (strokeComposer.ts
// `completeStroke`, from the land and terrain the session hands the page) is accepted as sent and logged as sent, the
// session adding nothing, whatever the brush, beside water and away from it. (Found by the browser: a rule-6 stroke's
// ring by the water, `rim`, which the session records itself, was refused when the page sent it.)

import { describe, expect, it } from "vitest";
import { completeStroke } from "../../src/core/features/raster/strokeComposer";
import type { BrushParams } from "../../src/core/features/raster/brush";
import * as ed from "../../src/worker/session";
import { mapProject } from "./collabFixtures";

const W = 96;

/** A stroke of `tool` along a row from (x, y), ten tiles, as the page records it. */
function stroke(tool: BrushParams["tool"], x: number, y: number): BrushParams {
  const dabs: number[] = [];
  for (let k = 0; k < 10; k++) dabs.push((x + k) * 4 + 2, y * 4 + 2);
  return { tool, size: 4, strength: 8, dabs, ...(tool === "naturalize" ? { seed: 5, weathers: true } : {}) };
}

describe("a stroke completed on the page is the operation the session logs", () => {
  it("every brush, by the water and away from it: accepted as sent, logged as sent", () => {
    ed.openProject(mapProject(11, "riverValley", W));
    const water = ed.terrainNow().terrain.water!;
    // (a dry tile with water three tiles east: a stroke along the row reaches the water's edge; from row 19 since generator
    // 0.10.23's round forms, the look round, D148: the first such tile from row 10, (50, 15), now has no water standing on the
    // ring round the stroke's working rectangle, so its Naturalize stroke records no ring, and none of rows 15–18's does either;
    // from row 19 the first is (44, 19), whose ring holds water on 3 tiles)
    let wet: [number, number] | null = null;
    for (let y = 19; y < W - 10 && !wet; y++) for (let x = 10; x < W - 20 && !wet; x++) if (!(water[y * W + x] > 0) && water[y * W + x + 3] > 0) wet = [x, y];
    expect(wet, "water on the map").not.toBeNull();
    let rims = 0;
    for (const [tool, x, y] of [["naturalize", ...wet!], ["naturalize", 20, 20], ["raise", ...wet!], ["lower", 30, 60], ["smooth", ...wet!], ["flatten", 50, 30]] as const) {
      const { heights, terrain } = ed.terrainNow();
      const entities = ed.collabSession()!.built.entities.map((e) => ({ template: e.template, x: e.x, y: e.y, orientation: e.orientation ?? "Cw0", flipped: !!e.flipped }));
      const p = completeStroke({ ...stroke(tool, x, y), ...(tool === "flatten" ? { target: 6 } : {}) }, { W, H: W, heights, terrain, entities });
      if (p.rim) rims++;
      const u = ed.apply({ op: "brush", params: p }, "user", tool);
      expect(u.errors, `${tool} at ${x}, ${y}`).toEqual([]);
      const logged = ed.collabSession()!.document.edits.at(-1)!;
      expect(logged.params, `${tool} at ${x}, ${y}`).toEqual(p);
    }
    // (and a stroke by the water recorded its ring: the case the session's check refused)
    expect(rims).toBeGreaterThan(0);
  });
});
