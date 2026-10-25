// Undo with two players (docs/COLLAB-BRIEF.md §5): each player takes back only their own actions, the last 50 of
// them. Where the other player (or the same player, later) has built on the same ground, the undo is refused and
// skipped, naming the action in the way, and it comes back to life when that action is taken back. An undo restores
// the stored values: the map after it is the map without the action, never an edit replayed onto changed land. Every
// peer decides the same from the same records, a rejoined one too.

import { beforeAll, describe, expect, test } from "vitest";
import { blockLine, boxOf, captureState, CollabReplica, Mask, placeOf, recordToJson, stateHash, type Command, type Reject } from "../../src/core/collab";
import type { EditOp } from "../../src/core/doc/ops";
import { decodeProject } from "../../src/core/doc/document";
import { MapSession } from "../../src/core/doc/session";
import { act, expectIdentical, GUEST, GUID, HOST, live, mapProject, openProject, settle, sit, Stream, type Table } from "./collabFixtures";

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

describe("what the plans skip besides the rule", () => {
  test("a refusal the rule did not foresee (a claim, the safety net) is skipped until the next entry, on the host and on the player's copy", () => {
    const t = sit2();
    const b1 = ask(t, GUEST, raise(6, 6)) as number;
    const b2 = ask(t, GUEST, raise(30, 6)) as number;
    t.host.setCheck((entry, record) => (record.undoes?.target === b2 && entry.command.kind === "undo" ? "Reaches into ada's area" : null));
    const refused = act(t, GUEST, undo(b2)) as Reject;
    expect(refused.reason).toBe("Reaches into ada's area");
    expect(refused.target).toBe(b2);
    // Undo no longer offers it; the plan says why it skipped it, and takes the one before
    const bo = t.guests.get(GUEST)!;
    expect(bo.undoPlan().target).toBe(b1);
    expect(bo.undoPlan().skipped).toEqual([{ seq: b2, label: "Raise", where: expect.any(String), reason: "Reaches into ada's area" }]);
    expect(t.host.undoPlan(GUEST).target).toBe(b1);
    // the next entry, anyone's, lets it be offered again
    ask(t, HOST, raise(6, 40));
    expect(bo.undoPlan().target).toBe(b2);
    expect(t.host.undoPlan(GUEST).target).toBe(b2);
    // a claim answers with a mask test of what the action wrote
    const area = new Mask(SIZE * SIZE);
    for (const i of t.host.records.get(b2)!.writes.tiles()) area.add(i);
    bo.setVeto((r) => (r.writes.intersects(area) ? "That is in ada's area" : null));
    expect(bo.undoPlan().target).toBe(b1);
    expect(t.host.undoPlan(GUEST, (r) => (r.writes.intersects(area) ? "That is in ada's area" : null)).skipped[0].reason).toBe("That is in ada's area");
    bo.setVeto(undefined);
    // a block carries what the page needs to word it: the author's id, the tool, the place, the sequence and the box of tiles
    t.host.setCheck(() => null);
    const a1 = ask(t, HOST, raise(20, 20)) as number;
    const b3 = ask(t, GUEST, raise(21, 20)) as number;
    const blocked = act(t, HOST, undo(a1)) as Reject;
    expect(blocked.block).toMatchObject({ why: "on-top", author: GUEST, label: "Raise", seq: b3 });
    expect(blocked.block!.box).toEqual(boxOf(SIZE, SIZE, t.host.records.get(b3)!.writes));
    expect(t.host.undoPlan(HOST).skipped.find((x) => x.seq === a1)!.block).toEqual(blocked.block);
  });

  test("a line never names a player it does not know", () => {
    const gone = { why: "changed", seq: 3, author: "", label: "", where: "", box: null } as const;
    expect(blockLine(gone, "ada")).toBe("An earlier edit under this has changed for good");
    expect(blockLine({ ...gone, why: "on-top" }, "ada")).toBe("An older edit is on top of this");
    expect(blockLine({ why: "on-top", seq: 3, author: "bo", label: "Raise", where: "at the lake", box: null }, "ada", (id) => id.toUpperCase())).toBe("BO's Raise at the lake is on top of this");
  });

  test("after a redo, Undo takes the action just brought back", () => {
    const t = sit2();
    const a1 = ask(t, HOST, raise(6, 6)) as number;
    const a2 = ask(t, HOST, raise(30, 6)) as number;
    expect(t.host.undoPlan(HOST).target).toBe(a2);
    ask(t, HOST, undo(a1));
    expect(t.host.undoPlan(HOST).target).toBe(a2);
    ask(t, HOST, redo(a1));
    // a2 has the higher sequence, but a1 is the one done last
    expect(t.host.undoPlan(HOST).target).toBe(a1);
    ask(t, HOST, undo(a1));
    expect(t.host.undoPlan(HOST).target).toBe(a2);
    expectIdentical(t, "after");
  });
});

describe("the records an undo leaves", () => {
  test("an undo's effect is kept until the settle that follows its batch is announced, however many entries come between", () => {
    const t = sit2();
    const a1 = ask(t, HOST, raise(6, 6)) as number;
    const u = ask(t, HOST, undo(a1)) as number;
    for (let k = 0; k < 110; k++) ask(t, GUEST, raise(2 + (k % 8) * 5, 20 + Math.floor(k / 8) * 2, 3));
    expect(t.host.records.get(u)?.undoes).toEqual({ target: a1, redo: false });
    expect(t.guests.get(GUEST)!.records.get(u)?.undoes).toEqual({ target: a1, redo: false });
    settle(t); // the batch since the start, with the undo in it: it is the water note's to name
    expect(t.host.records.get(u)).toBeDefined();
    ask(t, GUEST, raise(40, 5));
    settle(t); // the next batch: the first one's effects can go
    expect(t.host.records.get(u)).toBeUndefined();
    expect(t.guests.get(GUEST)!.records.get(u)).toBeUndefined();
  });

  test("a fence goes once every action kept is later than it", () => {
    const t = sit2();
    const b1 = ask(t, GUEST, raise(40, 40)) as number;
    ask(t, HOST, raise(41, 40));
    for (let k = 0; k < 50; k++) ask(t, HOST, raise(2 + (k % 8) * 5, 2 + Math.floor(k / 8) * 5, 3));
    expect(t.host.records.fences().tiles.length, "ada's first fell out while standing: it fences bo's first").toBeGreaterThan(0);
    expect(ask(t, GUEST, undo(b1))).toMatch(/is on top of this$/);
    // bo's first falls out in turn; everything kept is later than the fence now
    for (let k = 0; k < 50; k++) ask(t, GUEST, raise(2 + (k % 8) * 5, 2 + Math.floor(k / 8) * 5, 3));
    expect(t.host.records.fences()).toEqual({ tiles: [], keys: [], who: [] });
  });
});

describe("a place in words", () => {
  const tilesAt = (...xy: [number, number][]) => {
    const m = new Mask(SIZE * SIZE);
    for (const [x, y] of xy) m.add(y * SIZE + x);
    return m;
  };
  const open = (seed: number, theme: "highlands" | "canyon") => MapSession.open(decodeProject(mapProject(seed, theme, SIZE)));
  const centre = (outline: number[][]): [number, number] => [Math.floor(outline.reduce((a, p) => a + p[0], 0) / outline.length), Math.floor(outline.reduce((a, p) => a + p[1], 0) / outline.length)];
  /** The distance from a tile's centre to a path. */
  const apart = (path: number[][], x: number, y: number) =>
    Math.min(
      ...path.slice(1).map(([bx, by], k) => {
        const [ax, ay] = path[k];
        const dx = bx - ax;
        const dy = by - ay;
        const t = Math.max(0, Math.min(1, ((x + 0.5 - ax) * dx + (y + 0.5 - ay) * dy) / (dx * dx + dy * dy || 1)));
        return Math.hypot(x + 0.5 - ax - t * dx, y + 0.5 - ay - t * dy);
      }),
    );

  test("a lake, the start and a river are named; a compass word only when there are several of the kind", () => {
    const one = open(1, "highlands");
    const lakes = one.features.filter((f) => f.kind === "lake");
    expect(lakes.length, "the map has a single lake").toBe(1);
    const [lx, ly] = centre((lakes[0].params as { outline: number[][] }).outline);
    expect(placeOf(one, tilesAt([lx, ly], [lx + 1, ly]))).toBe("at the lake");
    const start = one.features.find((f) => f.kind === "start")!;
    const [sx, sy] = (start.params as { position: [number, number] }).position;
    expect(placeOf(one, tilesAt([Math.round(sx), Math.round(sy)]))).toBe("by the start");
    // (a spring cave's stream is "the cave", not one more river, D488)
    const caves = one.features.filter((f) => f.kind === "river" && f.role?.startsWith("river/caveSpring/"));
    const mains = one.features.filter((f) => f.kind === "river" && !caves.includes(f));
    expect(mains.length, "a single river needs no compass word").toBe(1);
    const [ox, oy] = (mains[0].params as { path: number[][] }).path[1];
    expect(placeOf(one, tilesAt([Math.floor(ox), Math.floor(oy)]))).toBe("at the river");
    if (caves.length === 1) {
      const [cx, cy] = (caves[0].params as { path: number[][] }).path[0];
      expect(placeOf(one, tilesAt([Math.floor(cx), Math.floor(cy)]))).toBe("at the cave");
    }
    const three = open(5, "highlands");
    const rivers = three.features.filter((f) => f.kind === "river");
    expect(rivers.length).toBeGreaterThan(1);
    const path = (rivers[0].params as { path: number[][] }).path;
    const [rx, ry] = path[Math.floor(path.length / 2)];
    expect(placeOf(three, tilesAt([Math.floor(rx), Math.floor(ry)]))).toMatch(/^at the (north|south|east|west|north-east|north-west|south-east|south-west|middle) river$/);
    // two lakes: the one that holds the tiles, with where it lies
    const two = open(3, "canyon");
    const both = two.features.filter((f) => f.kind === "lake");
    expect(both.length).toBe(2);
    for (const lake of both) {
      const [x, y] = (lake.params as { outline: number[][] }).outline[0];
      expect(placeOf(two, tilesAt([Math.floor(x), Math.floor(y)]))).toMatch(/^at the (north|south|east|west|north-east|north-west|south-east|south-west|middle) lake$/);
    }
  });

  test("only the feature's own ground counts: far from a river's water the place is a compass word, not the river", () => {
    for (const [seed, theme] of [[5, "highlands"], [1, "highlands"], [3, "canyon"]] as const) {
      const s = open(seed, theme);
      const rivers = s.features.filter((f) => f.kind === "river").map((f) => f.params as { path: number[][]; width: number; banks?: boolean });
      for (const r of rivers) {
        // the corners of the rectangle round the river's path: a diagonal river leaves far corners
        const xs = r.path.map((p) => p[0]);
        const ys = r.path.map((p) => p[1]);
        for (const [x, y] of [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.min(...ys)], [Math.min(...xs), Math.max(...ys)], [Math.max(...xs), Math.max(...ys)]] as const) {
          const tx = Math.max(0, Math.min(SIZE - 1, Math.floor(x)));
          const ty = Math.max(0, Math.min(SIZE - 1, Math.floor(y)));
          if (rivers.some((q) => apart(q.path, tx, ty) <= q.width / 2 + 4)) continue;
          expect(placeOf(s, tilesAt([tx, ty])), `a corner of the rectangle round a river (${theme} ${seed})`).not.toMatch(/river/);
        }
      }
    }
    // (no tile, and the whole map, name no place)
    const s = open(5, "highlands");
    expect(placeOf(s, new Mask(SIZE * SIZE, true))).toBe("");
    expect(placeOf(s, new Mask(SIZE * SIZE))).toBe("");
    expect(placeOf(s, tilesAt([1, 1], [2, 1]))).toMatch(/^in the /);
  });
});
