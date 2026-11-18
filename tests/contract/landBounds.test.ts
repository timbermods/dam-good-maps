// The shown land's bounds (#236, the 256² audit): above 128² a land is shown at the land stage, before
// its start is proved, and three attempts in a row on it that fail the same way end the round as spent
// attempts do (D471's rescue rounds take over); it is never drawn again within its round (D348), and
// a land not yet shown is the only one ever dropped mid-round. Each stage's progress says why the last
// attempt failed, in a player's words, for the making dialog.
//
// Generates live, not from a fixture: its subject is the generator's rounds and stages, D148.
import { describe, expect, it } from "vitest";
import { failurePhrase } from "../../src/core/gen/failWords";
import { generate, type GenProgressStage } from "../../src/core/gen/generate";
import { makeSpec, type MapSpec, type ThemeId } from "../../src/core/spec/mapspec";

interface Step {
  round: number;
  landNo: number;
  land: "drawn" | "kept" | "shown";
  why: string;
}

/** Each attempt of a generation: its round, the land it was on (a count of lands drawn), the kind of
 *  land, and why it failed; and every stage's progress. */
function traced(spec: MapSpec): { steps: Step[]; progress: GenProgressStage[]; failures: string[][]; passed: boolean } {
  const steps: Step[] = [];
  const progress: GenProgressStage[] = [];
  let landNo = 0;
  let round = 0;
  let prev = -1;
  const r = generate(spec, {
    onProgress: (p) => {
      progress.push(p);
      if (p.stage === "land") landNo++;
    },
    onAttempt: (a) => {
      if (a.attempt <= prev) round++;
      prev = a.attempt;
      steps.push({ round, landNo, land: a.land, why: a.passed ? "passed" : a.failed[0] });
    },
  });
  return { steps, progress, failures: r.failures.map((f) => f.failed), passed: r.report.passed };
}

const spec = (theme: ThemeId, size: number, seed: number, badwaterDistance?: number): MapSpec => {
  const s = makeSpec({ seed, theme, size: { x: size, y: size } });
  if (badwaterDistance !== undefined) s.settings.hazards.badwaterDistance = badwaterDistance;
  return s;
};

describe("the shown land's bounds (#236)", () => {
  it("above 128², a shown land failing the same way three times in a row ends its round, and is never dropped within it", () => {
    // (Highlands 136², badwater distance 60, seed 1 → 14 at 0.10.47, D(terrace-edges), D148: seed 1 passes on its first attempt now,
    // with no round ended by the bound; of seeds 1–16 only 14, 15 and 16 end a round, each passing the whole test;
    // seed 2 → 1 at 0.10.46, D(new-ditch) and D(sea-steps) on #1217's land, D148: seed 2 passes
    // now with no round ended by the bound; of seeds 1–8 only 1 and 6 end a round, each passing the whole test;
    // seed 6 → 2 at 0.10.30, D(new-ditch) and D(sea-steps), D148: the badwater drains by
    // gullies, so seed 6's lands moved and it passes on its 17th attempt with no round ended by the bound; of seeds 1–8 only 2
    // ends a round now, and none breaks the shown land's rules;
    // seed 2 → 6 at 0.10.29 (#1186), D148: the disc's land (the weathering's disc of the square's area, the washes' brush and swing) gives seed 2 no
    // round ended by the bound, it passing on land 5; of seeds 1 and 3–20 only 6, 14 and 16 end a round now, and none breaks the shown land's rules;
    // seed 2 since generator 0.10.27, D(new-leaks): a course's water leaves only by its own way,
    // so the land moved, D148: seed 1 passes on its first shown land now, with no round ended by the bound; of seeds 1–5, 8 and 10 only
    // 2 and 8 end a round now; seed 1 since generator 0.10.24's round forms, the look round, D148: seed 6 passes now
    // with no round ended by the bound; of seeds 1–8, 10–14, 18, 27, 28, 34, 36, 48, 56 and 59 only 1, 2, 8 and 10 end a round now, and none breaks
    // the shown land's rules; seed 6 since the D518 mends (the rolling ground's reweighed noise, compact rises,
    // wash treads and dead-stand knots), D148: seed 15's attempts no longer fail three alike on a shown land, it passes on land 5; of
    // seeds 1–60 only 6, 13, 18, 27, 28, 34, 36, 48, 56 and 59 end a round now (6, 27 and 56 twice), and none of the 60 breaks the shown land's rules;
    // before that: seed 15: a shown land fails the same way three times and its round
    // ends; seed 4 for generator 0.10.7, whose first shown land's start was within 60 tiles of its badwater on every
    // attempt, until D504's springs toward the far land changed its land: its shown land now fails once and passes, D148; of
    // seeds 1–8, 1 and 5 end a round; seed 15 for 1 since generator 0.10.20's contour edges, D518, D148: seed 1's attempts now fail as drawn lands, never three alike on a shown one, so no round ends by the bound, and of seeds 1–60 only 15, 19, 26, 30, 32, 43, 51, 54 and 57 end one)
    const { steps, passed } = traced(spec("highlands", 136, 14, 60));
    expect(passed).toBe(true);
    const at = JSON.stringify(steps);
    let ended = 0;
    for (let k = 1; k < steps.length; k++) {
      const [a, b] = [steps[k - 1], steps[k]];
      // (shown: the next attempt in its round is on it, never on a land drawn after it)
      if (a.land === "shown" && b.round === a.round) {
        expect(b.landNo, at).toBe(a.landNo);
        expect(b.land, at).toBe("shown");
      }
      // (never a fourth attempt in a row on it failing the same way)
      if (k >= 3 && steps.slice(k - 3, k + 1).every((s) => s.land === "shown" && s.round === b.round && s.landNo === b.landNo && s.why === b.why && s.why !== "passed")) expect.fail(`four "${b.why}" in a row on a shown land: ${at}`);
      if (k >= 3 && b.round === a.round + 1 && steps.slice(k - 3, k).every((s) => s.land === "shown" && s.round === a.round && s.landNo === a.landNo && s.why === a.why)) ended++;
    }
    expect(ended, `a round ended by the bound: ${at}`).toBeGreaterThan(0);
  }, 600000);

  it("each stage's progress says how many attempts failed before it and why the last did, in a short plain phrase", () => {
    // (seed 2: it fails six attempts before its map, with several reasons; seed 1 makes its map at the first since generator 0.10.7, D502;
    // seed 1 since generator 0.10.24's round forms, the look round, D148: seed 2 fails one attempt now, and seed 1 fails four, each
    // for its own reason;
    // seed 1 → 3 at 0.10.36: seeds 1 and 2 fail only one attempt now, the others gone from their land (#1205); seed 3 fails more than one;
    // seed 3 → 5 at 0.10.40, small maps at their own scale (#1193, D(small-own-scale), D148): seeds 1 and 3 make their map at the first
    // attempt now, seed 5 at its ninth;
    // seed 5 → 2 at 0.10.44, a tributary deep under a wall winding at a small map's scale (D(gorge-followups), D148): seed 5 makes
    // its map at the first attempt now, seed 2, the first of seeds 1–10 that fails more than one, at its third)
    const { progress, failures } = traced(spec("riverValley", 64, 2));
    expect(failures.length).toBeGreaterThan(1);
    expect(progress[0].failed).toBeUndefined();
    expect(progress[0].tried).toBe(0);
    for (const p of progress) {
      const tried = p.tried!;
      if (tried === 0) continue;
      expect(p.failed).toBe(failurePhrase(failures[tried - 1]));
      // (a phrase, never a check's id or the generator's own shorthand)
      expect(p.failed).toMatch(/^[a-z][a-z' ]+[a-z]$/);
    }
    expect(progress.at(-1)!.tried).toBe(failures.length);
  }, 600000);
});
