// ROADMAP M8 (from the workshop study, D87; PLAN §11, D98; decisions-pending #36): maps whose water
// a steady state cannot show report their water and start checks as approximate, with the reason,
// in both validators. A cause (sources that turn on later or aquifers
// carrying a quarter of the clean water, seeps half of the running water, a start under a roof;
// caves are no cause since their water is simulated, D120)
// counts only with evidence that the settle disagrees with the map's own water. The rule's parts are
// tested where they run, in Rust (rust/checks/src/mechanics.rs, `cargo test -p checks`, D465); here,
// through validateMap.
//
// On the official maps (local only): none has an approximate check (Hollows, Pressure and Nomads had, for
// their caves, and Oasis, whose seep the stacked pre-fill filled to its pit's rim). The Python validator has
// no stacked engine (D279) and still names caves.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { entityJson, startingLocation, waterSource } from "../../src/core/format/entities";
import { mapMetadata, readTimber, type TimberFile } from "../../src/core/format/timber";
import { emptySimulationSingletons, GAME_VERSION, LAYERS, voxelsFromHeights } from "../../src/core/format/world";
import { mapObjects, waterModel } from "../../src/core/sim/model";
import type { CanonicalWater } from "../../src/core/sim/prefill";
import { validateMap } from "../../src/core/validate/checks";

/** The checks a steady state's water cannot answer for: the water checks and the start's. */
const approximateId = (id: string) => id.startsWith("water.") || /^start\.(dry|water|badwater|reach|food|wood|ruins_clear)$/.test(id);

const W = 20;
const H = 20;
const N = W * H;

/** Level 3 ground, a start whose middle is (10, 10), a running source and one that turns on later
 *  carrying 75% of the clean water. */
function file(): TimberFile {
  const heights = new Uint8Array(N).fill(3);
  const entities = [
    startingLocation({ id: "00000000-0000-4000-8000-000000000001", owner: "test", x: 9, y: 9, z: 3, orientation: "Cw0" }),
    waterSource({ id: "00000000-0000-4000-8000-000000000002", owner: "test", x: 2, y: 2, z: 3, strength: 1 }),
    waterSource({ id: "00000000-0000-4000-8000-000000000003", owner: "test", x: 3, y: 2, z: 3, strength: 3, timed: { enabled: true, cycles: 1, days: 2 } }),
  ];
  return {
    metadata: mapMetadata(W, H, "mechanics test"),
    thumbnail: null,
    versionTxt: GAME_VERSION + "\r\n",
    world: { gameVersion: GAME_VERSION, timestamp: "2026-10-05 00:00:00", sizeX: W, sizeY: H, layers: LAYERS, voxels: voxelsFromHeights(heights, W, H), singletons: emptySimulationSingletons(W, H), entities: entities.map(entityJson) },
    extraFiles: [],
  };
}

function approximate(depth: Float64Array, storedWet: Uint8Array) {
  const f = file();
  const model = waterModel(W, H, new Uint8Array(N).fill(3), mapObjects(f.world));
  const settled = { settled: true, ticks: 100, depth, contamination: new Float64Array(N), sat: new Uint8Array(N) } as CanonicalWater;
  const v = validateMap(f, { profile: "import", designedFor: "normal", storedWet, water: { model, settled } });
  return { reasons: v.mechanics!.reasons, approx: v.report.checks.filter((c) => c.approximate) };
}

describe("the approximate-water rule (D98)", () => {
  it("a cause counts only with evidence: the settle floods the start, or differs on 10% of the map", () => {
    const dry = new Float64Array(N);
    const stored = new Uint8Array(N);
    // the settle agrees with the map's own water: a cause, but not approximate
    const agree = approximate(dry, stored);
    expect(agree.reasons.join(" ")).toMatch(/turn on later carry 75%/);
    expect(agree.approx).toEqual([]);
    // the settle floods the start, which the map's water keeps dry
    const flooded = dry.slice();
    flooded[10 * W + 10] = 1;
    const f = approximate(flooded, stored);
    expect(f.approx.length).toBeGreaterThan(0);
    for (const c of f.approx) {
      expect(approximateId(c.id), c.id).toBe(true);
      expect(c.approximate).toMatch(/turn on later.*floods the start/);
    }
    // the settle is wet on 10% of the map where the map's water is dry
    const wide = dry.slice();
    for (let i = 0; i < 0.1 * N; i++) wide[i] = 1;
    expect(approximate(wide, stored).approx[0].approximate).toMatch(/differs from the map's own water on 10%/);
  });
});

const OFFICIAL = "investigation/raw/builtin";
const official = existsSync(OFFICIAL) ? readdirSync(OFFICIAL).filter((n) => n.endsWith(".timber") && !n.startsWith("_")).sort() : [];

describe("the official maps (local only)", () => {
  it.skipIf(official.length !== 19)("none of the 19 reports approximate checks: their caves' water is simulated and the settle agrees with each map's own water (D98 with D120)", () => {
    const flagged: string[] = [];
    for (const n of official) {
      const v = validateMap(readTimber(new Uint8Array(readFileSync(join(OFFICIAL, n)))), { profile: "import", designedFor: "normal" });
      const approx = v.report.checks.filter((c) => c.approximate);
      if (!approx.length) continue;
      flagged.push(n.replace(/\.timber$/, ""));
      for (const c of approx) {
        expect(approximateId(c.id), `${n} ${c.id}`).toBe(true);
        expect(c.ok).toBe(true);
        expect(c.message).toMatch(/^Approximate \(/);
        expect(c.approximate!.length).toBeGreaterThan(20);
      }
      // every water check that applies is approximate
      for (const c of v.report.checks) if (c.id.startsWith("water.") && c.applicable !== false) expect(c.approximate, `${n} ${c.id}`).toBeTruthy();
    }
    expect(flagged).toEqual([]);
  });
});
