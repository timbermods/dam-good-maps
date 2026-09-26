// Kyler's mine site and ruins round (PLAN §20 D178) changes only how the 3D view draws them: the
// downloaded map keeps its bytes (the live check's file, tools/gen.ts's for seed 4242 at 128² River
// Valley, Normal), the ruins' variants reach the view from the map, and a generated map's mine
// sites and ruins are drawn within their footprints.
//
// The pinned sha256 is `dev`'s own for this spec: a step that changes generated maps on purpose
// updates it (with its contact sheet, D144); a change to how the view draws them never does.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ShaderMaterial } from "three";
import { footprintTiles, type Orientation } from "../../src/core/format/footprints";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
import { buildEntities, mineCutout } from "../../src/render3d/entities3d";
import { ORIENTATION_NAMES, RUIN_VARIANT_IDS } from "../../src/render3d/model";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

/** The live check's download (tests/live/live.spec.ts): tools/gen.ts's file for this spec, as `dev`
 *  makes it since resources like the official maps (#43, generator 0.6.2, 2026-09-26; `e4f2f72c…`
 *  from the start and edge rules, #44, and `5118b6a6…` from M8 until then). */
const LIVE_SHA = "b358b4f8e8d3c03b99f513ecba496d8b513266c835721a13e7dc5b988b6f60fd";
const spec = () => makeSpec({ seed: 4242, size: { x: 128, y: 128 }, theme: "riverValley", designedFor: "normal" });

describe("mine sites and ruins, models of our own", () => {
  it("leave the map's bytes as they were: the live check's download for seed 4242 is unchanged", async () => {
    const r = generate(spec());
    expect(createHash("sha256").update(r.bytes).digest("hex")).toBe(LIVE_SHA);
    // the page's download is the same file
    const page = await runGenerate(spec());
    expect(page.sha256).toBe(LIVE_SHA);
  });

  it("draw each ruin's own variant, and every mine site and ruin within its footprint", async () => {
    const page = await runGenerate(spec());
    const ruins = page.entities.filter((e) => /^RuinColumnH\d$/.test(e.template));
    const mines = page.entities.filter((e) => e.template === "UndergroundRuins");
    expect(ruins.length).toBeGreaterThan(20);
    expect(mines.length).toBeGreaterThan(0);
    for (const e of ruins) expect(e.variant).toMatch(/^[A-E]$/);
    // the editor's view carries them too
    const v = ed.refine().view.entities;
    let seen = 0;
    for (let k = 0; k < v.count; k++) {
      if (!/^RuinColumnH\d$/.test(v.templates[v.template[k]])) continue;
      expect(v.variant[k]).toBeLessThan(RUIN_VARIANT_IDS.length);
      seen++;
    }
    expect(seen).toBe(ruins.length);
    // every instance of the two models over its own footprint's tiles
    const { group } = buildEntities(v, new ShaderMaterial());
    const W = page.W;
    const cut = mineCutout(v, W, page.H);
    expect(cut.size).toBe(25 * mines.length);
    for (let k = 0; k < v.count; k++) {
      const t = v.templates[v.template[k]];
      if (t !== "UndergroundRuins") continue;
      const tiles = footprintTiles(t, { template: t, x: v.x[k], y: v.y[k], z: v.z[k], orientation: ORIENTATION_NAMES[v.orientation[k]] as Orientation, flipped: false });
      // the cut tiles are the footprint's, at the site's level (its ground)
      const own = new Set(tiles.map(([x, y]) => y * W + x));
      let inPit = 0;
      for (const [i, z] of cut) {
        if (!own.has(i)) continue;
        inPit++;
        expect(z).toBe(v.z[k]);
        expect(page.heights[i]).toBe(v.z[k]);
      }
      expect(inPit).toBe(25);
    }
    const mesh = group.children.find((c) => c.name === "UndergroundRuins") as unknown as { count: number; instanceMatrix: { array: ArrayLike<number> }; geometry: { getAttribute(n: string): { array: ArrayLike<number> } } };
    expect(mesh.count).toBe(mines.length);
    const pos = mesh.geometry.getAttribute("position").array;
    for (let i = 0; i < mesh.count; i++) {
      const e = Array.from(mesh.instanceMatrix.array).slice(i * 16, i * 16 + 16);
      const tx = Math.floor(e[12]);
      const ty = Math.floor(-e[14]);
      const site = mines.find((m) => footprintTiles("UndergroundRuins", { template: "UndergroundRuins", x: m.x, y: m.y, z: m.z, orientation: m.orientation as Orientation, flipped: false }).some(([x, y]) => x === tx && y === ty))!;
      const tiles = footprintTiles("UndergroundRuins", { template: "UndergroundRuins", x: site.x, y: site.y, z: site.z, orientation: site.orientation as Orientation, flipped: false });
      const xs = tiles.map(([x]) => x);
      const ys = tiles.map(([, y]) => y);
      for (let q = 0; q < pos.length; q += 3) {
        const X = e[0] * pos[q] + e[8] * pos[q + 2] + e[12];
        const Y = -(e[2] * pos[q] + e[10] * pos[q + 2] + e[14]);
        expect(X).toBeGreaterThanOrEqual(Math.min(...xs) - 1e-4);
        expect(X).toBeLessThanOrEqual(Math.max(...xs) + 1 + 1e-4);
        expect(Y).toBeGreaterThanOrEqual(Math.min(...ys) - 1e-4);
        expect(Y).toBeLessThanOrEqual(Math.max(...ys) + 1 + 1e-4);
      }
    }
  });
});
