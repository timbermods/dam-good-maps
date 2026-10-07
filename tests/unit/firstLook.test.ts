// The map-making dialog's words (Kyler, 2026-10-05): each layout that reaches a stage takes that stage's next wording,
// a stage a failed layout never reached keeps its place, and past the last the last stays.
import { expect, test } from "vitest";
import { progressText, sayStage, stageText, type Progress, type Said } from "../../src/ui/FirstLook";

const at = (said: Said | undefined, stage: string, attempt: number): Progress => ({ attempt, stage, land: null, said: sayStage(said, stage, attempt) });

test("each layout's stage says the next wording, counted per stage", () => {
  let p = at(undefined, "land", 0);
  expect(stageText(p)).toBe("Raising the land…");
  p = at(p.said, "water", 0);
  expect(stageText(p)).toBe("Running the rivers…");
  // (the same layout again: the same words)
  p = at(p.said, "water", 0);
  expect(stageText(p)).toBe("Running the rivers…");
  // layout 2 starts again from the land; it reaches the check, which layout 1 never did
  p = at(p.said, "land", 1);
  expect(progressText(p)).toBe("Shaping new hills (layout 2)…");
  p = at(p.said, "water", 1);
  expect(stageText(p)).toBe("Rerouting the rivers…");
  p = at(p.said, "check", 1);
  expect(stageText(p)).toBe("Checking the map…");
  for (let a = 2; a < 7; a++) p = at(p.said, "land", a);
  expect(stageText(p)).toBe("Folding the valleys…");
});
