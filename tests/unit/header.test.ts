// The editor's quiet dot and first run (PLAN §20 D184): the dot's tone and words; the first run's
// three hints, each gone once done.

import { describe, expect, it } from "vitest";
import { loadFirstRun, saveFirstRun } from "../../src/editor/FirstRun";
import { dotOf } from "../../src/editor/Header";
import type { CheckItem, ExportCheck } from "../../src/worker/session";

const item = (id: string): CheckItem => ({ id, message: id, class: "load" }) as unknown as CheckItem;
const check = (blocking: number, warnings: number): ExportCheck => ({ blocking: Array.from({ length: blocking }, (_, k) => item(`b${k}`)), warnings: Array.from({ length: warnings }, (_, k) => item(`w${k}`)), advisory: [], existing: [], checks: 45, version: 1 }) as unknown as ExportCheck;

describe("the quiet dot", () => {
  it("is grey while checking, green when all is well, amber with a count otherwise", () => {
    expect(dotOf({ check: null, instant: [], busy: false, progress: null, flowing: null }).tone).toBe("wait");
    expect(dotOf({ check: check(0, 0), instant: [], busy: false, progress: null, flowing: null })).toEqual({ tone: "ok", words: "Ready to play", count: 0 });
    expect(dotOf({ check: check(1, 1), instant: [], busy: false, progress: null, flowing: null })).toEqual({ tone: "warn", words: "2 things to look at", count: 2 });
    // what an edit just made shows at once, before the background check
    expect(dotOf({ check: null, instant: [item("start.entrance")], busy: true, progress: null, flowing: null })).toEqual({ tone: "warn", words: "1 thing to look at", count: 1 });
  });
});

describe("the first run", () => {
  it("remembers the steps done, and is over after the three", () => {
    const store = new Map<string, string>();
    const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const was = (globalThis as { localStorage?: unknown }).localStorage;
    (globalThis as { localStorage?: unknown }).localStorage = ls;
    try {
      expect(loadFirstRun().size).toBe(0);
      saveFirstRun(new Set(["paint"]));
      expect([...loadFirstRun()]).toEqual(["paint"]);
      saveFirstRun(new Set(["paint", "place", "water"]));
      expect(store.get("dgm.firstRun")).toBe("done");
      expect(loadFirstRun().size).toBe(3);
    } finally {
      (globalThis as { localStorage?: unknown }).localStorage = was;
    }
  });
});
