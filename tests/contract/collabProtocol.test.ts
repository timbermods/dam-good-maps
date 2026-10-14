// Collaborative editing's rules (docs/COLLAB-BRIEF.md §1, §9, D362): the host refuses with a plain
// reason and changes nothing; a replica applies only in order; a force planned on a map that has since
// changed is refused; a guest cannot change the whole map; a rejoin sends the host's current map plus
// the entries since, and the restored copy is identical; claims plug in at one seam.

import { beforeAll, describe, expect, test } from "vitest";
import { CollabHost, CollabReplica, messageProblem, snapshotProblem, type Command, type Commit, type LogEntry } from "../../src/core/collab";
import { act, BRUSH_KINDS, CHEAP_KINDS, deliver, GUEST, HOST, live, mapProject, openProject, sameProject, sit, Stream, type Kind } from "./collabFixtures";

const SIZE = 48;
let bytes: Uint8Array;
beforeAll(() => {
  bytes = mapProject(5, "highlands", SIZE);
});

const brush = (n = 0): Command => ({ kind: "edit", label: "Raise", ops: [{ op: "brush", params: { tool: "raise", size: 5, strength: 10, dabs: [100 + n * 8, 100, 120 + n * 8, 120] } }] });

describe("the host refuses, and nothing changes", () => {
  test("an invalid operation, an unknown message and a made-up author each get one plain reason", () => {
    const t = sit(bytes, {}, [GUEST]);
    const hash = t.host.hash();
    const sculptPastTheCeiling: Command = { kind: "edit", label: "Raise", ops: [{ op: "sculpt", params: { mode: "raise", cells: [[10, 10, 12]], amount: 40 } }] };
    const first = act(t, HOST, sculptPastTheCeiling);
    expect(first.kind).toBe("reject");
    expect(first.kind === "reject" && first.reason).toMatch(/amount: must be <= 22/);
    // a request that is not well formed
    const bad = t.host.submit(GUEST, { kind: "request", epoch: 0, counter: 1, baseSeq: 0, command: { kind: "edit", label: "x", ops: [] } });
    expect(bad.kind === "reject" && bad.reason).toMatch(/not valid/);
    const notARequest = t.host.submit(GUEST, { hello: 1 });
    expect(notARequest.kind === "reject" && notARequest.reason).toBeTruthy();
    // a force travels as its gesture, never as its result
    const asResult = { kind: "edit", label: "x", ops: [{ op: "forceResult", params: {} }] } as unknown as Command;
    expect(act(t, HOST, asResult).kind).toBe("reject");
    // someone who has not joined
    const stranger = t.host.submit("mallory", t.host.request(brush(), "mallory"));
    expect(stranger.kind === "reject" && stranger.reason).toMatch(/not in this session/);
    expect(t.host.seq).toBe(0);
    expect(t.host.hash()).toBe(hash);
    expect(t.refused.every((r) => !r.includes("\n"))).toBe(true);
  });

  test("a request counted twice, or out of order, is refused", () => {
    const t = sit(bytes, {}, [GUEST]);
    const r = t.guests.get(GUEST)!.request(brush(0)) as ReturnType<CollabHost["request"]>;
    const first = t.host.submit(GUEST, r);
    expect(first.kind).toBe("commit");
    const again = t.host.submit(GUEST, r);
    expect(again.kind === "reject" && again.reason).toMatch(/already received/);
    const skipped = t.host.submit(GUEST, { ...r, counter: r.counter + 2 });
    expect(skipped.kind === "reject" && skipped.reason).toMatch(/missing/);
    expect(t.host.seq).toBe(1);
  });

  test("a force planned before the map changed is refused, and works again on the new map", () => {
    const t = sit(bytes, {}, [GUEST]);
    const stream = new Stream(3, SIZE);
    const guest = t.guests.get(GUEST)!;
    // bo draws a force on the map at seq 0; before it is sent, ada's stroke lands
    const late = guest.request(stream.command("craterize", t.host.session)!) as ReturnType<CollabHost["request"]>;
    expect(act(t, HOST, brush()).kind).toBe("commit");
    const refused = t.host.submit(GUEST, late);
    expect(refused.kind).toBe("reject");
    expect(refused.kind === "reject" && refused.reason).toMatch(/draw the force again/);
    expect(t.host.seq).toBe(1);
    // an edit made at the same moment is not stale: ordered after ada's, it applies on the map as it is
    const edit = guest.request(brush(3)) as ReturnType<CollabHost["request"]>;
    expect(act(t, HOST, brush(5)).kind).toBe("commit");
    const ordered = t.host.submit(GUEST, edit);
    expect(ordered.kind).toBe("commit");
    deliver(t, ordered as Commit);
    expect(guest.hash()).toBe(t.host.hash());
    // the force drawn again on the map as it is now is ordered
    expect(act(t, GUEST, stream.command("craterize", t.host.session)!).kind).toBe("commit");
    expect(guest.hash()).toBe(t.host.hash());
  });

  test("a guest cannot change the whole map, and the host's own request must say so", () => {
    const t = sit(bytes, {}, [GUEST]);
    const asked = act(t, GUEST, { kind: "newMap", name: "Somewhere else" });
    expect(asked.kind === "reject" && asked.reason).toBe("Only the host can open a new map");
    const hostAsks = act(t, HOST, { kind: "newMap", name: "Somewhere else" });
    expect(hostAsks.kind === "reject" && hostAsks.reason).toMatch(/openMap/);
    expect(t.host.seq).toBe(0);
  });

  test("the claims seam refuses an entry with the reason it returns, before anything is applied", () => {
    const seen: LogEntry[] = [];
    const t = sit(bytes, {
      check: (entry, state) => {
        seen.push(entry);
        expect(state.seq).toBe(entry.seq - 1);
        return entry.author === GUEST && entry.command.kind === "edit" ? "reaches into ada's area" : null;
      },
    });
    const hash = t.host.hash();
    const refused = act(t, GUEST, brush());
    expect(refused.kind === "reject" && refused.reason).toBe("reaches into ada's area");
    expect(t.host.hash()).toBe(hash);
    expect(t.host.seq).toBe(0);
    expect(act(t, HOST, brush()).kind).toBe("commit");
    expect(seen.map((e) => e.author)).toEqual([GUEST, HOST]);
    expect(seen[0].seq).toBe(1);
    // the default lets everything through, and the check can be set later
    const open = sit(bytes, {}, [GUEST]);
    expect(act(open, GUEST, brush()).kind).toBe("commit");
    open.host.setCheck(() => "closed");
    expect(act(open, GUEST, brush(2)).kind).toBe("reject");
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
    expect(gap.ok).toBe(false);
    expect(!gap.ok && gap.reason).toMatch(/Entry 1 is missing/);
    expect(r.hash()).toBe(startHash);
    expect(r.receive(commits[0]).ok).toBe(true);
    const dup = r.receive(commits[0]);
    expect(!dup.ok && dup.reason).toMatch(/already applied/);
    expect(r.receive(commits[1]).ok).toBe(true);
    expect(r.receive(commits[2]).ok).toBe(true);
    expect(r.seq).toBe(3);
    expect(r.hash()).toBe(t.host.hash());
    // another map's entry
    const other = { ...commits[0], entry: { ...commits[0].entry, seq: 4, epoch: 7 } };
    expect(r.receive(other).ok).toBe(false);
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
    expect(messageProblem({ kind: "map-opening", author: HOST, name: "" })).toMatch(/1 to 120/);
  });
});

describe("whole-map changes are the host's alone", () => {
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
    const oldHash = t.host.hash();
    const next = openProject(mapProject(9, "canyon", SIZE));
    const { opening, commit, previousProject } = t.host.openMap("Canyon, seed 9", next);
    // the old map is handed back for Your maps: it opens as the map that was
    expect(openProject(previousProject).built.heights).toEqual(guest.session.built.heights);
    guest.receive(opening);
    expect(guest.status).toBe("opening");
    expect(guest.request(brush())).toEqual({ refused: "Canyon, seed 9 is opening a new map" });
    guest.receive(commit);
    expect(guest.status).toBe("needs-map");
    expect(guest.hash()).toBe(oldHash);
    expect(events).toEqual(["opening Canyon, seed 9 by ada", "newMap Canyon, seed 9 previous true"]);
    // a request against the old map is refused by the host
    const late = t.host.submit(GUEST, { kind: "request", epoch: 0, counter: 5, baseSeq: 1, command: brush() });
    expect(late.kind === "reject" && late.reason).toMatch(/opened another map/);
    // the guest adopts the host's new map and edits again
    expect(guest.adopt(t.host.snapshot()).ok).toBe(true);
    expect(guest.status).toBe("live");
    expect(guest.epoch).toBe(1);
    expect(guest.hash()).toBe(t.host.hash());
    expect(act(t, GUEST, brush()).kind).toBe("commit");
    expect(guest.hash()).toBe(t.host.hash());
    expect(guest.seq).toBe(1);
  });
});

describe("a rejoin is the host's current map plus the entries since", () => {
  test("after a hundred and seventy edits the restored copy is identical to the host's", () => {
    // (the host and one player edit; nobody else is connected while it grows, so the cost is the map's, once)
    const t = sit(bytes, { checkpointEvery: 60 }, []);
    t.host.join(GUEST);
    const stream = new Stream(11, SIZE);
    const kinds: readonly Kind[] = [...BRUSH_KINDS, ...BRUSH_KINDS, ...CHEAP_KINDS];
    const forces: Kind[] = ["craterize", "erupt", "lift", "rift"];
    let ordered = 0;
    for (let n = 0; n < 170; n++) {
      const kind = n % 45 === 44 ? forces[((n / 45) | 0) % forces.length] : stream.pick(kinds);
      const c = stream.command(kind, t.host.session);
      if (!c) continue;
      const author = n % 3 === 0 ? GUEST : HOST;
      if (t.host.submit(author, t.host.request(c, author)).kind === "commit") ordered++;
    }
    expect(ordered).toBeGreaterThan(130);
    const snapshot = t.host.snapshot();
    // never the whole history: the latest checkpoint and the entries after it
    expect(snapshot.checkpointSeq).toBeGreaterThanOrEqual(120);
    expect(snapshot.tail.length).toBeLessThan(60);
    expect(snapshot.checkpointSeq + snapshot.tail.length).toBe(t.host.seq);
    expect(snapshotProblem(snapshot)).toBeNull();
    // bo's connection dropped and comes back: a new copy from the snapshot
    const back = CollabReplica.fromSnapshot(snapshot, GUEST, {}, live);
    t.guests.set(GUEST, back);
    expect(back.seq).toBe(t.host.seq);
    expect(back.hash()).toBe(t.host.hash());
    expect(Buffer.compare(back.session.exportTimber().bytes, t.host.session.exportTimber().bytes)).toBe(0);
    expect(sameProject(back.session.project(), t.host.session.project())).toBe(true);
    // bo's counter carries on, and the restored copy takes the next edit like one that never left
    const next = act(t, GUEST, brush(2));
    expect(next.kind === "reject" ? next.reason : "ordered").toBe("ordered");
    expect(back.hash()).toBe(t.host.hash());
    // a snapshot whose entries are not in order after its checkpoint is refused
    expect(snapshotProblem({ ...snapshot, tail: snapshot.tail.slice(1) })).toMatch(/not in order/);
  });
});
