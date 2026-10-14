// Edits, undo and redo answer at once (D453, D158): undo and redo put back the map each step kept, never
// rebuilding it, and the log followed or spliced (`followLog`, `spliceStep`, the checks replica's and
// collaborative editing's way, D362) is rebuilt from where the map stood, as an edit is. Whatever path a
// sequence takes, its land and its water once settled are those of the same log built afresh, byte for
// byte: the .timber file the game loads and the settled map's hash.

import { describe, expect, it } from "vitest";
import { settledHash } from "../../src/core/collab";
import { decodeProject } from "../../src/core/doc/document";
import type { EditOp } from "../../src/core/doc/ops";
import { MapSession } from "../../src/core/doc/session";
import { applySelection } from "../../src/core/doc/start";
import { CHEAP_KINDS, mapProject, Stream } from "./collabFixtures";
import { rng } from "./forceEverywhere";

const W = 64;
const live = (bytes: Uint8Array): MapSession => {
  const s = MapSession.open(decodeProject(bytes));
  s.setWaterMode("defer");
  return s;
};

/** The session's log built afresh from its generation, its water settled canonically. */
const fresh = (s: MapSession, edits = s.document.edits): MapSession => MapSession.open({ ...s.document, edits }, { rebuild: true });

function expectSame(s: MapSession, ref: MapSession, where: string): void {
  s.settleCanonical();
  expect(Buffer.from(s.built.heights).equals(Buffer.from(ref.built.heights)), `land ${where}`).toBe(true);
  expect(settledHash(s), `settled map ${where}`).toBe(settledHash(ref));
  expect(Buffer.compare(s.exportTimber().bytes, ref.exportTimber().bytes), `.timber ${where}`).toBe(0);
}

/** One edit from the stream, applied as the editor's worker applies it. */
function edit(s: MapSession, stream: Stream): boolean {
  const c = stream.command(stream.pick(CHEAP_KINDS), s);
  if (!c || (c.kind !== "edit" && c.kind !== "select")) return false;
  if (c.kind === "select") {
    const tiles: number[] = [];
    for (const op of c.ops as EditOp[]) if (op.op === "sculpt") for (const [y, x0, x1] of op.params.cells) for (let x = x0; x <= x1; x++) tiles.push(y * W + x);
    return applySelection(s, c.ops as EditOp[], c.label, tiles).ok;
  }
  return s.applyAll(c.ops as EditOp[], "user", c.label).ok;
}

describe("undo and redo put back each step's map; a followed or spliced log rebuilds as an edit", () => {
  it("random edits, undos and redos, the water settling only now and then, end as the same log built afresh", () => {
    const base = mapProject(11, "riverValley", W);
    for (const seed of [1, 2]) {
      const s = live(base);
      const stream = new Stream(seed, W);
      const next = rng(seed * 31);
      for (let k = 0; k < 40; k++) {
        const r = next();
        if (r < 0.45) edit(s, stream);
        else if (r < 0.75) s.undo();
        else s.redo();
        // (the background settle, when the player pauses)
        if (next() < 0.2) s.settleCanonical();
      }
      expectSame(s, fresh(s), `seed ${seed}`);
      // all the way back: the map as opened
      while (s.undo());
      expectSame(s, fresh(s), `seed ${seed}, every step undone`);
    }
  }, 600_000);

  it("undo and redo put back the very map each step kept, its settled water with it: nothing to settle again", () => {
    const s = live(mapProject(11, "riverValley", W));
    const stream = new Stream(9, W);
    const kept = [s.built];
    for (let k = 0; k < 12; k++) {
      if (!edit(s, stream)) continue;
      s.settleCanonical();
      kept.push(s.built);
    }
    for (let k = kept.length - 2; k >= 0; k--) {
      expect(s.undo()).toBe(true);
      expect(s.built, `undo to step ${k}`).toBe(kept[k]);
      expect(s.waterPending).toBe(false);
    }
    for (let k = 1; k < kept.length; k++) {
      expect(s.redo()).toBe(true);
      expect(s.built, `redo to step ${k}`).toBe(kept[k]);
      expect(s.waterPending).toBe(false);
    }
  }, 600_000);

  it("a replica following the log grow and shrink, and a step spliced out and back, is the log built afresh", () => {
    const base = mapProject(12, "highlands", W);
    const a = live(base);
    const b = live(base);
    const stream = new Stream(5, W);
    for (let k = 0; k < 10; k++) {
      edit(a, stream);
      b.followLog(a.logOps, a.nextSeq);
    }
    a.undo();
    a.undo();
    b.followLog(a.logOps, a.nextSeq);
    expectSame(b, fresh(a), "following");
    // a step that is not the latest, out and back (collaborative editing's undo and redo of it)
    const steps = b.history().filter((h) => h.applied);
    const mid = steps[Math.floor(steps.length / 2)].seq!;
    const ops = b.stepOps(mid);
    expect(ops.length).toBeGreaterThan(0);
    const all = b.document.edits;
    expect(b.spliceStep({ remove: mid })).toBe(true);
    expect(b.spliceStep({ remove: mid })).toBe(false);
    expectSame(b, fresh(b, all.filter((o) => o.seq !== mid && o.step !== mid)), "spliced out");
    expect(b.spliceStep({ insert: ops })).toBe(true);
    expect(b.spliceStep({ insert: ops })).toBe(false);
    expectSame(b, fresh(b, all), "spliced back");
    expect(b.document.edits.map((o) => o.seq)).toEqual(all.map((o) => o.seq));
  }, 600_000);
});
