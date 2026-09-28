// Benchmarks.
//
//   npx tsx tools/bench.ts [--size 128] [--seeds 1-10] [--budget 3000] [--theme riverValley]
//     Generation time (ROADMAP M1 acceptance: 128² in under 3 s): every map's max must be under
//     the budget.
//
//   npx tsx tools/bench.ts --water [--size 256] [--seeds 1-10] [--budget 3000] [--theme riverValley]
//     The canonical water settle alone (ROADMAP M2: the budget of PLAN §10, ≤ 3 s at 256² and
//     ≤ 0.6 s at 128²): the water model of each generated map, pre-filled and settled from scratch.
//     The median must be under the budget; the max is reported.
//
//   --info: the budget is information, not a gate (CI, where runners are slower and shared): the
//     time is recorded (tools/timings.ts) and the exit code says only whether every map generated.

import { generate } from "../src/core/gen/generate";
import { canonicalSettle } from "../src/core/sim/prefill";
import { makeSpec, type ThemeId } from "../src/core/spec/mapspec";
import { recordTiming } from "./timings";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const water = process.argv.includes("--water");
const info = process.argv.includes("--info");
const size = Number(arg("size", water ? "256" : "128"));
const [a, b] = arg("seeds", "1-10").split("-").map(Number);
const budget = Number(arg("budget", water ? (size >= 256 ? "3000" : "600") : "3000"));
const theme = arg("theme", "riverValley") as ThemeId;
const spec = (seed: number) => makeSpec({ seed, size: { x: size, y: size }, theme });

const times: number[] = [];
const ticks: number[] = [];
if (water) {
  // warm up the JIT on a map of the same size
  canonicalSettle(generate(spec(0)).built.waterModel);
  for (let seed = a; seed <= (b ?? a); seed++) {
    const model = generate(spec(seed)).built.waterModel;
    const t0 = performance.now();
    const w = canonicalSettle(model);
    times.push(performance.now() - t0);
    ticks.push(w.ticks);
    if (!w.settled) console.log(`seed ${seed}: did not settle in 4 days`);
  }
} else {
  generate(spec(0)); // warm up the JIT
  for (let seed = a; seed <= (b ?? a); seed++) {
    const t0 = performance.now();
    const r = generate(spec(seed));
    times.push(performance.now() - t0);
    if (!r.report.passed) {
      console.log(`seed ${seed}: generation failed`);
      process.exit(1);
    }
  }
}
const order = times.map((t, k) => [t, k] as const).sort((x, y) => x[0] - y[0]);
const median = order[order.length >> 1][0];
const max = order[order.length - 1][0];
const what = water ? "canonical water settle" : "generation";
const tickText = water ? `, ${Math.min(...ticks)}–${Math.max(...ticks)} ticks (median ${ticks.slice().sort((x, y) => x - y)[ticks.length >> 1]})` : "";
console.log(`${what}, ${theme}, ${size}×${size}, ${times.length} seeds: median ${Math.round(median)} ms, max ${Math.round(max)} ms${tickText} (budget ${budget} ms)`);
const gated = water ? median : max;
if (info) {
  recordTiming({ what: `${what}, ${theme} ${size}², ${water ? "median" : "max"} of ${times.length} seeds`, ms: gated, budget });
  process.exit(0);
}
process.exit(gated < budget ? 0 : 1);
