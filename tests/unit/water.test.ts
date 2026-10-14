// Water golden vectors (PLAN §4, §15; ROADMAP M2 acceptance): the TypeScript port against the
// Python reference on fixed terrains (tools/export-fixtures.py), and against the game's own save.

import { existsSync, readFileSync } from "node:fs";
import { gunzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { readTimber } from "../../src/core/format/timber";
import { surfaceOf } from "../../src/core/format/world";
import { soilContamination } from "../../src/core/sim/contamination";
import { droughtStorage } from "../../src/core/sim/drought";
import { waterModelFromWorld } from "../../src/core/sim/model";
import { moisture } from "../../src/core/sim/moisture";
import { canonicalSettle, prefill } from "../../src/core/sim/prefill";
import { settle, TICKS_PER_DAY, WaterSim, type Emitter, type WaterModel } from "../../src/core/sim/water";

interface Fixture {
  name: string;
  W: number;
  H: number;
  floor: number[];
  dam: number[] | null;
  emitters: Emitter[];
  snapshots: { ticks: number; depth: number[]; contamination: number[] }[];
  moisture: number[];
  soilContamination: number[];
  prefill: { depth: number[]; contamination: number[] };
  canonical: { settled: boolean; ticks: number; depth: number[]; contamination: number[] };
  drought9: number[];
}

const golden = JSON.parse(strFromU8(gunzipSync(readFileSync("tests/golden/water.json.gz")))) as { fixtures: Fixture[] };

function model(f: Fixture): WaterModel {
  return { W: f.W, H: f.H, floor: Float64Array.from(f.floor), dam: f.dam ? Float64Array.from(f.dam) : null, emitters: f.emitters };
}

function maxDiff(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
}

describe.each(golden.fixtures.map((f) => [f.name, f] as const))("water fixture %s", (_, f) => {
  const m = model(f);
  const heights = Uint8Array.from(f.floor);

  it("matches the Python reference after 50, 200 and 975 ticks within 1e-6", () => {
    const sim = new WaterSim(m);
    let done = 0;
    for (const s of f.snapshots) {
      sim.run(s.ticks - done);
      done = s.ticks;
      expect(maxDiff(sim.D, s.depth), `depth at ${s.ticks}`).toBeLessThan(1e-6);
      expect(maxDiff(sim.C, s.contamination), `contamination at ${s.ticks}`).toBeLessThan(1e-6);
    }
    const M = moisture(heights, sim.D, sim.C, f.W, f.H);
    for (let i = 0; i < M.length; i++) expect(M[i] > 0, `moist mask at ${i}`).toBe(f.moisture[i] > 0);
    expect(maxDiff(M, f.moisture)).toBeLessThan(1e-6);
    expect(maxDiff(soilContamination(heights, sim.D, sim.C, f.W, f.H), f.soilContamination)).toBeLessThan(1e-6);
  });

  it("pre-fills and settles canonically like the reference", () => {
    const p = prefill(m);
    expect(maxDiff(p.depth, f.prefill.depth)).toBe(0);
    expect(maxDiff(p.contamination, f.prefill.contamination)).toBe(0);
    const c = canonicalSettle(m);
    expect(c.settled).toBe(f.canonical.settled);
    expect(c.ticks).toBe(f.canonical.ticks);
    expect(maxDiff(c.depth, f.canonical.depth)).toBeLessThan(1e-6);
    expect(maxDiff(droughtStorage(m, c.depth, 9), f.drought9)).toBeLessThan(1e-9);
  });
});

describe("drought (PLAN §10)", () => {
  // the analytic drought against the simulation with every source off, on the fixtures that hold
  // water in basins: within 5% of the stored volume
  it.each(["lake_sill", "valley_basin", "weir"])("%s: analytic storage within 5% of the simulated drought", (name) => {
    const f = golden.fixtures.find((x) => x.name === name)!;
    const m = model(f);
    const c = canonicalSettle(m);
    const days = 9;
    const kept = droughtStorage(m, c.depth, days);
    let analytic = 0;
    for (const v of kept) analytic += v;
    const sim = new WaterSim(m, { depth: c.depth, contamination: c.contamination });
    sim.run(days * TICKS_PER_DAY, 0);
    const simulated = sim.volume();
    expect(analytic).toBeGreaterThan(5); // a real store, not a film
    expect(Math.abs(simulated - analytic) / analytic).toBeLessThan(0.05);
  });
});

const SAVE = "investigation/raw/saves/generated-river-valley-day1-2.timber";

describe.skipIf(!existsSync(SAVE))("the game's own save (local only)", () => {
  it("975 ticks from empty reproduce the saved water within 0.001", () => {
    const file = readTimber(new Uint8Array(readFileSync(SAVE)));
    const w = file.world;
    const m = waterModelFromWorld(w, surfaceOf(w));
    const sim = new WaterSim(m);
    sim.run(975);
    const toks = String(((w.singletons.WaterMapNew as Record<string, unknown>).WaterColumns as { Array: string }).Array).split(" ");
    let worst = 0;
    let wetSaved = 0;
    let wetSim = 0;
    for (let i = 0; i < w.sizeX * w.sizeY; i++) {
      const d = toks[i] === "0" ? 0 : Number(toks[i].split(":")[0]);
      worst = Math.max(worst, Math.abs(d - sim.D[i]));
      if (d > 0) wetSaved++;
      if (sim.D[i] > 0) wetSim++;
    }
    expect(worst).toBeLessThan(0.001);
    expect(wetSim).toBe(wetSaved);
  });
});

describe("maps need not hold their water (D152)", () => {
  // a channel from a spring at its west end, stepping down to the east edge, where its water leaves
  // the map: the settle is steady while the source keeps pouring and the water keeps leaving
  const W = 40;
  const H = 12;
  const floor = new Float64Array(W * H).fill(8);
  for (let y = 5; y <= 6; y++) for (let x = 1; x < W; x++) floor[y * W + x] = 5 - Math.floor(x / 14);
  const m: WaterModel = { W, H, floor, dam: null, emitters: [{ cells: [5 * W + 2, 6 * W + 2], strength: 2, contamination: 0 }] };

  it("a steady flow off the map is steady: the canonical settle settles, and the water keeps leaving", () => {
    const c = canonicalSettle(m);
    expect(c.settled).toBe(true);
    const sim = new WaterSim(m, { depth: c.depth, contamination: c.contamination });
    const before = sim.volume();
    sim.run(TICKS_PER_DAY);
    const poured = 2 * 0.6 * TICKS_PER_DAY; // 2 blocks a second for a day of 0.6 s ticks
    // what the source poured in a day left the map: the water on it hardly changed
    expect(Math.abs(sim.volume() - before)).toBeLessThan(0.01 * poured);
    expect(before).toBeLessThan(0.2 * poured);
  });

  it("what fails is water that never settles: from empty, a few checks are not enough", () => {
    const sim = new WaterSim(m);
    expect(settle(sim, { maxDays: 128 / TICKS_PER_DAY }).settled).toBe(false);
  });
});
