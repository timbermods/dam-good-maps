// The forces row's order, by prominence (PLAN §20 D352): one list, with its groups; a force not adopted yet
// takes its place in it when it arrives.

import { describe, expect, it } from "vitest";
import { FORCE_GROUPS, FORCES } from "../../src/editor/TopBar";

describe("the forces row's order (D352)", () => {
  it("the groups: Carve, Craterize, Erupt · Rift, Quake, Glaciate · Erode, Deposit", () => {
    expect(FORCE_GROUPS).toEqual([
      ["carve", "craterize", "erupt"],
      ["rift", "quake", "glaciate"],
      ["erode", "deposit"],
    ]);
  });
  it("the forces that exist follow it, and every one has a place in it", () => {
    expect(FORCES.map((f) => f.id)).toEqual(["carve", "craterize", "erupt", "rift", "quake", "glaciate", "deposit"]);
    for (const f of FORCES) expect(FORCE_GROUPS.some((g) => g.includes(f.id))).toBe(true);
  });
});
