// The shown land's bounds (#236, the 256² audit): above 128² a land is shown at the land stage, before
// its start is proved, and three attempts in a row on it that fail the same way end the round as spent
// attempts do (D471's rescue rounds take over); it is never drawn again within its round (D348), and
// a land not yet shown is the only one ever dropped mid-round. Each stage's progress says why the last
// attempt failed, in a player's words, for the making dialog.
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
    // (Highlands 136², badwater distance 60, seed 4: its first shown land's start is within 60 tiles of
    // its badwater on every attempt; dev spent the round's attempts on it)
    const { steps, passed } = traced(spec("highlands", 136, 4, 60));
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
    const { progress, failures } = traced(spec("riverValley", 64, 1));
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
