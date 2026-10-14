// The session layer (docs/COLLAB-BRIEF.md §2-§9, D486): two players' CollabPeers over an in-memory link, host and guest each
// beside their own map. Interleaved edits, claims ordered through the host, an undo blocked and freed, presence, a drop in
// the middle of a stroke, a rejoin with a new "code" that carries on, and the host's whole-map change. The maps are compared
// byte for byte at the settled points (the .timber the game loads, the project the app saves, the hashes).

import { beforeAll, describe, expect, test } from "vitest";
import type { Command, PeerEvent } from "../../src/core/collab";
import { SESSION_VERSION, decode, encode, wireProblem } from "../../src/core/collab";
import type { EditOp } from "../../src/core/doc/ops";
import { GUID, mapProject, openProject } from "./collabFixtures";
import { makeRig } from "./collabSessionRig";

const SIZE = 48;
let bytes: Uint8Array;
beforeAll(() => {
  bytes = mapProject(5, "highlands", SIZE);
});

const raise = (x: number, y: number, size = 4): Command => ({ kind: "edit", label: "Raise", ops: [{ op: "brush", params: { tool: "raise", size, strength: 10, dabs: [x * 4, y * 4, (x + 3) * 4, y * 4] } } as EditOp] });
const lower = (x: number, y: number): Command => ({ kind: "edit", label: "Lower", ops: [{ op: "brush", params: { tool: "lower", size: 4, strength: 10, dabs: [x * 4, y * 4, (x + 3) * 4, y * 4] } } as EditOp] });
const crater = (x: number, y: number, seed = 5): Command => ({ kind: "force", gesture: { id: GUID(5000 + seed), request: { verb: "craterize", settings: { mode: "strike", power: 80, size: 16, walls: "terraced", centre: "auto", debris: "heavy", rays: false, seed }, origin: [x, y], cut: null, natural: true } } });
const square = (x0: number, y0: number, x1: number, y1: number): [number, number, number][] => Array.from({ length: y1 - y0 + 1 }, (_, k) => [y0 + k, x0, x1] as [number, number, number]);
const types = (list: PeerEvent[]) => list.map((e) => e.type);

describe("the wire", () => {
  test("every message is checked and refused with one line", () => {
    expect(wireProblem({ kind: "hello", v: 1, name: "Bo" })).toBeNull();
    expect(wireProblem({ kind: "hello", v: 1 })).toMatch(/hello message is not valid: missing "name"/);
    expect(wireProblem({ kind: "hello", v: 1, name: "Bo", extra: 1 })).toMatch(/unknown property/);
    expect(wireProblem({ kind: "nonsense" })).toBe("The message is not one the session knows");
    expect(wireProblem({ kind: "presence", n: 1, cursor: [4, 4], stroke: { id: 1, part: 0, pts: Array.from({ length: 146 }, () => 1) } })).toMatch(/allows 144 items/);
    expect(wireProblem({ kind: "presence", n: 1, stroke: { id: 1, part: 0, pts: [1, 2, 3] } })).toMatch(/at most 72 points/);
    expect(wireProblem({ kind: "presence", n: 1, cursor: [1.5, 4] })).toMatch(/must be integer/);
    expect(wireProblem({ kind: "presence", n: 1, view: { x: 1, y: 1, z: 1, dist: 1, yaw: 0, pitch: 0 } })).toBeNull();
    expect(wireProblem({ kind: "snapshot" })).toBe("That message does not travel alone");
    expect(decode("not json")).toEqual({ ok: false, reason: "The message is not readable" });
    expect(decode(encode({ kind: "bye" }))).toEqual({ ok: true, message: { kind: "bye" } });
  });
});

describe("joining", () => {
  test("the guest gets the host's map, claims and numbers, and both know the other", () => {
    const rig = makeRig(bytes);
    rig.connect();
    expect(rig.host.state).toBe("live");
    expect(rig.guest.state).toBe("live");
    expect(rig.guest.sessionId).toBe("test-session");
    expect(rig.guestMap.adopted).toBe(1);
    expect(types(rig.events.host)).toContain("joined");
    expect(types(rig.events.guest)).toContain("joined");
    expect(rig.eventsOf("host", "joined")).toEqual([{ type: "joined", name: "Bo" }]);
    expect(rig.eventsOf("guest", "joined")).toEqual([{ type: "joined", name: "Ada" }]);
    rig.identical("on joining");
  });

  test("a guest of another version is refused with a plain line", () => {
    const rig = makeRig(bytes);
    rig.host.attach({ send: () => undefined, sendPresence: () => undefined });
    const line = rig.host.receive(JSON.stringify({ kind: "hello", v: SESSION_VERSION + 1, name: "Bo" }));
    expect(line).toBe("The other player has a newer version of Dam Good Maps. Reload the page to update.");
    expect(rig.eventsOf("host", "error")).toHaveLength(1);
  });
});

describe("editing together", () => {
  test("interleaved edits, a force and the water end up as identical bytes", async () => {
    const rig = makeRig(bytes);
    rig.connect();
    // both ask before either has heard the other's commit
    const a = rig.host.submit(raise(10, 10));
    const b = rig.guest.submit(raise(34, 30));
    rig.drain();
    expect(await a).toMatchObject({ ok: true });
    expect(await b).toMatchObject({ ok: true });
    const c = rig.guest.submit(lower(12, 36));
    const d = rig.host.submit(raise(30, 12));
    rig.drain();
    expect(await Promise.all([c, d])).toEqual([expect.objectContaining({ ok: true }), expect.objectContaining({ ok: true })]);
    rig.identical("after four edits");
    // a force from the guest: it previews on its settled copy, the host plans the same and orders it
    const gesture = (crater(24, 24).kind === "force" ? (crater(24, 24) as Extract<Command, { kind: "force" }>).gesture : null)!;
    const shown = rig.guest.previewForce(gesture);
    expect(shown.ok).toBe(true);
    if (!shown.ok) return;
    const f = rig.guest.submit({ kind: "force", gesture: { ...gesture, preview: shown.preview } });
    rig.drain();
    expect(await f).toMatchObject({ ok: true });
    rig.identical("after the guest's force");
    expect(rig.hostMap.changes).toBeGreaterThan(0);
    expect(rig.guestMap.changes).toBeGreaterThan(0);
    // the host asks for a force while its water is still settling: it waits for the settle and goes through
    const g = rig.host.submit(crater(12, 12, 6));
    rig.settle();
    expect(await g).toMatchObject({ ok: true });
    rig.identical("after the host's force");
  }, 120_000);

  test("a refused request says why, in one line, and the next one still goes", async () => {
    const rig = makeRig(bytes);
    rig.connect();
    const bad = rig.guest.submit({ kind: "edit", label: "Move", ops: [{ op: "moveEntity", params: { id: GUID(404), x: 5, y: 5 } } as EditOp] });
    rig.drain();
    const r = await bad;
    expect(r.ok).toBe(false);
    expect(rig.eventsOf("guest", "refused")).toHaveLength(1);
    const ok = rig.guest.submit(raise(20, 20));
    rig.drain();
    expect(await ok).toMatchObject({ ok: true });
    rig.identical("after a refusal");
  });
});

describe("claims", () => {
  test("ordered through the host, they refuse the other's edit, release, offer and accept, and travel on a rejoin", async () => {
    const rig = makeRig(bytes);
    rig.connect();
    // the host claims the north-west, the guest the south-east (the guest's goes via the host)
    expect(await rig.host.claim({ kind: "claim", runs: square(4, 4, 18, 18) })).toMatchObject({ ok: true, changed: 225 });
    const g = rig.guest.claim({ kind: "claim", runs: square(28, 28, 44, 44) });
    rig.drain();
    expect(await g).toMatchObject({ ok: true, changed: 17 * 17 });
    rig.identical("claims agree");
    expect(rig.eventsOf("host", "claims").map((e) => (e as { by: string }).by)).toEqual(["host", "guest"]);
    // only unclaimed ground
    const clash = rig.guest.claim({ kind: "claim", runs: square(10, 10, 12, 12) });
    expect(await clash).toEqual({ ok: false, reason: "That includes Ada's area" });
    // an edit that reaches into the other's claim is refused, before release and at the host
    const reach = lower(8, 8);
    expect(rig.guest.reachRefusal((reach as { ops: EditOp[] }).ops)).toBe("Reaches into Ada's area");
    expect(rig.guest.reachBand((reach as { ops: EditOp[] }).ops).length).toBeGreaterThan(0);
    const hostSeq = rig.host.seq;
    const refused = rig.guest.submit(reach);
    rig.drain();
    expect(await refused).toEqual({ ok: false, reason: "Reaches into Ada's area" });
    expect(rig.host.seq).toBe(hostSeq);
    // and in one's own, or in the open, the edit stands; the host reaching into hers is refused alike
    const own = rig.guest.submit(raise(34, 34));
    rig.drain();
    expect(await own).toMatchObject({ ok: true });
    expect(await rig.host.submit(raise(34, 34))).toEqual({ ok: false, reason: "Reaches into Bo's area" });
    rig.identical("after claim refusals");
    // an offer: the host offers a corner; the guest accepts (the answer is ordered through the host)
    const offered = await rig.host.claim({ kind: "offer", runs: square(4, 4, 6, 6) });
    rig.drain();
    expect(offered.ok).toBe(true);
    if (!offered.ok || !offered.offer) return;
    expect(rig.eventsOf("guest", "claims").at(-1)).toMatchObject({ by: "host", command: { kind: "offer" }, offer: { id: offered.offer.id, to: "guest" } });
    const accepted = rig.guest.claim({ kind: "accept", offer: offered.offer.id });
    rig.drain();
    expect(await accepted).toMatchObject({ ok: true, changed: 9 });
    expect(await rig.host.claim({ kind: "release", runs: square(7, 7, 8, 8) })).toMatchObject({ ok: true, changed: 4 });
    rig.drain();
    rig.identical("after the offer and the release");
    // claims are sent on a rejoin
    rig.cut();
    rig.connect();
    rig.identical("claims after the rejoin");
    expect(rig.guest.claimsView().guest.length).toBeGreaterThan(0);
  }, 120_000);

  test("the water flooding the other's area is a quiet note naming who and where; one's own edit is none", async () => {
    const rig = makeRig(bytes);
    rig.connect();
    rig.settle();
    // the guest claims ground the water reaches when the host puts a strong spring outside it
    const claim = rig.guest.claim({ kind: "claim", runs: square(30, 6, 46, 13) });
    rig.drain();
    expect((await claim).ok).toBe(true);
    const spring: Command = { kind: "edit", label: "Place WaterSource", ops: [{ op: "placeEntity", params: { id: GUID(9001), template: "WaterSource", x: 22, y: 24, orientation: "Cw0", components: { WaterSource: { SpecifiedStrength: 8, CurrentStrength: 8 } } } } as EditOp] };
    const r = rig.host.submit(spring);
    rig.drain();
    expect(await r).toMatchObject({ ok: true });
    expect(rig.eventsOf("guest", "note")).toEqual([]);
    rig.settle();
    const notes = rig.eventsOf("guest", "note") as Extract<PeerEvent, { type: "note" }>[];
    expect(notes).toHaveLength(1);
    expect(notes[0].note).toMatchObject({ by: "host", owner: "guest", edits: 1, seqs: { from: 1, to: 1 } });
    expect(notes[0].note.tiles).toBeGreaterThan(3);
    expect(notes[0].note.bounds.x0).toBeGreaterThanOrEqual(30);
    expect(notes[0].text).toMatch(/^Ada's edit (flooded|drained|fouled)[a-z0-9 ,]* of your area$/);
    // the host never gets a note for the guest's area, and the guest's own edit in it earns none
    expect(rig.eventsOf("host", "note")).toEqual([]);
    const own = rig.guest.submit(raise(36, 10));
    rig.drain();
    await own;
    rig.settle();
    expect(rig.eventsOf("guest", "note")).toHaveLength(1);
    expect(rig.eventsOf("host", "note")).toEqual([]);
    rig.identical("after the notes");
  }, 120_000);
});

describe("undo with two players", () => {
  test("blocked by the other's edit on top, named; freed when that is undone; the maps stay identical", async () => {
    const rig = makeRig(bytes);
    rig.connect();
    const g1 = rig.guest.submit(raise(30, 30));
    rig.drain();
    expect(await g1).toMatchObject({ ok: true });
    const h1 = rig.host.submit(raise(31, 30));
    rig.drain();
    expect(await h1).toMatchObject({ ok: true });
    rig.identical("both edits");
    const blocked = rig.guest.undo();
    rig.drain();
    const b = await blocked;
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason).toMatch(/^Ada's Raise .* is on top of this$/);
    expect(b.skipped).toHaveLength(1);
    // the host takes back hers: Bo's becomes undoable
    const hostUndo = rig.host.undo();
    rig.drain();
    expect(await hostUndo).toMatchObject({ ok: true });
    const freed = rig.guest.undo();
    rig.drain();
    expect(await freed).toMatchObject({ ok: true });
    rig.identical("after the undos");
    const back = rig.guest.redo();
    rig.drain();
    expect(await back).toMatchObject({ ok: true });
    rig.identical("after the redo");
  }, 120_000);

  test("an undo that would reach into the other's claim is skipped by the plan", async () => {
    const rig = makeRig(bytes);
    rig.connect();
    const g = rig.guest.submit(raise(10, 10));
    rig.drain();
    await g;
    // the host then claims the ground the guest edited (it is the guest's edit's ground, claimed afterwards by the host)
    expect(await rig.host.claim({ kind: "claim", runs: square(6, 6, 16, 16) })).toMatchObject({ ok: true });
    rig.drain();
    const plan = rig.guest.plan();
    expect(plan.target).toBeNull();
    expect(plan.reason).toBe("Reaches into Ada's area");
  });
});

describe("presence", () => {
  test("cursor, tool, camera and a stroke before release reach the other, bounded and throttled, and never touch the map", () => {
    const rig = makeRig(bytes);
    rig.connect();
    const seqBefore = rig.host.seq;
    rig.guest.presence({ cursor: [10.25, 20.5], tool: "Raise", view: { x: 24, y: 24, z: 0, dist: 40, yaw: 0.5, pitch: 0.9 } }, 1000);
    rig.drain();
    const p = rig.eventsOf("host", "presence").at(-1) as Extract<PeerEvent, { type: "presence" }>;
    expect(p).toMatchObject({ who: "guest", name: "Bo", cursor: [10.25, 20.5], tool: "Raise", view: { x: 24, y: 24, z: 0, dist: 40, yaw: 0.5, pitch: 0.9 } });
    expect(p.colour).toMatch(/^#[0-9a-f]{6}$/);
    // throttled: a second packet inside the interval waits for its time, then goes; the latest wins
    rig.guest.presence({ cursor: [11, 21] }, 1010);
    rig.guest.presence({ cursor: [12, 22] }, 1020);
    rig.drain();
    expect(rig.eventsOf("host", "presence")).toHaveLength(1);
    expect(rig.guest.tick(1100)).toBe(false);
    rig.drain();
    expect(rig.eventsOf("host", "presence").at(-1)).toMatchObject({ cursor: [12, 22] });
    expect(rig.eventsOf("host", "presence")).toHaveLength(2);
    // a stroke: points are queued and cut into bounded packets; its start and end also go on the ordered channel
    const pts: [number, number][] = Array.from({ length: 200 }, (_, k) => [10 + k * 0.1, 10 + (k % 7) * 0.25]);
    rig.guest.presence({ stroke: { id: 7, points: pts, end: true } }, 2000);
    for (let t = 2000; rig.guest.tick(t); t += 70) rig.drain();
    rig.drain();
    const strokes = rig.eventsOf("host", "stroke") as Extract<PeerEvent, { type: "stroke" }>[];
    expect(strokes.length).toBe(3);
    expect(strokes[0]).toMatchObject({ id: 7, fresh: true, ended: false });
    expect(strokes.reduce((n, s) => n + s.points.length, 0)).toBe(200);
    expect(strokes.every((s) => s.points.length <= 72)).toBe(true);
    expect(strokes.at(-1)).toMatchObject({ ended: true, gap: false });
    expect(strokes[0].points[3]).toEqual([10.25, 10.75]);
    // a malformed or oversized packet is refused and ignored
    expect(rig.host.receivePresence(JSON.stringify({ kind: "presence", n: 99, cursor: [1.5, 2] }))).toMatch(/must be integer/);
    expect(rig.host.receivePresence("{}")).toMatch(/not one the session knows/);
    // none of it was an edit
    expect(rig.host.seq).toBe(seqBefore);
    rig.identical("after presence");
  });

  test("a packet that arrives late is dropped", () => {
    const rig = makeRig(bytes);
    rig.connect();
    const newer = JSON.stringify({ kind: "presence", n: 5, cursor: [8, 8] });
    const older = JSON.stringify({ kind: "presence", n: 4, cursor: [4, 4] });
    rig.host.receivePresence(newer);
    rig.host.receivePresence(older);
    expect(rig.eventsOf("host", "presence").map((e) => (e as { cursor: unknown }).cursor)).toEqual([[2, 2]]);
  });
});

describe("a player leaves or the connection drops", () => {
  test("the other is paused, read-only, with a plain line; they keep a copy; a new code carries on exactly", async () => {
    const rig = makeRig(bytes, { sessionId: "carry-on" });
    rig.connect();
    const e1 = rig.host.submit(raise(10, 10));
    const e2 = rig.guest.submit(raise(34, 30));
    rig.drain();
    await Promise.all([e1, e2]);
    rig.settle();
    // a stroke is under way when the connection drops
    rig.guest.presence({ stroke: { id: 3, points: [[30, 30], [31, 30]] } }, 5000);
    rig.guest.presence({ stroke: { id: 3, points: [[32, 30]] } }, 5100);
    rig.drain();
    // and a request has left the guest but not reached the host
    const lost = rig.guest.submit(raise(20, 38));
    rig.cut("timeout");
    expect(await lost).toEqual({ ok: false, reason: "The connection dropped before this was confirmed" });
    // the host is paused for Bo; the guest for Ada
    expect(rig.eventsOf("host", "paused")).toEqual([{ type: "paused", name: "Bo", message: "Bo has left. Waiting to reconnect.", reason: "timeout" }]);
    expect(rig.eventsOf("guest", "paused")).toEqual([{ type: "paused", name: "Ada", message: "Ada has left. Waiting to reconnect.", reason: "timeout" }]);
    expect(rig.eventsOf("host", "presence-cleared")).toHaveLength(1);
    // read-only meanwhile
    expect(await rig.host.submit(raise(10, 10))).toEqual({ ok: false, reason: "Bo has left. Waiting to reconnect." });
    expect(await rig.guest.submit(raise(10, 10))).toEqual({ ok: false, reason: "Ada has left. Waiting to reconnect." });
    expect(await rig.guest.claim({ kind: "release" })).toEqual({ ok: false, reason: "Ada has left. Waiting to reconnect." });
    // each keeps a copy as a normal project in Your maps, and can save their own meanwhile
    for (const who of ["host", "guest"] as const) {
      const keeps = rig.eventsOf(who, "keep") as Extract<PeerEvent, { type: "keep" }>[];
      expect(keeps).toHaveLength(1);
      expect(keeps[0]).toMatchObject({ reason: "pause", sessionId: "carry-on", role: who });
      expect(openProject(keeps[0].project).built.W).toBe(SIZE);
    }
    expect(rig.guest.project()).not.toBeNull();
    const seq = rig.host.seq;
    const hashBefore = rig.host.hash();
    // a new room code: the same session, the host's map plus the edits since
    rig.connect();
    expect(rig.host.state).toBe("live");
    expect(rig.guest.state).toBe("live");
    expect(rig.eventsOf("host", "resumed")).toEqual([{ type: "resumed", name: "Bo" }]);
    expect(rig.eventsOf("guest", "resumed")).toEqual([{ type: "resumed", name: "Ada" }]);
    expect(rig.host.seq).toBe(seq);
    expect(rig.host.hash()).toBe(hashBefore);
    rig.identical("after the rejoin");
    // and they carry on: the guest's numbers continue where the host counted them
    const again = rig.guest.submit(raise(20, 38));
    const other = rig.host.submit(raise(8, 30));
    rig.drain();
    expect(await other).toMatchObject({ ok: true, seq: seq + 1 });
    expect(await again).toMatchObject({ ok: true, seq: seq + 2 });
    rig.identical("after carrying on");
  }, 120_000);

  test("a request the host ordered but whose answer was lost is in the map after the rejoin", async () => {
    const rig = makeRig(bytes);
    rig.connect();
    const sent = rig.guest.submit(raise(14, 30));
    rig.deliverToHost();
    expect(rig.host.seq).toBe(1);
    // the commit is on its way back when the connection drops
    rig.cut("connection-failed");
    expect((await sent).ok).toBe(false);
    rig.connect();
    expect(rig.guest.seq).toBe(1);
    rig.identical("with the lost answer's edit");
    const next = rig.guest.submit(raise(14, 36));
    rig.drain();
    expect(await next).toMatchObject({ ok: true, seq: 2 });
    rig.identical("after");
  });

  test("leaving on purpose tells the other at once and keeps the session", () => {
    const rig = makeRig(bytes);
    rig.connect();
    rig.guest.leave();
    rig.drain();
    expect(rig.guest.state).toBe("ended");
    expect(rig.eventsOf("guest", "keep")).toHaveLength(1);
    expect((rig.eventsOf("guest", "keep")[0] as { reason: string }).reason).toBe("end");
    expect(rig.eventsOf("host", "paused")).toEqual([{ type: "paused", name: "Bo", message: "Bo has left. Waiting to reconnect.", reason: "left" }]);
    expect(rig.host.state).toBe("paused");
  });

  test("a host that leaves pauses the guest the same way", async () => {
    const rig = makeRig(bytes);
    rig.connect();
    rig.host.leave();
    rig.drain();
    expect(rig.eventsOf("guest", "paused")).toEqual([{ type: "paused", name: "Ada", message: "Ada has left. Waiting to reconnect.", reason: "left" }]);
    expect(await rig.guest.submit(raise(10, 10))).toEqual({ ok: false, reason: "Ada has left. Waiting to reconnect." });
  });
});

describe("a desync is loud", () => {
  test("a copy that differs says so on both sides, stops, and is sent the map again on request", async () => {
    const rig = makeRig(bytes);
    rig.connect();
    // the guest's copy is edited behind the session's back
    expect(rig.guestMap.session!.apply({ op: "brush", params: { tool: "raise", size: 5, strength: 10, dabs: [100, 100, 120, 100] } } as EditOp, "user").ok).toBe(true);
    const e = rig.host.submit(raise(30, 30));
    rig.drain();
    await e;
    expect(rig.eventsOf("guest", "desync")).toHaveLength(1);
    expect(rig.eventsOf("host", "desync")).toHaveLength(1);
    expect((rig.eventsOf("guest", "desync")[0] as { reason: string }).reason).toMatch(/differs from the host's/);
    expect(rig.guest.state).toBe("desynced");
    expect(await rig.guest.submit(raise(10, 10))).toMatchObject({ ok: false, reason: expect.stringMatching(/out of step with the host's/) });
    // the guest asks for the map again
    rig.guest.resync();
    rig.drain();
    expect(rig.guest.state).toBe("live");
    rig.events.host.length = 0;
    rig.events.guest.length = 0;
    rig.identical("after the resync");
  });
});

describe("the host changes the whole map (§9)", () => {
  test("the guest hears first, both keep the previous map, and the guest adopts the new one", async () => {
    const rig = makeRig(bytes);
    rig.connect();
    const e = rig.guest.submit(raise(30, 30));
    rig.drain();
    await e;
    rig.host.announceNewMap("Lakeside");
    rig.drain();
    expect(rig.eventsOf("guest", "opening")).toEqual([{ type: "opening", name: "Lakeside", message: "Ada is opening a new map" }]);
    // while the host is opening it, the guest can't edit
    expect(await rig.guest.submit(raise(10, 10))).toMatchObject({ ok: false });
    // the host opens another map in its worker, then tells the session
    const second = mapProject(7, "highlands", SIZE);
    rig.hostMap.session = openProject(second);
    rig.host.newMap("Lakeside");
    rig.drain();
    for (const who of ["host", "guest"] as const) {
      const keeps = (rig.eventsOf(who, "keep") as Extract<PeerEvent, { type: "keep" }>[]).filter((k) => k.reason === "new-map");
      expect(keeps, who).toHaveLength(1);
    }
    expect(rig.eventsOf("guest", "new-map")).toEqual([{ type: "new-map", name: "Lakeside" }]);
    expect(rig.guestMap.adopted).toBe(2);
    rig.identical("on the new map");
    // the new map is edited together at once; the old claims are gone
    const f = rig.guest.submit(raise(22, 22));
    rig.drain();
    expect(await f).toMatchObject({ ok: true, seq: 1 });
    rig.identical("after an edit on the new map");
  }, 120_000);

  test("announced and then not opened, the guest carries on with the map as it is", async () => {
    const rig = makeRig(bytes);
    rig.connect();
    rig.host.announceNewMap("Lakeside");
    rig.drain();
    expect(await rig.guest.submit(raise(10, 10))).toEqual({ ok: false, reason: "Ada is opening a new map" });
    rig.host.cancelNewMap();
    rig.drain();
    const e = rig.guest.submit(raise(10, 10));
    rig.drain();
    expect(await e).toMatchObject({ ok: true });
    rig.identical("after the change of mind");
  });

  test("only the host can: a guest's attempt is refused", async () => {
    const rig = makeRig(bytes);
    rig.connect();
    const r = rig.guest.submit({ kind: "newMap", name: "x" });
    rig.drain();
    expect(await r).toEqual({ ok: false, reason: "Only the host can open a new map" });
    expect(() => rig.guest.announceNewMap("x")).toThrow(/only the host/);
  });
});
