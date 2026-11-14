// Showcase mode (D488 (2)): the search makes the asked map's siblings in order, measures each one's arc,
// keeps the best three that pass, and each pick's share spec regenerates its file byte for byte. The beats
// asserted here were read off these three maps by hand (Lake Basin 96², seed 2, variations 0–2) and re-read off the new maps for generator 0.10.13 (D507, D148), 0.10.16 (ground with grade, D148), 0.10.17 (the start's floors, D515, D148) 0.10.20 (contour edges, D518, D148) and 0.10.21 (the look round, D518, D148).

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
    // (generator 0.10.16's ground with grade, D148: every land is new, so every beat below was read off the new maps
    // again by hand; before it the asked map's landmark was an 8-level butte 50 tiles east and its mystery a relic on a
    // pinnacle, the first sibling had no landmark and no valley but the first drought's choice, and the second had
    // a second district site for its valley and no drought choice; generator 0.10.17's start floors, D515, D148: the asked
    // map is unchanged, the two siblings' lands moved round their starts, so their beats were read off again by hand: every
    // beat met before is met still, the first sibling's butte 28 tiles west now 38 south-east, its dam, 4 tiles 23 south,
    // now 5 tiles 50 east, its partial drought choice 0.25 now 0.4; the second sibling's dam, 7 tiles 31 west, now 5 tiles
    // 48 west, its mesa, drowned village and holding water each a tile further; generator 0.10.20's contour edges, D518, D148: every
    // land is new again, so every beat below was read off the new maps by hand with `arcOf` and `showcaseSearch` at tries: 3;
    // before it the asked map had its 8-level mesa 30 tiles east and no valley, the first sibling its butte and farmland past
    // the gorge, and the second every beat; the D518 mends (wash treads and dead-stand knots), D148: the asked map and the
    // second sibling are as they were, the first sibling's dam, 9 tiles 20 east holding 5,200, is now 8 tiles 47 north-east
    // holding 3,200, and its relic on a pinnacle is gone (its mystery's strength 0.4, unmet), read off again by hand)
    // (generator 0.10.20's contour edges again, the D518 mends, D148: the rolling ground's noise reweighed, compact rises,
    // a dry wash that leaves no broad flat, the dead stands in a few woods; so the lands of all three moved, and the beats
    // below were read off the new maps by hand with `arcOf` and `showcaseSearch` at tries: 3; before the mends the asked map
    // had a dam 57 tiles east and a valley past the gorge but no landmark, the first sibling its dam 47 tiles north-east, and the
    // second sibling every beat but the vista, with a second district site behind debris as its valley beat)
    // (generator 0.10.21's look round, D518, D148: the land's long straight steps jog and the ruin fields lie along their level's
    // rim; the asked map is as it was, the other two lands moved and their beats were read off by hand again with `arcOf` and
    // `showcaseSearch` at tries: 3: the first sibling now has an 8-level mesa 59 tiles east in view, its nearest water holding to the
    // next water 8 tiles' walk away, its dam a 4-tile one 30 tiles south-east holding 3,100; the second sibling's nearest water
    // is 14 tiles' walk from its start, the next 25, its landmark an 11-level mesa 40 tiles south, its dam a 7-tile one 20 tiles
    // south-west holding 5,400)
    // the asked map: an 8-level mesa in view and a dam to build, a drowned village for its mystery, and no valley, no
    // vista and no first-drought choice (the strength 0.4 of a partial one)
    expect(a.vista.met).toBe(false);
    expect(a.landmark.met).toBe(true);
    expect(a.landmark.say).toMatch(/^An 8-level mesa stands 44 tiles east of the start, in the opening view\.$/);
    expect(a.drought.met).toBe(false);
    expect(a.drought.strength).toBe(0.4);
    expect(a.valley.met).toBe(false);
    expect(a.project.say).toMatch(/^A 4-tile dam across a narrows 53 tiles south-east of the start would hold 6,500 water\.$/);
    expect(a.mystery.met).toBe(true);
    expect(a.mystery.say).toMatch(/^A drowned village stands in a lake's shallows 29 tiles north-east of the start/);
    // the first sibling: a first-drought choice, farmland past the gorge, a mesa in view, a dam to build and a drowned village
    expect(b.landmark.met).toBe(true);
    expect(b.landmark.say).toMatch(/^An 8-level mesa stands 59 tiles east of the start, in the opening view.$/);
    expect(b.valley.met).toBe(true);
    expect(b.valley.say).toBe("The best farmland lies past the gorge, more than twice what the start has.");
    expect(b.drought.met).toBe(true);
    expect(b.drought.say).toMatch(/^The nearest water, 7 tiles' walk from the start, runs low in the first drought; water 8 tiles' walk away holds.$/);
    expect(b.project.say).toMatch(/^A 4-tile dam across a narrows 30 tiles south-east of the start would hold 3,100 water\.$/);
    expect(b.mystery.met).toBe(true);
    expect(b.mystery.say).toMatch(/^A drowned village stands in a lake's shallows 53 tiles east of the start/);
    // the second: every beat but the vista; farmland past the gorge, the first drought's choice, an 11-level mesa in view,
    // a dam and a drowned village in the lake's shallows
    expect(c.valley.met).toBe(true);
    expect(c.valley.say).toBe("The best farmland lies past the gorge, more than the start has.");
    expect(c.mystery.say).toMatch(/^A drowned village stands in a lake's shallows 59 tiles south-west of the start/);
    expect(c.drought.met).toBe(true);
    expect(c.drought.say).toMatch(/^The nearest water, 14 tiles' walk from the start, runs low in the first drought; water 25 tiles' walk away holds.$/);
    expect(c.landmark.say).toMatch(/^An 11-level mesa stands 40 tiles south of the start, in the opening view\.$/);
    expect(c.project.say).toMatch(/^A 7-tile dam across a narrows 20 tiles south-west of the start would hold 5,400 water\.$/);
    expect(c.vista.met).toBe(false);
    // each is ranked by its arc and its opening picture's looks (SHOWCASE_LOOKS, docs/progress/showcase-looks.md)
    for (const c of seen) expect(c.score).toBeCloseTo(arcScore(c.arc!) + SHOWCASE_LOOKS * c.looks!, 9);
    // the best three, best first: the second sibling (5 beats), the asked map (3 beats: a project, a landmark and the
    // mystery), the first sibling (5 beats)
    // (the looks decide the last two: the asked map's picture holds far more, its looks 0.56 against the first sibling's 0.007,
    // and that outweighs its two beats fewer: it scores 8.87 to 5.79, though the first sibling's arc alone scores higher)
    expect(seen[0].looks!).toBeGreaterThan(seen[1].looks!);
    expect(arcScore(b)).toBeGreaterThan(arcScore(a));
    expect(res.best.map((p) => p.index)).toEqual([2, 0, 1]);
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
