// Showcase mode (D488 (2)): the search makes the asked map's siblings in order, measures each one's arc,
// keeps the best three that pass, and each pick's share spec regenerates its file byte for byte. The beats
// asserted here were read off these three maps by hand (Lake Basin 96², seed 2, variations 0–2).

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { arcOf, showcaseSearch, type ShowcaseCandidate } from "../../src/core/gen/showcase";
import { makeSpec } from "../../src/core/spec/mapspec";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

describe("Showcase mode (D488 (2))", () => {
  it("measures each sibling's arc, keeps the best three in order, and a pick's link regenerates it", async () => {
    const spec = makeSpec({ seed: 2, theme: "lakeBasin", size: { x: 96, y: 96 } });
    const seen: ShowcaseCandidate[] = [];
    // (a replay makes all its maps: a budget spent at once does not cut it short)
    const res = await showcaseSearch(spec, { tries: 3, budgetMs: 0, onCandidate: (c) => seen.push(c) });
    expect(res.tried).toBe(3);
    // siblings in order, the asked map first, each with its own share spec
    expect(seen.map((c) => c.spec.variation)).toEqual([undefined, 1, 2]);
    expect(seen.every((c) => c.passed && c.arc)).toBe(true);
    const [a, b, c] = seen.map((s) => s.arc!);
    // the asked map: an 8-level butte 34 tiles east in the opening camera pulled back (D493), but too
    // little in the game's first frame round the start to call a vista
    expect(a.vista.met).toBe(false);
    expect(a.landmark.met).toBe(true);
    expect(a.landmark.say).toMatch(/^An 8-level butte stands 34 tiles east of the start, in the opening view\.$/);
    // and the first drought's choice: the river by the start runs low, the pool a little further holds
    expect(a.drought.met).toBe(true);
    expect(a.drought.say).toMatch(/^The nearest water, 5 tiles' walk from the start, runs low in the first drought; water 7 tiles' walk away holds.$/);
    // the first sibling: no landmark near the colony, no valley behind a gate
    expect(b.landmark.met).toBe(false);
    expect(b.valley.met).toBe(false);
    // the second: a district behind debris (a valley behind a gate) and an 11-level mesa in view
    expect(c.valley.met).toBe(true);
    expect(c.valley.say).toMatch(/^A wide, level second district site 39 tiles out/);
    // the debris counts once: in the valley, which has nothing else, not again as a mystery; the mystery
    // is the drowned village in the lake's shallows (ruins placed with meaning, generator 0.10.1)
    expect(c.mystery.say).toMatch(/^A drowned village stands in a lake's shallows 57 tiles south-west of the start/);
    // its nearest water holds and a farther one runs dry: no choice to face, some of the beat only
    expect(c.drought.met).toBe(false);
    expect(c.drought.strength).toBe(0.4);
    expect(c.landmark.say).toMatch(/^An 11-level mesa stands 29 tiles south of the start/);
    // and its first frame: 12 levels of relief, open water, a 3-level fall and the mesa
    expect(c.vista.met).toBe(true);
    expect(c.vista.say).toBe("The opening view takes in 12 levels of relief, open water, a 3-level fall and the mesa.");
    // the best three, best first: the second sibling (its drowned village a mystery, since 0.10.1; its start
    // turned to its relief, open water, a fall and the mesa, D493: 5.74 to the asked map's 3.60), the asked
    // map (its drought's choice), the first
    expect(res.best.map((p) => p.index)).toEqual([2, 0, 1]);
    expect(res.best[0].note).toMatch(/^\d of 6 beats\. /);
    // a budget spent at once still makes one map, the asked map's own
    const once = await showcaseSearch(spec, { budgetMs: 0 });
    expect(once.tried).toBe(1);
    expect(once.best[0].arc).toEqual(a);
    // the winner's share spec regenerates its file, and so its arc
    const top = res.best[0];
    const again = generate(top.spec);
    expect(sha(again.bytes)).toBe(sha(top.result.bytes));
    expect(arcOf(again)).toEqual(top.arc);
  });
});
