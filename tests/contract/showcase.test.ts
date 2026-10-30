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
    // (generator 0.10.7, D502, D148: every River Valley, Lake Basin, Delta and Any map grows a landmark form and every start
    // leans toward one, so these three maps are new lands; the beats below were read off them by hand again)
    // the asked map: an 8-level mesa 43 tiles south-east in the opening camera pulled back (D493), but too
    // little in the game's first frame round the start to call a vista; nothing to choose in the first drought
    expect(a.vista.met).toBe(false);
    expect(a.landmark.met).toBe(true);
    expect(a.landmark.say).toMatch(/^An 8-level mesa stands 43 tiles south-east of the start, in the opening view\.$/);
    expect(a.drought.met).toBe(false);
    // a dam across the narrows to build, and a drowned village for its mystery
    expect(a.project.say).toMatch(/^A 4-tile dam across a narrows 42 tiles north-east of the start would hold 4,900 water\.$/);
    expect(a.mystery.say).toMatch(/^A drowned village stands in a lake's shallows 50 tiles south-east of the start/);
    // the first sibling: no landmark near the colony; the best farmland lies past a gorge (the valley, since
    // badwater joins only the main river's lower reach, D498), the first drought's choice (the river by the
    // start runs low, the pool a little further holds), and no mystery to speak of
    expect(b.landmark.met).toBe(false);
    expect(b.valley.met).toBe(true);
    expect(b.valley.say).toBe("The best farmland lies past the gorge, more than twice what the start has.");
    expect(b.drought.met).toBe(true);
    expect(b.drought.say).toMatch(/^The nearest water, 9 tiles' walk from the start, runs low in the first drought; water 17 tiles' walk away holds.$/);
    expect(b.mystery.met).toBe(false);
    // the second: the farmland past a gorge, the first drought's choice, an 8-level mesa in view and a drowned
    // village in the lake's shallows (ruins placed with meaning, generator 0.10.1)
    expect(c.valley.met).toBe(true);
    expect(c.valley.say).toBe("The best farmland lies past the gorge, more than the start has.");
    expect(c.mystery.say).toMatch(/^A drowned village stands in a lake's shallows 67 tiles south-west of the start/);
    expect(c.drought.met).toBe(true);
    expect(c.drought.strength).toBe(1);
    expect(c.landmark.say).toMatch(/^An 8-level mesa stands 40 tiles south-west of the start/);
    // and its first frame holds too little to call a vista
    expect(c.vista.met).toBe(false);
    // the best three, best first: the second sibling (5 beats: a drought's choice, a project, the valley, the
    // landmark and the mystery), the first (a valley past a gorge, a drought's choice, a project: 3 beats), the
    // asked map (3 beats: a project, the landmark and the mystery)
    expect(res.best.map((p) => p.index)).toEqual([2, 1, 0]);
    expect(res.best[0].note).toMatch(/^5 of 6 beats\. /);
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
