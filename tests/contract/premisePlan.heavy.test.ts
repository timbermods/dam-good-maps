// The lake stair's plans on seeds 1 to 200 at 128², 192² and 256² (docs/PREMISES.md §7, build step 1): every one holds
// every `plan` invariant within PLAN_TRIES attempts, so the premise never sends a spec it is eligible for to the
// themes' path for want of a plan. Prints the attempts it took and the time a plan.

import { describe, expect, it } from "vitest";
import { failing, firstPlan } from "../../src/core/premise/draw";
import { lakeStair } from "../../src/core/premise/premises/lakeStair";
import { makeSpec } from "../../src/core/spec/mapspec";

describe("The lake stair's 600 plans", () => {
  for (const side of [128, 192, 256])
    it(`hold every plan invariant on seeds 1 to 200 at ${side}²`, () => {
      const failed: string[] = [];
      const attempts = new Map<number, number>();
      const t0 = performance.now();
      for (let seed = 1; seed <= 200; seed++) {
        const spec = makeSpec({ seed, size: { x: side, y: side }, theme: "any" });
        spec.premise = "lakeStair";
        const r = firstPlan(lakeStair, spec);
        if ("reason" in r) {
          failed.push(`seed ${seed}: ${r.reason}`);
          continue;
        }
        const f = failing(lakeStair.invariants, "plan", { spec, plan: r.plan });
        if (f.length) failed.push(`seed ${seed}: ${f[0].id}: ${f[0].reason}`);
        attempts.set(r.attempt, (attempts.get(r.attempt) ?? 0) + 1);
      }
      const ms = (performance.now() - t0) / 200;
      console.log(`${side}²: attempts ${[...attempts].sort((a, b) => a[0] - b[0]).map(([a, n]) => `${a}: ${n}`).join(", ")}; ${ms.toFixed(0)} ms a plan`);
      expect(failed).toEqual([]);
    });
});
