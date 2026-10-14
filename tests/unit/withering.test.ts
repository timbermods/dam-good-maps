// Which plants a held day has surely killed (core/sim/withering.ts), by the game's rules: a dry run of 1.1 × DaysToDieDry
// (the timer resets when moisture returns), contamination for any day, succulents exempt from dryness only, death permanent.

import { describe, expect, it } from "vitest";
import { hazardDays } from "../../src/core/sim/weather";
import { DAYS_TO_DIE_DRY, witheredByDay, type DaySoil, type Plant } from "../../src/core/sim/withering";

/** One tile's soil per day, day 0 first: a letter each: "m" moist, "d" dry, "c" dry and contaminated, "x" moist and contaminated. */
const series = (pattern: string): DaySoil[] =>
  [...pattern].map((c) => ({ moisture: [c === "m" || c === "x" ? 9 : 0], contamination: [c === "c" || c === "x" ? 40 : 0] }));
const deadOn = (template: string, pattern: string, upTo = pattern.length - 1) => witheredByDay(series(pattern).slice(0, upTo + 1), [{ tile: 0, template }])[0] === 1;
const plant = (template: string): Plant => ({ tile: 0, template });

describe("the plants a held day has surely killed", () => {
  it("nothing is dead on Day 0, and dryness alone takes 1.1 times the species' days: a pine (13) is alive until its tile has been dry 14.3 days", () => {
    expect(witheredByDay(series("d"), [plant("Pine")])[0]).toBe(0);
    // moist on day 0, dry from day 1: the tile is known to have been dry for at least k - 1 days on day k
    const dry = (n: number) => "m" + "d".repeat(n);
    expect(deadOn("Pine", dry(15))).toBe(false); // at least 14 days: short of 14.3
    expect(deadOn("Pine", dry(16))).toBe(true); // at least 15
  });

  it("blueberry (9 days) is still alive at 9.9 days dry and dead after; birch 11, oak 15 likewise", () => {
    const run = (template: string, days: number) => deadOn(template, "m" + "d".repeat(days));
    expect(DAYS_TO_DIE_DRY).toMatchObject({ BlueberryBush: 9, Birch: 11, Oak: 15, Pine: 13 });
    // (dry from day 1, so the run is known to be at least `n - 1` days long after `n` days; the limit is 1.1 × the species' days)
    expect([run("BlueberryBush", 10), run("BlueberryBush", 11)]).toEqual([false, true]);
    expect([run("Birch", 13), run("Birch", 14)]).toEqual([false, true]);
    expect([run("Oak", 17), run("Oak", 18)]).toEqual([false, true]);
  });

  it("the timer resets when moisture returns: a long drought with one moist day in it kills nobody it would have killed", () => {
    // 8 dry days, a moist one, then 8 dry again: never 9.9 in a row for a blueberry
    expect(deadOn("BlueberryBush", "m" + "d".repeat(8) + "m" + "d".repeat(8))).toBe(false);
    expect(deadOn("BlueberryBush", "m" + "d".repeat(12))).toBe(true);
  });

  it("death is permanent: a plant dead on one day is dead on every later day, whatever the ground does after", () => {
    const pattern = "m" + "d".repeat(11) + "mmmm";
    expect(deadOn("BlueberryBush", pattern, 11)).toBe(true);
    for (let day = 11; day < pattern.length; day++) expect(deadOn("BlueberryBush", pattern, day), `day ${day}`).toBe(true);
    // (and one that never reached the limit is alive when the moisture comes back)
    expect(deadOn("BlueberryBush", "m" + "d".repeat(6) + "mmmm")).toBe(false);
  });

  it("contamination on a single day kills any plant, succulents included, for good; contamination on Day 0 is the map's own", () => {
    for (const template of ["Pine", "Birch", "Oak", "BlueberryBush", "Succulent"]) {
      expect(deadOn(template, "mmxmmm"), template).toBe(true);
      expect(deadOn(template, "mmxmmm", 1), template).toBe(false);
    }
    expect(deadOn("Pine", "xmm")).toBe(false);
  });

  it("a succulent is exempt from dryness only", () => {
    expect(deadOn("Succulent", "m" + "d".repeat(40))).toBe(false);
    expect(deadOn("Succulent", "m" + "d".repeat(5) + "c")).toBe(true);
  });

  it("nothing dies of dryness in an easy drought's 4 days or a normal one's 9: the longest a pine, birch, oak or blueberry takes is 9.9", () => {
    for (const [difficulty, days] of [["easy", hazardDays("easy", "drought")], ["normal", hazardDays("normal", "drought")]] as const) {
      for (const template of Object.keys(DAYS_TO_DIE_DRY).filter((t) => t !== "Mangrove" && t !== "ChestnutTree" && t !== "Dandelion" && t !== "CoffeeBush" && t !== "Maple")) {
        expect(deadOn(template, "m" + "d".repeat(days)), `${template} on ${difficulty}`).toBe(false);
      }
    }
    // (the species with the shortest timers, 8 and 6 days, do die in a normal drought)
    expect(deadOn("ChestnutTree", "m" + "d".repeat(hazardDays("normal", "drought")))).toBe(false);
    expect(deadOn("Mangrove", "m" + "d".repeat(hazardDays("normal", "drought")))).toBe(true);
  });

  it("each plant is judged on its own tile, in its order", () => {
    const days: DaySoil[] = [
      { moisture: [9, 9, 9], contamination: [0, 0, 0] },
      { moisture: [0, 9, 0], contamination: [0, 0, 0] },
      { moisture: [0, 9, 0], contamination: [0, 5, 0] },
    ];
    expect(Array.from(witheredByDay(days, [{ tile: 1, template: "Oak" }, { tile: 0, template: "Oak" }, { tile: 2, template: "Succulent" }]))).toEqual([1, 0, 0]);
  });
});
