// The ground for minePair.test.ts: a start whose walk holds room for two mine sites only at the two
// ends of one level strip.
import type { BuildResult } from "../../src/core/features/build";
import { planExtras } from "../../src/core/gen/extras";
import { makeSpec } from "../../src/core/spec/mapspec";

const W = 96;
const H = 96;
const N = W * H;

/** Rugged land at 6 (knolls every few tiles: no level ground for a site) but for one level strip
 *  out in the start's walk, 7 tiles deep and 18 long: room for two sites only at its two ends. */
export function strip(): BuildResult {
  const heights = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) heights[y * W + x] = 6 + ((2 * x + 3 * y) % 5 === 0 ? 1 : 0);
  for (let y = 60; y < 67; y++) for (let x = 50; x < 68; x++) heights[y * W + x] = 6;
  return {
    W,
    H,
    heights,
    water: new Float64Array(N),
    contamination: new Float64Array(N),
    moisture: new Float64Array(N),
    channel: new Uint8Array(N),
    occupied: new Uint8Array(N),
    cache: { terrain: { protect: new Uint8Array(N) } },
    start: { x: 15, y: 15 },
    entities: [],
  } as unknown as BuildResult;
}

/** The mine sites a plan places (only the strip holds level ground for one). */
export function sitesOnStrip(seed: number): number {
  const objects = planExtras({ spec: makeSpec({ seed, theme: "highlands", size: { x: W, y: H } }), base: strip(), features: [], candidate: 0, attempt: 0 });
  return objects.filter((o) => o.params.kind === "mineSite").length;
}
