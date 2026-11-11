// The generator's premise mode (docs/PREMISES.md §2.1, §2.2 stages 3, 4, 5 and 8; build steps 4 and 5): a share link
// with `p=lakeStair` opens a lake stair the generator made through its plan, water, relief, start and ladder, one
// settle and the checks, and a spec the premise rules out goes to the themes with the reason in one line (D471). The
// ladder's gains are the soil rule's reach, `soilReach`, which must equal `sim/moisture.ts` tile for tile.
//
// The pinned sha256 is the `.timber` of seed 1 at 128² as this step makes it: a step that changes premise maps on
// purpose updates it (D148).

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { firstWater } from "../../src/core/premise/draw";
import { dayOneWater } from "../../src/core/premise/frame";
import { generatePremise } from "../../src/core/premise/generate";
import { droughtHold } from "../../src/core/premise/hold";
import { soilReach } from "../../src/core/premise/ladder";
import { premiseLand } from "../../src/core/premise/map";
import { PREMISES } from "../../src/core/premise/premises";
import { waterByNumber } from "../../src/core/premise/water";
import { moisture } from "../../src/core/sim/moisture";
import { decodeSpecFragment, encodeSpecFragment, makeSpec } from "../../src/core/spec/mapspec";

// (re-pinned since generator 0.10.16's ground with grade, D148: the map's own land is the same; its description names the
// generator's version, "Made with Dam Good Maps 0.10.16", gen/pack.ts; again for step 7's works, and for step 8's works
// sited by moisture, D148)
const SHA = "68284f130bf27f34590ccb5236bad0a2a1769a73a9c0a9006acabee05efdfdd6";

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
    // (step 6's plants and mine sites answer the start's wood and food and the mine pair: none waits for a later step)
    expect(p.later).toEqual([]);
    for (const id of ["start.food", "start.wood", "start.wood_floor", "resources.mine_site"]) expect(r.report.checks.find((c) => c.id === id)?.ok, id).toBe(true);
    // (the life by budget, §2.2 stage 6: living trees 450 to 700 per 10,000 tiles, berries about 185 to 230)
    expect(p.life!.livingPer10k).toBeGreaterThanOrEqual(450);
    expect(p.life!.livingPer10k).toBeLessThanOrEqual(700);
    expect(p.life!.bushesPer10k).toBeGreaterThanOrEqual(185);
    expect(p.life!.bushesPer10k).toBeLessThanOrEqual(230);
    expect(p.start!.shallow).toBeGreaterThanOrEqual(0.85);
    // (the ladder: every work has a site on the land or says why not; day 1 is not fully watered)
    const ladder = p.ladder!;
    expect(ladder.works.length).toBe(p.plan!.works.length);
    for (const w of ladder.works) expect(w.tiles.length > 0 || !!w.note).toBe(true);
    expect(ladder.works.filter((w) => w.green > 0 || w.reservoir > 0).length).toBeGreaterThan(ladder.works.length / 2);
    expect(ladder.day1.water + ladder.day1.moist).toBeLessThan(0.7);
    expect(createHash("sha256").update(r.bytes).digest("hex")).toBe(SHA);
  });

  it("reads the soil's reach as the game's soil rule does (stage 4's estimateGain)", () => {
    const fw = firstWater(PREMISES.lakeStair, made);
    if ("reason" in fw) throw new Error(fw.reason);
    const { W, H } = fw.plan;
    const { heights } = premiseLand(fw.plan, fw.water);
    const depth = dayOneWater(fw.plan, fw.water, heights);
    const none = new Float64Array(W * H);
    const reach = soilReach(heights, { depth, contamination: none }, W, H);
    const m = moisture(heights, depth, none, W, H);
    let differ = 0;
    let moist = 0;
    for (let i = 0; i < W * H; i++) {
      if (depth[i] > 0) continue;
      if (m[i] > 0) moist++;
      if (reach[i] > 0 !== m[i] > 0) differ++;
    }
    expect(moist).toBeGreaterThan(1000);
    expect(differ).toBe(0);
  });

  it("keeps its lakes through the difficulty's longest drought: each drops a level, none empties (§4.4 drought.lakes)", () => {
    const r = generatePremise(made);
    if ("reason" in r) throw new Error(r.reason);
    const plan = r.result.info.premise!.plan!;
    const hold = droughtHold(made, plan, r.result.built, waterByNumber(plan));
    const lowStart = plan.stair!.startLake === plan.stair!.lakes[0] ? plan.stair!.lakes[0] : null;
    for (const l of hold.lakes) {
      if (l.id === plan.stair!.pool) continue;
      // (most of each lake's water at the worst day; the lowest lake when it is the start's, its ruined weir's breach
      // a level deep on a bed three deep, about a third: §9)
      expect(l.worst / l.day0, l.id).toBeGreaterThanOrEqual(l.id === lowStart ? 0.28 : 0.5);
    }
    expect(hold.has).toBe(true);
    expect(hold.gone).toBe(0);
  });

  it("hands a spec the premise rules out to the themes, saying why", () => {
    const spec = makeSpec({ seed: 1, size: { x: 64, y: 64 }, theme: "any" });
    spec.premise = "lakeStair";
    const r = generatePremise(spec);
    expect("reason" in r && r.reason.length).toBeGreaterThan(0);
  });
});
