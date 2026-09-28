// The starting-logs floor on a real place (Kyler, 2026-09-26, D224, D227, D229): the groves
// src/core/places/wood.ts grows for a place short of it read the land (a river bank, the far bank,
// a plateau, a side valley, woodland), stay on free dry ground within the floor's walk, are grown,
// and are the same every time.
import { describe, expect, it } from "vitest";
import { startingLocation, tree, TREE_LOGS, type EntitySpec } from "../../src/core/format/entities";
import { LOG_FLOOR, LOG_FLOOR_WALK, startLogs } from "../../src/core/places/place";
import { plantForFloor } from "../../src/core/places/wood";
import type { MapObject } from "../../src/core/sim/model";

// 64² of flat ground at level 6, a river 3 wide across it at y 30-32, the start south of it, and
// a raised shelf (level 8) in the north-east corner beyond the walk's level
const W = 64;
const H = 64;
const heights = new Uint8Array(W * H).fill(6);
const water = new Float64Array(W * H);
const moisture = new Float64Array(W * H);
for (let y = 0; y < H; y++)
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (x >= 48 && y >= 48) heights[i] = 8;
    if (y >= 30 && y <= 32) {
      heights[i] = 5;
      water[i] = 0.8;
    }
    if (Math.abs(y - 31) <= 10) moisture[i] = 1;
  }
const start = { x: 20, y: 18 };
const own: EntitySpec[] = [startingLocation({ id: "s", owner: "t", x: start.x - 1, y: start.y - 1, z: 6, orientation: "Cw0" })];
const obj = (e: EntitySpec): MapObject => ({ template: e.template, x: e.x, y: e.y, z: e.z, orientation: e.orientation, flipped: e.flipped, components: { ...(e.before ?? {}), ...e.components } });
const run = () => plantForFloor({ W, H, heights, water, moisture, soilContamination: new Float64Array(W * H), entities: own, start, need: 120, within: LOG_FLOOR_WALK, seed: 7, owner: "t/floor" });

describe("the starting-logs floor's groves on a real place (D224, D227, D229)", () => {
  it("the floor is the pinned one, counted within its walk", () => {
    expect(LOG_FLOOR).toBe(178);
    expect(LOG_FLOOR_WALK).toBe(40);
  });

  it("grows the logs asked for, in groves that read the land, on free dry ground within the walk, grown", () => {
    const r = run();
    expect(r.logs).toBeGreaterThanOrEqual(120);
    expect(r.groves.length).toBeGreaterThanOrEqual(2);
    // what the groves' trees give, and what the floor's count sees of them
    expect(r.groves.reduce((s, g) => s + g.logs, 0)).toBe(r.logs);
    const logs = startLogs(heights, W, H, [...own, ...r.entities].map(obj));
    expect(logs).toBe(r.logs);
    // the river's two banks read apart: birches or pines on this side, a forest on the far bank
    const stands = new Set(r.groves.map((g) => g.stand));
    expect(stands.size).toBeGreaterThanOrEqual(2);
    const seen = new Set<number>();
    for (const e of r.entities) {
      const i = e.y * W + e.x;
      expect(water[i], `${e.x},${e.y}`).toBe(0);
      expect(heights[i]).toBe(6);
      expect(Math.max(Math.abs(e.x - start.x), Math.abs(e.y - start.y)) > 2).toBe(true);
      expect(seen.has(i)).toBe(false);
      seen.add(i);
      // grown: a sapling's logs do not count
      expect(e.components.Growable).toBeUndefined();
      expect(TREE_LOGS[e.template]).toBeGreaterThan(0);
    }
    // across the river: trees north of it, where the straight line to the start crosses the water
    expect(r.entities.some((e) => e.y > 32)).toBe(r.groves.some((g) => g.stand === "across the water"));
  });

  it("keeps clear of the trees already there, and is the same every time", () => {
    const a = run();
    expect(run()).toEqual(a);
    const old = tree({ id: "o", owner: "t", x: 26, y: 24, z: 6, species: "Oak" });
    const r = plantForFloor({ W, H, heights, water, moisture, soilContamination: new Float64Array(W * H), entities: [...own, old], start, need: 60, within: LOG_FLOOR_WALK, seed: 7, owner: "t/floor" });
    // (with room enough, no grove grows on at the old tree's edge)
    expect(r.logs).toBeGreaterThanOrEqual(60);
    expect(r.entities.filter((e) => Math.max(Math.abs(e.x - 26), Math.abs(e.y - 24)) <= 1)).toEqual([]);
  });
});
