// Trees and bushes at the game's size (plantSize.ts, D135 as amended 2026-10-29): our own models, built to the size of the
// game's grown ones, and scaled per plant as the game's randomizer scales them, in Standard, the light look and High.

import { describe, expect, it } from "vitest";
import { modelOf } from "../../src/render3d/entities3d";
import { model } from "../../src/render3d/high/models";
import { plantScale, RANDOMIZER } from "../../src/render3d/plantSize";

/** The game's grown models (resources.assets): height and width (the larger footprint side), tiles. */
const GAME: Record<string, { height: number; width: number }> = {
  Pine: { height: 3.01, width: 1.22 },
  Birch: { height: 1.92, width: 1.02 },
  Oak: { height: 2.26, width: 1.83 },
  BlueberryBush: { height: 0.4, width: 1.16 },
};

function extent(pos: ArrayLike<number>): { height: number; width: number } {
  let h = 0;
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (let v = 0; v < pos.length; v += 3) {
    h = Math.max(h, pos[v + 1]);
    x0 = Math.min(x0, pos[v]);
    x1 = Math.max(x1, pos[v]);
    z0 = Math.min(z0, pos[v + 2]);
    z1 = Math.max(z1, pos[v + 2]);
  }
  return { height: h, width: Math.max(x1 - x0, z1 - z0) };
}

describe("trees and bushes at the game's size", () => {
  it("are built to the game's grown model's height and width, in Standard, the light look's and High's models", () => {
    for (const [species, game] of Object.entries(GAME)) {
      const shapes: [string, { height: number; width: number }][] = [
        ["standard", extent(modelOf(species).pos)],
        ["high near", extent(model(species as never, 0, "near").getAttribute("position").array as Float32Array)],
        ["high far", extent(model(species as never, 0, "far").getAttribute("position").array as Float32Array)],
      ];
      for (const [look, e] of shapes) {
        expect(e.height / game.height, `${species} ${look} height`).toBeGreaterThan(0.9);
        expect(e.height / game.height, `${species} ${look} height`).toBeLessThan(1.1);
        expect(e.width / game.width, `${species} ${look} width`).toBeGreaterThan(0.8);
        expect(e.width / game.width, `${species} ${look} width`).toBeLessThan(1.2);
      }
    }
  });

  it("are scaled per plant as the game's randomizer scales them: its ranges, one factor where it keeps proportion", () => {
    expect(RANDOMIZER.Pine).toEqual({ height: [0.8, 1.0], width: [0.9, 1.1], constrain: false });
    expect(plantScale("Pine", 0, 0)).toEqual({ width: 0.9, height: 0.8 });
    expect(plantScale("Pine", 1, 1)).toEqual({ width: 1.1, height: 1.0 });
    const oak = plantScale("Oak", 0.5, 0.1);
    expect(oak.width).toBeCloseTo(oak.height, 9);
    expect(oak.height).toBeCloseTo(1.0, 9);
    expect(plantScale("RuinColumnH1", 0.3, 0.7)).toEqual({ width: 1, height: 1 });
  });
});
