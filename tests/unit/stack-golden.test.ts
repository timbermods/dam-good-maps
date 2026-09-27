// The stacked water engine's golden fixtures (PLAN §20 D279; tools/stack-golden.ts): on our own maps with
// terrain above terrain (the Probe's T1–T6 and two cave cases), the support rule, the canonical stacked
// settle and soil per run give exactly the results tests/golden/terrain3d.json holds. A change to any
// bit fails here; regenerate the fixtures only when the engine is meant to change. The cases the DGM
// Probe verified (run terrain3d-20260927) carry that verification only while they are the case it saw.

import { describe, expect, it } from "vitest";
import { caseSha256, goldenCases, readGolden } from "../../tools/stack-golden";

describe("the stacked water engine's golden fixtures", () => {
  it("reproduces every case bit for bit, and each verification is of the case as it is", async () => {
    const golden = readGolden();
    expect(golden, "tests/golden/terrain3d.json is missing: run npx tsx tools/stack-golden.ts").not.toBeNull();
    const cases = await goldenCases();
    expect(cases.map((c) => c.name)).toEqual(golden!.cases.map((c) => c.name));
    for (const c of cases) expect(c, `${c.name} differs from its fixture`).toEqual(golden!.cases.find((g) => g.name === c.name));
    for (const [name, v] of Object.entries(golden!.verified)) {
      const c = cases.find((x) => x.name === name);
      expect(c, `${name} is verified but not a case`).toBeDefined();
      expect(v.caseSha256, `${name}'s verification by ${v.run} is of another case`).toBe(caseSha256(c!));
    }
    // the Probe verified every T map it played (run terrain3d-20260927)
    expect(Object.keys(golden!.verified).sort()).toEqual(["t1-support", "t2-walking", "t3-cave-water", "t4-soil", "t5-plants", "t6-heights"]);
  });
});
