// Whether a plant lives on its ground (PLAN §20 D235, D342): the core's plain answer behind the page's
// "dry ground: these will die" warning. It must be the check's own rule, so on a built map the plants the check
// `plants.survive` flags are exactly the plants `dyingTiles` names, for trees, bushes and succulents, shallow
// water and contaminated soil included.

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { diesOnSoil, dyingTiles } from "../../src/core/doc/plantSoil";
import { planPlant } from "../../src/core/doc/placing";
import { MapSession } from "../../src/core/doc/session";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const g = {
  moisture: Uint8Array.from([1, 0, 1, 0, 1]),
  contamination: Uint8Array.from([0, 0, 1, 0, 0]),
  depth: Float32Array.from([0, 0, 0, 0.04, 0.5]),
};

describe("diesOnSoil / dyingTiles (D235)", () => {
  it("trees and bushes die on dry, contaminated or watered ground, a succulent on moist ground", () => {
    for (const t of ["Pine", "Birch", "Oak", "BlueberryBush"]) {
      expect(diesOnSoil(t, g, 0)).toBe(false);
      expect([1, 2, 3, 4].every((i) => diesOnSoil(t, g, i))).toBe(true);
    }
    expect([0, 1, 2, 3, 4].filter((i) => diesOnSoil("Succulent", g, i))).toEqual([0, 2, 4]);
  });

  it("leaves out tiles with water over 0.05 (nothing is planted there) and tiles off the map", () => {
    expect(dyingTiles("Oak", [1, 3, 4, -1, 9], g)).toEqual([1, 3]);
  });
});

describe("the warning and the check agree on a built map", () => {
  it("the plants plants.survive flags are the plants dyingTiles names, for trees, bushes and succulents", async () => {
    const W = 96;
    await runGenerate(makeSpec({ seed: 21, theme: "highlands", size: { x: W, y: W } }));
    ed.refine();
    const s = MapSession.open(decodeProject(ed.project().bytes));
    const n = W * W;
    const templates = ["Oak", "BlueberryBush", "Succulent"];
    // every third tile for each kind, over the whole map: dry, moist, shoreline and contaminated ground alike
    const mine = new Set<string>();
    const id = () => {
      const u = crypto.randomUUID();
      mine.add(u);
      return u;
    };
    const ops = templates.flatMap((t, ti) => {
      const tiles: number[] = [];
      for (let i = 0; i < n; i++) if ((i + Math.floor(i / W) * 2) % 3 === ti) tiles.push(i);
      const p = planPlant(s, t, tiles, id);
      return p.ok ? p.ops : [];
    });
    expect(ops.length).toBeGreaterThan(1000);
    const applied = s.applyBatch(ops, "user", "plants");
    expect(applied.errors.slice(0, 3)).toEqual([]);

    const b = s.built;
    const ground = { moisture: b.moisture, contamination: b.soilContamination, depth: b.water };
    const flagged = new Set(s.validate().report.checks.find((c) => c.id === "plants.survive")!.where?.entities ?? []);
    const plants = b.entities.filter((e) => templates.includes(e.template) && mine.has(e.id));
    expect(plants.length).toBeGreaterThan(1000);
    const seen = { shallow: 0, contaminated: 0 };
    for (const e of plants) {
      const i = e.y * W + e.x;
      if (b.water[i] > 0 && b.water[i] <= 0.05) seen.shallow++;
      if (b.soilContamination[i] > 0) seen.contaminated++;
      expect(dyingTiles(e.template, [i], ground).length === 1, `${e.template} at ${e.x},${e.y}`).toBe(flagged.has(e.id));
    }
    // (the map must have held the cases that differ, or this proves little)
    expect(flagged.size).toBeGreaterThan(0);
    expect(seen.shallow).toBeGreaterThan(0);
    expect(seen.contaminated).toBeGreaterThan(0);
  });
});
