// An eruption's lava shows with ridges or without (D356: a force always has a visible effect). Ridges shapes the
// land along the flows; whether the flows glow is not its business. With Ridges off the heat on the ground was a
// faint disc (14% at most outside the vent), so on Auto, where the land and the seed draw Ridges (D309), half the
// eruptions ended with no lava to see.

import { describe, expect, it } from "vitest";
import { fixture } from "../../investigation/erupt/maps";
import { ERUPT_DEFAULTS, EruptPlan, type EruptSettings } from "../../src/core/forces/erupt";
import type { FullForceMap } from "../../src/core/forces/force";

const W = 128;
const CENTRE = 64 * W + 64;

/** The tiles whose heat glows as lava (the mask's red, over half), outside the vent's own glow. */
function lavaTiles(p: EruptPlan): number {
  let n = 0;
  for (let i = 0; i < W * W; i++) if (p.heat[i * 4] > 128 && Math.hypot((i % W) - 64, Math.floor(i / W) - 64) > p.anatomy.radius * 0.22) n++;
  return n;
}

describe("Erupt's lava", () => {
  it("glows along its flows with Ridges off as with Ridges on, light flows and heavy, each summit", () => {
    for (const flows of ["light", "heavy"] as const)
      for (const summit of ["peak", "crater", "caldera"] as const) {
        const plan = (ridges: boolean) => {
          const m = fixture("plain", W);
          return new EruptPlan(m as unknown as FullForceMap, { ...ERUPT_DEFAULTS, power: 70, flows, summit, ridges, seed: 890 } as EruptSettings, { origin: CENTRE });
        };
        const on = lavaTiles(plan(true));
        const off = lavaTiles(plan(false));
        const what = `${flows}, ${summit}: ${off} tiles off, ${on} on`;
        expect(on, what).toBeGreaterThan(50);
        expect(off, what).toBe(on);
      }
  });
});
