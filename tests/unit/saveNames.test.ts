// The names saved maps get (PLAN §20 D345, B10): dgm-<theme>-<seed>.timber, the theme the map has,
// a word seed made file-safe (lowercase, dashes), a real place or an opened file by its name as
// dgm-<name>; a taken name gets a number in Save to Timberborn (platform.test.ts).

import { describe, expect, it } from "vitest";
import { fileName, fileSlug, namedFile } from "../../src/core/gen/pack";
import { makeSpec } from "../../src/core/spec/mapspec";

describe("saved map names (D345, B10)", () => {
  it("a generated map: dgm, its theme, its seed", () => {
    expect(fileName(makeSpec({ seed: 4242, theme: "riverValley" }))).toBe("dgm-river-valley-4242.timber");
    expect(fileName(makeSpec({ seed: 7, theme: "lakeBasin" }))).toBe("dgm-lake-basin-7.timber");
    expect(fileName(makeSpec({ seed: 1, theme: "islands" }))).toBe("dgm-islands-1.timber");
    // (Surprise me: the map has no single theme)
    expect(fileName(makeSpec({ seed: 3, theme: "any" }))).toBe("dgm-any-3.timber");
  });
  it("a seed typed as a word is made file-safe: lowercase, dashes", () => {
    const spec = makeSpec({ seed: 99, theme: "canyon" });
    expect(fileName(spec, "Big Beaver!")).toBe("dgm-canyon-big-beaver.timber");
    expect(fileName(spec, "  Émile's dam  ")).toBe("dgm-canyon-emile-s-dam.timber");
    // (a word with nothing file-safe in it falls back to the seed's number)
    expect(fileName(spec, "!!!")).toBe("dgm-canyon-99.timber");
  });
  it("a real place or an opened file by its name", () => {
    expect(namedFile("Lake Powell")).toBe("dgm-lake-powell.timber");
    expect(namedFile("Mine")).toBe("dgm-mine.timber");
    // (a map saved by Dam Good Maps keeps its name)
    expect(namedFile("dgm-river-valley-5")).toBe("dgm-river-valley-5.timber");
    expect(namedFile("???")).toBe("dgm-map.timber");
  });
  it("slugs never leave a dash at either end or two together", () => {
    expect(fileSlug("--A  b__c--")).toBe("a-b-c");
  });
});
