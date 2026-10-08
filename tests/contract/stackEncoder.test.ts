// The water objects through the stacked engine's encoder (sim/stackWater.ts `stackObjectRows`; 3D
// Foundations, stage 5): on a map of one open column per tile, every kind of water object the app can
// place settles through the engine to today's water, bit for bit, whichever way it faces. The two
// objects that roof a cell (a badtide drain, a natural overhang) make a tile more than one open column
// by the game's rules, so the engine runs them stacked; a heightfield map never goes through the
// engine in the app (sim/prefill.ts decides by the terrain), so today's water keeps today's model there.

import { describe, expect, it } from "vitest";
import { toMapObject } from "../../src/core/features/build";
import { blockObject, fluidObject, waterSource, type EntitySpec } from "../../src/core/format/entities";
import type { Orientation } from "../../src/core/format/footprints";
import { heightMasks } from "../../src/core/sim/columns";
import { waterModel } from "../../src/core/sim/model";
import { canonicalSettle } from "../../src/core/sim/prefill";
import { canonicalStackSettle, stackObjectRows } from "../../src/core/sim/stackWater";

const W = 20;
const H = 16;
const N = W * H;
const owner = "test";
const id = (k: number) => `00000000-0000-4000-8000-${String(k).padStart(12, "0")}`;

/** Ground at 6 with a basin at 3 that drains to the east edge through a channel at 3. */
function ground(): Uint8Array {
  const h = new Uint8Array(N).fill(6);
  for (let y = 3; y < 13; y++) for (let x = 3; x < 15; x++) h[y * W + x] = 3;
  for (let x = 15; x < W; x++) h[8 * W + x] = 3;
  return h;
}

function both(entities: EntitySpec[]) {
  const heights = ground();
  const objects = entities.map(toMapObject);
  const today = canonicalSettle(waterModel(W, H, heights, objects));
  const engine = canonicalStackSettle(heightMasks(W, H, heights), objects);
  return { today, engine };
}

function same(entities: EntitySpec[], wet = true): void {
  const { today, engine } = both(entities);
  expect(engine.stacked).toBe(false);
  expect(engine.depth).toEqual(today.depth);
  expect(engine.contamination).toEqual(today.contamination);
  expect([engine.settled, engine.ticks]).toEqual([today.settled, today.ticks]);
  expect(today.depth.some((d) => d > 0.05)).toBe(wet);
}

const feed = waterSource({ id: id(1), owner, x: 5, y: 5, z: 3, strength: 1.5 });

describe("water objects through the stacked engine on one-column maps", () => {
  it("a water source, a badwater source and a delayed source", () => {
    same([feed]);
    same([waterSource({ id: id(2), owner, x: 8, y: 6, z: 3, strength: 4, bad: true })]);
    same([feed, waterSource({ id: id(3), owner, x: 10, y: 10, z: 3, strength: 3, timed: { enabled: true, cycles: 2, days: 1 } })]);
  });

  it.each(["Cw0", "Cw90", "Cw180", "Cw270"] as Orientation[])("a water seep and a badwater seep facing %s, flipped or not", (orientation) => {
    for (const flipped of [false, true]) {
      same([fluidObject({ id: id(4), owner, template: "WaterSeep", x: 8, y: 7, z: 3, strength: 2, orientation, flipped })]);
      same([feed, fluidObject({ id: id(5), owner, template: "BadwaterSeep", x: 9, y: 9, z: 3, strength: 1, orientation, flipped })]);
    }
  });

  it("an aquifer, which waits for its drill, alone and beside running water", () => {
    same([fluidObject({ id: id(6), owner, template: "Aquifer", x: 7, y: 6, z: 3, strength: 2 })], false);
    same([feed, fluidObject({ id: id(6), owner, template: "Aquifer", x: 7, y: 6, z: 3, strength: 2 })]);
  });

  it.each(["Cw0", "Cw90", "Cw180", "Cw270"] as Orientation[])("a blockage and a natural dam in the channel, facing %s", (orientation) => {
    same([feed, blockObject({ id: id(7), owner, template: "Blockage", x: 16, y: 8, z: 3, orientation })]);
    same([feed, blockObject({ id: id(8), owner, template: "NaturalDam", x: 16, y: 8, z: 3, orientation })]);
  });

  it("a badtide drain and a natural overhang roof a cell, so the engine runs them stacked", () => {
    for (const template of ["BadtideDrain", "NaturalOverhang2x1"]) {
      const { engine } = both([feed, blockObject({ id: id(9), owner, template, x: 9, y: 4, z: 3, orientation: "Cw0" })]);
      expect(engine.stacked, template).toBe(true);
    }
  });

  it("a sink is refused in one line: stacked water has no rule for it yet", () => {
    expect(() => stackObjectRows([toMapObject(waterSource({ id: id(10), owner, x: 5, y: 5, z: 3, strength: -1 }))])).toThrow(/takes water away/);
  });
});
