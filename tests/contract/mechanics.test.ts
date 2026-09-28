// ROADMAP M8 (from the workshop study, D87; PLAN §11, D98; decisions-pending #36): maps whose water
// a steady state cannot show report their water and start checks as approximate, with the reason,
// in both validators. A cause (caves on 5%+ of tiles, sources that turn on later or aquifers
// carrying a quarter of the clean water, seeps half of the running water, a start under a roof)
// counts only with evidence that the settle disagrees with the map's own water.
//
// On the official maps (local only): Hollows, Pressure, Oasis and Nomads are approximate; every
// other map has no approximate check. The oracle (npm run oracle) checks the Python validator agrees.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { approximateId, approximateReason, mechanicsOf } from "../../src/core/analysis/mechanics";
import { readTimber } from "../../src/core/format/timber";
import type { MapObject } from "../../src/core/sim/model";
import { validateMap } from "../../src/core/validate/checks";

const W = 20;
const H = 20;
const N = W * H;

function source(strength: number, delayed = false, template = "WaterSource"): MapObject {
  return { template, x: 2, y: 2, z: 3, orientation: "Cw0", flipped: false, components: { WaterSource: { SpecifiedStrength: strength }, ...(delayed ? { TimeActivatedComponent: { IsEnabled: true } } : {}) } as MapObject["components"] };
}
const start: MapObject = { template: "StartingLocation", x: 9, y: 9, z: 3, orientation: "Cw0", flipped: false, components: {} };

describe("the approximate-water rule (D98)", () => {
  const floors = new Uint8Array(N).fill(1);
  const surface = new Uint8Array(N).fill(3);
  const ring: number[] = [];
  for (let y = 8; y <= 12; y++) for (let x = 8; x <= 12; x++) ring.push(y * W + x);

  it("names each cause, and needs none on a plain map", () => {
    expect(mechanicsOf([source(2), start], floors, surface, W, H).reasons).toEqual([]);
    expect(mechanicsOf([source(1), source(3, true), start], floors, surface, W, H).reasons.join(" ")).toMatch(/turn on later carry 75%/);
    expect(mechanicsOf([source(1), source(1, false, "Aquifer"), start], floors, surface, W, H).reasons.join(" ")).toMatch(/aquifers.*50%/);
    expect(mechanicsOf([source(1), source(1, false, "WaterSeep"), start], floors, surface, W, H).reasons.join(" ")).toMatch(/seeps.*50%/);
    const caves = floors.slice();
    for (let i = 0; i < 0.05 * N; i++) caves[i] = 2;
    expect(mechanicsOf([source(2), start], caves, surface, W, H).reasons.join(" ")).toMatch(/caves or overhangs cover 5%/);
    const roofed = surface.slice();
    roofed[10 * W + 10] = 7; // the start's middle is under a roof: its top surface is higher
    expect(mechanicsOf([source(2), start], floors, roofed, W, H).startUnderRoof).toBe(true);
  });

  it("a cause counts only with evidence: the settle floods the start, or differs on 10% of the map", () => {
    const m = mechanicsOf([source(1), source(3, true), start], floors, surface, W, H);
    const dry = new Float64Array(N);
    const stored = new Uint8Array(N);
    // the settle agrees with the map's own water: not approximate
    expect(approximateReason(m, dry, stored, ring)).toBeNull();
    // the settle floods the start, which the map's water keeps dry
    const flooded = dry.slice();
    flooded[10 * W + 10] = 1;
    expect(approximateReason(m, flooded, stored, ring)).toMatch(/turn on later.*floods the start/);
    // the settle is wet on 10% of the map where the map's water is dry
    const wide = dry.slice();
    for (let i = 0; i < 0.1 * N; i++) wide[i] = 1;
    expect(approximateReason(m, wide, stored, ring)).toMatch(/differs from the map's own water on 10%/);
    expect(approximateReason({ ...m, reasons: [] }, wide, stored, ring)).toBeNull();
    // a start under a roof is approximate on its own
    expect(approximateReason({ ...m, startUnderRoof: true, reasons: ["the start stands under a roof"] }, dry, stored, ring)).toBe("the start stands under a roof");
  });

  it("marks only the water checks and the start's playability checks", () => {
    for (const id of ["water.settles", "water.storage_possible", "start.dry", "start.water", "start.wood", "start.food", "start.badwater", "start.reach", "start.ruins_clear"]) expect(approximateId(id), id).toBe(true);
    for (const id of ["start.flat", "start.entrance", "start.count", "start.clear", "plants.survive", "resources.trees", "entities.placement"]) expect(approximateId(id), id).toBe(false);
  });
});

const OFFICIAL = "investigation/raw/builtin";
const official = existsSync(OFFICIAL) ? readdirSync(OFFICIAL).filter((n) => n.endsWith(".timber") && !n.startsWith("_")).sort() : [];

describe("the official maps (local only)", () => {
  it.skipIf(official.length !== 19)("Hollows, Pressure, Oasis and Nomads report their water and start checks as approximate, with the reason; the other 15 have none", () => {
    const flagged: string[] = [];
    for (const n of official) {
      const v = validateMap(readTimber(new Uint8Array(readFileSync(join(OFFICIAL, n)))), { profile: "import", designedFor: "normal" });
      const approx = v.report.checks.filter((c) => c.approximate);
      if (!approx.length) continue;
      flagged.push(n.replace(/\.timber$/, ""));
      for (const c of approx) {
        expect(approximateId(c.id), `${n} ${c.id}`).toBe(true);
        expect(c.ok).toBe(true);
        expect(c.message).toMatch(/^approximate \(/);
        expect(c.approximate!.length).toBeGreaterThan(20);
      }
      // every water check that applies is approximate
      for (const c of v.report.checks) if (c.id.startsWith("water.") && c.applicable !== false) expect(c.approximate, `${n} ${c.id}`).toBeTruthy();
    }
    expect(flagged).toEqual(["Hollows", "Nomads", "Oasis", "Pressure"]);
  });
});
