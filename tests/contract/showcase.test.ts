// Showcase mode (D488 (2)): the search makes the asked map's siblings in order, measures each one's arc,
// keeps the best three that pass, and each pick's share spec regenerates its file byte for byte. The beats
// asserted here were read off these three maps by hand (Lake Basin 96², seed 2, variations 0–2) and re-read off the new maps for generator 0.10.13 (D507, D148), 0.10.16 (ground with grade, D148), 0.10.17 (the start's floors, D515, D148) 0.10.20 (contour edges, D518, D148), 0.10.21 (the look round, D518, D148), 0.10.24 (round forms, D148), 0.10.27 (D(new-leaks), D148), 0.10.29 (#1186, D148), 0.10.36 (#1205, D148) and 0.10.44 (#1240, D148).

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
    // (generator 0.10.24's round forms, the look round, D148: no mesa, plateau, butte, cone or knoll is a circle and the
    // weathering reaches in a disc, so all three lands moved and the beats below were read off the new maps by hand with
    // `arcOf` and `showcaseSearch` at tries: 3; before it the asked map had its 8-level mesa 44 tiles east, a dam 53 tiles
    // south-east holding 6,500 and a drowned village but no drought choice, the first sibling every beat but the vista, and
    // the second every beat but the vista with an 11-level mesa 40 tiles south)
    // (generator 0.10.27, D(new-leaks): a course's water leaves only by its own way, D148: all three lands moved and the beats
    // below were read off the new maps by hand with `arcOf` and `showcaseSearch` at tries: 3; before it the asked map's dam was a
    // 4-tile one 57 tiles north-east, the first sibling's partial drought choice 0.25 and its dam 38 tiles north-east, and the
    // second sibling had every beat, its nearest water running low in the first drought with water 21 tiles' walk away holding,
    // 10 levels of relief in view, its butte 54 tiles south and its dam 52 tiles south-west holding 4,800)
    // (generator 0.10.29, #1186, D148: the weathering's disc of the square's area and the washes' brush and swing moved all
    // three lands, and the beats below were read off the new maps by hand with `arcOf` and `showcaseSearch` at tries: 3;
    // before it the asked map's mesa stood 37 tiles east, its dam a 5-tile one 50 tiles north-east holding 5,700, the first
    // sibling's partial drought choice 0.4, a 4-tile dam 37 tiles north-east holding 7,700 and its drowned village 62 tiles
    // east, the second every beat but the first drought's choice, ranked [2, 0, 1])
    // (generator 0.10.36, #1205, D148: the round forms at their meant size, a sixth wider, moved all three lands, and the beats
    // below were read off the new maps by hand with `arcOf` and `showcaseSearch` at tries: 3; before it the asked map's mesa stood
    // 34 tiles east, its dam a 4-tile one 20 tiles north-east holding 5,600, the first drought's choice met and no mystery, the
    // first sibling's partial drought choice 0.25, a 9-tile dam 39 tiles north-east holding 7,500 and its drowned village 42 tiles
    // south-east, the second every beat, its vista of 10 levels of relief, farmland past the gorge, an 8-level mesa 50 tiles
    // south, a 4-tile dam 36 tiles south holding 6,900, a drowned village 40 tiles west and the first drought's choice, ranked
    // [2, 1, 0])
    // (generator 0.10.44, the gorge follow-ups (#1240), D148: a tributary running deep under a wall winds as a gorge, so all
    // three lands moved and the beats below were read off the new maps by hand with `arcOf` and `showcaseSearch` at tries: 3;
    // before it the asked map's dam was a 4-tile one 60 tiles east and its drowned village 31 tiles east; the first sibling
    // had no valley, a 9-level mesa in its vista and a 9-tile dam 37 tiles west holding 8,400; the second had no landmark and
    // a partial first-drought choice (0.4) with a 4-tile dam 54 tiles south-west holding 5,300, ranked [1, 0, 2], the first
    // sibling's looks outranking the asked map's higher arc. Now the arcs and the looks rank alike, so the score's weighing
    // of the looks is held by the check of every candidate's score below)
    // the asked map: an 8-level mesa in view, a dam to build and a drowned village; no valley, no vista (the strength 0.41 of a
    // partial one) and a partial first-drought choice (0.4)
    expect(a.vista.met).toBe(false);
    expect(a.landmark.met).toBe(true);
    expect(a.landmark.say).toMatch(/^An 8-level mesa stands 39 tiles east of the start, in the opening view\.$/);
    expect(a.drought.met).toBe(false);
    expect(a.drought.strength).toBe(0.4);
    expect(a.valley.met).toBe(false);
    expect(a.project.say).toMatch(/^A 5-tile dam across a narrows 34 tiles north-east of the start would hold 5,900 water\.$/);
    expect(a.mystery.met).toBe(true);
    expect(a.mystery.say).toMatch(/^A drowned village stands in a lake's shallows 29 tiles east of the start/);
    // the first sibling: the vista of 9 levels of relief, farmland past the gorge, a dam to build and a drowned village; no
    // landmark and no first-drought choice
    expect(b.vista.met).toBe(true);
    expect(b.vista.say).toBe("The opening view takes in 9 levels of relief, open water and a 7-level mesa.");
    expect(b.landmark.met).toBe(false);
    expect(b.valley.met).toBe(true);
    expect(b.valley.say).toBe("The best farmland lies past the gorge, more than twice what the start has.");
    expect(b.drought.met).toBe(false);
    expect(b.drought.strength).toBe(0);
    expect(b.project.say).toMatch(/^A 4-tile dam across a narrows 10 tiles north-west of the start would hold 5,400 water\.$/);
    expect(b.mystery.met).toBe(true);
    expect(b.mystery.say).toMatch(/^A drowned village stands in a lake's shallows 55 tiles west of the start/);
    // the second: the first drought's choice, a 10-level mesa in view, a dam to build and a drowned village; no vista (a
    // partial one) and no valley
    expect(c.vista.met).toBe(false);
    expect(c.valley.met).toBe(false);
    expect(c.mystery.say).toMatch(/^A drowned village stands in a lake's shallows 48 tiles west of the start/);
    expect(c.drought.met).toBe(true);
    expect(c.drought.say).toBe("The nearest water, 3 tiles' walk from the start, runs low in the first drought; water 30 tiles' walk away holds.");
    expect(c.landmark.met).toBe(true);
    expect(c.landmark.say).toMatch(/^A 10-level mesa stands 32 tiles south of the start, in the opening view\.$/);
    expect(c.project.say).toMatch(/^An 11-tile dam across a narrows 44 tiles west of the start would hold 5,200 water\.$/);
    // each is ranked by its arc and its opening picture's looks (SHOWCASE_LOOKS, docs/progress/showcase-looks.md)
    for (const c of seen) expect(c.score).toBeCloseTo(arcScore(c.arc!) + SHOWCASE_LOOKS * c.looks!, 9);
    // the best three, best first: the second sibling (4 beats: the first drought's choice, a landmark, a project and a
    // mystery), the first sibling (4 beats: the vista, a valley, a project and a mystery), the asked map (3 beats: a landmark,
    // a project and a mystery); the second's picture holds the most (its looks 0.74, against 0.49 and 0.49)
    expect(arcScore(c)).toBeGreaterThan(arcScore(b));
    expect(arcScore(b)).toBeGreaterThan(arcScore(a));
    expect(seen[2].looks!).toBeGreaterThan(seen[1].looks!);
    expect(res.best.map((p) => p.index)).toEqual([2, 1, 0]);
    expect(res.best[0].note).toMatch(/^4 of 6 beats\. /);
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
