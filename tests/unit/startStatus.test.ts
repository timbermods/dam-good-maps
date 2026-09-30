// The start's colour means one thing (PLAN §20 D361, item 4): green it fits and meets every start
// requirement, amber it fits but misses some, red it cannot be placed there.

import { describe, expect, it } from "vitest";
import { sameStartCheck, startStatus, type StartCheck } from "../../src/editor/features";

const base: StartCheck = { problem: null, tiles: [1, 2, 3], door: 4, water: 5, wood: 60, woodBySpecies: {} as StartCheck["woodBySpecies"], woodGrowing: 0, woodFloor: 80, bushes: 12, meets: true, warnings: [] };

describe("the start's colour", () => {
  it("green when it fits and meets every requirement", () => {
    expect(startStatus({ problem: null, meets: true })).toBe("ok");
  });
  it("amber when it fits but misses a requirement (not red)", () => {
    expect(startStatus({ problem: null, meets: false })).toBe("warn");
  });
  it("red only when it cannot be placed there, whatever else holds", () => {
    expect(startStatus({ problem: "on an object", meets: false })).toBe("blocked");
    expect(startStatus({ problem: "under water", meets: true })).toBe("blocked");
  });
});

describe("a placed start changes colour only when something about it changed", () => {
  it("the same answer asked again is the same check", () => {
    expect(sameStartCheck(base, { ...base, tiles: [9], warnings: [] })).toBe(true);
  });
  it("a changed requirement, problem or warning is a change", () => {
    expect(sameStartCheck(base, { ...base, meets: false })).toBe(false);
    expect(sameStartCheck(base, { ...base, water: null })).toBe(false);
    expect(sameStartCheck(base, { ...base, problem: "under water" })).toBe(false);
    expect(sameStartCheck(base, { ...base, warnings: ["Badwater 3 tiles away"] })).toBe(false);
  });
});
