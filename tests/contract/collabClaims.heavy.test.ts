// Every force against the claims' bands (nightly; the quick run keeps one Craterize, one aimed Carve and
// Try another): for each force at small and large Power, on two maps, what the host will record as written
// (#397's touchesOf plus the generated trees) is inside the plan's footprint and inside the cautious band of
// the gesture, whether it is read from the operation's record or from the page's request. The bands are
// derived from the planners' constants (footprint.ts `corridor`); this holds them to the real plans.

import { beforeAll, describe, expect, it } from "vitest";
import { MapSession } from "../../src/core/doc/session";
import { DEFAULTS as CARVE_DEFAULTS } from "../../src/core/forces/carve/run";
import { CRATER_DEFAULTS } from "../../src/core/forces/craterize";
import { DEPOSIT_DEFAULTS } from "../../src/core/forces/deposit";
import { ERUPT_DEFAULTS } from "../../src/core/forces/erupt";
import { GLACIATE_DEFAULTS } from "../../src/core/forces/glaciate/model";
import { QUAKE_DEFAULTS } from "../../src/core/forces/quake";
import { RIFT_DEFAULTS } from "../../src/core/forces/rift";
import { generate } from "../../src/core/gen/generate";
import { makeSpec, type ThemeId } from "../../src/core/spec/mapspec";
import * as ed from "../../src/worker/session";
import { holdForce } from "./collabClaimsForces";

const W = 64;

function cases(): ed.ForceRequest[] {
  const out: Record<string, unknown>[] = [];
  for (const power of [10, 40, 80, 100]) {
    for (const at of [[22, 22], [44, 40]] as [number, number][]) {
      out.push({ verb: "craterize", settings: { ...CRATER_DEFAULTS, power }, origin: at, cut: null });
      out.push({ verb: "craterize", settings: { ...CRATER_DEFAULTS, mode: "aim", power, rays: true }, origin: at, end: [at[0] + 14, at[1] + 6], cut: null });
      out.push({ verb: "craterize", settings: { ...CRATER_DEFAULTS, power, debris: "light" }, origin: at, cut: null });
      out.push({ verb: "erupt", settings: { ...ERUPT_DEFAULTS, power }, origin: at, cut: null });
      out.push({ verb: "erupt", settings: { ...ERUPT_DEFAULTS, power, flows: "light" }, origin: at, cut: null });
      out.push({ verb: "erupt", settings: { ...ERUPT_DEFAULTS, mode: "fissure", power }, origin: at, path: [{ x: at[0] - 8, y: at[1] }, { x: at[0] + 8, y: at[1] + 3 }], cut: null });
      out.push({ verb: "rift", settings: { ...RIFT_DEFAULTS, power, size: 22 }, path: [{ x: at[0], y: at[1] }, { x: at[0] + 12, y: at[1] + 10 }], cut: null });
      out.push({ verb: "deposit", settings: { ...DEPOSIT_DEFAULTS, power, size: 20 }, path: [{ x: at[0], y: at[1] }, { x: at[0] + 12, y: at[1] + 10 }], cut: null });
      out.push({ verb: "carve", settings: { ...CARVE_DEFAULTS, mode: "unleash", power }, origin: at, cut: null });
      out.push({ verb: "carve", settings: { ...CARVE_DEFAULTS, mode: "aim", power }, origin: at, end: [at[0] + 20, at[1] + 5], cut: null });
      out.push({ verb: "carve", settings: { ...CARVE_DEFAULTS, mode: "aim", power, banks: 10 }, origin: at, end: [at[0] + 16, at[1] + 4], via: [[at[0] + 8, at[1] - 6]], cut: null });
      for (const side of [1, -1] as const) {
        const path = [{ x: at[0] - 15, y: at[1] }, { x: at[0] + 15, y: at[1] + 3 }];
        out.push({ verb: "quake", settings: { ...QUAKE_DEFAULTS, power }, path, side, cut: null });
        out.push({ verb: "quake", settings: { ...QUAKE_DEFAULTS, mode: "slide", power }, path, side, cut: null });
        // (a short line: 8 tiles, whose claim band is its margin and a slide's travel)
        const short = [{ x: at[0] - 4, y: at[1] }, { x: at[0] + 4, y: at[1] + 1 }];
        out.push({ verb: "quake", settings: { ...QUAKE_DEFAULTS, power }, path: short, side, cut: null });
        out.push({ verb: "quake", settings: { ...QUAKE_DEFAULTS, mode: "slide", power }, path: short, side, cut: null });
      }
      out.push({ verb: "glaciate", settings: { ...GLACIATE_DEFAULTS, power }, origin: at, cut: null });
      out.push({ verb: "glaciate", settings: { ...GLACIATE_DEFAULTS, mode: "aim", power }, origin: at, end: [at[0] + 20, at[1] + 5], via: [[at[0] + 10, at[1] + 8]], cut: null });
    }
  }
  return out as unknown as ed.ForceRequest[];
}

describe.each([
  ["highlands", 5],
  ["riverValley", 3],
] as [ThemeId, number][])("every force's plan and band on %s", (theme, seed) => {
  beforeAll(() => {
    const bytes = MapSession.fromGenerated(generate(makeSpec({ seed, theme, size: { x: W, y: W } }))).project();
    ed.openProject(bytes);
  }, 300_000);

  it("holds", () => {
    let seen = 0;
    for (const req of cases()) if (holdForce(req)) seen++;
    expect(seen).toBeGreaterThanOrEqual(80);
  }, 1_200_000);
});
