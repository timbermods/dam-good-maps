// Two players' sessions (CollabPeer) over an in-memory link, for the session layer's contract tests: messages wait in two
// queues until the test delivers them, so a test can interleave edits, deliver only one way, drop the link mid-stroke and
// reconnect with a new "code" (a new link, the same session id). The map each player edits is a plain MapPort over a session
// the test holds.

import { expect } from "vitest";
import { CollabPeer, settledHash, type Link, type MapPort, type PeerEvent, type Role } from "../../src/core/collab";
import type { MapSession } from "../../src/core/doc/session";
import { openProject, projectDiff } from "./collabFixtures";

export interface Rig {
  host: CollabPeer;
  guest: CollabPeer;
  /** The host’s page was reloaded and its map reopened from the project it had kept (the session id is the same): call after `cut`. */
  restartHost(): void;
  /** Everything either side ever put on its link, in order (for a test that wants to hand-deliver or corrupt one). */
  sent: { toHost: (string | Uint8Array)[]; toGuest: (string | Uint8Array)[] };
  hostMap: { session: MapSession | null; changes: number; adopted: number };
  guestMap: { session: MapSession | null; changes: number; adopted: number };
  events: { host: PeerEvent[]; guest: PeerEvent[] };
  /** Messages waiting to be delivered, by the receiver. */
  queue: { toHost: (string | Uint8Array)[]; toGuest: (string | Uint8Array)[]; presenceToHost: string[]; presenceToGuest: string[] };
  /** Deliver everything waiting, both ways, until nothing is. */
  drain(): void;
  deliverToHost(): void;
  deliverToGuest(): void;
  /** A new connection: new links on both, the same peers (the rejoin with a new room code). */
  connect(): void;
  /** The connection drops: whatever was waiting is lost, and both peers hear `dropped`. */
  cut(reason?: string): void;
  /** The background settle, run to its end on both peers, and the announcement compared. */
  settle(): void;
  /** Both maps are identical bytes (the .timber the game loads, the project the app saves, the settled and direct hashes) once settled. */
  identical(where: string): void;
  eventsOf(who: Role, type: PeerEvent["type"]): PeerEvent[];
}

const NAMES = { host: "Ada", guest: "Bo" };

export function makeRig(bytes: Uint8Array, options: { sessionId?: string; checkpointEvery?: number } = {}): Rig {
  const hostMap: Rig["hostMap"] = { session: openProject(bytes), changes: 0, adopted: 0 };
  const guestMap: Rig["guestMap"] = { session: null, changes: 0, adopted: 0 };
  const port = (m: Rig["hostMap"]): MapPort => ({
    session: () => m.session,
    adopt: (s) => {
      m.session = s;
      m.adopted++;
    },
    changed: () => void m.changes++,
  });
  const events = { host: [] as PeerEvent[], guest: [] as PeerEvent[] };
  const sessionId = options.sessionId ?? "test-session";
  const makeHost = () => new CollabPeer({ role: "host", name: NAMES.host, port: port(hostMap), sessionId, events: (e) => events.host.push(e), checkpointEvery: options.checkpointEvery });
  let host = makeHost();
  const guest = new CollabPeer({ role: "guest", name: NAMES.guest, port: port(guestMap), sessionId: null, events: (e) => events.guest.push(e) });
  const queue: Rig["queue"] = { toHost: [], toGuest: [], presenceToHost: [], presenceToGuest: [] };
  let epoch = 0;
  const sent: Rig["sent"] = { toHost: [], toGuest: [] };

  const deliverToHost = () => {
    const my = epoch;
    while (epoch === my && (queue.toHost.length || queue.presenceToHost.length)) {
      const m = queue.toHost.shift();
      if (m !== undefined) host.receive(m);
      const p = queue.presenceToHost.shift();
      if (p !== undefined) host.receivePresence(p);
    }
  };
  const deliverToGuest = () => {
    const my = epoch;
    while (epoch === my && (queue.toGuest.length || queue.presenceToGuest.length)) {
      const m = queue.toGuest.shift();
      if (m !== undefined) guest.receive(m);
      const p = queue.presenceToGuest.shift();
      if (p !== undefined) guest.receivePresence(p);
    }
  };
  const drain = () => {
    for (let i = 0; i < 1000 && (queue.toHost.length || queue.toGuest.length || queue.presenceToHost.length || queue.presenceToGuest.length); i++) {
      deliverToHost();
      deliverToGuest();
    }
  };
  const linkFor = (to: "toHost" | "toGuest", presence: "presenceToHost" | "presenceToGuest", mine: number): Link => ({
    send: (p) => {
      if (mine === epoch) {
        const copy = typeof p === "string" ? p : p.slice();
        queue[to].push(copy);
        sent[to].push(copy);
      }
    },
    sendPresence: (p) => {
      if (mine === epoch) queue[presence].push(p);
    },
  });
  const connect = () => {
    epoch++;
    queue.toHost = [];
    queue.toGuest = [];
    queue.presenceToHost = [];
    queue.presenceToGuest = [];
    host.attach(linkFor("toGuest", "presenceToGuest", epoch));
    guest.attach(linkFor("toHost", "presenceToHost", epoch));
    drain();
  };
  const cut = (reason = "timeout") => {
    epoch++;
    queue.toHost = [];
    queue.toGuest = [];
    queue.presenceToHost = [];
    queue.presenceToGuest = [];
    host.detach(reason);
    guest.detach(reason);
  };
  const settle = () => {
    for (let i = 0; i < 20; i++) {
      const a = host.pump();
      drain();
      const b = guest.pump();
      drain();
      if (a && b && !host.settling && !guest.settling) return;
    }
    throw new Error("the water did not settle");
  };
  const rig: Rig = {
    host,
    guest,
    sent,
    restartHost() {
      const kept = host.project();
      if (!kept) throw new Error("no map to reopen");
      hostMap.session = openProject(kept);
      host = makeHost();
      rig.host = host;
    },
    hostMap,
    guestMap,
    events,
    queue,
    drain,
    deliverToHost,
    deliverToGuest,
    connect,
    cut,
    settle,
    identical(where) {
      settle();
      for (const [who, list] of Object.entries(events)) {
        expect(list.filter((e) => e.type === "desync"), `${who} desync ${where}`).toEqual([]);
        expect(list.filter((e) => e.type === "error"), `${who} errors ${where}`).toEqual([]);
      }
      const a = hostMap.session!;
      const b = guestMap.session!;
      expect(guest.seq, `seq ${where}`).toBe(host.seq);
      expect(guest.hash(), `direct hash ${where}`).toBe(host.hash());
      expect(settledHash(b), `settled hash ${where}`).toBe(settledHash(a));
      expect(Buffer.compare(b.exportTimber().bytes, a.exportTimber().bytes), `.timber ${where}`).toBe(0);
      expect(projectDiff(b.project(), a.project()), `project ${where}`).toBe("");
      expect(guest.claimsView(), `claims ${where}`).toEqual(host.claimsView());
    },
    eventsOf: (who, type) => events[who].filter((e) => e.type === type),
  };
  return rig;
}
