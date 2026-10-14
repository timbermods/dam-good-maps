// The shortcuts panel's list is read from the editor's own tool lists, so a new tool or force shows up by itself.

import { describe, expect, it } from "vitest";
import { BRUSHES } from "../../src/editor/brushes";
import { shortcutGroups } from "../../src/editor/help/shortcuts";
import { SHOWN_FORCES } from "../../src/editor/TopBar";

describe("the shortcuts list", () => {
  const rows = shortcutGroups().flatMap((g) => g.rows);
  const keys = new Set(rows.flatMap((r) => r.keys));
  it("lists every brush's key and every shown force's key", () => {
    for (const b of BRUSHES) expect(keys.has(b.key), b.name).toBe(true);
    for (const f of SHOWN_FORCES) if (f.key) expect(keys.has(f.key), f.name).toBe(true);
  });
  it("has the five groups, each with lines that name what they do", () => {
    expect(shortcutGroups().map((g) => g.title)).toEqual(["Tools", "Brushes, forces and items", "With the mouse", "View", "Editing"]);
    for (const r of rows) {
      expect(r.what.length).toBeGreaterThan(0);
      expect(r.keys.length).toBeGreaterThan(0);
    }
    expect(keys.has("?")).toBe(true);
  });
});
