// The name a map's files get (D443, amended 2026-11-18, Kyler: "I, as the user, would be benefiting from being able
// to choose the name of the file"): the map's name as the header shows it, kept as written; only what a file name
// can't hold on Windows, macOS or Linux is replaced, and a name that leaves nothing is refused. (Before 2026-11-18
// saved maps were `dgm-<theme>-<seed>` or `dgm-` and a lower-case slug of the name, D345 B10; this file pinned that,
// and is updated to the decision, D148.) A taken name gets a number in Save to Timberborn (platform.test.ts).

import { describe, expect, it } from "vitest";
import { fileStemOf, MAX_FILE_STEM, mapFileName, mapProjectFileName, numberedFileName, numberedStem } from "../../src/core/format/fileName";
import { fileName } from "../../src/core/gen/pack";
import { makeSpec } from "../../src/core/spec/mapspec";

const stem = (name: string) => {
  const r = fileStemOf(name);
  if (!r.ok) throw new Error(`refused: ${r.reason}`);
  return r.stem;
};

describe("a numbered copy reads Name (2), not Name-2 (D443, amended 2026-11-18)", () => {
  it("is the stem and the number in brackets, from 2 on", () => {
    expect(numberedStem("Old Loop Lakelands", 2)).toBe("Old Loop Lakelands (2)");
    expect(numberedStem("Old Loop Lakelands", 3)).toBe("Old Loop Lakelands (3)");
    expect(numberedStem("Old Loop Lakelands", 12)).toBe("Old Loop Lakelands (12)");
    expect(numberedFileName("Old Loop Lakelands.timber", 2)).toBe("Old Loop Lakelands (2).timber");
    expect(numberedFileName("Old Loop Lakelands.damgoodmaps.json", 3)).toBe("Old Loop Lakelands.damgoodmaps (3).json");
    expect(numberedFileName("v1.2 final.timber", 2)).toBe("v1.2 final (2).timber");
    expect(numberedFileName("No extension", 2)).toBe("No extension (2)");
  });

  it("a name that already ends in (2) gets another: Name (2) (2), as the OS's own file manager does", () => {
    expect(numberedStem("Name (2)", 2)).toBe("Name (2) (2)");
    expect(numberedFileName("Name (2).timber", 3)).toBe("Name (2) (3).timber");
  });

  it("cuts the name, never the number, so the stem still fits the limit in characters and bytes", () => {
    const base = stem("Beaver ".repeat(29) + "Dam");
    expect([...base].length).toBeLessThanOrEqual(MAX_FILE_STEM);
    for (const n of [2, 9, 10, 99, 100, 12345]) {
      const s = numberedStem(base, n);
      expect(s.endsWith(" (" + n + ")"), String(n)).toBe(true);
      expect([...s].length, String(n)).toBeLessThanOrEqual(MAX_FILE_STEM);
      expect(s.includes("  ")).toBe(false);
    }
    // a name of exactly the limit loses just enough
    const full = "a".repeat(MAX_FILE_STEM);
    expect(numberedStem(full, 2)).toBe("a".repeat(MAX_FILE_STEM - 4) + " (2)");
    // (the cut never leaves a space or dot before the bracket: "…b. (2)" is not wanted)
    const spaced = "a".repeat(MAX_FILE_STEM - 5) + " b" + "c";
    expect(numberedStem(spaced, 2)).toBe("a".repeat(MAX_FILE_STEM - 5) + " (2)");
    // (and a name in another script fits the byte limit with its number)
    const wide = stem("谷".repeat(200));
    const wideTwo = numberedStem(wide, 2);
    expect(new TextEncoder().encode(wideTwo).length).toBeLessThanOrEqual(200);
    expect(wideTwo.endsWith(" (2)")).toBe(true);
    // the project file's name, with its longer extension, is still short of a path's limit
    expect(numberedFileName(mapProjectFileName(base), 123).length).toBeLessThan(255);
  });
});

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

  it("trims trailing dots and spaces before it takes off a typed .timber", () => {
    expect(stem("Lake.timber.")).toBe("Lake");
    expect(stem("Lake.timber ")).toBe("Lake");
    expect(stem("Lake.timber. . ")).toBe("Lake");
    expect(stem("Lake.TIMBER\t.")).toBe("Lake");
    // (only the one: a name that is "x.timber.timber" keeps its first)
    expect(stem("x.timber.timber")).toBe("x.timber");
  });

  it("counts CONIN$ and CONOUT$ among the device names, in any case", () => {
    expect(stem("CONIN$")).toBe("CONIN$ map");
    expect(stem("conout$")).toBe("conout$ map");
    expect(stem("ConIn$.lake")).toBe("ConIn$ map.lake");
    expect(stem("CONIN$ Valley")).toBe("CONIN$ Valley");
    expect(stem("CON")).toBe("CON map");
  });

  it("puts \" map\" after a device name before the length cut, so the result still fits", () => {
    // ("CON." then 200 more characters: the head is CON, the rest is cut, " map" stays)
    const s = stem("CON." + "a".repeat(200));
    expect(s.startsWith("CON map.")).toBe(true);
    expect([...s].length).toBe(MAX_FILE_STEM);
    expect(new TextEncoder().encode(s).length).toBeLessThanOrEqual(200);
    // (a cut that lands on the dot leaves "CON map", never the bare device name)
    expect(stem("CON." + "a".repeat(200)).split(".")[0]).toBe("CON map");
  });

  it("removes the marks that make a file name display reversed, without leaving a space", () => {
    expect(stem("Lake\u202Etxt.timber")).toBe("Laketxt");
    for (const c of ["\u202A", "\u202B", "\u202C", "\u202D", "\u202E", "\u2066", "\u2067", "\u2068", "\u2069", "\u200E", "\u200F"]) {
      expect(stem("Old" + c + "Lakes"), c.charCodeAt(0).toString(16)).toBe("OldLakes");
    }
    // (a name of nothing else is refused; a marked device name is still one)
    expect(fileStemOf("\u202E\u200F").ok).toBe(false);
    expect(stem("C\u200EON")).toBe("CON map");
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
