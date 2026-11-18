// The name a map's files get (D443, amended 2026-11-18, Kyler: "I, as the user, would be benefiting from being able
// to choose the name of the file"): the map's name as the header shows it, kept as written; only what a file name
// can't hold on Windows, macOS or Linux is replaced, and a name that leaves nothing is refused. (Before 2026-11-18
// saved maps were `dgm-<theme>-<seed>` or `dgm-` and a lower-case slug of the name, D345 B10; this file pinned that,
// and is updated to the decision, D148.) A taken name gets a number in Save to Timberborn (platform.test.ts).

import { describe, expect, it } from "vitest";
import { fileStemOf, MAX_FILE_STEM, mapFileName, mapProjectFileName } from "../../src/core/format/fileName";
import { fileName } from "../../src/core/gen/pack";
import { makeSpec } from "../../src/core/spec/mapspec";

const stem = (name: string) => {
  const r = fileStemOf(name);
  if (!r.ok) throw new Error(`refused: ${r.reason}`);
  return r.stem;
};

describe("a map's file name is its name (D443)", () => {
  it("keeps the name as written: case, spaces, accents, brackets, other scripts", () => {
    expect(mapFileName("Old Loop Lakelands")).toBe("Old Loop Lakelands.timber");
    expect(mapFileName("Drumheller (Alberta)")).toBe("Drumheller (Alberta).timber");
    expect(mapFileName("Émile's dam")).toBe("Émile's dam.timber");
    expect(mapFileName("Two  spaces, kept")).toBe("Two  spaces, kept.timber");
    expect(mapFileName("ビーバーの谷")).toBe("ビーバーの谷.timber");
    expect(mapFileName("dgm-river-valley-5")).toBe("dgm-river-valley-5.timber");
    expect(mapFileName("v1.2 final")).toBe("v1.2 final.timber");
    expect(mapProjectFileName("Old Loop Lakelands")).toBe("Old Loop Lakelands.damgoodmaps.json");
  });

  it("replaces what a file name can't hold with one space", () => {
    expect(stem("Lakes: North / South")).toBe("Lakes North South");
    expect(stem('Who said "dam"?')).toBe("Who said dam");
    expect(stem("a\\b*c<d>e|f")).toBe("a b c d e f");
    expect(stem("tab\there\u0007bell")).toBe("tab here bell");
  });

  it("drops dots and spaces at the ends, and a .timber typed with the name", () => {
    expect(stem("The end.")).toBe("The end");
    expect(stem("Trailing. . ")).toBe("Trailing");
    expect(stem(".hidden")).toBe("hidden");
    expect(stem("My map.timber")).toBe("My map");
    expect(stem("My map.TIMBER ")).toBe("My map");
  });

  it("gives Windows' device names a word after them", () => {
    expect(stem("CON")).toBe("CON map");
    expect(stem("nul")).toBe("nul map");
    expect(stem("Com1")).toBe("Com1 map");
    expect(stem("lpt9.lake")).toBe("lpt9 map.lake");
    // (only the whole first part: a name that starts with one is fine)
    expect(stem("Console Valley")).toBe("Console Valley");
    expect(stem("Aux Lakes")).toBe("Aux Lakes");
  });

  it("refuses a name that leaves nothing, with a one-line reason", () => {
    for (const n of ["", "   ", "???", "...", ' / : * ? " < > | ', ".timber"]) {
      const r = fileStemOf(n);
      expect(r.ok, n).toBe(false);
      if (!r.ok) expect(r.reason).toMatch(/^A file can't be named with only dots, spaces or .*: use letters or digits$/);
    }
    expect(() => mapFileName("???")).toThrow(/use letters or digits/);
  });

  it("cuts a 200-character name to 150 characters, never ending on a space or dot", () => {
    const long = "Beaver ".repeat(29) + "Dam."; // 207 characters
    const s = stem(long.slice(0, 200));
    expect([...s].length).toBeLessThanOrEqual(MAX_FILE_STEM);
    expect(s).toBe(long.slice(0, 150).trimEnd());
    // (and to 200 bytes in UTF-8, so a name in another script still fits a Linux or macOS file name)
    const wide = stem("谷".repeat(200));
    expect(new TextEncoder().encode(wide).length).toBeLessThanOrEqual(200);
    expect(wide).toBe("谷".repeat(66));
  });

  it("a batch's file name (the tools' and probes') stays dgm-<theme>-<seed>", () => {
    expect(fileName(makeSpec({ seed: 4242, theme: "riverValley" }))).toBe("dgm-river-valley-4242.timber");
    expect(fileName(makeSpec({ seed: 3, theme: "any" }))).toBe("dgm-any-3.timber");
  });
});
