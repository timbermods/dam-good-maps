// Showcase mode's ranking (D488 (2), docs/progress/showcase-looks.md): a better opening picture outranks a higher arc,
// as the player chooses by the picture. Lake Basin 96² seed 2's siblings showed it until generator 0.10.44 (#1240), whose
// maps rank alike by arc and by looks; planning asked for it back as a constructed case (#236, 2026-11-18), since a
// property only a formula holds is one nobody notices breaking.

import { describe, expect, it } from "vitest";
import { arcScore, BEATS, candidateScore, ranksBefore, SHOWCASE_LOOKS, type Arc } from "../../src/core/gen/showcase";

/** An arc with the first `met` beats met at `strength`, the rest unmet at none. */
function arcWith(met: number, strength = 0.7): Arc {
  return Object.fromEntries(BEATS.map((id, i) => [id, i < met ? { met: true, strength, say: id } : { met: false, strength: 0 }])) as Arc;
}

describe("Showcase mode's ranking (D488 (2))", () => {
  it("lets a better picture outrank a higher arc, and the arc decide between pictures alike", () => {
    // a map with one beat more but a plain picture, against one with a beat less and a picture a fifth of the looks' span better
    const moreBeats = { index: 0, score: candidateScore(arcWith(4), 0.3, true) };
    const betterPicture = { index: 1, score: candidateScore(arcWith(3), 0.5, true) };
    expect(arcScore(arcWith(4))).toBeGreaterThan(arcScore(arcWith(3)));
    expect(ranksBefore(betterPicture, moreBeats)).toBe(true);
    expect(ranksBefore(moreBeats, betterPicture)).toBe(false);
    // pictures alike: the beats decide
    const alike = { index: 1, score: candidateScore(arcWith(3), 0.3, true) };
    expect(ranksBefore(moreBeats, alike)).toBe(true);
    // a weight under a beat's worth over the looks' span would let the arc always win: the looks span about 1.2 (−0.2 to 1)
    expect(SHOWCASE_LOOKS * 0.2).toBeGreaterThan(1 + 1 / BEATS.length);
  });

  it("takes one off a map that misses its theme's promise, and breaks a tie by the earlier candidate", () => {
    const kept = candidateScore(arcWith(3), 0.4, true);
    expect(candidateScore(arcWith(3), 0.4, false)).toBeCloseTo(kept - 1, 12);
    const first = { index: 0, score: kept };
    const second = { index: 1, score: kept };
    expect(ranksBefore(first, second)).toBe(true);
    expect(ranksBefore(second, first)).toBe(false);
  });
});
