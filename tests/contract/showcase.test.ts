// Showcase mode (D488 (2)): the search makes the asked map's siblings in order, measures each one's arc,
// keeps the best three that pass, and each pick's share spec regenerates its file byte for byte. The beats
// asserted here were read off these three maps by hand (Lake Basin 96², seed 2, variations 0–2) and re-read off the new maps for generator 0.10.13 (D507, D148) and 0.10.16 (ground with grade, D148).

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generate } from "../../src/core/gen/generate";
import { arcOf, arcScore, SHOWCASE_LOOKS, showcaseSearch, type ShowcaseCandidate } from "../../src/core/gen/showcase";
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
    // (generator 0.10.7, D502, D148: the first D502 pass gave these maps a landmark form each; narrowed to one form
    // for each whole 128² of the map (none at 96²), they are new lands again; generator 0.10.11, the D410 round, D148: the
    // start leans toward ground whose soil the drought leaves moist, so the starts moved; generator 0.10.13, D148: its
    // starts frame the map (D507), so they moved again and the beats below were read off the new maps by hand, with
    // `arcOf` and `showcaseSearch` at tries: 3; generator 0.10.14, D148: the opening camera's target on height 0, as the game
    // puts it (D493), so the first sibling's land moved (its start kept) and lost its farmland past the gorge, the second
    // sibling's first frame holds less relief, and every opening picture's looks moved; read off again by hand)
    // the asked map: an 8-level mesa 30 tiles east in the opening view, but too little in the game's first frame round
    // the start to call a vista; no first-drought choice (the strength 0.4 of a partial one), no farmland past a gorge;
    // a dam across the narrows to build and a drowned village in a lake's shallows for its mystery
    // (generator 0.10.16's ground with grade, D148: every land is new, so every beat below was read off the new maps
    // again by hand; before it the asked map's landmark was an 8-level butte 50 tiles east and its mystery a relic on a
    // pinnacle, the first sibling had no landmark and no valley but the first drought's choice, and the second had
    // a second district site for its valley and no drought choice)
    expect(a.vista.met).toBe(false);
    expect(a.landmark.met).toBe(true);
    expect(a.landmark.say).toMatch(/^An 8-level mesa stands 30 tiles east of the start, in the opening view\.$/);
    expect(a.drought.met).toBe(false);
    expect(a.drought.strength).toBe(0.4);
    expect(a.project.say).toMatch(/^A 6-tile dam across a narrows 19 tiles north-east of the start would hold 4,200 water\.$/);
    expect(a.valley.met).toBe(false);
    expect(a.mystery.met).toBe(true);
    expect(a.mystery.say).toMatch(/^A drowned village stands in a lake's shallows 30 tiles north-east of the start/);
    // the first sibling: an 8-level butte in view and farmland past the gorge; no first-drought choice (the strength
    // 0.25 of a partial one); a dam to build and a drowned village for its mystery
    expect(b.landmark.met).toBe(true);
    expect(b.landmark.say).toMatch(/^An 8-level butte stands 28 tiles west of the start, in the opening view\.$/);
    expect(b.valley.met).toBe(true);
    expect(b.valley.say).toBe("The best farmland lies past the gorge, more than twice what the start has.");
    expect(b.drought.met).toBe(false);
    expect(b.drought.strength).toBe(0.25);
    expect(b.project.say).toMatch(/^A 4-tile dam across a narrows 23 tiles south of the start would hold 7,900 water\.$/);
    expect(b.mystery.say).toMatch(/^A drowned village stands in a lake's shallows 31 tiles north-west of the start/);
    // the second: every beat; farmland past the gorge as its valley beat, the first drought's choice, a 12-level mesa in
    // view and a drowned village in the lake's shallows (ruins placed with meaning, generator 0.10.1)
    expect(c.valley.met).toBe(true);
    expect(c.valley.say).toBe("The best farmland lies past the gorge, more than twice what the start has.");
    expect(c.mystery.say).toMatch(/^A drowned village stands in a lake's shallows 36 tiles south of the start/);
    expect(c.drought.met).toBe(true);
    expect(c.drought.say).toMatch(/^The nearest water, 4 tiles' walk from the start, runs low in the first drought; water 17 tiles' walk away holds.$/);
    expect(c.landmark.say).toMatch(/^A 12-level mesa stands 27 tiles south of the start/);
    expect(c.project.say).toMatch(/^A 7-tile dam across a narrows 31 tiles west of the start would hold 1,800 water\.$/);
    // and its first frame: 8 levels of relief, open water and the mesa
    expect(c.vista.met).toBe(true);
    expect(c.vista.say).toBe("The opening view takes in 8 levels of relief, open water and the mesa.");
    // each is ranked by its arc and its opening picture's looks (SHOWCASE_LOOKS, docs/progress/showcase-looks.md)
    for (const c of seen) expect(c.score).toBeCloseTo(arcScore(c.arc!) + SHOWCASE_LOOKS * c.looks!, 9);
    // the best three, best first: the second sibling (all 6 beats), the first (4 beats: the valley, a project, the
    // landmark and the mystery), the asked map (3 beats: a project, the landmark and the mystery)
    // (the asked map's picture holds more than the first sibling's, its looks 0.55 against 0.43, but its arc has a beat
    // fewer, so it scores 8.71 to 8.74; the second sibling's 12.35 leads)
    expect(seen[0].looks!).toBeGreaterThan(seen[1].looks!);
    expect(res.best.map((p) => p.index)).toEqual([2, 1, 0]);
    expect(res.best[0].note).toMatch(/^6 of 6 beats\. /);
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
