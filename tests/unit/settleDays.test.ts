// The canonical settle's limit (PLAN §10, D358: 6 game days, 4 before 2026-10-01). The settle stops at
// the first check that passes, so water that settles within 4 days settles on the same tick with the
// same bytes whatever the limit: on every golden fixture that settles, a settle given 4 days and one
// given 6 end alike, tick for tick and byte for byte.
import { readFileSync } from "node:fs";
import { gunzipSync, strFromU8 } from "fflate";
import { describe, expect, it } from "vitest";
import { prefill } from "../../src/core/sim/prefill";
import { SETTLE_DAYS, settle, TICKS_PER_DAY, WaterSim, type Emitter, type WaterModel } from "../../src/core/sim/water";

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

describe("the canonical settle's six days (D358)", () => {
  it("is six game days", () => {
    expect(SETTLE_DAYS).toBe(6);
  });

  it.each(golden.fixtures.map((f) => [f.name, f] as const))("%s: water that settles within 4 days ends the same with 6", (_, f) => {
    for (const rules of ["game", "port"] as const) {
      const m = model(f);
      const a = new WaterSim(m, prefill(m), { rules });
      const ra = settle(a, { maxDays: 4 });
      const b = new WaterSim(m, prefill(m), { rules });
      const rb = settle(b, { maxDays: SETTLE_DAYS });
      if (!ra.settled) {
        // (water still changing at 4 days runs on: it may settle later, or run to the new limit)
        expect(rb.ticks).toBeGreaterThan(4 * TICKS_PER_DAY);
        continue;
      }
      expect(rb).toEqual(ra);
      expect(Buffer.from(b.D.buffer).equals(Buffer.from(a.D.buffer))).toBe(true);
      expect(Buffer.from(b.C.buffer).equals(Buffer.from(a.C.buffer))).toBe(true);
      expect(Buffer.from(b.out.buffer).equals(Buffer.from(a.out.buffer))).toBe(true);
    }
  });
});
