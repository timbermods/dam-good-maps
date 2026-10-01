// A tooltip is a short phrase that says what a control is for at a glance, then its key at the end as a small key
// cap (PLAN §20 D351, as amended by D361 and D368 (6)): no second sentence, about 60 characters at most, never a key
// in brackets. The Playwright spec (tests/e2e/tooltips.spec.ts) checks every title on the rendered page; this checks
// the hints the tools, the forces and the shelf carry, where they are written, and the one tooltip's keys.

import { describe, expect, it } from "vitest";
import { BRUSHES } from "../../src/editor/brushes";
import { SHELF, shelfTip } from "../../src/editor/shelfItems";
import { brushTip, FORCES, forceTip, SELECT_TIP, SIZE_KEYS, STRENGTH_KEYS } from "../../src/editor/TopBar";
import { KEY_SEP, keyParts, tip } from "../../src/ui/Tooltip";

const MAX = 60;
const secondSentence = (t: string) => /[.!?][)"']?\s+[A-Z(]/.test(t);
/** A key in brackets: "(7)", "(Ctrl+Z)", "(F, [ and ])", "(X or Esc)", "(R turns it)"; "(48 to 256)" is no key. */
const KEY_WORD = /\b(Ctrl|Shift|Alt|Esc|Space|Delete|Enter|Tab|Up|Down|scroll|click)\b/;
const bracketedKey = (t: string) => [...t.matchAll(/\(([^)]*)\)/g)].some(([, inner]) => /^\s*\S\s*$/.test(inner) || KEY_WORD.test(inner) || /[[\]{}]/.test(inner) || /(^|\s)[A-Z0-9](,|\s|$)/.test(inner));
const keysOf = (t: { "data-keys"?: string }) => (t["data-keys"] ? t["data-keys"].split(KEY_SEP) : []);

function expectForm(what: string, t: { title: string; "data-keys"?: string }, key?: string) {
  expect(secondSentence(t.title), `${what} has a second sentence: ${t.title}`).toBe(false);
  expect(t.title.length, `${what} is over ${MAX} characters: ${t.title}`).toBeLessThanOrEqual(MAX);
  expect(bracketedKey(t.title), `${what} has a key in brackets: ${t.title}`).toBe(false);
  expect(t.title.charAt(0), `${what} starts as a phrase: ${t.title}`).toBe(t.title.charAt(0).toUpperCase());
  // (its key, where it has one, a cap at the end: the first of its keys)
  if (key) expect(keysOf(t)[0], `${what}'s key cap`).toBe(key);
  else expect(keysOf(t).every((k) => keyParts(k).cap !== ""), what).toBe(true);
}

describe("tooltips are one short phrase, the key a cap at the end (D368 (6))", () => {
  it("each brush and Select, with its key", () => {
    for (const b of BRUSHES) expectForm(b.name, brushTip(b), b.key);
    expectForm("Select", SELECT_TIP, "M");
    expect(brushTip(BRUSHES.find((b) => b.tool === "smooth")!)).toEqual({ title: "Smooth bumps and steps", "data-keys": "4" });
  });
  it("each force, with its key", () => {
    for (const f of FORCES) expectForm(f.name, forceTip(f), f.key);
    expect(forceTip(FORCES.find((f) => f.id === "carve")!)).toEqual({ title: "Carve a river", "data-keys": "7" });
  });
  it("each shelf item, with its key and R's turn", () => {
    for (const it of SHELF) {
      const t = shelfTip(it);
      expectForm(it.name, t, it.key);
      expect(keysOf(t).includes("R turns it"), it.name).toBe(it.turns);
    }
  });
  it("Size's keys are F and { }, strength's and Power's F+scroll and [ ] (D368 (1), (11))", () => {
    expect(SIZE_KEYS).toEqual(["F", "{", "}"]);
    expect(STRENGTH_KEYS).toEqual(["F+scroll", "[", "]"]);
  });
  it("a key's cap and its words; no key, no cap", () => {
    expect(keyParts("V flips it")).toEqual({ cap: "V", words: "flips it" });
    expect(keyParts("Ctrl+Z")).toEqual({ cap: "Ctrl+Z", words: "" });
    expect(tip("Frame the whole map again")).toEqual({ title: "Frame the whole map again" });
    expect(tip("Undo", "Z", null, false, "Ctrl+Z")).toEqual({ title: "Undo", "data-keys": "Z|Ctrl+Z" });
  });
  it("the checks tell a second sentence from a file name, and a key in brackets from a number", () => {
    expect(secondSentence("Raise the ground. Shift+scroll sets the level.")).toBe(true);
    expect(secondSentence("Open a .timber file")).toBe(false);
    for (const t of ["Carve (7): carve a river", "Take all of it back (Ctrl+Z)", "How wide it cuts (F, [ and ])", "Put it down (X or Esc)", "Pine: plant pines (R turns it)", "How hard it cuts ({ and })"]) expect(bracketedKey(t), t).toBe(true);
    expect(bracketedKey("The map's width in tiles (48 to 256)")).toBe(false);
  });
});
