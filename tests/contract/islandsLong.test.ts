// Islands on a long map (D357, the shapes audit of 2026-10-24): its sea was one rectangle in a thin frame of land
// (the look D417 rejected) holding rows of pebble islets, and some seas drained as they settled. The sea is drawn
// inside the map now (`land/genome.ts` `inBasin`), its islands sized by the area, and a long Islands map's land
// waits for its sea to settle (`gen/generate.ts` `DRAINED_SEA`).
import { describe, expect, it } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { islandToExpandTo } from "../../src/core/land/islands";
import { makeSpec } from "../../src/core/spec/mapspec";

describe("Islands on a long map", () => {
  it("holds its sea as it settled, its coast its own rather than a frame along the edges, and an island to settle", () => {
    const [W, H] = [80, 250];
    const N = W * H;
    let shown = 0;
    const r = generate(makeSpec({ seed: 3, theme: "islands", size: { x: W, y: H } }), { onLand: () => shown++ });
    expect(r.report.passed).toBe(true);
    expect(shown).toBe(1);
    let wet = 0;
    for (let i = 0; i < N; i++) if (r.built.water[i] > 0.05) wet++;
    // (the sea settled: Islands' long maps planned 45–65% and two of them drained to 28% and 5%)
    expect(wet / N).toBeGreaterThan(0.35);
    // (the ring four tiles in from the edge: the framed sea ran along 30–55% of it, the drawn coast 12–40%)
    let ring = 0;
    let ringWet = 0;
    for (let y = 4; y < H - 4; y++)
      for (let x = 4; x < W - 4; x++) {
        if (Math.min(x, y, W - 1 - x, H - 1 - y) !== 4) continue;
        ring++;
        if (r.built.water[y * W + x] > 0.05) ringWet++;
      }
    expect(ringWet / ring).toBeLessThan(0.45);
    // (the promise's island, 150 tiles at 128², by area: on 3–6 of 12 long maps before)
    expect(islandToExpandTo(r.built.heights, r.built.water, W, H)).toBeGreaterThanOrEqual((150 * N) / (128 * 128));
  });
});
