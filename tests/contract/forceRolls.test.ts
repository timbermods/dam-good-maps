// Force variants (D488; core/forces/rolls.ts): every roll Try another makes on a force's step is
// kept, and the player shows another at once (Tab, Shift+Tab, the "2 of 4"), each its real result,
// never worked out again. The history holds one step for the force, the roll shown; undo takes it
// back whole, redo brings back the roll that was shown, and a saved project holds only that roll and
// reopens byte for byte (D455). Up to eight are kept; a ninth drops the oldest.

import { describe, expect, it } from "vitest";
import { decodeProject } from "../../src/core/doc/document";
import { clearedLabel } from "../../src/core/doc/labels";
import { MapSession } from "../../src/core/doc/session";
import type { ForceResultParams } from "../../src/core/forces/op";
import { RIFT_DEFAULTS } from "../../src/core/forces/rift";
import { MAX_ROLLS } from "../../src/core/forces/rolls";
import { makeSpec } from "../../src/core/spec/mapspec";
import { runGenerate } from "../../src/worker/api";
import * as ed from "../../src/worker/session";

const applied = () => ed.sessionInfo().history.filter((h) => h.applied);
const objects = () => MapSession.open(decodeProject(ed.project().bytes)).built.entities.map((e) => `${e.template} ${e.id} @${e.x},${e.y}`).sort();

function play(again: boolean, req: ed.ForceRequest) {
  const st = again ? ed.forceAgain() : ed.forceStart(req);
  expect(st.errors).toEqual([]);
  for (let k = 0; k < 4000 && !(ed.forceAdvance(16)?.done ?? true); k++);
  const kept = ed.forceStop();
  expect(kept.errors).toEqual([]);
  expect(kept.kept).toBe(true);
}

/** The map as it stands: its ground, its objects and the saved project's bytes. */
function shot() {
  return { heights: Array.from(ed.terrainNow().heights), objects: objects(), bytes: Array.from(ed.project().bytes) };
}
/** Its ground and objects (undo leaves the next operation's number moved on, as after any step). */
const land = (s = shot()) => ({ heights: s.heights, objects: s.objects });
/** The History's label for the roll shown: the force's words, the sources its Sources: Clear took
 *  (the saved step's own list, D474), and which roll. */
function rollLabel(k: number): string {
  const op = [...MapSession.open(decodeProject(ed.project().bytes)).logOps].reverse().find((o) => o.op === "forceResult") as unknown as { params: ForceResultParams };
  return `${clearedLabel("Rift", op.params.cleared?.length ?? 0)}, roll ${k}`;
}

describe("a force's rolls (D488)", () => {
  it("Rift, three rolls: each shown is byte-identical to its own result; one history step; undo, redo and save-and-reopen keep exactly the roll shown; at most eight are kept", async () => {
    const W = 64;
    await runGenerate(makeSpec({ seed: 21, theme: "highlands", size: { x: W, y: W } }));
    ed.refine();
    const before = shot();
    const n0 = applied().length;
    const at = { x: 16, y: 40 };
    const req: ed.ForceRequest = { verb: "rift", settings: { ...RIFT_DEFAULTS, power: 70 }, path: [at, { x: at.x + 14, y: at.y - 8 }], cut: null, natural: true };

    // three rolls, each its own result as it was kept
    play(false, req);
    const rolls = [shot()];
    expect(ed.sessionInfo().forceRolls).toEqual({ shown: 1, count: 1 });
    play(true, req);
    rolls.push(shot());
    play(true, req);
    rolls.push(shot());
    expect(new Set(rolls.map((r) => r.heights.join())).size).toBe(3);
    expect(rolls[0].heights).not.toEqual(before.heights);
    // (one step of the history, the roll shown)
    expect(applied().length).toBe(n0 + 1);
    expect(applied().at(-1)!.label).toBe(rollLabel(3));
    expect(ed.sessionInfo().forceRolls).toEqual({ shown: 3, count: 3 });

    // switching: each roll shown exactly as it was kept, the next, the one before and round
    for (const [to, k] of [[{ index: 0 }, 0], [{ step: 1 }, 1], [{ step: -1 }, 0], [{ step: -1 }, 2], [{ step: 1 }, 0], [{ index: 1 }, 1]] as const) {
      const u = ed.forceRoll(to);
      expect(u.errors).toEqual([]);
      expect(u.ok).toBe(true);
      expect(u.settings?.seed).toBe(RIFT_DEFAULTS.seed + k);
      expect(shot()).toEqual(rolls[k]);
      expect(ed.sessionInfo().forceRolls).toEqual({ shown: k + 1, count: 3 });
      expect(applied().length).toBe(n0 + 1);
      expect(applied().at(-1)!.label).toBe(rollLabel(k + 1));
    }

    // undo takes the force's step back whole; redo brings back the roll shown (roll 2)
    ed.undo();
    expect(land()).toEqual(land(before));
    expect(applied().length).toBe(n0);
    expect(ed.sessionInfo().forceRolls).toBeNull();
    expect(ed.forceRoll({ step: 1 }).ok).toBe(false);
    ed.redo();
    expect(shot()).toEqual(rolls[1]);
    expect(applied().length).toBe(n0 + 1);
    expect(ed.sessionInfo().forceRolls).toEqual({ shown: 2, count: 3 });
    // (the player moved on, as the page says: only the roll shown stays)
    expect(ed.forceSettle().forceRolls).toEqual({ shown: 1, count: 1 });
    expect(shot()).toEqual(rolls[1]);

    // saved: only the roll shown is in the project, and it reopens as it was: its log the same, byte for byte, and
    // its map, its log replayed, the roll's own (D455)
    const bytes = Uint8Array.from(rolls[1].bytes);
    const doc = decodeProject(bytes);
    const forces = doc.edits.filter((o) => o.op === "forceResult");
    expect(forces.length).toBe(1);
    expect(forces[0].op === "forceResult" && forces[0].params.settings.seed).toBe(RIFT_DEFAULTS.seed + 1);
    const again = MapSession.open(doc, { rebuild: true });
    expect(JSON.stringify(decodeProject(again.project(9)).edits)).toBe(JSON.stringify(doc.edits));
    expect(Array.from(again.built.heights)).toEqual(rolls[1].heights);
    expect(again.built.entities.map((e) => `${e.template} ${e.id} @${e.x},${e.y}`).sort()).toEqual(rolls[1].objects);

    // more rolls: at most eight kept, the oldest dropped
    const more: number[][] = [];
    for (let k = 0; k < MAX_ROLLS; k++) {
      play(true, req);
      more.push(shot().heights);
    }
    expect(ed.sessionInfo().forceRolls).toEqual({ shown: MAX_ROLLS, count: MAX_ROLLS });
    expect(ed.forceRoll({ index: 0 }).ok).toBe(true);
    expect(shot().heights).toEqual(more[0]);
    expect(applied().length).toBe(n0 + 1);
    ed.undo();
    expect(land()).toEqual(land(before));
  });
  it("eight kept and the first shown (Tab round from the eighth): a ninth drops the oldest but never the roll shown, which Tab and Esc after the keep bring back", async () => {
    await runGenerate(makeSpec({ seed: 21, theme: "highlands", size: { x: 64, y: 64 } }));
    ed.refine();
    const at = { x: 16, y: 40 };
    const req: ed.ForceRequest = { verb: "rift", settings: { ...RIFT_DEFAULTS, power: 70 }, path: [at, { x: at.x + 14, y: at.y - 8 }], cut: null, natural: true };
    play(false, req);
    const first = shot();
    for (let k = 1; k < MAX_ROLLS; k++) play(true, req);
    expect(ed.sessionInfo().forceRolls).toEqual({ shown: MAX_ROLLS, count: MAX_ROLLS });
    // Tab from the eighth: round to the first
    expect(ed.forceRoll({ step: 1 }).ok).toBe(true);
    expect(shot()).toEqual(first);
    // a ninth, from the first shown: the oldest that isn't it goes
    expect(ed.forceAgain(undefined, 7001).errors).toEqual([]);
    for (let k = 0; k < 4000 && !(ed.forceAdvance(16)?.done ?? true); k++);
    expect(ed.forceStop(7001).kept).toBe(true);
    expect(ed.sessionInfo().forceRolls).toEqual({ shown: MAX_ROLLS, count: MAX_ROLLS });
    expect(land()).not.toEqual(land(first));
    // Esc whose keep was on its way: the first comes back, as it was
    expect(ed.forceCancel(7001).taken).toBe("kept");
    expect(shot()).toEqual(first);
    expect(ed.sessionInfo().forceRolls).toEqual({ shown: 1, count: MAX_ROLLS - 1 });
    // and Tab round reaches it again after another ninth
    expect(ed.forceAgain(undefined, 7002).errors).toEqual([]);
    for (let k = 0; k < 4000 && !(ed.forceAdvance(16)?.done ?? true); k++);
    expect(ed.forceStop(7002).kept).toBe(true);
    expect(ed.forceRoll({ index: 0 }).ok).toBe(true);
    expect(land()).toEqual(land(first));
  });
});
