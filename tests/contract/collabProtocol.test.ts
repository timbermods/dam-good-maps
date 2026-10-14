// Collaborative editing's rules (docs/COLLAB-BRIEF.md §1, §9, D362): the host refuses with a plain
// reason and changes nothing, and counts every request so a refusal never strands a player; a replica
// applies only in order; a force whose operation differs from the preview its author saw is refused;
// a guest cannot change the whole map; the water settles in the background and the peers compare it at
// the sequence the host names; a rejoin sends the host's checkpoint, its records and the entries since;
// claims plug in at one seam that runs after the step is applied.

import { beforeAll, describe, expect, test } from "vitest";
import { CollabReplica, settledHash, snapshotProblem, STALE, recordToJson, type Command, type Commit, type LogEntry, type Request } from "../../src/core/collab";
import type { EditOp } from "../../src/core/doc/ops";
import { act, BRUSH_KINDS, CHEAP_KINDS, deliver, GUEST, GUID, HOST, live, mapProject, openProject, projectDiff, settle, sit, Stream, type Kind, type Table } from "./collabFixtures";

const SIZE = 48;
let bytes: Uint8Array;
beforeAll(() => {
  bytes = mapProject(5, "highlands", SIZE);
});

const brush = (n = 0): Command => ({ kind: "edit", label: "Raise", ops: [{ op: "brush", params: { tool: "raise", size: 5, strength: 10, dabs: [60 + n * 8, 60, 80 + n * 8, 80] } }] });
const crater = (x: number, y: number, seed = 5): Command => ({ kind: "force", gesture: { id: GUID(5000 + seed), request: { verb: "craterize", settings: { mode: "strike", power: 80, size: 16, walls: "terraced", centre: "auto", debris: "heavy", rays: false, seed }, origin: [x, y], cut: null, natural: true } } });
const reason = (a: { kind: string }) => (a.kind === "reject" ? (a as unknown as { reason: string }).reason : "ordered");

describe("the host refuses, and nothing changes", () => {
  test("an invalid operation, an unknown message, a made-up author and a made-up edit each get one plain reason", () => {
    const t = sit(bytes, {}, [GUEST]);
    const hash = t.host.hash();
    const past: Command = { kind: "edit", label: "Raise", ops: [{ op: "sculpt", params: { mode: "raise", cells: [[10, 10, 12]], amount: 40 } }] };
    expect(reason(act(t, HOST, past))).toMatch(/amount: must be <= 22/);
    expect(reason(t.host.submit(GUEST, { kind: "request", epoch: 0, counter: 1, baseSeq: 0, command: { kind: "edit", label: "x", ops: [] } }))).toMatch(/not valid/);
    expect(reason(t.host.submit(GUEST, { hello: 1 }))).toMatch(/no request number/);
    // a force travels as its gesture, never as its result
    expect(reason(act(t, HOST, { kind: "edit", label: "x", ops: [{ op: "forceResult", params: {} }] } as unknown as Command))).toMatch(/gesture/);
    // a Select action travels without its tiles: the host works them out, a client's are not trusted
    const withTiles = { ...t.host.request({ kind: "select", label: "x", ops: [{ op: "sculpt", params: { mode: "raise", cells: [[10, 10, 12]], amount: 1 } }] }), command: { kind: "select", label: "x", tiles: [1, 2], ops: [{ op: "sculpt", params: { mode: "raise", cells: [[10, 10, 12]], amount: 1 } }] } };
    expect(reason(t.host.submit(HOST, withTiles))).toMatch(/unknown property "tiles"/);
    // a force with no seed is not guessed at
    const noSeed = crater(20, 20);
    delete (noSeed as { gesture: { request: { settings: { seed?: number } } } }).gesture.request.settings.seed;
    expect(reason(act(t, HOST, noSeed))).toMatch(/needs its seed/);
    expect(reason(t.host.submit("mallory", t.host.request(brush(), "mallory")))).toMatch(/not in this session/);
    expect(t.host.seq).toBe(0);
    expect(t.host.hash()).toBe(hash);
    expect(t.refused.every((r) => !r.includes("\n"))).toBe(true);
  });

  test("a refused request never strands the player: every request is counted, through a replica", () => {
    const t = sit(bytes, {}, [GUEST]);
    const bo = t.guests.get(GUEST)!;
    const send = (c: Command) => {
      const r = bo.request(c) as Request;
      const a = t.host.submit(GUEST, r);
      if (a.kind === "commit") deliver(t, a);
      return a;
    };
    expect(reason(send({ kind: "edit", label: "x", ops: [] } as unknown as Command))).toMatch(/not valid/);
    expect(reason(send({ kind: "newMap", name: "Elsewhere" }))).toMatch(/Only the host/);
    expect(reason(send(brush()))).toBe("ordered");
    // the page's force request carries its gesture number (and the water has settled for it to plan on)
    settle(t);
    const withGesture = crater(24, 24);
    (withGesture as { gesture: { request: { gesture?: number } } }).gesture.request.gesture = 3;
    expect(reason(send(withGesture))).toBe("ordered");
    // a request made for another map is counted and refused too
    const old = { ...(bo.request(brush(1)) as Request), epoch: 9 };
    expect(reason(t.host.submit(GUEST, old))).toMatch(/another map/);
    expect(reason(send(brush(2)))).toBe("ordered");
  });

  test("a request counted twice, or out of order, is refused", () => {
    const t = sit(bytes, {}, [GUEST]);
    const r = t.guests.get(GUEST)!.request(brush(0)) as Request;
    expect(t.host.submit(GUEST, r).kind).toBe("commit");
    expect(reason(t.host.submit(GUEST, r))).toMatch(/already received/);
    expect(reason(t.host.submit(GUEST, { ...r, counter: r.counter + 2 }))).toMatch(/missing/);
    expect(t.host.seq).toBe(1);
  });
});

describe("a force is kept only if it is the one its author saw", () => {
  test("the host compares the operation it plans with the author's preview; with none, any change since refuses", () => {
    const t = sit(bytes, {}, [GUEST]);
    const bo = t.guests.get(GUEST)!;
    settle(t);
    const gesture = (crater(24, 24) as Extract<Command, { kind: "force" }>).gesture;
    const shown = bo.previewForce(gesture);
    expect(shown.ok).toBe(true);
    if (!shown.ok) return;
    // ada paints a stroke on the very ground the crater will reach, before bo's request arrives
    const cells: [number, number, number][] = Array.from({ length: 25 }, (_, k): [number, number, number] => [12 + k, 12, 36]);
    expect(reason(act(t, HOST, { kind: "select", label: "Flatten", ops: [{ op: "sculpt", params: { mode: "flatten", level: 12, cells } }] }))).toBe("ordered");
    settle(t);
    const late = bo.request({ kind: "force", gesture: { ...gesture, preview: shown.preview } }) as Request;
    const refused = t.host.submit(GUEST, { ...late, baseSeq: 0 });
    expect(reason(refused)).toBe(STALE);
    expect(t.host.seq).toBe(1);
    // drawn again on the map as it is now, it is ordered
    const again = bo.previewForce(gesture);
    expect(again.ok && again.preview).not.toBe(shown.preview);
    expect(reason(act(t, GUEST, { kind: "force", gesture }))).toBe("ordered");
    // without a preview, a force planned before any entry that changed the map is refused whatever it would do
    const t2 = sit(bytes, {}, [GUEST]);
    const early = t2.guests.get(GUEST)!.request({ kind: "force", gesture }) as Request;
    expect(reason(act(t2, HOST, brush()))).toBe("ordered");
    expect(reason(t2.host.submit(GUEST, early))).toMatch(/draw the force again/);
  });

  test("a force waits for the settled water: busy until the settle has run, then ordered", () => {
    const t = sit(bytes, {}, [GUEST]);
    expect(reason(t.host.submit(HOST, t.host.request(brush())))).toBe("ordered");
    expect(t.host.waterSettled).toBe(false);
    const busy = t.host.submit(HOST, t.host.request(crater(24, 24)));
    expect(busy.kind === "reject" && busy.busy).toBe(true);
    expect(reason(busy)).toMatch(/still settling/);
    // the author's preview waits too
    const bo = openReplica(t);
    expect(bo.previewForce((crater(24, 24) as Extract<Command, { kind: "force" }>).gesture)).toMatchObject({ ok: false, busy: true });
    expect(t.host.pumpWater()).toMatchObject({ kind: "settled", seq: 0 + 1, since: 0 });
    expect(reason(t.host.submit(HOST, t.host.request(crater(24, 24))))).toBe("ordered");
  });
});

/** A replica of the host's map as it stands now. */
function openReplica(t: Table) {
  return CollabReplica.fromSnapshot(t.host.snapshot(), GUEST, {}, live);
}

describe("the water settles in the background", () => {
  test("a settle a newer entry overtakes is dropped; the host names the batch and the peers compare at that sequence", () => {
    const t = sit(bytes, {}, [GUEST]);
    const bo = t.guests.get(GUEST)!;
    act(t, HOST, brush(0));
    // a slice of the settle runs, then another entry lands: the settle starts again on the new map
    expect(t.host.pumpWater(1)).toBeNull();
    act(t, GUEST, brush(1));
    const settled = t.host.pumpWater();
    expect(settled).toMatchObject({ kind: "settled", seq: 2, since: 0 });
    expect(t.host.pumpWater(), "announced once").toBeNull();
    // bo has not settled yet: the announcement waits, then is compared when bo's own settle is for that sequence
    expect(bo.receive(settled).ok).toBe(true);
    expect(t.settles).toBe(0);
    expect(bo.pumpWater()).toBe(true);
    expect(t.settles).toBe(1);
    // an entry that lands after the announcement makes it moot: no comparison, no complaint
    act(t, HOST, brush(2));
    expect(bo.receive({ ...settled, seq: 2, hash: "00000000" }).ok).toBe(true);
    expect(bo.status).toBe("live");
    // a settle that differs is found
    settle(t);
    const wrong = { ...(t.host.pumpWater() ?? { kind: "settled" as const, epoch: 0, seq: t.host.seq, since: 2, hash: settledHash(t.host.session) }), hash: "00000000" };
    const verdict = bo.receive(wrong);
    expect(verdict.ok).toBe(false);
    expect(bo.status).toBe("out-of-sync");
  });
});

describe("a replica applies only in order", () => {
  test("a gap, a duplicate and an entry of another map are refused, and the copy stays as it was", () => {
    const t = sit(bytes, {}, []);
    const start = t.host.snapshot();
    const commits: Commit[] = [];
    for (let n = 0; n < 3; n++) {
      const c = t.host.submit(HOST, t.host.request(brush(n)));
      expect(c.kind).toBe("commit");
      commits.push(c as Commit);
    }
    const r = CollabReplica.fromSnapshot(start, GUEST);
    expect(r.seq).toBe(0);
    const startHash = r.hash();
    const gap = r.receive(commits[1]);
    expect(!gap.ok && gap.reason).toMatch(/Entry 1 is missing/);
    expect(r.hash()).toBe(startHash);
    expect(r.receive(commits[0]).ok).toBe(true);
    const dup = r.receive(commits[0]);
    expect(!dup.ok && dup.reason).toMatch(/already applied/);
    expect(r.receive(commits[1]).ok).toBe(true);
    expect(r.receive(commits[2]).ok).toBe(true);
    expect(r.hash()).toBe(t.host.hash());
    expect(r.receive({ ...commits[0], entry: { ...commits[0].entry, seq: 4, epoch: 7 } }).ok).toBe(false);
    // a commit whose hash is not this copy's marks it out of step, and it will not take more
    const wrong = t.host.submit(HOST, t.host.request(brush(6))) as Commit;
    const verdict = r.receive({ ...wrong, hash: "deadbeef" });
    expect(!verdict.ok && verdict.reason).toMatch(/differs from the host's/);
    expect(r.status).toBe("out-of-sync");
    expect(r.request(brush())).toEqual({ refused: expect.stringMatching(/out of step/) });
  });

  test("a message that is not well formed is refused with its reason", () => {
    const t = sit(bytes, {}, [GUEST]);
    const g = t.guests.get(GUEST)!;
    expect(g.receive({ kind: "commit", entry: { kind: "entry", seq: 1 }, hash: "00000000" }).ok).toBe(false);
    expect(g.receive("hello").ok).toBe(false);
    expect(g.receive({ kind: "map-opening", author: HOST, name: "" }).ok).toBe(false);
  });
});

describe("whole-map changes are the host's alone", () => {
  test("a guest cannot; the host's own request must say openMap", () => {
    const t = sit(bytes, {}, [GUEST]);
    expect(reason(act(t, GUEST, { kind: "newMap", name: "Somewhere else" }))).toBe("Only the host can open a new map");
    expect(reason(act(t, HOST, { kind: "newMap", name: "Somewhere else" }))).toMatch(/openMap/);
    expect(t.host.seq).toBe(0);
  });

  test("the guest hears of a new map first, keeps the old one, and loads the new one", () => {
    const t = sit(bytes, {}, []);
    const events: string[] = [];
    const guest = CollabReplica.fromSnapshot(t.host.snapshot(), GUEST, {
      opening: (e) => events.push(`opening ${e.name} by ${e.author}`),
      newMap: (e) => events.push(`newMap ${e.name} previous ${e.previousProject.length > 1000}`),
    }, live);
    t.host.join(GUEST);
    t.guests.set(GUEST, guest);
    act(t, HOST, brush());
    settle(t);
    const oldHash = t.host.hash();
    const next = openProject(bytes);
    const { opening, commit, previousProject } = t.host.openMap("The same map, renamed", next);
    // the old map is handed back for Your maps: it opens as the map that was
    expect(openProject(previousProject).built.heights).toEqual(guest.session.built.heights);
    guest.receive(opening);
    expect(guest.status).toBe("opening");
    expect(guest.request(brush())).toEqual({ refused: "The same map, renamed is opening a new map" });
    guest.receive(commit);
    expect(guest.status).toBe("needs-map");
    expect(guest.hash()).toBe(oldHash);
    expect(events).toEqual(["opening The same map, renamed by ada", "newMap The same map, renamed previous true"]);
    // a request against the old map is refused by the host (and counted)
    const late = t.host.submit(GUEST, { kind: "request", epoch: 0, counter: 1, baseSeq: 1, command: brush() });
    expect(reason(late)).toMatch(/opened another map/);
    // the guest adopts the host's new map and edits again
    expect(guest.adopt(t.host.snapshot()).ok).toBe(true);
    expect(guest.status).toBe("live");
    expect(guest.epoch).toBe(1);
    expect(guest.hash()).toBe(t.host.hash());
    expect(reason(act(t, GUEST, brush()))).toBe("ordered");
    expect(guest.hash()).toBe(t.host.hash());
    expect(guest.seq).toBe(1);
  });
});

describe("the claims seam", () => {
  test("it runs after the step is applied, sees the exact footprint, and a refusal takes the step back", () => {
    const seen: string[] = [];
    const t = sit(bytes, {
      check: (entry, record, state) => {
        seen.push(`${entry.author}:${entry.command.kind}:${record.writes.size > 0}`);
        expect(state.seq).toBe(entry.seq - 1);
        // (the host's map already shows the step)
        expect(record.changed).toBe(true);
        return entry.author === GUEST && entry.command.kind !== "edit" ? "reaches into ada's area" : null;
      },
    });
    const hash = t.host.hash();
    const doc = t.host.session.project();
    expect(act(t, HOST, brush()).kind).toBe("commit");
    const afterOne = t.host.session.project();
    // a force by bo: the footprint the check saw is the force's exact result
    const refused = act(t, GUEST, crater(24, 24));
    expect(reason(refused)).toBe("reaches into ada's area");
    expect(seen).toEqual(["ada:edit:true", "bo:force:true"]);
    expect(t.host.seq).toBe(1);
    // (the log, its numbers and the features are as they were; only the stored map differs, as the force made the water settle)
    expect(projectDiff(t.host.session.project(), afterOne, ["stored"])).toBe("");
    expect(t.host.hash()).toBe(t.guests.get(GUEST)!.hash());
    expect(hash).not.toBe(t.host.hash());
    void doc;
    // the sequence did not advance: the next entry takes its number, and every peer agrees
    expect(act(t, GUEST, brush(3)).kind).toBe("commit");
    expect(t.host.seq).toBe(2);
    settle(t);
    expect(projectDiff(t.guests.get(GUEST)!.session.project(), t.host.session.project())).toBe("");
    // the default lets everything through, and the check can be set later
    const open = sit(bytes, {}, [GUEST]);
    expect(act(open, GUEST, brush()).kind).toBe("commit");
    open.host.setCheck(() => "closed");
    expect(reason(act(open, GUEST, brush(2)))).toBe("closed");
  });
});

describe("a rejoin is the host's checkpoint, its records and the entries since", () => {
  test("after thirty edits and a checkpoint every ten, the restored copy holds what the host holds", () => {
    // (the host never waits on the water while the edits go in; its checkpoints come when a settle completes)
    const t = sit(bytes, { checkpointEvery: 10 }, []);
    t.host.join(GUEST);
    const stream = new Stream(11, SIZE);
    const kinds: readonly Kind[] = [...BRUSH_KINDS, ...BRUSH_KINDS, ...CHEAP_KINDS];
    let ordered = 0;
    for (let n = 0; n < 32; n++) {
      const kind = n === 15 ? "craterize" : stream.pick(kinds);
      const c = stream.command(kind, t.host.session);
      if (!c) continue;
      const author = n % 3 === 0 ? GUEST : HOST;
      if (kind === "craterize") t.host.pumpWater();
      if (t.host.submit(author, t.host.request(c, author)).kind === "commit") ordered++;
      if (n % 12 === 11) t.host.pumpWater();
    }
    expect(ordered).toBeGreaterThan(20);
    const snapshot = t.host.snapshot();
    // never the whole history: the latest checkpoint and the entries after it
    expect(snapshot.checkpointSeq).toBeGreaterThanOrEqual(10);
    expect(snapshot.tail.length).toBeLessThan(ordered);
    expect(snapshot.checkpointSeq + snapshot.tail.length).toBe(t.host.seq);
    expect(snapshot.records.length).toBeGreaterThan(0);
    expect(snapshotProblem(snapshot)).toBeNull();
    // bo's connection dropped and comes back: a new copy from the snapshot
    const back = CollabReplica.fromSnapshot(snapshot, GUEST, {}, live);
    t.guests.set(GUEST, back);
    expect(back.seq).toBe(t.host.seq);
    expect(back.hash()).toBe(t.host.hash());
    // it holds the records the host holds (each player's last 50), not only the ones since
    expect(back.records.all().map((r) => recordToJson(r))).toEqual(t.host.records.all().map((r) => recordToJson(r)));
    // once the water has settled the two are one map, though one restored from a settled checkpoint and the other never waited
    settle(t);
    expect(t.outOfSync).toEqual([]);
    expect(settledHash(back.session)).toBe(settledHash(t.host.session));
    expect(Buffer.compare(back.session.exportTimber().bytes, t.host.session.exportTimber().bytes)).toBe(0);
    expect(projectDiff(back.session.project(), t.host.session.project())).toBe("");
    // bo's counter carries on, and the restored copy takes the next edit like one that never left
    expect(reason(act(t, GUEST, brush(2)))).toBe("ordered");
    expect(back.hash()).toBe(t.host.hash());
    // a snapshot whose entries are not in order after its checkpoint is refused
    expect(snapshotProblem({ ...snapshot, tail: snapshot.tail.slice(1) })).toMatch(/not in order/);
    void ({} as LogEntry);
    void ({} as EditOp);
  });
});
