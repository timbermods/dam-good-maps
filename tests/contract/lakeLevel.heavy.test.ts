// Lakes by number on a generated map (core/sim/sill.ts): the Lake Basin's main lake, 192², seed 3. Raised from 12 to 14
// it is refused, not walled into islets: its cheapest closure a level up stands far downstream, and the bank found at
// its outlet all the same leaves a plateau at 14 the lake would lie over and pour off. Cut to 10 it holds, down its
// river's own course.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { applyLakeLevel, planLakeLevel } from "../../src/core/doc/lakeLevel";
import { MapSession } from "../../src/core/doc/session";
import { generate } from "../../src/core/gen/generate";
import { GENERATOR_VERSION, makeSpec } from "../../src/core/spec/mapspec";

describe("Lakes by number on a generated map", () => {
  it("refuses the Lake Basin's lake at 14 where it would pour over a plateau at 14, and cuts it to 10", () => {
    const n = 192;
    const s = MapSession.fromGenerated(generate(makeSpec({ seed: 3, theme: "lakeBasin", size: { x: n, y: n } })));
    expect(planLakeLevel(s, 129, 111, 14).reason).toMatch(/^at level 14 the lake would also pour over land at its level at X \d+ · Y \d+: one bank can't hold it$/);
    const plan = planLakeLevel(s, 129, 111, 10);
    expect(plan.reason).toBeNull();
    expect(plan.sill).toBe("cut");
    expect(plan.surface).toBeGreaterThanOrEqual(10);
    expect(plan.surface).toBeLessThan(11);
    expect(applyLakeLevel(s, 129, 111, 10).errors).toEqual([]);
  }, 240_000);

  it("cuts the Canyon's lake down to its edge outlet, the notch reaching it", () => {
    // (Canyon 128², seed 1: the lake at X 50 · Y 85 drains off the map's edge at X 69 · Y 127; a bed rounded across the
    // low ground its line skipped once stopped short of it, the lake still spilling at 9)
    // (the map as generator 0.10.15 made it, saved, tests/fixtures/projects/canyon-128-1.damgoodmaps: made with that
    // generator's `MapSession.fromGenerated(generate(makeSpec({ seed: 1, theme: "canyon", size: { x: 128, y: 128 } })),
    // g.file).project()`, and opened as this generator's own, so it plays live with the same land and water. Since
    // generator 0.10.16's ground with grade, D148, no Canyon 128² of seeds 1–20 has a lake whose notch two levels down
    // reaches the map's edge: their lakes are smaller and spill onto rolling ground nearby)
    const bytes = new Uint8Array(readFileSync("tests/fixtures/projects/canyon-128-1.damgoodmaps"));
    const s = MapSession.open({ ...decodeProject(bytes), generatorVersion: GENERATOR_VERSION });
    const n = s.built.W;
    for (const level of [8, 7]) {
      const plan = planLakeLevel(s, 50, 85, level);
      expect(plan.reason, `level ${level}`).toBeNull();
      expect(plan.surface).toBeGreaterThanOrEqual(level);
      expect(plan.surface).toBeLessThan(level + 1);
      // (the notch reaches the map's edge)
      expect(plan.tiles.some((t) => t % n <= 1 || t % n >= n - 2 || t < 2 * n || t >= n * n - 2 * n), `level ${level}: the notch reaches the edge`).toBe(true);
    }
  }, 240_000);
});
