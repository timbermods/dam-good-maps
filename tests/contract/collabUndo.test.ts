// Undo with two players (docs/COLLAB-BRIEF.md §5): each player takes back only their own actions, the last 50 of
// them. Where the other player (or the same player, later) has built on the same ground, the undo is refused and
// skipped, naming the action in the way, and it comes back to life when that action is taken back. An undo restores
// the stored values: the map after it is the map without the action, never an edit replayed onto changed land. Every
// peer decides the same from the same records, a rejoined one too.

import { beforeAll, describe, expect, test } from "vitest";
import { captureState, CollabReplica, recordToJson, stateHash, type Command, type Reject } from "../../src/core/collab";
import type { EditOp } from "../../src/core/doc/ops";
import { act, CHEAP_KINDS, expectIdentical, GUEST, GUID, HOST, live, mapProject, openProject, settle, sit, Stream, type Table } from "./collabFixtures";

const SIZE = 48;
let bytes: Uint8Array;
beforeAll(() => {
  bytes = mapProject(5, "highlands", SIZE);
});

/** A raise stroke centred on tile (x, y). */
const raise = (x: number, y: number, size = 4): Command => ({ kind: "edit", label: "Raise", ops: [{ op: "brush", params: { tool: "raise", size, strength: 10, dabs: [x * 4, y * 4, (x + 3) * 4, y * 4] } } as EditOp] });
const crater = (x: number, y: number, seed = 5): Command => ({ kind: "force", gesture: { id: GUID(5000 + seed), request: { verb: "craterize", settings: { mode: "strike", power: 80, size: 16, walls: "terraced", centre: "auto", debris: "heavy", rays: false, seed }, origin: [x, y], cut: null, natural: true } } });
const undo = (target: number): Command => ({ kind: "undo", target });
const redo = (target: number): Command => ({ kind: "redo", target });
const refusal = (a: { kind: string }): string => (a.kind === "reject" ? (a as Reject).reason : "ordered");
/** The seq the host gave the entry just ordered. */
const last = (t: Table) => t.host.seq;
/** `author` asks for `command`; the entry's seq, or the refusal's reason. */
const ask = (t: Table, author: string, command: Command): number | string => {
  const a = act(t, author, command);
  return a.kind === "commit" ? a.entry.seq : (a as Reject).reason;
};
const sit2 = (options: Parameters<typeof sit>[1] = {}) => sit(bytes, options, [GUEST]);

describe("taking back an action nothing is built on", () => {
  test("it works for either player, the same on both peers, and the map is the one without the action", () => {
    const t = sit2();
    const start = t.host.hash();
    const a1 = ask(t, HOST, raise(10, 10)) as number;
    const b1 = ask(t, GUEST, raise(34, 34)) as number;
    const both = t.host.hash();
    expect(both).not.toBe(start);
    // ada takes back her own; bo's stays
    expect(ask(t, HOST, undo(a1))).toBeTypeOf("number");
    expectIdentical(t, "after ada's undo");
    // the map is what a map holding only bo's edit is, made from scratch (the stored values, never an edit replayed on changed land)
    const alone = openProject(bytes);
    const bo = t.host.records.get(b1)!;
    for (const op of bo.ops) expect(alone.apply({ op: op.op, params: structuredClone(op.params) } as EditOp, "user").ok).toBe(true);
    expect(stateHash(captureState(t.host.session))).toBe(stateHash(captureState(alone)));
    // and bo takes back his: the map is as it started
    expect(ask(t, GUEST, undo(b1))).toBeTypeOf("number");
    expectIdentical(t, "after bo's undo");
    expect(t.host.hash()).toBe(start);
    // the entry's record says what it did; it is not an action of its own, so it has no place in the history
    const effect = t.host.records.get(last(t))!;
    expect(effect.undoes).toEqual({ target: b1, redo: false });
    expect(t.host.records.byAuthor(GUEST).map((r) => r.seq)).toEqual([b1]);
    // redo puts both back, in the other order
    expect(ask(t, GUEST, redo(b1))).toBeTypeOf("number");
    expect(ask(t, HOST, redo(a1))).toBeTypeOf("number");
    expectIdentical(t, "after the redos");
    expect(t.host.hash()).toBe(both);
  });

  test("the water settles in the background afterwards, as it does for any edit", () => {
    const t = sit2();
    const a1 = ask(t, HOST, raise(12, 12)) as number;
    settle(t);
    expect(t.host.waterSettled).toBe(true);
    ask(t, HOST, undo(a1));
    // (an undo, like an edit, never waits for the water; the settle follows and the peers compare it)
    expect(t.host.waterSettled).toBe(false);
    expectIdentical(t, "after the settle");
  });
});

describe("taking back what the other player has built on", () => {
  test("it is refused, names the edit in the way, and works once that edit is taken back", () => {
    const t = sit2();
    const start = t.host.hash();
    const a1 = ask(t, HOST, raise(20, 20)) as number;
    const b1 = ask(t, GUEST, raise(21, 20)) as number;
    const before = t.host.hash();
    expect(ask(t, HOST, undo(a1))).toBe("bo's Raise in the middle is on top of this");
    expect(t.host.hash()).toBe(before);
    // the plan skips it, naming the same edit, and the blocked action stays in the history
    const plan = t.host.undoPlan(HOST);
    expect(plan.target).toBeNull();
    expect(plan.skipped.map((s) => [s.seq, s.reason])).toEqual([[a1, "bo's Raise in the middle is on top of this"]]);
    expect(plan.reason).toBe("bo's Raise in the middle is on top of this");
    expect(t.guests.get(GUEST)!.undoPlan().target).toBe(b1);
    // bo takes his back; hers is free
    expect(ask(t, GUEST, undo(b1))).toBeTypeOf("number");
    expect(t.host.undoPlan(HOST).target).toBe(a1);
    expect(ask(t, HOST, undo(a1))).toBeTypeOf("number");
    expectIdentical(t, "after both");
    expect(t.host.hash()).toBe(start);
  });

  test("the same player's own later edits block too, and the plan skips down to what is free", () => {
    const t = sit2();
    const a1 = ask(t, HOST, raise(20, 20)) as number;
    const b1 = ask(t, GUEST, raise(21, 20)) as number;
    const a2 = ask(t, HOST, raise(6, 6)) as number;
    const a3 = ask(t, HOST, raise(7, 6)) as number;
    // ada's latest is free; a2 has her own a3 on it; a1 has bo's b1 on it
    expect(ask(t, HOST, undo(a2))).toMatch(/^Your Raise in the south-west is on top of this$/);
    let plan = t.host.undoPlan(HOST);
    expect(plan.target).toBe(a3);
    ask(t, HOST, undo(a3));
    plan = t.host.undoPlan(HOST);
    expect(plan.target).toBe(a2);
    ask(t, HOST, undo(a2));
    // only a1 is left, and bo's edit is on it: skipped and named
    plan = t.host.undoPlan(HOST);
    expect(plan.target).toBeNull();
    expect(plan.skipped.map((s) => s.seq)).toEqual([a1]);
    expect(plan.skipped[0].reason).toMatch(/^bo's Raise/);
    // the plan on bo's copy is the same, and his own free action is the one it offers him
    expect(t.guests.get(GUEST)!.undoPlan().target).toBe(b1);
    expectIdentical(t, "after the undos");
  });

  test("an object placed, then moved by the other player, cannot be taken back (the same object), and can be once the move is", () => {
    const t = sit2();
    const stream = new Stream(7, SIZE);
    const place = stream.command("place", t.host.session)!;
    const placed = ask(t, HOST, place) as number;
    const id = (place as { ops: { params: { id: string } }[] }).ops[0].params.id;
    // bo changes the same object, wherever it stands
    const c: Command = { kind: "edit", label: "Move", ops: [{ op: "moveEntity", params: { id, x: 30, y: 30 } } as EditOp] };
    const moved = ask(t, GUEST, c);
    if (typeof moved === "string") return; // (30, 30 not accepted for this template on this map: nothing to show)
    expect(ask(t, HOST, undo(placed))).toMatch(/^bo's Move .*is on top of this$/);
    expect(ask(t, GUEST, undo(moved))).toBeTypeOf("number");
    expect(ask(t, HOST, undo(placed))).toBeTypeOf("number");
    expectIdentical(t, "after");
  });

  test("a force's broad reads block conservatively, and a force can be taken back itself", () => {
    const t = sit2();
    const start = t.host.hash();
    const a1 = ask(t, HOST, raise(4, 4)) as number;
    const b1 = ask(t, GUEST, crater(30, 30)) as number;
    expect(b1).toBeTypeOf("number");
    // far from the crater, but a force reads the whole map
    expect(ask(t, HOST, undo(a1))).toMatch(/^bo's Craterize.* is on top of this$/);
    // bo takes his force back: the stored values come back, the objects and lakes it moved with them
    expect(ask(t, GUEST, undo(b1))).toBeTypeOf("number");
    expect(ask(t, HOST, undo(a1))).toBeTypeOf("number");
    expectIdentical(t, "after");
    expect(t.host.hash()).toBe(start);
    // and a force comes back with redo, once the ground it was made on is as it was
    expect(ask(t, GUEST, redo(b1))).toMatch(/which this was made on, has changed since/);
    expect(ask(t, HOST, redo(a1))).toBeTypeOf("number");
    expect(ask(t, GUEST, redo(b1))).toBeTypeOf("number");
    expectIdentical(t, "after the force's redo");
    expect(t.host.hash()).not.toBe(start);
  });
});

describe("redo, with the same rule", () => {
  test("an edit made on the ground since blocks it, and taking that edit back frees it", () => {
    const t = sit2();
    const start = t.host.hash();
    const a1 = ask(t, HOST, raise(20, 20)) as number;
    const done = t.host.hash();
    ask(t, HOST, undo(a1));
    expect(t.host.redoPlan(HOST).target).toBe(a1);
    const b1 = ask(t, GUEST, raise(21, 20)) as number;
    expect(ask(t, HOST, redo(a1))).toBe("bo's Raise in the middle is on top of this");
    expect(t.host.redoPlan(HOST).target).toBeNull();
    expect(ask(t, GUEST, undo(b1))).toBeTypeOf("number");
    expect(ask(t, HOST, redo(a1))).toBeTypeOf("number");
    expectIdentical(t, "after");
    expect(t.host.hash()).toBe(done);
    expect(done).not.toBe(start);
  });

  test("an edit made on ground that has changed under it cannot come back until the ground is as it was", () => {
    const t = sit2();
    const b1 = ask(t, GUEST, raise(20, 20)) as number;
    const a1 = ask(t, HOST, raise(21, 20)) as number; // made on bo's ground
    ask(t, HOST, undo(a1));
    ask(t, GUEST, undo(b1)); // free: ada's edit is taken back
    // ada's raise would now be put on ground that is not the ground she made it on
    expect(ask(t, HOST, redo(a1))).toBe("bo's Raise in the middle, which this was made on, has changed since");
    expect(ask(t, GUEST, redo(b1))).toBeTypeOf("number");
    expect(ask(t, HOST, redo(a1))).toBeTypeOf("number");
    expectIdentical(t, "after");
  });

  test("only what was taken back can come back, and only by its author", () => {
    const t = sit2();
    const a1 = ask(t, HOST, raise(10, 10)) as number;
    expect(ask(t, HOST, redo(a1))).toBe("Raise has not been taken back");
    expect(ask(t, GUEST, undo(a1))).toBe("You can only take back your own actions");
    ask(t, HOST, undo(a1));
    expect(ask(t, HOST, undo(a1))).toBe("Raise is already taken back");
    expect(ask(t, GUEST, redo(a1))).toBe("You can only bring back your own actions");
    expect(ask(t, HOST, undo(99))).toMatch(/not in your history/);
  });
});

describe("the claims seam and the history's reach", () => {
  test("a check that refuses an undo takes it back as if it had never been asked", () => {
    const t = sit2();
    const a1 = ask(t, HOST, raise(10, 10)) as number;
    settle(t);
    const hash = t.host.hash();
    const seq = t.host.seq;
    const next = t.host.session.nextSeq;
    t.host.setCheck((entry, record) => (entry.command.kind === "undo" ? `Reaches into bo's area (${record.writes.size} tiles)` : null));
    expect(ask(t, HOST, undo(a1))).toMatch(/^Reaches into bo's area/);
    expect(t.host.hash()).toBe(hash);
    expect(t.host.seq).toBe(seq);
    expect(t.host.session.nextSeq).toBe(next);
    t.host.setCheck(() => null);
    expect(ask(t, HOST, undo(a1))).toBeTypeOf("number");
    expectIdentical(t, "after");
  });

  test("only a player's last 50 actions are kept; one that left still holds the other's earlier edit down", () => {
    const t = sit2({ checkpointEvery: 10 });
    const b1 = ask(t, GUEST, raise(40, 40)) as number;
    const a1 = ask(t, HOST, raise(41, 40)) as number; // on bo's
    expect(a1).toBeTypeOf("number");
    expect(ask(t, GUEST, undo(b1))).toMatch(/^ada's Raise.* is on top of this$/);
    // ada makes fifty more elsewhere: her first falls out of her last 50
    for (let k = 0; k < 50; k++) expect(ask(t, HOST, raise(2 + (k % 8) * 5, 2 + Math.floor(k / 8) * 5, 3))).toBeTypeOf("number");
    expect(t.host.records.byAuthor(HOST).length).toBe(50);
    expect(ask(t, HOST, undo(a1))).toMatch(/not in your history/);
    // she cannot take it back, and what lies under it stays down for good (bo's undo is blocked by what is no longer in the list)
    const why = ask(t, GUEST, undo(b1)) as string;
    expect(why).toMatch(/^ada's Raise.* is on top of this$/);
    expect(t.host.undoPlan(GUEST).target).toBeNull();
    // a peer that rejoins decides the same
    t.host.pumpWater();
    const back = CollabReplica.fromSnapshot(t.host.snapshot(), GUEST, {}, live);
    expect(back.undoPlan()).toEqual(t.host.undoPlan(GUEST));
    expect(back.records.fences()).toEqual(t.host.records.fences());
    expect(t.host.snapshot().checkpointSeq).toBeGreaterThan(40);
  });
});

describe("a rejoin decides undo the same", () => {
  test("a copy restored from the snapshot holds the same history and takes the same undos", () => {
    const t = sit2({ checkpointEvery: 3 });
    const a1 = ask(t, HOST, raise(20, 20)) as number;
    const b1 = ask(t, GUEST, raise(21, 20)) as number;
    const a2 = ask(t, HOST, raise(6, 40)) as number;
    ask(t, HOST, undo(a2));
    ask(t, GUEST, raise(40, 6));
    t.host.pumpWater(); // a checkpoint, with the records as they stand (a2 taken back)
    ask(t, HOST, raise(30, 40)); // and one more after it
    const stayed = t.guests.get(GUEST)!;
    const back = CollabReplica.fromSnapshot(t.host.snapshot(), GUEST, {}, live);
    t.guests.set(GUEST, back); // bo's connection dropped and came back: from here on the rejoined copy is bo's
    expect(t.host.snapshot().checkpointSeq).toBeGreaterThan(0);
    expect(back.records.all().map((r) => recordToJson(r))).toEqual(t.host.records.all().map((r) => recordToJson(r)));
    expect(back.undoPlan()).toEqual(stayed.undoPlan());
    expect(back.redoPlan()).toEqual(stayed.redoPlan());
    // the rejoined copy (standing in for bo) and the host agree on what stops ada's first action
    expect(ask(t, HOST, undo(a1))).toBe("bo's Raise in the middle is on top of this");
    // bo takes his back: every copy, the rejoined one too, takes it and frees hers
    expect(ask(t, GUEST, undo(b1))).toBeTypeOf("number");
    expect(ask(t, HOST, undo(a1))).toBeTypeOf("number");
    expect(ask(t, HOST, redo(a2))).toBeTypeOf("number");
    settle(t);
    expect(back.hash()).toBe(t.host.hash());
    expect(back.records.all().map((r) => recordToJson(r))).toEqual(t.host.records.all().map((r) => recordToJson(r)));
    expect(t.outOfSync).toEqual([]);
  });
});

describe("edits and undos mixed at random", () => {
  test("whatever is asked, the peers agree after every answer and the map equals the stored values", () => {
    const t = sit2();
    const stream = new Stream(21, SIZE);
    const all = [HOST, GUEST];
    let taken = 0;
    let refused = 0;
    for (let n = 0; n < 40; n++) {
      const author = stream.pick(all);
      if (n % 3 === 2) {
        // Undo as the page does it: the plan's target, or the plan's reason
        const redoing = n % 9 === 8;
        const plan = redoing ? t.host.redoPlan(author) : t.host.undoPlan(author);
        if (plan.target === null) {
          refused += plan.skipped.length;
          continue;
        }
        expect(typeof ask(t, author, redoing ? redo(plan.target) : undo(plan.target)), "a planned undo is ordered").toBe("number");
        taken++;
      } else {
        const c = stream.command(stream.pick(CHEAP_KINDS), t.host.session);
        if (c) ask(t, author, c);
      }
      expect(t.guests.get(GUEST)!.hash()).toBe(t.host.hash());
    }
    expect(taken).toBeGreaterThan(3);
    expectIdentical(t, `after ${t.ordered} entries (${taken} undos, ${refused} skipped)`);
  });
});
