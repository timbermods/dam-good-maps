// The side panel (docs/UI-BRIEF.md §3, §5; PLAN §20 D330): open on the first visit, then as it was
// left; Generate runs only on its button or Enter in the panel, with its dot when the settings
// differ from the shown map's. The component itself is exercised in tests/e2e/page-parts.spec.ts.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeSpec, type MapSpec } from "../../src/core/spec/mapspec";
import { generateOnEnter, settingsDiffer, settingsKey } from "../../src/page/panel/generate";
import { loadPanelOpen, PANEL_KEY, PANEL_MODES, savePanelOpen } from "../../src/page/panel/panelState";
import { replacedText } from "../../src/page/QuietNote";

describe("the panel remembers how it was left", () => {
  const store = new Map<string, string>();
  let was: unknown;
  beforeEach(() => {
    store.clear();
    was = (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  });
  afterEach(() => void ((globalThis as { localStorage?: unknown }).localStorage = was));

  it("is open on the first visit", () => {
    expect(loadPanelOpen()).toBe(true);
  });
  it("then stays as it was left", () => {
    savePanelOpen(false);
    expect(store.get(PANEL_KEY)).toBe("collapsed");
    expect(loadPanelOpen()).toBe(false);
    savePanelOpen(true);
    expect(loadPanelOpen()).toBe(true);
  });
  it("opens when the browser keeps nothing", () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadPanelOpen()).toBe(true);
    expect(() => savePanelOpen(false)).not.toThrow();
  });
  it("switches between Generate, Real places and Pick a place", () => {
    expect(PANEL_MODES.map((m) => m.label)).toEqual(["Generate", "Real places", "Pick a place"]);
  });
});

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

describe("Enter in the panel generates", () => {
  const key = (over: Partial<Parameters<typeof generateOnEnter>[0]> = {}) => ({ key: "Enter", shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, target: { tagName: "INPUT", type: "text" } as unknown as EventTarget, ...over });
  it("from a field", () => {
    expect(generateOnEnter(key())).toBe(true);
    expect(generateOnEnter(key({ target: { tagName: "INPUT", type: "range" } as unknown as EventTarget }))).toBe(true);
  });
  it("never from another key, a modifier, a held key or while composing text", () => {
    expect(generateOnEnter(key({ key: "a" }))).toBe(false);
    expect(generateOnEnter(key({ shiftKey: true }))).toBe(false);
    expect(generateOnEnter(key({ ctrlKey: true }))).toBe(false);
    expect(generateOnEnter(key({ repeat: true }))).toBe(false);
    expect(generateOnEnter(key({ isComposing: true }))).toBe(false);
  });
  it("never where Enter already does something: a button, a link, a section, a list", () => {
    for (const tagName of ["BUTTON", "A", "SUMMARY", "TEXTAREA", "SELECT"]) expect(generateOnEnter(key({ target: { tagName } as unknown as EventTarget }))).toBe(false);
    expect(generateOnEnter(key({ target: { tagName: "INPUT", type: "submit" } as unknown as EventTarget }))).toBe(false);
  });
});

describe("replacing an edited map (brief §6)", () => {
  it("says the brief's words", () => {
    expect(replacedText("Willow Bend")).toBe("Willow Bend is in Your maps. Undo to bring it back.");
  });
});
