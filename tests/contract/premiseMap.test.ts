// The generator's premise mode (docs/PREMISES.md §2.1, §2.2 stages 3, 5 and 8; build step 4): a share link with
// `p=lakeStair` opens a lake stair the generator made through its plan, water, relief and start, one settle and the
// checks, and a spec the premise rules out goes to the themes with the reason in one line (D471).
//
// The pinned sha256 is the `.timber` of seed 1 at 128² as this step makes it: a step that changes premise maps on
// purpose updates it (D148).

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { generatePremise } from "../../src/core/premise/generate";
import { decodeSpecFragment, encodeSpecFragment, makeSpec } from "../../src/core/spec/mapspec";

const SHA = "7c59f9a1bb092dc78a3a1de50cce8a9fdaef78f8baf89bd5a5f501ba137620c9";

describe("The premise mode (§2.2, build step 4)", () => {
  const made = makeSpec({ seed: 1, size: { x: 128, y: 128 }, theme: "any" });
  made.premise = "lakeStair";
  const link = encodeSpecFragment(made);
  const opened = decodeSpecFragment(link)!;

  it("opens from a share link with p=lakeStair", () => {
    expect(link).toContain("p=lakeStair");
    expect(opened.problems).toEqual([]);
    expect(opened.spec.premise).toBe("lakeStair");
  });

  it("makes the lake stair, every blocking check passed, the start placed for the first frame", () => {
    const r = generate(opened.spec);
    const p = r.info.premise!;
    expect(p.fellBack).toBeUndefined();
    expect(p.plan?.premise).toBe("lakeStair");
    expect(r.report.passed).toBe(true);
    // (the checks only plants and mine sites answer wait for steps 6 and 7, as warnings)
    for (const id of p.later ?? []) expect(r.report.checks.find((c) => c.id === id)?.severity).toBe("warning");
    expect(p.start!.shallow).toBeGreaterThanOrEqual(0.85);
    expect(createHash("sha256").update(r.bytes).digest("hex")).toBe(SHA);
  });

  it("hands a spec the premise rules out to the themes, saying why", () => {
    const spec = makeSpec({ seed: 1, size: { x: 64, y: 64 }, theme: "any" });
    spec.premise = "lakeStair";
    const r = generatePremise(spec);
    expect("reason" in r && r.reason.length).toBeGreaterThan(0);
  });
});
