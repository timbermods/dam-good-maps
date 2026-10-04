// A force's record never depends on how fast it was planned (PLAN §20 D366). The staged forces are
// planned in one call when they start (in Rust, D381) and never read the clock, so a busy machine takes
// the same steps as a quick one; the operation keeps the stages it shows (`total`), so the same gesture
// is the same operation on any machine.

import { afterEach, describe, expect, it, vi } from "vitest";
import { snapshotMap } from "../../src/core/forces/force";
import { CraterRun, EruptRun, QuakeRun, type StagedRun } from "../../src/core/forces/runs";
import { GlaciateRun } from "../../src/core/forces/glaciate/run";
import { CRATER_DEFAULTS } from "../../src/core/forces/craterize";
import { ERUPT_DEFAULTS } from "../../src/core/forces/erupt";
import { QUAKE_DEFAULTS } from "../../src/core/forces/quake";
import { GLACIATE_DEFAULTS } from "../../src/core/forces/glaciate/model";
import { stagedParamsOf, type ForceRecord } from "../../src/core/forces/result";
import { fixture } from "./forceFixtures";

const W = 96;
const path = [{ x: 30, y: 20 }, { x: 48, y: 44 }, { x: 70, y: 60 }];
const where = { origin: [48, 40] as [number, number] };
const cases: [ForceRecord["verb"], (m: ReturnType<typeof fixture>) => StagedRun, Record<string, unknown>][] = [
  ["craterize", (m) => new CraterRun(snapshotMap(m), { ...CRATER_DEFAULTS, power: 60, seed: 7 }, { origin: 40 * W + 48 }), where],
  ["erupt", (m) => new EruptRun(snapshotMap(m), { ...ERUPT_DEFAULTS, power: 60, seed: 7 }, { origin: 40 * W + 48 }), where],
  ["quake", (m) => new QuakeRun(snapshotMap(m), { ...QUAKE_DEFAULTS, power: 60, seed: 7 }, { side: 1, path }), { path: path.map((p) => [p.x, p.y]), side: 1 }],
  ["glaciate", (m) => new GlaciateRun(snapshotMap(m), { ...GLACIATE_DEFAULTS, power: 60, seed: 7 }, { origin: 12 * W + 60 }), { origin: [60, 12] }],
];

afterEach(() => vi.restoreAllMocks());

/** Runs to the end with a clock that moves `tick` ms each time it is read. */
function play(make: () => StagedRun, tick: number): { run: StagedRun; calls: number } {
  let clock = 0;
  const now = vi.spyOn(performance, "now").mockImplementation(() => (clock += tick));
  const run = make();
  while (!run.done) run.step();
  now.mockRestore();
  return { run, calls: run.steps };
}

describe("a force's record does not depend on how fast it was planned (D366)", () => {
  for (const [verb, make, at] of cases)
    it(verb, () => {
      const m = fixture("river", W);
      const quick = play(() => make(m), 0);
      const busy = play(() => make(m), 100);
      // the busy machine takes the same steps, and the record is the same
      expect(busy.calls).toBe(quick.calls);
      const rec = { verb, settings: (quick.run as unknown as { settings: never }).settings, where: at as never, cut: null };
      const a = stagedParamsOf(m, quick.run, rec);
      const b = stagedParamsOf(m, busy.run, rec);
      expect(a).not.toBeNull();
      expect(JSON.stringify(b)).toBe(JSON.stringify(a));
      expect(a!.steps).toBe(quick.run.total);
    });
});
