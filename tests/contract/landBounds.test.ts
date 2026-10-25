// The land stage's bounds (#236, the 256² audit): a land kept from the land stage but not yet shown is
// drawn again once two attempts in a row on it fail the same way; a shown land is never drawn again
// within its round (D348), and three in a row end the round as spent attempts do (D471's rescue rounds
// take over). Each stage's progress says why the last attempt failed, in a player's words, for the
// making dialog.
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

/** Runs of attempts in a row on one land of one kind that failed for the same reason. */
function runs(steps: Step[], kind: Step["land"]): { length: number; next: Step | undefined }[] {
  const out: { length: number; next: Step | undefined }[] = [];
  for (let k = 0; k < steps.length; ) {
    let n = 1;
    while (k + n < steps.length && steps[k + n].land === kind && steps[k].land === kind && steps[k + n].round === steps[k].round && steps[k + n].landNo === steps[k].landNo && steps[k + n].why === steps[k].why) n++;
    if (steps[k].land === kind && steps[k].why !== "passed") out.push({ length: n, next: steps[k + n] });
    k += n;
  }
  return out;
}

const spec = (theme: ThemeId, size: number, seed: number, badwaterDistance?: number): MapSpec => {
  const s = makeSpec({ seed, theme, size: { x: size, y: size } });
  if (badwaterDistance !== undefined) s.settings.hazards.badwaterDistance = badwaterDistance;
  return s;
};

describe("the land stage's bounds (#236)", () => {
  it("a land not yet shown that fails the same way twice in a row is drawn again; a shown land is never drawn again in its round, and three in a row end it", () => {
    const { steps, passed } = traced(spec(HIDDEN.theme, HIDDEN.size, HIDDEN.seed));
    expect(passed).toBe(true);
    // (not yet shown: never a third attempt on it after two that failed the same way)
    const hidden = runs(steps, "kept");
    for (const r of hidden) expect(r.length, JSON.stringify(steps)).toBeLessThanOrEqual(2);
    expect(hidden.some((r) => r.length === 2 && r.next && r.next.land !== "kept"), "the spec draws a kept land again").toBe(true);
    // (shown: the next attempt in its round is on it, never on a land drawn after it)
    for (let k = 1; k < steps.length; k++)
      if (steps[k - 1].land === "shown" && steps[k].round === steps[k - 1].round) {
        expect(steps[k].landNo, JSON.stringify(steps)).toBe(steps[k - 1].landNo);
        expect(steps[k].land).toBe("shown");
      }
    for (const r of runs(steps, "shown")) expect(r.length).toBeLessThanOrEqual(3);
  }, 600000);

  it("each stage's progress says how many attempts failed before it and why the last did, in a short plain phrase", () => {
    const { progress, failures } = traced(spec(HIDDEN.theme, HIDDEN.size, HIDDEN.seed));
    expect(failures.length).toBeGreaterThan(1);
    expect(progress[0].failed).toBeUndefined();
    expect(progress[0].tried).toBe(0);
    for (const p of progress) {
      const tried = p.tried!;
      if (tried === 0) continue;
      expect(p.failed).toBe(failurePhrase(failures[tried - 1]));
      // (a phrase, never a check's id or a generator's own words)
      expect(p.failed).toMatch(/^[a-z][a-z' ]+[a-z]$/);
    }
    expect(progress.at(-1)!.tried).toBe(failures.length);
  }, 600000);
});

/** A small map whose land kept from the land stage fails the same way twice before it is shown. */
const HIDDEN = { theme: "riverValley" as ThemeId, size: 64, seed: 1 };
