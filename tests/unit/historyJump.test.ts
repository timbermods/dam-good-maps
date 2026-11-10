// A History row clicked while a Naturalize stroke lands (#884): the jump waits for the stroke (`afterLanding`, #880),
// then runs. It goes to the step the row showed, found by that step wherever it stands then, never by the index the row
// had before the stroke went on the history; a step the stroke replaced (an undone one) is refused with one line.

import { describe, expect, it } from "vitest";
import { STEP_GONE } from "../../src/core/doc/session";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const W = 48;

async function threeTrees() {
  await runGenerate(makeSpec({ seed: 5, size: { x: W, y: W } }));
  ed.refine();
  const trees = ed.collabSession()!.built.entities.filter((e) => e.template === "Pine").slice(0, 3);
  expect(trees.length).toBe(3);
  return trees.map((t) => t.id);
}

describe("a History jump goes to the step its row showed (#884)", () => {
  it("a step the landing edit replaced is refused with one line, and nothing moves", async () => {
    const [a, b, c] = await threeTrees();
    ed.apply({ op: "deleteEntities", params: { entities: [a] } });
    ed.apply({ op: "deleteEntities", params: { entities: [b] } });
    ed.undo();
    // (the row the player clicks: the undone step, second in the list)
    const row = ed.sessionInfo().history[1];
    expect(row.applied).toBe(false);
    // (meanwhile the stroke lands: a newer edit, which replaces the undone step)
    ed.apply({ op: "deleteEntities", params: { entities: [c] } });
    const before = ed.sessionInfo().history;
    const u = ed.jump(1, row.seq);
    expect(u.ok).toBe(false);
    expect(u.errors).toEqual([STEP_GONE]);
    expect(u.info.history).toEqual(before);
  });

  it("a step still there is found where it stands now, whatever index the row had", async () => {
    const [a, b, c] = await threeTrees();
    ed.apply({ op: "deleteEntities", params: { entities: [a] } });
    ed.apply({ op: "deleteEntities", params: { entities: [b] } });
    const row = ed.sessionInfo().history[0];
    ed.apply({ op: "deleteEntities", params: { entities: [c] } });
    // (an index from before, wrong now: the step wins)
    const u = ed.jump(2, row.seq);
    expect(u.ok).toBe(true);
    expect(u.info.history.map((h) => h.applied)).toEqual([true, false, false]);
    expect(u.info.history[0].seq).toBe(row.seq);
    // (the row before every edit has no step: its index)
    expect(ed.jump(-1).info.history.map((h) => h.applied)).toEqual([false, false, false]);
  });
});
