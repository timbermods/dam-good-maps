// A generated map's name and how-it-plays line (M9b; PLAN §20 D278 (1b)): from the standout
// intention and the read-back features, never a title the names study forbids.

import { describe, expect, it } from "vitest";
import FORBIDDEN from "../../src/core/data/forbiddenNames.json" with { type: "json" };
import { allowedName, mapWords, playHint, type PlayFacts } from "../../src/core/gen/names";
import type { Signature } from "../../src/core/analysis/signature";
import { ACTIVE, INTENTION_TEXT } from "../../src/core/land/intentions";

const sig: Signature = { valley: 0.25, canyon: 0, canyonShare: 0, high: 0.3, cliffs: 0.05, plateaus: 1, lakeShare: 0.1, bigLake: 0.01, mouths: 1, water: 0.12, mainBody: 0.1, apart: 0, islands: 0 };
const facts: PlayFacts = { W: 128, H: 128, start: { x: 60, y: 60 }, startDrought: true, bestDam: null, badwater: { x: 100, y: 60, distance: 40 }, woods: null };

describe("names and how it plays (D278 (1b))", () => {
  it("never uses a title the names study forbids", () => {
    for (const t of FORBIDDEN.exact) expect(allowedName(t), t).toBe(false);
    expect(allowedName("Oxbow Bend")).toBe(true);
  });

  it("names every standout, says it in a sentence and one thing about how the map plays", () => {
    for (const id of ACTIVE)
      for (let seed = 1; seed <= 5; seed++) {
        const w = mapWords({ seed, theme: "riverValley", standout: id, signature: sig, facts });
        expect(w.name.length, id).toBeGreaterThan(3);
        expect(allowedName(w.name), w.name).toBe(true);
        expect(w.description.startsWith(INTENTION_TEXT[id]), id).toBe(true);
        expect(w.description).toContain("Badwater lies 40 tiles east of the start.");
      }
  });

  it("a map without a standout is named for its land", () => {
    expect(mapWords({ seed: 3, theme: "canyon", standout: null, signature: sig, facts }).name).toMatch(/Gorge$/);
  });

  it("the play hint reads the map: the first drought, a dam site, the badwater, the woods", () => {
    expect(playHint({ ...facts, startDrought: false })).toMatch(/runs low in the first drought/);
    expect(playHint({ ...facts, bestDam: { x: 60, y: 80, volume: 1234, length: 5 } })).toBe("A 5-tile dam 20 tiles north of the start holds 1,200 water.");
    expect(playHint({ ...facts, bestDam: { x: 40, y: 40, volume: 21834, length: 8 } })).toBe("An 8-tile dam 28 tiles south-west of the start holds 21,800 water.");
    expect(playHint({ ...facts, badwater: null, woods: "oak" })).toMatch(/mostly oak/);
  });
});
