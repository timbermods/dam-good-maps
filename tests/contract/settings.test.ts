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
  it.each(EXPERIMENTS.map((e) => [e.info ? `${e.setting} (information: ${e.info})` : e.setting, e] as const))("%s", (_, e) => {
    const o = runExperiment(e, seedsFor(e, SEEDS), SIZE);
    expect(o.ok, `${e.setting} (${e.values.join(" → ")}): ${e.target}; means ${o.means.map((m) => m.toFixed(e.digits ?? 0)).join(" → ")}; ${o.why}`).toBe(true);
    // every map of the experiment is still a valid map
    expect(o.failed, `${o.failed} maps failed a check`).toBe(0);
  });
});
