// The side panel (docs/UI-BRIEF.md §3, §5; PLAN §20 D330): open on the first visit, then as it was
// left; Generate runs only on its button or Enter in the panel. Its dot is a core question
// (tests/contract/generateDot.test.ts). The component is exercised in tests/e2e/page-parts.spec.ts.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { generateOnEnter } from "../../src/page/panel/enter";
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
