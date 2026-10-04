// ROADMAP M6: each setting moves its measured target in batch runs, a test per setting. Every
// experiment (tools/settings-suite.ts) generates the same seeds at two values of one setting, the
// rest at the theme's preset, and measures the target the setting maps to (PLAN §5) the way the
// official maps were measured (src/core/analysis/metrics.ts).
//
// CI runs 4 seeds at 96² per value, nightly (vitest's "heavy" project, vitest.config.ts), and 8
// for the experiments whose maps vary most from seed to seed (`minSeeds`, M9a);
// `npx tsx tools/settings-batch.ts --seeds 1-20` runs the same experiments on more seeds and prints
// the table in docs/progress.md. DGM_SETTINGS_SEEDS sets the seeds here (for example "1-12").

import { describe, expect, it } from "vitest";
import { EXPERIMENTS, runExperiment, seedsFor } from "../../tools/settings-suite";

function parseSeeds(s: string): number[] {
  const out: number[] = [];
  for (const part of s.split(",")) {
    const m = /^(\d+)-(\d+)$/.exec(part);
    if (m) for (let k = Number(m[1]); k <= Number(m[2]); k++) out.push(k);
    else out.push(Number(part));
  }
  return out;
}

const SEEDS = parseSeeds(process.env.DGM_SETTINGS_SEEDS ?? "1-4");
const SIZE = Number(process.env.DGM_SETTINGS_SIZE ?? 96);

describe("each setting moves its measured target (ROADMAP M6)", () => {
  // (an experiment that is information, D211, still runs: its maps must pass their checks)
  const check = (_: string, e: (typeof EXPERIMENTS)[number]) => {
    const o = runExperiment(e, seedsFor(e, SEEDS), SIZE);
    expect(o.ok, `${e.setting} (${e.values.join(" → ")}): ${e.target}; means ${o.means.map((m) => m.toFixed(e.digits ?? 0)).join(" → ")}; ${o.why}`).toBe(true);
    // every map of the experiment is still a valid map
    expect(o.failed, `${o.failed} maps failed a check`).toBe(0);
  };
  const name = (e: (typeof EXPERIMENTS)[number]) => (e.info ? `${e.setting} (information: ${e.info})` : e.setting);
  // D466: expected failures, the known shortfalls held for settings round 2 (docs/progress/m9b.md); each moves
  // back to the plain list when round 2 fixes it. "Designed for" is dropped when D449's core change removes it.
  const HELD = new Set(["Verticality", "Drought reserve", "Lakes and basins", "Waterfalls", "Designed for"]);
  it.each(EXPERIMENTS.filter((e) => !HELD.has(e.setting)).map((e) => [name(e), e] as const))("%s", check);
  it.fails.each(EXPERIMENTS.filter((e) => HELD.has(e.setting)).map((e) => [name(e), e] as const))("%s (expected failure, settings round 2)", check);
});
