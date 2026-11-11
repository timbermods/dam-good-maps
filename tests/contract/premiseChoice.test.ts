// A theme and a premise are two choices (docs/PREMISES.md §1.3, §1.5; build step 9): the spec carries both, each may be
// Any (resolved from the seed), a pair the premise cannot honour is refused in one line, the theme's style changes the
// land past the start's ground and never the premise's water, and every setting of the panel says what it does to a
// premise map.

import { describe, expect, it } from "vitest";
import { drawPlan } from "../../src/core/premise/draw";
import { generatePremise } from "../../src/core/premise/generate";
import { PAIR_REFUSALS, PREMISE_SETTINGS, PREMISE_THEMES, premiseRefusal, premiseSettings, resolvePremise } from "../../src/core/premise/choice";
import { PREMISES } from "../../src/core/premise/premises";
import { reliefBetween } from "../../src/core/premise/raster/relief";
import { premiseStyle } from "../../src/core/premise/style";
import { waterByNumber } from "../../src/core/premise/water";
import { SETTING_KEYS } from "../../src/core/spec/codec";
import { decodeSpecFragment, encodeSpecFragment, makeSpec, THEME_PRESETS, themeOwnSettings, type MapSpec, type ThemeId } from "../../src/core/spec/mapspec";

const spec128 = (seed: number, theme: ThemeId, premise: MapSpec["premise"]) => makeSpec({ seed, size: { x: 128, y: 128 }, theme, premise });

describe("Theme × premise (§1.5, build step 9)", () => {
  it("carries both in a share link, each Any resolved from the seed, the premise's water preset whatever the theme", () => {
    for (const [theme, premise] of [["canyon", "lakeStair"], ["any", "any"], ["highlands", "any"], ["any", "lakeStair"]] as const) {
      const spec = spec128(7, theme, premise);
      const link = encodeSpecFragment(spec);
      expect(link).toContain(`t=${theme}`);
      expect(link).toContain(`p=${premise}`);
      const back = decodeSpecFragment(link)!;
      expect(back.problems).toEqual([]);
      expect(back.spec).toEqual(spec);
      // (Any resolves the same way every time, to a pair the premise honours)
      const r = resolvePremise(spec);
      if ("reason" in r) throw new Error(r.reason);
      expect(resolvePremise(back.spec)).toEqual(r);
      expect(PREMISE_THEMES[r.premise]).toContain(r.theme);
      if (theme !== "any") expect(r.theme).toBe(theme);
    }
    // (the theme's preset gives the style's settings, the premise's what its plan reads)
    const canyon = spec128(1, "canyon", "lakeStair");
    const any = spec128(1, "any", "lakeStair");
    expect(canyon.settings.terrain.relief).toBe(THEME_PRESETS.canyon.relief);
    expect(canyon.settings.water).toEqual(any.settings.water);
    expect(canyon.settings.terrain.verticality).toBe(any.settings.terrain.verticality);
    expect(canyon.settings.terrain.buildableLand).toBe(any.settings.terrain.buildableLand);
    // (Any spreads over the themes a premise honours)
    const seen = new Set<string>();
    for (let seed = 1; seed <= 24; seed++) {
      const r = resolvePremise(spec128(seed, "any", "any"));
      if (!("reason" in r)) seen.add(r.theme);
    }
    expect([...seen].sort()).toEqual([...PREMISE_THEMES.lakeStair].sort());
    // (a premise the codec does not know is a problem, and the themes make the map)
    const odd = decodeSpecFragment("#s=1&t=any&z=128&p=wallAndGate")!;
    expect(odd.spec.premise).toBeUndefined();
    expect(odd.problems).toEqual(['unknown premise "wallAndGate", so the themes make the map']);
  });

  it("refuses a pair it cannot honour in one line, never silently", () => {
    for (const theme of ["islands", "delta"] as const) {
      const spec = spec128(1, theme, "lakeStair");
      expect(premiseRefusal(spec)).toBe(PAIR_REFUSALS.lakeStair[theme]);
      expect(generatePremise(spec)).toEqual({ reason: PAIR_REFUSALS.lakeStair[theme] });
      expect(premiseRefusal(spec128(1, theme, "any"))).toMatch(/^No premise takes the .+ style yet$/);
      // (the themes then make the theme's own map: its own settings where the premise's preset set them)
      expect(themeOwnSettings(spec)).toEqual(makeSpec({ seed: 1, size: { x: 128, y: 128 }, theme }).settings);
    }
    // (a setting changed from the premise's preset stays as set)
    const set = spec128(1, "delta", "lakeStair");
    set.settings.water.riverFlow = set.settings.water.riverFlow === "strong" ? "lush" : "strong";
    expect(themeOwnSettings(set).water.riverFlow).toBe(set.settings.water.riverFlow);
    // (the settings a premise rules out are refused the same way)
    const off = spec128(1, "canyon", "lakeStair");
    off.settings.water.waterfalls = "off";
    expect(premiseRefusal(off)).toBe("The lake stair needs waterfalls, and Waterfalls is Off");
    expect(premiseRefusal(spec128(1, "canyon", "lakeStair"))).toBeNull();
  });

  it("styles the land past the start's ground, never the plan or the water", () => {
    const rv = spec128(1, "riverValley", "lakeStair");
    const canyon = spec128(1, "canyon", "lakeStair");
    const a = drawPlan(PREMISES.lakeStair, rv, 0);
    const b = drawPlan(PREMISES.lakeStair, canyon, 0);
    if ("reason" in a || "reason" in b) throw new Error("no plan");
    expect(b.plan).toEqual(a.plan);
    const water = waterByNumber(a.plan);
    const own = reliefBetween(a.plan, water, premiseStyle("riverValley", rv, 0).relief);
    const styled = reliefBetween(a.plan, water, premiseStyle("canyon", canyon, 0).relief);
    const { W, H } = a.plan;
    const { x: sx, y: sy } = a.plan.frame.start;
    let differ = 0;
    let higher = 0;
    const r = water.raster;
    // (day 1's water: a wet body's or a wet link's tiles; the dry beds follow the land, as stage 2 lays them in any land)
    const wet = (i: number) => (r.lake[i] > 0 && !a.plan.bodies[r.lake[i] - 1].dry) || (r.channel[i] > 0 && a.plan.links[r.channel[i] - 1].wet);
    for (let i = 0; i < W * H; i++) {
      const x = i % W;
      const y = (i - x) / W;
      if (wet(i) || Math.max(Math.abs(x - sx), Math.abs(y - sy)) < 16) expect(styled[i], `tile ${x},${y}`).toBe(own[i]);
      if (styled[i] !== own[i]) differ++;
      higher += styled[i] - own[i];
    }
    // (Canyon stands higher over the stair than River Valley, over a good part of the map)
    expect(differ).toBeGreaterThan(0.2 * W * H);
    expect(higher).toBeGreaterThan(0);
  });

  it("says what every setting of the panel does to a premise map, and which the page greys out", () => {
    const list = PREMISE_SETTINGS.lakeStair;
    expect(list.map((s) => s.key).sort()).toEqual(["z", "d", ...SETTING_KEYS.map((k) => k.key)].sort());
    for (const s of list) expect(s.does.length, s.key).toBeGreaterThan(0);
    expect(premiseSettings("lakeStair").greyed).toEqual(["water.rivers", "water.riverStyle", "hazards.thornBelts", "hazards.unstableCores", "resources.relics", "resources.geothermal"]);
    expect(premiseSettings("any").greyed).toEqual(premiseSettings("lakeStair").greyed);
    // (every setting marked as refusing has a value the premise refuses)
    const refusing: Record<string, (s: MapSpec) => void> = {
      "water.waterfalls": (s) => (s.settings.water.waterfalls = "off"),
      "water.sources": (s) => (s.settings.water.sources = "none"),
      "start.easyStart": (s) => (s.settings.start.easyStart = true),
    };
    for (const s of list.filter((t) => t.role === "refuses")) {
      const spec = spec128(1, "any", "lakeStair");
      refusing[s.path](spec);
      expect(premiseRefusal(spec), s.path).not.toBeNull();
    }
  });
});
