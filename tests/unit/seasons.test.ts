// The seasons as the game shows them (render3d/high/seasons.ts; D250 as amended 2026-10-29 by planning: follows the game,
// D496's rule): a held Drought or Badtide day changes the haze to the game's fog colour for that weather, and nothing
// else of the look; the game has no straw, heat shimmer or sickly sky. (Re-based from the High-only dry ground, shimmer
// and sickly sky the amendment retired, D148.)

import { describe, expect, it } from "vitest";
import { HIGH_EFFECTS, LOWER_COST_DROPS } from "../../src/render3d/high/effects";
import { FOG, fogOf } from "../../src/render3d/high/seasons";
import { LIGHT } from "../../src/render3d/palette";

describe("a held day's haze", () => {
  it("is the game's daytime fog colour for the weather (Sun.blueprint DayColors)", () => {
    expect(fogOf(null)).toEqual(FOG.temperate);
    expect(fogOf("drought")).toEqual(FOG.drought);
    expect(fogOf("badtide")).toEqual(FOG.badtide);
    expect(FOG.temperate).toEqual([0.4470589, 0.7607844, 0.8235295]);
    expect(FOG.drought).toEqual([0.7058824, 0.5490196, 0.3764706]);
    expect(FOG.badtide).toEqual([0.6980392, 0.4392157, 0.3490196]);
    // the map's own haze is the temperate fog
    expect([...LIGHT.haze]).toEqual([...FOG.temperate]);
  });

  it("brings no High effect of its own", () => {
    const keys: string[] = HIGH_EFFECTS.map((e) => e.key);
    for (const k of ["dryGround", "heat", "badtideSky"]) expect(keys).not.toContain(k);
    expect(LOWER_COST_DROPS as readonly string[]).not.toContain("heat");
  });
});
