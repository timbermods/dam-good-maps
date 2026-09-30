// The water simulation's exact bytes (PLAN §20 D130). The golden vectors (water.test.ts) compare
// with the Python reference within 1e-6; these digests pin every byte of the simulator's state, so
// a speedup that is not bit for bit identical fails here. The digests were computed with the
// simulator before the speedups (the loops they replace); never update them to accept a change.
// Each digest covers the depth, badwater share, outflow momentum and saturation after the run, and
// the canonical settle's water. The small grids cover the map edges (1×N, N×1, 2×2), dams, a seep
// switching off and on, badwater switching, droughts and scaled sources.
//
// They pin the port's rules as they were (`rules: "port"`): the speedups are proved on them. The
// game's rules (M9b, D293, D303, D308) change the bytes on purpose; their own digests are pinned
// beside them (GAME_FIXTURES, GAME_GRIDS), computed when the rules changed, so a later change to
// either shows here.

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
  // (D358: the two fixtures whose water never settles run their canonical settle to the new 6-day
  // limit; their 975 ticks are as they were, re-pinned 2026-10-01)
  seep_pit: "6db5c1595e91b09f",
  terraces: "6b332df084085727",
  confluence: "88f18f70071953e4",
  evaporation: "f0be98676869fc36",
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

/** The game's rules (D293, D303, D308), pinned when they replaced the port's in M9b (the same runs). */
const GAME_FIXTURES: Record<string, string> = {
  channel_sealed: "13d94e4e8e6975a2",
  channel_gap: "6e01e315258129f0",
  waterfall: "13a08c6b19709d4a",
  lake_sill: "e625b2523d491882",
  flat_plain: "447189b38f250f3e",
  badwater_mix: "1e83108f76337c5c",
  weir: "84da01e759d67044",
  // (D358, as above)
  seep_pit: "90f0cbe04aaba0fe",
  terraces: "9185cae3652d6a14",
  confluence: "3dee22750da62ea7",
  evaporation: "201c1efea94586f5",
  valley_basin: "00b29d342e1aa6c8",
};

const GAME_GRIDS: [number, number, string][] = [
  [1, 1, "b1796b2de7a60e56"],
  [1, 9, "52b7b43af3251ae3"],
  [9, 1, "a8439af4b30bfd65"],
  [2, 2, "a62ace51b7852bad"],
  [3, 7, "ac894c589ddc37c2"],
  [13, 11, "e33b457a7ddadcd4"],
  [24, 20, "85f688d808ccab49"],
];

function gridRun(W: number, H: number, rules: "game" | "port"): WaterSim {
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
  const sim = new WaterSim({ W, H, floor, dam, emitters }, { depth, contamination }, { rules });
  for (let t = 0; t < 256; t++) {
    emitters[1].contamination = t < 128 ? 1 : 0;
    sim.run(1, t < 64 ? 1 : t < 128 ? 0 : t < 192 ? 0.35 : 1);
  }
  return sim;
}

describe("the water simulation's bytes are pinned (PLAN §20 D130)", () => {
  it("every golden fixture is pinned", () => {
    expect(golden.fixtures.map((f) => f.name).sort()).toEqual(Object.keys(FIXTURES).sort());
  });

  it.each(golden.fixtures.map((f) => [f.name, f] as const))("%s: 975 ticks from empty, and the canonical settle", (name, f) => {
    const sim = new WaterSim(model(f), undefined, { rules: "port" });
    sim.run(975);
    const c = canonicalSettle(model(f), { rules: "port" });
    expect(digest(sim.D, sim.C, sim.out, sim.saturation(), c.depth, c.contamination, c.sat, c.out!)).toBe(FIXTURES[name]);
  });

  it.each(GRIDS)("a %i×%i grid: edges, a dam, a seep, badwater and droughts for 256 ticks", (W, H, pinned) => {
    const sim = gridRun(W, H, "port");
    expect(digest(sim.D, sim.C, sim.Dold, sim.out, sim.saturation())).toBe(pinned);
  });
});

describe("the game's rules' bytes are pinned (M9b; D293, D303, D308)", () => {
  it.each(golden.fixtures.map((f) => [f.name, f] as const))("%s: 975 ticks from empty, and the canonical settle", (name, f) => {
    const sim = new WaterSim(model(f), undefined, { rules: "game" });
    sim.run(975);
    const c = canonicalSettle(model(f), { rules: "game" });
    expect(digest(sim.D, sim.C, sim.out, sim.saturation(), c.depth, c.contamination, c.sat, c.out!)).toBe(GAME_FIXTURES[name]);
  });

  it.each(GAME_GRIDS)("a %i×%i grid: edges, a dam, a seep, badwater and droughts for 256 ticks", (W, H, pinned) => {
    const sim = gridRun(W, H, "game");
    expect(digest(sim.D, sim.C, sim.Dold, sim.out, sim.saturation())).toBe(pinned);
  });
});
