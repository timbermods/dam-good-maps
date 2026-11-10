// Islands' sea reads as sea (#446, D498): the share of the sea at 5% badwater or more, as it settled and as the game
// plays it on. Shared by islandsCleanSea.test.ts (96²) and islandsCleanSea.heavy.test.ts (128², 256²).
//
// Before D498 the sea was the main water D476 steered the first badwater ditch into, and badwater reaching
// standing water mixes through the whole of it with nothing to carry it off: Islands 128² seed 7's sea stood at
// 10–20% over most of it and the page drew it warm brown (#236, 2026-10-15). D498 gives Islands no join and keeps
// every ditch out of the sea and the water joined to it; these tests hold that over seeds and sizes.
import { expect } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { makeSpec } from "../../src/core/spec/mapspec";
import { TICKS_PER_DAY, WaterSim } from "../../src/core/sim/water";

/** Badwater this strong or more reads as poisoned: the water's hue turns early by design (D496). */
export const BAD = 0.05;

/** The sea: the largest body of wet tiles (4-connected), the badwater's own pits and ditches left out (a
 *  ditch that runs past the sea to the edge touches it, and its water is its own). */
function seaOf(depth: ArrayLike<number>, own: Uint8Array, W: number, H: number): number[] {
  const N = W * H;
  const wet = (i: number) => depth[i] > 0.05 && !own[i];
  const seen = new Uint8Array(N);
  let best: number[] = [];
  for (let s = 0; s < N; s++) {
    if (seen[s] || !wet(s)) continue;
    const body = [s];
    seen[s] = 1;
    for (let k = 0; k < body.length; k++) {
      const c = body[k];
      const x = c % W;
      const y = (c - x) / W;
      for (const n of [x > 0 ? c - 1 : -1, x < W - 1 ? c + 1 : -1, y > 0 ? c - W : -1, y < H - 1 ? c + W : -1])
        if (n >= 0 && !seen[n] && wet(n)) {
          seen[n] = 1;
          body.push(n);
        }
    }
    if (body.length > best.length) best = body;
  }
  return best;
}

export interface SeaReading {
  /** Wet tiles in the sea. */
  tiles: number;
  /** The share of them at `BAD` or more. */
  bad: number;
}

/** Generates Islands at `size`² for `seed` and reads its sea as it settled, then after each of `days` more days of
 *  the game's water (none: the settled file alone). */
export function islandsSea(seed: number, size: number, days: number[] = []): { settled: SeaReading; played: SeaReading[]; sources: number } {
  const r = generate(makeSpec({ seed, theme: "islands", size: { x: size, y: size } }));
  expect(r.report.passed).toBe(true);
  const b = r.built;
  const { W, H } = b;
  const N = W * H;
  // the badwater's own water: each hollow's pit (within 8 tiles of its source, `land/hazards.ts`) and its ditch
  const own = new Uint8Array(N);
  let sources = 0;
  for (const f of r.features) {
    if (f.kind !== "setPiece" || f.params.kind !== "badwaterBasin") continue;
    sources++;
    const plan = f.params.plan as { x: number; y: number; outlet: number[] };
    for (let y = plan.y - 8; y <= plan.y + 10; y++) for (let x = plan.x - 8; x <= plan.x + 10; x++) if (x >= 0 && y >= 0 && x < W && y < H) own[y * W + x] = 1;
    for (let k = 0; k + 1 < plan.outlet.length; k += 2)
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = plan.outlet[k] + dx;
          const y = plan.outlet[k + 1] + dy;
          if (x >= 0 && y >= 0 && x < W && y < H) own[y * W + x] = 1;
        }
  }
  const read = (depth: ArrayLike<number>, cont: ArrayLike<number>): SeaReading => {
    const sea = seaOf(depth, own, W, H);
    let bad = 0;
    for (const i of sea) if (cont[i] >= BAD) bad++;
    return { tiles: sea.length, bad: bad / Math.max(1, sea.length) };
  };
  const settled = read(b.water, b.contamination);
  const played: SeaReading[] = [];
  if (days.length) {
    const sim = new WaterSim(b.waterModel, { depth: Float64Array.from(b.water), contamination: Float64Array.from(b.contamination) });
    if (b.settle.out && b.settle.out.length === sim.out.length) sim.setOut(b.settle.out);
    let at = 0;
    for (const d of days) {
      sim.run((d - at) * TICKS_PER_DAY);
      at = d;
      played.push(read(sim.D, sim.C));
    }
    sim.dispose();
  }
  return { settled, played, sources };
}
