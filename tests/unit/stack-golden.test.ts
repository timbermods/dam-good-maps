// The stacked water engine's golden fixtures (PLAN §20 D279; tools/stack-golden.ts): on our own maps with
// terrain above terrain (the Probe's T1–T5 and two cave cases), the support rule, the canonical stacked
// settle and soil per run give exactly the results tests/golden/terrain3d.json holds. A change to any
// bit fails here; regenerate the fixtures only when the engine is meant to change.

import { describe, expect, it } from "vitest";
import { goldenCases, readGolden } from "../../tools/stack-golden";

describe("the stacked water engine's golden fixtures", () => {
  it("reproduces every case bit for bit", () => {
    const golden = readGolden();
    expect(golden, "tests/golden/terrain3d.json is missing: run npx tsx tools/stack-golden.ts").not.toBeNull();
    const cases = goldenCases();
    expect(cases.map((c) => c.name)).toEqual(golden!.cases.map((c) => c.name));
    for (const c of cases) expect(c, `${c.name} differs from its fixture`).toEqual(golden!.cases.find((g) => g.name === c.name));
  });
});
