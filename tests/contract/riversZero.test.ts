// Rivers 0 (PLAN §5.3): no river enters by the map's edge; a spring feeds the main river. River
// Valley's own shaping draws one default trunk (D370), which must never override the player's 0
// (the nightly settings experiment found every River Valley map at Rivers 0 with an edge river).

import { describe, expect, it } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";

describe("Rivers 0: no river enters by the map's edge (PLAN §5.3)", () => {
  for (const seed of [1, 2])
    it(`River Valley 96² seed ${seed}: its main river rises from a spring`, () => {
      const s = makeSpec({ seed, theme: "riverValley", size: { x: 96, y: 96 } });
      s.settings.water.rivers = 0;
      const r = generate(s);
      expect(r.report.passed).toBe(true);
      const rivers = r.features.filter((f) => f.kind === "river");
      expect(rivers.length).toBeGreaterThan(0);
      expect(rivers.filter((f) => f.kind === "river" && "edge" in f.params.entry).map((f) => f.id)).toEqual([]);
    }, 300_000);
});
