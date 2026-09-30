// A tooltip is a short phrase that says what a control is for at a glance, then its key (PLAN §20 D351,
// as amended by D361): no second sentence, about 60 characters at most. The Playwright spec
// (tests/e2e/tooltips.spec.ts) checks every title on the rendered page; this checks the hints the tools,
// the forces and the shelf carry, where they are written.

import { describe, expect, it } from "vitest";
import { BRUSHES } from "../../src/editor/brushes";
import { SHELF } from "../../src/editor/shelfItems";
import { FORCES } from "../../src/editor/TopBar";

const MAX = 60;
const secondSentence = (t: string) => /[.!?][)"']?\s+[A-Z(]/.test(t);

function expectForm(what: string, words: string) {
  expect(secondSentence(words), `${what} has a second sentence: ${words}`).toBe(false);
  expect(words.length, `${what} is over ${MAX} characters: ${words}`).toBeLessThanOrEqual(MAX);
}

describe("tooltips are one short phrase", () => {
  it("each brush, with its name and key", () => {
    for (const b of BRUSHES) expectForm(b.name, `${b.name} (${b.key}): ${b.hint}`);
  });
  it("each force, with its name and key", () => {
    for (const f of FORCES) expectForm(f.name, `${f.name}${f.key ? ` (${f.key})` : ""}: ${f.hint ?? ""}`);
  });
  it("each shelf item, with its name, key and turn", () => {
    for (const it of SHELF) expectForm(it.name, `${it.name}${it.key ? ` (${it.key})` : ""}: ${it.hint}${it.turns ? " (R turns it)" : ""}`);
  });
  it("the check tells a second sentence from a file name", () => {
    expect(secondSentence("Raise the ground. Shift+scroll sets the level.")).toBe(true);
    expect(secondSentence("Open a .timber file (Ctrl+O)")).toBe(false);
  });
});
