// The map's own words (item 7 of planning's queue, 2026-11-11): a generated map's description stops claiming what the
// seed made once its player changes the map by hand, and is marked until they keep or rewrite it; an export never
// carries the checks' notes.

import { describe, expect, it } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { MapSession } from "../../src/core/doc/session";
import { readTimber } from "../../src/core/format/timber";
import { makeSpec } from "../../src/core/spec/mapspec";

function session(): MapSession {
  return MapSession.fromGenerated(generate(makeSpec({ seed: 4242, size: { x: 96, y: 96 }, theme: "canyon" })));
}
const fileText = (s: MapSession) => String(readTimber(s.exportTimber().bytes).metadata?.MapDescription ?? "");

describe("the map's own words", () => {
  it("are the generator's until the map is changed by hand; then they drop its claims and are marked until kept or rewritten", () => {
    const s = session();
    const made = s.description();
    expect(made.stale).toBe(false);
    expect(fileText(s)).toContain(made.text.split(" Made with")[0]);
    expect(s.apply({ op: "sculpt", params: { mode: "raise", cells: [[5, 5, 8]], amount: 1 } }).ok).toBe(true);
    const edited = s.description();
    expect(edited.stale).toBe(true);
    expect(edited.written).toBe(false);
    // (what the generator said the map shows is gone from the words and from the file; what it is stays)
    for (const line of s.document.meta.says ?? []) {
      expect(edited.text).not.toContain(line);
      expect(fileText(s)).not.toContain(line);
    }
    expect(edited.text.startsWith("A 96×96 Canyon map.")).toBe(true);
    // kept: the words as they stand are the player's
    expect(s.apply({ op: "setDescription", params: { text: edited.text } }).ok).toBe(true);
    expect(s.description()).toMatchObject({ stale: false, written: true, text: edited.text });
    // undo of the edit and the keeping: the generator's words again
    s.undo();
    s.undo();
    expect(s.description()).toEqual(made);
  });
  it("an export's description never carries a check's note", () => {
    const s = session();
    expect(fileText(s)).not.toContain("Exported with");
  });
});
