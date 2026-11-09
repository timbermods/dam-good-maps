// No window between two waters on the generated maps the review of #867 counted open edges on (waterSkirts.test.ts):
// 27 on Canyon 3 and 25 on Highlands 2 at 256², and 12 on Canyon 2 at 128² (its narrow badwater fall at tile 31,119),
// before the skirts. Heavy: generating them takes a minute or two.

import { describe, expect, it } from "vitest";
import type { ThemeId } from "../../src/core/spec/mapspec";
import { openEdgesOn } from "../fixtures/openWaterEdges";

describe("no window between two waters, on generated maps", () => {
  const maps: [ThemeId, number, number][] = [
    ["canyon", 256, 3],
    ["highlands", 256, 2],
    ["canyon", 128, 2],
  ];
  it.each(maps)("%s %i² seed %i: no open edge", (theme, size, seed) => expect(openEdgesOn(theme, size, seed)).toEqual([]));
});
