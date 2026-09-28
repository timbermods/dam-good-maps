// The water simulation's exact bytes (PLAN §20 D130). The golden vectors (water.test.ts) compare
// with the Python reference within 1e-6; these digests pin every byte of the simulator's state, so
// a speedup that is not bit for bit identical fails here. The digests were computed with the
// simulator before the speedups (the loops they replace); never update them to accept a change.
// Each digest covers the depth, badwater share, outflow momentum and saturation after the run, and
// the canonical settle's water. The small grids cover the map edges (1×N, N×1, 2×2), dams, a seep
// switching off and on, badwater switching, droughts and scaled sources.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gunzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { canonicalSettle } from "../../src/core/sim/prefill";
import { WaterSim, type Emitter, type WaterModel } from "../../src/core/sim/water";

interface Fixture {
  name: string;
  W: number;
  H: number;
  floor: number[];
  dam: number[] | null;
  emitters: Emitter[];
}

const golden = JSON.parse(strFromU8(gunzipSync(readFileSync("tests/golden/water.json.gz")))) as { fixtures: Fixture[] };

function model(f: Fixture): WaterModel {
  return { W: f.W, H: f.H, floor: Float64Array.from(f.floor), dam: f.dam ? Float64Array.from(f.dam) : null, emitters: f.emitters };
}

function digest(...arrays: ArrayBufferView[]): string {
  const h = createHash("sha256");
  for (const a of arrays) h.update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
  return h.digest("hex").slice(0, 16);
}

const FIXTURES: Record<string, string> = {
  channel_sealed: "aa07174a55ad6fdc",
  channel_gap: "af9ddf3be87ae665",
  waterfall: "edc49bdbcf69cdfe",
  lake_sill: "d453c37ebb8827f9",
  flat_plain: "eb0a04bb69195246",
  badwater_mix: "0fa56fd90115101c",
  weir: "e138b185a660f100",
  seep_pit: "94322825c33ec67b",
  terraces: "6b332df084085727",
  confluence: "88f18f70071953e4",
  evaporation: "b47b353b6bfbf696",
  valley_basin: "df68c726b64d9399",
};

const GRIDS: [number, number, string][] = [
  [1, 1, "07d728dc78ee75ad"],
  [1, 9, "52064885f33dfcaf"],
  [9, 1, "93e17e0cb77f6be1"],
  [2, 2, "1a96344d244be764"],
  [3, 7, "020bdeb88598de87"],
  [13, 11, "dfc45c27400ced53"],
  [24, 20, "7a89cde87fe10b98"],
];

describe("the water simulation's bytes are pinned (PLAN §20 D130)", () => {
  it("every golden fixture is pinned", () => {
    expect(golden.fixtures.map((f) => f.name).sort()).toEqual(Object.keys(FIXTURES).sort());
  });

  it.each(golden.fixtures.map((f) => [f.name, f] as const))("%s: 975 ticks from empty, and the canonical settle", (name, f) => {
    const sim = new WaterSim(model(f));
    sim.run(975);
    const c = canonicalSettle(model(f));
    expect(digest(sim.D, sim.C, sim.out, sim.saturation(), c.depth, c.contamination, c.sat, c.out!)).toBe(FIXTURES[name]);
  });

  it.each(GRIDS)("a %i×%i grid: edges, a dam, a seep, badwater and droughts for 256 ticks", (W, H, pinned) => {
    const N = W * H;
    const floor = Float64Array.from({ length: N }, (_, i) => (i * 13 + 7) % 5);
    const dam = Float64Array.from({ length: N }, (_, i) => (i % 7 === 0 ? 0.65 : -1));
    const depth = Float64Array.from({ length: N }, (_, i) => (i % 3 === 0 ? 0 : 0.01 + (i % 9) / 3));
    const contamination = Float64Array.from({ length: N }, (_, i) => (i % 4) / 3);
    const emitters: Emitter[] = [
      { cells: [0], strength: 2, contamination: 0, depthLimit: { anchor: 0, off: 0.8, on: 0.72 } },
      { cells: [N - 1], strength: 1, contamination: 1 },
      { cells: [W - 1, N - W], strength: 0.5, contamination: 0.5 },
    ];
    const sim = new WaterSim({ W, H, floor, dam, emitters }, { depth, contamination });
    for (let t = 0; t < 256; t++) {
      emitters[1].contamination = t < 128 ? 1 : 0;
      sim.run(1, t < 64 ? 1 : t < 128 ? 0 : t < 192 ? 0.35 : 1);
    }
    expect(digest(sim.D, sim.C, sim.Dold, sim.out, sim.saturation())).toBe(pinned);
  });
});
