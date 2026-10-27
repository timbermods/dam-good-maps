// The day the start's water goes in a drought, or badwater reaches it in a badtide (D133): read from the days a hazard's run
// keeps, on a small map made by hand so the day is known. A plateau (ground 5) with a lake sunk in it (ground 3, water 2
// deep, its surface level with the shore): the start's pumps draw from the lake, and the days below thin it, taint it or
// leave it.

import { expect, it } from "vitest";
import type { DayWater } from "../../src/core/sim/firstDays";
import { StartWaterDays, startWaterNotes, startWaterWords, type HeldStartWater, type StartWaterInput } from "../../src/core/sim/startWaterDay";

const W = 24;
const H = 24;
const lake = (x: number, y: number) => x >= 8 && x <= 10 && y >= 10 && y <= 14;

const heights = new Float64Array(W * H).map((_, i) => (lake(i % W, Math.floor(i / W)) ? 3 : 5));
const input = (over: Partial<StartWaterInput> = {}): StartWaterInput => ({ W, H, heights, objects: [], start: { x: 3, y: 12 }, within: 20, ...over });

/** A day's water: the lake `deep`, with `taint` of badwater on its tile (8, 12) and `elsewhere` on the other tiles. */
function day(deep: number, taint = 0, elsewhere = 0): DayWater {
  const depth = new Float64Array(W * H);
  const contamination = new Float64Array(W * H);
  for (let i = 0; i < W * H; i++)
    if (lake(i % W, Math.floor(i / W))) {
      depth[i] = deep;
      contamination[i] = elsewhere;
    }
  contamination[12 * W + 8] = taint || elsewhere;
  return { depth, contamination };
}

it("a drought: the day no water the pumps reach is left, though some may lie on the map (too thin to draw)", () => {
  const d = new StartWaterDays("drought", day(2), input());
  expect(d.has).toBe(true);
  d.see(day(1.5));
  d.see(day(0.5));
  expect(d.day, "still 0.5 deep: a pump draws it").toBe(0);
  d.see(day(0.2));
  expect(d.day, "0.2 deep is under a pump's 0.3: gone on day 3, the water still on the map").toBe(3);
  d.see(day(0));
  expect(d.day, "the first day stays").toBe(3);
  expect(d.through).toBe(4);
});

it("a drought: water that lasts says nothing, however many days are seen", () => {
  const d = new StartWaterDays("drought", day(2), input());
  for (let k = 0; k < 12; k++) d.see(day(1));
  expect(d.day).toBe(0);
  expect(d.through).toBe(12);
});

it("a drought: the day a lake dries entirely is the day its water is gone", () => {
  const d = new StartWaterDays("drought", day(2), input());
  d.see(day(0.4));
  d.see(day(0));
  expect(d.day).toBe(2);
});

it("a drought: water too far to walk to was never the start's, so nothing is said of it", () => {
  const d = new StartWaterDays("drought", day(2), input({ within: 2 }));
  expect(d.has).toBe(false);
  d.see(day(0));
  expect(d.day).toBe(0);
  expect(new StartWaterDays("drought", day(2), input({ start: null })).has).toBe(false);
});

it("a badtide: the day badwater first stands where a pump would draw, not water that was bad on Day 0", () => {
  const d = new StartWaterDays("badtide", day(2), input());
  expect(d.has).toBe(true);
  d.see(day(2));
  expect(d.day).toBe(0);
  d.see(day(2, 0.02));
  expect(d.day, "0.02 is not badwater yet (0.05 is the line)").toBe(0);
  d.see(day(2, 0.4));
  expect(d.day).toBe(3);
  d.see(day(2, 0.9, 0.9));
  expect(d.day, "the first day stays").toBe(3);
});

it("a badtide: a lake clean through every day seen says nothing; badwater from Day 0 is not 'reaching' it", () => {
  const clean = new StartWaterDays("badtide", day(2), input());
  for (let k = 0; k < 8; k++) clean.see(day(2));
  expect(clean.day).toBe(0);
  // (the lake's one tile bad on Day 0: it stays bad on day 1, and the rest of the lake is clean until day 2)
  const dirty = new StartWaterDays("badtide", day(2, 0.5), input());
  dirty.see(day(2, 0.5));
  expect(dirty.day).toBe(0);
  dirty.see(day(2, 0.5, 0.3));
  expect(dirty.day).toBe(2);
});

it("the line: the day, in the hazard's words, only for the hazard on screen and the map it was worked out on", () => {
  const drought: HeldStartWater = { hazard: "drought", version: 4, day: 6 };
  const badtide: HeldStartWater = { hazard: "badtide", version: 4, day: 3 };
  expect(startWaterWords(drought, "drought", 4)).toBe("Day 6: your start's water is gone");
  expect(startWaterWords(badtide, "badtide", 4)).toBe("Day 3: badwater reaches your start's water");
  expect(startWaterWords(drought, "badtide", 4)).toBeNull();
  expect(startWaterWords(drought, null, 4)).toBeNull();
  expect(startWaterWords(drought, "drought", 5), "an edited map's days come later").toBeNull();
  expect(startWaterWords({ ...drought, day: 0 }, "drought", 4), "never, or not worked out yet: no guess").toBeNull();
  expect(startWaterWords(null, "drought", 4)).toBeNull();
  expect(startWaterNotes(drought, "drought", 4)).toEqual([{ text: "Day 6: your start's water is gone", now: false }]);
  expect(startWaterNotes(null, "drought", 4)).toEqual([]);
});
