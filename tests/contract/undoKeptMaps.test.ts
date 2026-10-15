// Edits, undo and redo answer at once (D453, D158): undo and redo put back the map each step kept, never
// rebuilding it, and the log followed or spliced (`followLog`, `spliceStep`, the checks replica's and
// collaborative editing's way, D362) is rebuilt from where the map stood, as an edit is. Whatever path a
// sequence takes, its land and its water once settled are those of the same log built afresh, byte for
// byte: the .timber file the game loads and the settled map's hash.

import { describe, expect, it } from "vitest";
import { applyForce, settledHash } from "../../src/core/collab";
import { decodeProject } from "../../src/core/doc/document";
import type { EditOp } from "../../src/core/doc/ops";
import { MapSession } from "../../src/core/doc/session";
import { applySelection } from "../../src/core/doc/start";
import { CHEAP_KINDS, GUID, mapProject, Stream } from "./collabFixtures";
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

  it("a splice among a batch step, a feature edit with undo data, a force and undo history ends as the log built afresh; saved after, its map matches its log", () => {
    const s = live(mapProject(13, "riverValley", W));
    const stream = new Stream(21, W);
    // three Pines as one step whose log marks no steps (a placement stroke's, applyBatch)
    const pines: EditOp[] = [];
    for (let i = 0; pines.length < 3 && i < W * W; i += 37) {
      const op = { op: "placeEntity", params: { id: GUID(900 + pines.length), template: "Pine", x: i % W, y: Math.floor(i / W), orientation: "Cw0" } } as EditOp;
      if (!s.check(op).length && !pines.some((p) => p.op === "placeEntity" && op.op === "placeEntity" && p.params.x === op.params.x && p.params.y === op.params.y)) pines.push(op);
    }
    expect(s.applyBatch(pines, "user", "Plant 3 pines").ok).toBe(true);
    const box = (x0: number, y0: number, mode: "raise" | "lower") => {
      const cells: [number, number, number][] = [];
      const tiles: number[] = [];
      for (let y = y0; y < y0 + 6; y++) {
        cells.push([y, x0, x0 + 5]);
        for (let x = x0; x < x0 + 6; x++) tiles.push(y * W + x);
      }
      expect(applySelection(s, [{ op: "sculpt", params: { mode, cells, amount: 1 } } as EditOp], mode, tiles).ok).toBe(true);
    };
    box(10, 10, "raise");
    box(12, 12, "lower");
    // a feature taken away: its operation keeps undo data (the feature, its place)
    const forest = s.features.find((f) => f.kind === "forest");
    if (forest) expect(s.applyAll([{ op: "deleteFeature", params: { id: forest.id } } as EditOp], "user", "Delete a forest").ok).toBe(true);
    s.settleCanonical();
    const g = stream.command("craterize", s);
    expect(g?.kind).toBe("force");
    if (g?.kind === "force") expect(applyForce(s, g.gesture).ok).toBe(true);
    // undo history: the force undone, Redo would bring it back
    s.undo();
    const steps = s.history().filter((h) => h.applied);
    expect(steps[0].count).toBe(3);
    const a = steps[1].seq!;
    const ops = s.stepOps(a);
    const label = s.stepLabel(a);
    expect(s.spliceStep({ remove: a })).toBe(true);
    // (the batch stays one step, and nothing is left to redo)
    expect(s.history().filter((h) => h.applied).map((h) => h.seq)).toEqual(steps.filter((h) => h.seq !== a).map((h) => h.seq));
    expect(s.canRedo).toBe(false);
    expectSame(s, fresh(s), "the first sculpt spliced out");
    // undo after the splice puts back a map that matches its log, never one kept from before it
    expect(s.undo()).toBe(true);
    expectSame(s, fresh(s), "spliced out, then undone");
    expect(s.redo()).toBe(true);
    expect(s.spliceStep({ insert: ops, ...(label ? { label } : {}) })).toBe(true);
    expectSame(s, fresh(s), "spliced back");
    expect(s.history().filter((h) => h.applied).map((h) => h.seq)).toEqual(steps.map((h) => h.seq));
    while (s.undo());
    expectSame(s, fresh(s), "every step undone");
    while (s.redo());
    expect(MapSession.replayMatchesStored(decodeProject(s.project()))).toBe(true);
  }, 600_000);

  it("a splice below the save point of a map opened from its stored map waits on the replay comparison (D455)", () => {
    const s = live(mapProject(14, "highlands", W));
    const stream = new Stream(4, W);
    for (let n = 0, k = 0; n < 3 && k < 50; k++) if (edit(s, stream)) n++;
    s.settleCanonical();
    const saved = s.project();
    const first = s.history()[0].seq!;
    // the comparison owed: the splice does it, and goes on when it matches
    const o = live(saved);
    expect(o.replayPending).toBe(true);
    expect(o.spliceStep({ remove: first })).toBe(true);
    expect(o.replayPending).toBe(false);
    expectSame(o, fresh(o), "spliced below the save point");
    // the replay differed: the save point stops a splice below it, never one above it
    const d = live(saved);
    d.confirmReplay(false);
    expect(d.spliceStep({ remove: first })).toBe(false);
    for (let k = 0; k < 50 && !edit(d, stream); k++);
    const top = d.history().at(-1)!.seq!;
    expect(d.spliceStep({ remove: top })).toBe(true);
    while (d.undo());
    expect(d.undoStopped).not.toBeNull();
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
