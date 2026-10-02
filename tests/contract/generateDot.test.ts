// Generate's dot (docs/UI-BRIEF.md §5, PLAN §20 D330): it shows when the panel's settings differ from
// the shown map's; a sibling from the candidates strip has the same settings; a real place or an
// imported map has none to differ from. The core question directly (D342 (5)).

import { describe, expect, it } from "vitest";
import { settingsDiffer, settingsKey } from "../../src/core/spec/differ";
import { makeSpec, type MapSpec } from "../../src/core/spec/mapspec";

describe("Generate's dot", () => {
  const spec = makeSpec({ seed: 7, theme: "riverValley", size: { x: 128, y: 128 } });
  it("is off while the settings are the shown map's", () => {
    expect(settingsDiffer(spec, { ...spec })).toBe(false);
  });
  it("shows when a setting, the seed, the size or the theme changes", () => {
    expect(settingsDiffer(spec, { ...spec, settings: { ...spec.settings, water: { ...spec.settings.water, rivers: spec.settings.water.rivers + 1 } } })).toBe(true);
    expect(settingsDiffer(spec, { ...spec, seed: 8 })).toBe(true);
    expect(settingsDiffer(spec, makeSpec({ seed: 7, theme: "riverValley", size: { x: 256, y: 256 } }))).toBe(true);
    expect(settingsDiffer(spec, makeSpec({ seed: 7, theme: "canyon", size: { x: 128, y: 128 } }))).toBe(true);
  });
  it("stays off for a sibling from the strip: the same settings on other land", () => {
    const sibling = { ...spec, variation: 2, intentions: ["a big lake"], accepted: { attempt: 1, candidate: 0 } } as MapSpec;
    expect(settingsKey(sibling)).toBe(settingsKey(spec));
    expect(settingsDiffer(sibling, spec)).toBe(false);
  });
  it("has nothing to differ from when a real place or an imported map is shown", () => {
    expect(settingsDiffer(null, spec)).toBe(false);
  });
});
