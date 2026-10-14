// One player's side of a collaborative session (docs/COLLAB-BRIEF.md, D362, D431, D486): the host or the guest, beside the
// map the page edits. It joins the pieces: the host-ordered log and the replicas (host.ts, replica.ts), claims ordered through
// the host (claims.ts), undo and redo as entries (undo.ts), the water notes (waterNotes.ts) and presence, over any link that
// carries whole messages in order (and, for presence, may lose some): the page's WebRTC transport, or two in-memory ends in a
// test. Headless (D342): it knows no network, no page and no worker; the map it edits is reached through a `MapPort`.
//
// What it keeps true:
//   - The host orders; a guest asks. Every refusal is one plain line. A drop pauses the session for whoever is left: the map
//     stays, read-only, and the page shows "<name> has left. Waiting to reconnect." (§7). A new connection with the same session
//     id is a rejoin: the host's checkpoint, its records and claims and the entries since, never the history (§7).
//   - A copy that differs from the host's says so loudly (`desync`) and stops; `resync()` asks for the map again.
//   - Presence is only ever drawn: it never edits the map. Bounded, throttled, latest wins.
//   - Whole-map changes are the host's alone, announced first (§9); the old map is handed over to be kept (§8).

import { decodeProject } from "../doc/document";
import type { EditOp } from "../doc/ops";
import type { MapSession } from "../doc/session";
import { bandOf } from "./footprint";
import { claimsCheck, ClaimsState, parseCommand, reachInto, refusal, refusalForWrites, type ClaimCommand, type ClaimOffer, type PlayerNames, type Role } from "./claims";
import { CollabHost } from "./host";
import { CollabReplica, type Previewed } from "./replica";
import { planKeptForce } from "./forceStep";
import type { HistoryPlan, Skipped, Veto } from "./undo";
import type { Block } from "./records";
import type { TransactionRecord } from "./transaction";
import type { Command, ForceGesture, LogEntry, Reject, Snapshot } from "./types";
import { describeWaterNote, waterNotes, type WaterNote } from "./waterNotes";
import { BUSY } from "./transaction";
import { settledHash } from "./water";
import { PresenceChannel, type PresenceEvent, type PresenceIn } from "./presence";
import {
  GUEST_ID,
  HOST_ID,
  MAX_DISPLAY_NAME,
  SESSION_VERSION,
  decode,
  encode,
  idOf,
  incompatible,
  roleOfId,
  type Payload,
  type Welcome,
  type Wire,
} from "./wire";

export type { PresenceIn } from "./presence";

/** Where the peer sends: whole messages in order (`send`), and presence that may be lost (`sendPresence`). */
export interface Link {
  send(payload: Payload): void;
  sendPresence(payload: string): void;
}

/** The map the page edits, as the peer reaches it. In the worker it is `session.ts`; a test holds a session itself. */
export interface MapPort {
  /** The open map. */
  session(): MapSession | null;
  /** Show this map now (a guest's copy from the host's snapshot): the page takes its whole view. */
  adopt(session: MapSession): void;
  /** The peer changed the map (an entry applied, undone, or re-settled): the page takes the update. */
  changed(): void;
}

export type PeerState =
  /** Not connected yet: a host with no guest in, or a guest not yet joined. */
  | "idle"
  /** A guest connected, waiting for the host's map. */
  | "joining"
  | "live"
  /** The other player is gone: the map is read-only until they come back. */
  | "paused"
  /** This copy differs from the host's: read-only until the map is sent again. */
  | "desynced"
  | "ended";

export type KeepReason = "pause" | "end" | "new-map";

export type PeerEvent =
  | { type: "state"; state: PeerState }
  /** The other player is in the session (the first time). */
  | { type: "joined"; name: string }
  /** The other player came back; the session carries on. */
  | { type: "resumed"; name: string }
  | { type: "paused"; name: string; message: string; reason: string }
  | PresenceEvent
  | { type: "presence-cleared" }
  | { type: "claims"; by: Role; command: ClaimCommand; changed: number; offer?: ClaimOffer; revision: number }
  /** The other player's edits changed the water in your area. */
  | { type: "note"; note: WaterNote; text: string }
  | { type: "applied"; seq: number; author: Role; mine: boolean; kind: string; label: string }
  | { type: "refused"; command: string; reason: string; busy?: boolean; block?: Block }
  /** The host is opening another map: "<name> is opening a new map". */
  | { type: "opening"; name: string; message: string }
  | { type: "new-map"; name: string }
  /** The session as a normal project, for Your maps: at a pause, at the end, and the old map when the host opens another. */
  | { type: "keep"; reason: KeepReason; project: Uint8Array; name: string; sessionId: string; role: Role; seq: number; epoch: number }
  /** This copy differs from the host's, or the other's does from the host's. Loud. */
  | { type: "desync"; reason: string; seq: number; by: Role }
  | { type: "settled"; seq: number }
  /** The other player's page is not a version this one can work with, or a message that could not be used arrived. */
  | { type: "error"; message: string };

export type SubmitResult = { ok: true; seq: number } | { ok: false; reason: string; busy?: boolean; block?: Block; target?: number };

export type ClaimOutcome = { ok: true; changed: number; offer?: ClaimOffer } | { ok: false; reason: string };

export interface PeerOptions {
  role: Role;
  /** This player's display name. */
  name: string;
  port: MapPort;
  /** The session this peer carries; a guest without one adopts the host's. */
  sessionId: string | null;
  events: (e: PeerEvent) => void;
  now?: () => number;
  checkpointEvery?: number;
  /** A request answered "busy" (the water is still settling) is asked again after the next settle, up to this many times. */
  busyRetries?: number;
}

interface PendingRequest {
  command: Command;
  resolve: (r: SubmitResult) => void;
  tries: number;
}

const live = (s: MapSession): void => s.setWaterMode("defer");
const CHECK_LINE = (name: string) => `${name} has left. Waiting to reconnect.`;

export class CollabPeer {
  readonly role: Role;
  readonly myId: string;
  sessionId: string | null;
  state: PeerState = "idle";
  name: string;
  /** The other player's name ("" until they are in). */
  otherName = "";
  claims = new ClaimsState(1, 1);
  private host: CollabHost | null = null;
  private replica: CollabReplica | null = null;
  private link: Link | null = null;
  private readonly port: MapPort;
  private readonly emit: (e: PeerEvent) => void;
  private readonly now: () => number;
  private readonly checkpointEvery: number | undefined;
  private readonly busyRetries: number;
  /** A welcome waits for the project bytes that follow it. */
  private expectProject: Welcome | null = null;
  private everJoined = false;
  private pending = new Map<number, PendingRequest>();
  private claimId = 0;
  private claimPending = new Map<number, (r: ClaimOutcome) => void>();
  private waiting: PendingRequest[] = [];
  // water notes: the settled water before the batch, who made the entries since, and the claims as they stood
  private baseline: { water: Float64Array; dirty: Float64Array } | null = null;
  private batch: { author: string; seq: number }[] = [];
  private claimsThen: ClaimsState | null = null;
  private dirty = false;
  private announced = false;
  private readonly presenceCh: PresenceChannel;
  /** The host: how its last requests from the guest were answered (a seq, or 0 and why not), told to a rejoining guest whose answer was lost. */
  private answered = new Map<number, { seq: number; reason?: string }>();
  /** The host: the guest said hello on this connection already. */
  private helloSeen = false;
  /** The host: the guest has said its copy is out of step, so a request to send the map again is a fair one. */
  private guestDesynced = false;

  constructor(opts: PeerOptions) {
    this.role = opts.role;
    this.myId = idOf(opts.role);
    this.name = cleanName(opts.name);
    this.sessionId = opts.sessionId;
    this.port = opts.port;
    this.emit = opts.events;
    this.now = opts.now ?? (() => Date.now());
    this.checkpointEvery = opts.checkpointEvery;
    this.busyRetries = opts.busyRetries ?? 40;
    this.presenceCh = new PresenceChannel({
      role: opts.role,
      now: this.now,
      active: () => !!this.link && this.state === "live",
      send: (payload, reliable) => (reliable ? this.link?.send(payload) : this.link?.sendPresence(payload)),
      emit: (e) => this.emit(e),
      otherName: () => this.otherName,
    });
  }

  // ------------------------------------------------------------------------------ names and views

  private get hostName(): string {
    return this.role === "host" ? this.name : this.otherName || "Host";
  }
  private get guestName(): string {
    return this.role === "guest" ? this.name : this.otherName || "Guest";
  }
  private playerNames = (): PlayerNames => ({ host: this.hostName, guest: this.guestName });
  private nameOfId = (id: string): string => (id === HOST_ID ? this.hostName : this.guestName);
  private get mySession(): MapSession | null {
    return this.host?.session ?? this.replica?.session ?? null;
  }

  /** The sequence of the last entry applied, or 0. */
  get seq(): number {
    return this.host?.seq ?? this.replica?.seq ?? 0;
  }

  /** The map's epoch (it changes when the host opens another map). */
  get epoch(): number {
    return this.host?.epoch ?? this.replica?.epoch ?? 0;
  }

  /** Why a direct edit of the map is refused now (one line), or null: paused, out of step, loading, and (once a session is on) every
   *  edit that does not go through the session. The worker checks it before it applies anything itself. */
  editBlocked(): string | null {
    if (this.state === "idle" || this.state === "ended") return null;
    return this.readOnly() ?? "Edits in a shared session go through the session";
  }

  /** The hash of what the players made directly (the log's, as the host announces it), or "" before there is a map. */
  hash(): string {
    return this.host?.hash() ?? this.replica?.hash() ?? "";
  }

  /** The session as the claims panel and outlines read it: runs of each player's ground and the offers waiting. */
  claimsView() {
    return this.claims.toSnapshot();
  }

  private setState(s: PeerState): void {
    if (this.state === s) return;
    this.state = s;
    this.emit({ type: "state", state: s });
  }

  /** Why the player can't edit now (one line), or null. */
  private readOnly(): string | null {
    // the host is opening another map: the guest waits for it (§9)
    if (this.replica && (this.replica.status === "opening" || this.replica.status === "needs-map")) return `${this.otherName || "The host"} is opening a new map`;
    switch (this.state) {
      case "paused":
        return CHECK_LINE(this.otherName || (this.role === "host" ? "The other player" : "The host"));
      case "joining":
        return "The map is loading";
      case "desynced":
        return "This copy of the map is out of step with the host's. Reload it from the host.";
      case "ended":
        return "The session has ended";
      default:
        return null;
    }
  }

  // ------------------------------------------------------------------------------ starting

  /** The host: this player's open map is the session's map. The water is settled first (a few seconds on a big map) so the
   *  first checkpoint is the map a guest sees. */
  startHosting(): void {
    if (this.role !== "host") throw new Error("only the host hosts");
    if (this.host) return;
    const session = this.port.session();
    if (!session) throw new Error("open a map first");
    live(session);
    this.claims = new ClaimsState(session.size.x, session.size.y);
    this.host = new CollabHost(session, {
      hostId: HOST_ID,
      check: claimsCheck(() => this.claims, roleOfId, this.playerNames),
      checkpointEvery: this.checkpointEvery,
      names: this.nameOfId,
    });
    this.host.join(GUEST_ID);
    this.takeBaseline();
  }

  /** A connection is up (the transport's `connected`): the guest says hello; the host waits for it. */
  attach(link: Link): void {
    this.link = link;
    this.expectProject = null;
    this.presenceCh.reset();
    this.helloSeen = false;
    if (this.state === "ended") return;
    if (this.role === "host") {
      if (!this.host) this.startHosting();
      return;
    }
    this.setState("joining");
    this.send({ kind: "hello", v: SESSION_VERSION, name: this.name });
  }

  /** The connection is gone (the transport's `dropped`, or the other player left). The session pauses for this player. */
  detach(reason: string): void {
    this.link = null;
    this.expectProject = null;
    if (this.state === "ended" || this.state === "paused") return;
    // a player the other never got to join is simply not in a session yet
    if (!this.everJoined) {
      this.setState("idle");
      return;
    }
    // (a reconnect that failed: the session was paused already, and the project kept then)
    if (this.state === "joining") {
      this.setState("paused");
      return;
    }
    const wasLive = this.state === "live";
    const left = this.otherName || (this.role === "host" ? "The other player" : "The host");
    // (a request already sent to the host is held: the snapshot of the rejoin says whether the host ordered it)
    this.dropWaiting("The connection dropped before this was confirmed");
    this.setState("paused");
    this.emit({ type: "presence-cleared" });
    this.emit({ type: "paused", name: left, message: CHECK_LINE(left), reason });
    if (wasLive) this.keep("pause");
  }

  /** Leave on purpose: the other player is told at once, and the session is kept as a normal project (§8). */
  leave(): void {
    if (this.state === "ended") return;
    if (this.link) this.send({ kind: "bye" });
    this.dropWaiting("You left the session");
    this.dropHeld("You left the session");
    this.emit({ type: "presence-cleared" });
    this.keep("end");
    this.link = null;
    this.setState("ended");
  }

  private dropHeld(reason: string): void {
    for (const [, p] of this.pending) p.resolve({ ok: false, reason });
    this.pending.clear();
  }

  /** The guest's requests that were sent when the connection dropped, answered from what the host says of them (the answered list, and
   *  how many requests of this guest it received). */
  private settleHeld(received: number, answered: readonly { counter: number; seq: number; reason?: string }[]): void {
    for (const [counter, p] of this.pending) {
      const a = answered.find((x) => x.counter === counter);
      if (a) p.resolve(a.seq > 0 ? { ok: true, seq: a.seq } : { ok: false, reason: a.reason ?? "The host did not take it" });
      else if (counter > received) p.resolve({ ok: false, reason: "The connection dropped before this was confirmed" });
      else p.resolve({ ok: false, reason: "The connection dropped. Look at the map to see whether this went through" });
    }
    this.pending.clear();
    this.dropWaiting("The map was reloaded from the host before this was confirmed");
  }

  private dropWaiting(reason: string): void {
    for (const p of this.waiting) p.resolve({ ok: false, reason });
    this.waiting = [];
    for (const [, r] of this.claimPending) r({ ok: false, reason });
    this.claimPending.clear();
  }

  /** The session as a normal project, handed to the page for Your maps (§8): at a pause, when it ends, and the old map when the
   *  host opens another. */
  private keep(reason: KeepReason, project?: Uint8Array, of?: { name: string; seq: number; epoch: number }): void {
    const s = this.mySession;
    if (!s && !project) return;
    const at = of ?? { name: s!.meta.name, seq: this.seq, epoch: this.epoch };
    this.emit({ type: "keep", reason, project: project ?? s!.project(6), name: at.name, sessionId: this.sessionId ?? "", role: this.role, seq: at.seq, epoch: at.epoch });
  }

  /** The session's map as a project now (a copy to save while paused, or to leave with). */
  project(level = 6): Uint8Array | null {
    return this.mySession?.project(level) ?? null;
  }

  // ------------------------------------------------------------------------------ sending

  private send(m: Wire): void {
    this.link?.send(encode(m));
  }

  private sendWelcome(): void {
    const host = this.host!;
    const { project, ...header } = host.snapshot();
    const welcome: Welcome = { kind: "welcome", v: SESSION_VERSION, sessionId: this.sessionId ?? "", hostName: this.hostName, guestName: this.guestName, snapshot: { kind: "snapshot", ...header }, claims: this.claims.toSnapshot(), answered: [...this.answered].map(([counter, a]) => ({ counter, seq: a.seq, ...(a.reason ? { reason: a.reason.slice(0, 300) } : {}) })) };
    this.send(welcome);
    // (a copy: the link may take the bytes over, and the host keeps the checkpoint)
    this.link?.send(project.slice());
    // the water has settled for this map already and was announced before the guest came: say so again, for it to compare its own
    if (!this.dirty && host.waterSettled) this.send({ kind: "settled", epoch: host.epoch, seq: host.seq, since: host.seq, hash: settledHash(host.session) });
  }

  // ------------------------------------------------------------------------------ receiving

  /** A message from the other player's link. A problem with it comes back as one line (and as an `error` event). */
  receive(payload: Payload): string | null {
    if (this.state === "ended") return null;
    try {
      if (typeof payload !== "string") return this.receiveProject(payload);
      if (this.expectProject) {
        this.expectProject = null;
        return this.fail("The map did not arrive");
      }
      const d = decode(payload);
      if (!d.ok) return this.fail(d.reason);
      return this.dispatch(d.message);
    } catch (e) {
      return this.broke(e, typeof payload === "string" ? payload : null);
    }
  }

  /** A message that could not be used because something threw: never silent. The guest's copy can no longer be trusted (a desync); the
   *  host answers a request with a refusal so the player is not left waiting. */
  private broke(e: unknown, payload: string | null): string {
    const reason = `The message could not be used: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300);
    if (this.role === "guest") return this.desync(reason);
    let counter = 0;
    try {
      const m = JSON.parse(payload ?? "{}") as { kind?: string; counter?: unknown };
      if (m.kind === "request" && Number.isInteger(m.counter)) counter = m.counter as number;
    } catch {
      /* not a request */
    }
    if (counter > 0) this.send({ kind: "reject", counter, reason });
    return this.fail(reason);
  }

  private fail(message: string): string {
    this.emit({ type: "error", message });
    return message;
  }

  private dispatch(m: Wire): string | null {
    // the two roles take different messages; a message for the other role is refused
    const hostOnly = ["hello", "request", "claim", "ready", "resync"];
    const guestOnly = ["welcome", "commit", "reject", "settled", "map-opening", "claims", "claim-reject"];
    if (this.role === "guest" && hostOnly.includes(m.kind)) return this.fail("A guest does not take that message");
    if (this.role === "host" && guestOnly.includes(m.kind)) return this.fail("The host does not take that message");
    switch (m.kind) {
      case "hello":
        return this.onHello(m);
      case "request":
        return this.onRequest(m);
      case "claim":
        return this.onClaimAsk(m);
      case "ready":
        return this.onReady();
      case "resync":
        // (the whole map goes again only when the guest has said its copy is out of step, once for each time)
        if (!this.guestDesynced) return "The map was not asked for";
        this.guestDesynced = false;
        if (this.host && this.link) this.sendWelcome();
        return null;
      case "welcome":
        return this.onWelcome(m);
      case "commit":
      case "reject":
      case "settled":
      case "map-opening":
        return this.onLog(m);
      case "claims":
        return this.onClaimsApplied(m);
      case "claim-reject": {
        this.claimPending.get(m.id)?.({ ok: false, reason: m.reason });
        this.claimPending.delete(m.id);
        this.emit({ type: "refused", command: "claim", reason: m.reason });
        return null;
      }
      case "desync":
        if (this.role === "host") this.guestDesynced = true;
        this.emit({ type: "desync", reason: `${this.otherName || "The other player"}'s map differs from the host's: ${m.reason}`, seq: m.seq, by: this.role === "host" ? "guest" : "host" });
        return null;
      case "bye":
        // (the connection's own end follows at once; the page can say so now)
        this.detach("left");
        return null;
      case "presence":
        return this.presenceCh.accept(m, true);
      default:
        return this.fail("The message is not one the session knows");
    }
  }

  // ---- the host's side

  private onHello(m: Extract<Wire, { kind: "hello" }>): string | null {
    const bad = incompatible(m.v);
    if (bad) {
      this.emit({ type: "error", message: bad });
      return bad;
    }
    // (the map goes once for each connection: a guest that says hello again on the same one is refused)
    if (this.helloSeen) return "The guest already said hello on this connection";
    this.helloSeen = true;
    if (!this.host) this.startHosting();
    this.otherName = cleanName(m.name) || "Guest";
    this.sendWelcome();
    return null;
  }

  private onReady(): string | null {
    const first = !this.everJoined;
    const was = this.state;
    this.everJoined = true;
    this.setState("live");
    if (first) this.emit({ type: "joined", name: this.otherName });
    else if (was !== "live") this.emit({ type: "resumed", name: this.otherName });
    return null;
  }

  private onRequest(m: Extract<Wire, { kind: "request" }>): string | null {
    const host = this.host;
    if (!host) return this.fail("No map is being hosted");
    const answer = host.submit(GUEST_ID, m);
    this.answered.set(m.counter, answer.kind === "commit" ? { seq: answer.entry.seq } : { seq: 0, reason: answer.reason });
    if (this.answered.size > 64) this.answered.delete(this.answered.keys().next().value as number);
    this.send(answer);
    if (answer.kind === "commit") {
      this.afterEntry(answer.entry);
      this.port.changed();
    }
    return null;
  }

  private onClaimAsk(m: Extract<Wire, { kind: "claim" }>): string | null {
    const parsed = parseCommand(m.command);
    if (!parsed.ok) {
      this.send({ kind: "claim-reject", id: m.id, reason: parsed.reason.slice(0, 300) });
      return null;
    }
    const paused = this.readOnly();
    if (paused) {
      this.send({ kind: "claim-reject", id: m.id, reason: paused.slice(0, 300) });
      return null;
    }
    const r = this.claims.apply("guest", parsed.command, this.playerNames());
    if (!r.ok) {
      this.send({ kind: "claim-reject", id: m.id, reason: r.reason.slice(0, 300) });
      return null;
    }
    this.send({ kind: "claims", by: "guest", id: m.id, command: parsed.command, revision: this.claims.revision });
    this.emit({ type: "claims", by: "guest", command: parsed.command, changed: r.changed.length, ...(r.offer ? { offer: r.offer } : {}), revision: this.claims.revision });
    return null;
  }

  // ---- the guest's side

  private onWelcome(w: Welcome): string | null {
    const bad = incompatible(w.v);
    if (bad) {
      this.setState("ended");
      this.emit({ type: "error", message: bad });
      return bad;
    }
    if (this.sessionId && w.sessionId && this.sessionId !== w.sessionId) return this.fail("That is a different session from the one this map belongs to");
    this.sessionId = w.sessionId || this.sessionId;
    this.otherName = w.hostName;
    this.expectProject = w;
    return null;
  }

  private receiveProject(bytes: Uint8Array): string | null {
    const w = this.expectProject;
    if (!w) return this.fail("A map arrived that was not asked for");
    this.expectProject = null;
    const { kind: _k, ...header } = w.snapshot;
    const snapshot: Snapshot = { ...header, project: bytes };
    const events = this.replicaEvents();
    let replica = this.replica;
    if (!replica) {
      try {
        replica = CollabReplica.fromSnapshot(snapshot, GUEST_ID, events, live, this.nameOfId);
      } catch (e) {
        return this.desync(`The host's map would not load here: ${e instanceof Error ? e.message : String(e)}`);
      }
      this.replica = replica;
    } else {
      const done = replica.adopt(snapshot);
      if (!done.ok) return this.desync(done.reason);
    }
    const s = replica.session;
    const claims = ClaimsState.fromSnapshot(w.claims, s.size.x, s.size.y);
    if (!claims.ok) return this.desync(claims.reason);
    this.claims = claims.claims;
    replica.setVeto(this.claimsVeto("guest"));
    this.batch = [];
    this.claimsThen = this.claims.clone();
    this.baseline = null;
    // (the tail the snapshot carried is applied, its water not yet settled here)
    this.dirty = true;
    this.settleHeld(w.snapshot.counters[GUEST_ID] ?? 0, w.answered ?? []);
    this.port.adopt(s);
    const first = !this.everJoined;
    this.everJoined = true;
    this.setState("live");
    this.send({ kind: "ready", seq: replica.seq, hash: replica.hash() });
    this.emit(first ? { type: "joined", name: this.otherName } : { type: "resumed", name: this.otherName });
    return null;
  }

  private replicaEvents() {
    return {
      opening: (e: { author: string; name: string }) => this.emit({ type: "opening", name: e.name, message: `${this.otherName || "The host"} is opening a new map` }),
      newMap: (e: { name: string; previousProject: Uint8Array }) => {
        // (the commit that opens the new map has taken its sequence already: the old map's log stood one before)
        this.keep("new-map", e.previousProject, { name: this.mySession?.meta.name ?? "", seq: this.seq - 1, epoch: this.epoch });
        this.emit({ type: "new-map", name: e.name });
      },
      applied: (entry: LogEntry, record: TransactionRecord) => {
        void record;
        this.afterEntry(entry);
      },
      rejected: (r: Reject) => this.onRejected(r),
      settled: (e: { seq: number; since: number }) => this.onSettled(e.seq, e.since),
      outOfSync: (reason: string) => void this.desync(reason),
    };
  }

  private desync(reason: string): string {
    reason = reason.slice(0, 300);
    this.setState("desynced");
    this.send({ kind: "desync", reason, seq: this.seq });
    this.emit({ type: "desync", reason, seq: this.seq, by: this.role });
    return reason;
  }

  /** The guest asks the host for the map again after a desync. */
  resync(): void {
    if (this.role !== "guest" || !this.link) return;
    this.send({ kind: "resync" });
  }

  private onLog(m: Extract<Wire, { kind: "commit" | "reject" | "settled" | "map-opening" }>): string | null {
    const replica = this.replica;
    if (!replica) return this.fail("The map has not arrived yet");
    if (this.state === "desynced") return null;
    const r = replica.receive(m);
    if (!r.ok) {
      // (an `outOfSync` event has said so already when the copy differs; a message out of order is the same loud failure)
      if ((this.state as PeerState) !== "desynced") this.desync(r.reason);
      return r.reason;
    }
    if (m.kind === "commit") {
      this.port.changed();
      const e = m.entry;
      if (e.author === this.myId) {
        const p = this.pending.get(e.counter);
        if (p) {
          this.pending.delete(e.counter);
          p.resolve({ ok: true, seq: e.seq });
        }
      }
    }
    return null;
  }

  private onRejected(rej: Reject): void {
    const p = this.pending.get(rej.counter);
    if (!p) return;
    this.pending.delete(rej.counter);
    if (rej.busy && p.tries < this.busyRetries) {
      p.tries++;
      this.waiting.push(p);
      return;
    }
    this.emit({ type: "refused", command: p.command.kind, reason: rej.reason, ...(rej.busy ? { busy: true } : {}), ...(rej.block ? { block: rej.block } : {}) });
    p.resolve({ ok: false, reason: rej.reason, ...(rej.busy ? { busy: true } : {}), ...(rej.block ? { block: rej.block } : {}), ...(rej.target !== undefined ? { target: rej.target } : {}) });
  }

  private onClaimsApplied(m: Extract<Wire, { kind: "claims" }>): string | null {
    const parsed = parseCommand(m.command);
    if (!parsed.ok) return this.fail(parsed.reason);
    const r = this.claims.apply(m.by, parsed.command, this.playerNames());
    if (!r.ok || this.claims.revision !== m.revision) {
      this.claimPending.get(m.id ?? 0)?.({ ok: false, reason: "The claims differ from the host's" });
      return this.desync(r.ok ? "The claims differ from the host's" : `A claim the host made would not apply here: ${r.reason}`);
    }
    this.emit({ type: "claims", by: m.by, command: parsed.command, changed: r.changed.length, ...(r.offer ? { offer: r.offer } : {}), revision: this.claims.revision });
    if (m.id !== undefined) {
      this.claimPending.get(m.id)?.({ ok: true, changed: r.changed.length, ...(r.offer ? { offer: r.offer } : {}) });
      this.claimPending.delete(m.id);
    }
    return null;
  }

  // ------------------------------------------------------------------------------ asking

  /** Ask for a command. The host orders it at once; a guest's request goes to the host and the answer comes back. A request that
   *  is only waiting for the water to settle is asked again after it has. Refusals are one plain line. */
  submit(command: Command): Promise<SubmitResult> {
    const why = this.readOnly();
    if (why) return Promise.resolve(this.refused(command, why));
    return new Promise((resolve) => {
      const p: PendingRequest = { command, resolve, tries: 0 };
      if (this.role === "guest") return this.guestSend(p);
      const r = this.hostSubmit(p);
      if (r.ok === false && r.busy && p.tries < this.busyRetries) {
        // (the host's own water is still settling: asked again after the next settle)
        this.dirty = true;
        this.waiting.push(p);
      } else resolve(r);
    });
  }

  private refused(command: Command, reason: string): SubmitResult {
    this.emit({ type: "refused", command: command.kind, reason });
    return { ok: false, reason };
  }

  /** The host orders its own request. A busy answer is not a refusal yet: the caller asks again after the settle. */
  private hostSubmit(p: PendingRequest): SubmitResult {
    const host = this.host;
    if (!host) return { ok: false, reason: "No map is being hosted" };
    const answer = host.submit(HOST_ID, host.request(p.command));
    if (answer.kind === "commit") {
      this.send(answer);
      this.afterEntry(answer.entry);
      this.port.changed();
      return { ok: true, seq: answer.entry.seq };
    }
    if (answer.busy) return { ok: false, reason: answer.reason, busy: true };
    this.emit({ type: "refused", command: p.command.kind, reason: answer.reason, ...(answer.block ? { block: answer.block } : {}) });
    return { ok: false, reason: answer.reason, ...(answer.block ? { block: answer.block } : {}), ...(answer.target !== undefined ? { target: answer.target } : {}) };
  }

  private guestSend(p: PendingRequest): void {
    const replica = this.replica;
    if (!replica || !this.link) return void p.resolve(this.refused(p.command, "The map is not ready"));
    const req = replica.request(p.command);
    if ("refused" in req) return void p.resolve(this.refused(p.command, req.refused));
    this.pending.set(req.counter, p);
    this.send(req);
  }

  /** Take back this player's last action that nothing is built on (the plan skips and names the blocked ones). */
  async undo(): Promise<SubmitResult & { skipped: Skipped[] }> {
    return this.history(false);
  }

  /** Bring back the action this player took back last. */
  async redo(): Promise<SubmitResult & { skipped: Skipped[] }> {
    return this.history(true);
  }

  /** What Undo (or Redo) would do now, without doing it. */
  plan(redo = false): HistoryPlan {
    const veto = this.claimsVeto(this.role);
    if (this.host) return redo ? this.host.redoPlan(HOST_ID, veto) : this.host.undoPlan(HOST_ID, veto);
    if (this.replica) return redo ? this.replica.redoPlan() : this.replica.undoPlan();
    return { target: null, skipped: [], reason: "No map is open" };
  }

  private async history(redo: boolean): Promise<SubmitResult & { skipped: Skipped[] }> {
    const why = this.readOnly();
    if (why) return { ...this.refused({ kind: redo ? "redo" : "undo", target: 0 }, why), skipped: [] };
    const p = this.plan(redo);
    if (p.target === null) return { ok: false, reason: p.reason ?? "Nothing to do", skipped: p.skipped };
    const r = await this.submit({ kind: redo ? "redo" : "undo", target: p.target });
    return { ...r, skipped: p.skipped };
  }

  /** Claims refuse what would land in the other player's area; the plans skip an undo that would (§3, §5). */
  private claimsVeto(role: Role): Veto {
    return (r) => (this.claims.owner.some((c) => c !== 0) ? refusalForWrites(r.writes, this.claims, role, this.playerNames()) : null);
  }

  // ------------------------------------------------------------------------------ claims

  /** Give a claims command (claim, release, offer, accept, decline): ordered by the host with the log. */
  claim(command: ClaimCommand): Promise<ClaimOutcome> {
    const parsed = parseCommand(command);
    if (!parsed.ok) return Promise.resolve({ ok: false, reason: parsed.reason.slice(0, 300) });
    const why = this.readOnly();
    if (why) return Promise.resolve({ ok: false, reason: why });
    if (this.role === "host") {
      const r = this.claims.apply("host", parsed.command, this.playerNames());
      if (!r.ok) {
        this.emit({ type: "refused", command: "claim", reason: r.reason });
        return Promise.resolve({ ok: false, reason: r.reason });
      }
      this.send({ kind: "claims", by: "host", command: parsed.command, revision: this.claims.revision });
      this.emit({ type: "claims", by: "host", command: parsed.command, changed: r.changed.length, ...(r.offer ? { offer: r.offer } : {}), revision: this.claims.revision });
      return Promise.resolve({ ok: true, changed: r.changed.length, ...(r.offer ? { offer: r.offer } : {}) });
    }
    if (!this.link) return Promise.resolve({ ok: false, reason: "The map is not ready" });
    // (the guest's own view says no at once, without a trip to the host)
    const early = this.claims.refusal("guest", parsed.command, this.playerNames());
    if (early) {
      this.emit({ type: "refused", command: "claim", reason: early });
      return Promise.resolve({ ok: false, reason: early });
    }
    const id = ++this.claimId;
    return new Promise((resolve) => {
      this.claimPending.set(id, resolve);
      this.send({ kind: "claim", id, command: parsed.command });
    });
  }

  /** The line for an edit this player is about to release that would reach into the other's area, or null (§3, shown before release). */
  reachRefusal(ops: EditOp | readonly EditOp[]): string | null {
    const s = this.mySession;
    return s ? refusal(ops, this.claims, this.role, s, this.playerNames()) : null;
  }

  /** The tiles of the other player's area that the edit's quick, cautious band reaches (shown in their colour while drawing). */
  reachBand(ops: EditOp | readonly EditOp[]): number[] {
    const s = this.mySession;
    return s ? reachInto(bandOf(ops, s), this.claims, this.role) : [];
  }

  /** The author's preview of a force, on the settled water of this copy; busy while it is still settling. */
  previewForce(gesture: ForceGesture): Previewed {
    if (this.replica) return this.replica.previewForce(gesture);
    const host = this.host;
    if (!host) return { ok: false, reason: "No map is open" };
    if (!host.waterSettled) return { ok: false, reason: BUSY, busy: true };
    const planned = planKeptForce(host.session, gesture);
    return planned.ok ? { ok: true, preview: planned.plan.hash, tiles: planned.plan.params.tiles.length } : { ok: false, reason: planned.reason };
  }

  // ------------------------------------------------------------------------------ the water

  private takeBaseline(): void {
    const b = this.mySession?.built;
    if (b) this.baseline = { water: Float64Array.from(b.water), dirty: Float64Array.from(b.contamination) };
  }

  /** An entry was applied here: its author is in the batch the water will settle for, and the claims as they stand are the ones the batch is judged by. */
  private afterEntry(entry: LogEntry): void {
    this.batch.push({ author: entry.author, seq: entry.seq });
    this.claimsThen = this.claims.clone();
    this.dirty = true;
    this.announced = false;
    this.emit({
      type: "applied",
      seq: entry.seq,
      author: roleOfId(entry.author),
      mine: entry.author === this.myId,
      kind: entry.command.kind,
      label: "label" in entry.command ? entry.command.label : entry.command.kind,
    });
  }

  /** True when there is water left to settle in the background (call `pump` while it is). */
  get settling(): boolean {
    return this.dirty;
  }

  /** Run a slice of the background settle (`ticks` of the water's clock; the default runs it to its end). True once the water
   *  has settled for the map as it is. The host announces it to the guest, which compares its own settle. */
  pump(ticks = Infinity): boolean {
    if (!this.dirty) return true;
    if (this.host) {
      const s = this.host.pumpWater(ticks);
      if (!s) return false;
      this.dirty = false;
      this.send(s);
      this.onSettled(s.seq, s.since);
      this.port.changed();
    } else if (this.replica) {
      if (this.state === "desynced") return true;
      if (!this.replica.pumpWater(ticks)) return false;
      this.dirty = false;
      this.port.changed();
    } else return true;
    this.retryWaiting();
    return true;
  }

  private retryWaiting(): void {
    const again = this.waiting;
    this.waiting = [];
    for (const p of again) {
      if (this.role === "guest") {
        this.guestSend(p);
        continue;
      }
      const r = this.hostSubmit(p);
      if (r.ok === false && r.busy && ++p.tries < this.busyRetries) this.waiting.push(p);
      else p.resolve(r);
    }
  }

  private onSettled(seq: number, since: number): void {
    const s = this.mySession;
    if (!s) return;
    const b = s.built;
    const batch = this.batch.filter((e) => e.seq > since && e.seq <= seq);
    if (this.baseline && this.claimsThen && batch.length && this.claimsThen.owner.some((c) => c !== 0)) {
      const notes = waterNotes(this.baseline.water, b.water, this.claimsThen, batch, roleOfId, { contamination: { before: this.baseline.dirty, after: b.contamination } });
      for (const note of notes) if (note.owner === this.role) this.emit({ type: "note", note, text: describeWaterNote(note, this.playerNames()) });
    }
    this.takeBaseline();
    this.batch = this.batch.filter((e) => e.seq > seq);
    this.emit({ type: "settled", seq });
    this.retryWaiting();
  }

  // ------------------------------------------------------------------------------ the whole map (§9)

  /** The host: tell the guest first ("<name> is opening a new map"), before the map is generated or loaded. */
  announceNewMap(name: string): void {
    if (this.role !== "host") throw new Error("only the host opens another map");
    this.announced = true;
    this.send({ kind: "map-opening", author: HOST_ID, name });
  }

  /** The host: the new map will not be opened after all (a generation that failed, Esc): the guest is sent the map as it is and carries on. */
  cancelNewMap(): void {
    if (this.role !== "host") throw new Error("only the host opens another map");
    if (!this.announced) return;
    this.announced = false;
    if (this.host && this.link && this.state !== "paused") this.sendWelcome();
  }

  /** The host: another map is open in the worker now (Generate, a real place, a file): the guest is sent it, and the old map is
   *  kept for Your maps on both sides. */
  newMap(name: string): void {
    if (this.role !== "host") throw new Error("only the host opens another map");
    const host = this.host;
    const session = this.port.session();
    if (!host || !session) throw new Error("no map is being hosted");
    live(session);
    const wasAnnounced = this.announced;
    // (the map being left: its name, where its log stood and its epoch, before the host opens the new one)
    const previous = { name: host.session.meta.name, seq: host.seq, epoch: host.epoch };
    const { opening, commit, previousProject } = host.openMap(name, session);
    this.announced = false;
    this.keep("new-map", previousProject, previous);
    this.claims = new ClaimsState(session.size.x, session.size.y);
    this.batch = [];
    this.dirty = false;
    this.takeBaseline();
    this.claimsThen = this.claims.clone();
    if (this.link && this.state !== "paused") {
      if (!wasAnnounced) this.send(opening);
      this.send(commit);
      this.sendWelcome();
    }
  }

  // ------------------------------------------------------------------------------ presence

  /** Say where this player is and what they are doing (see presence.ts; the page runs its own channel on the main thread, this one is
   *  for headless use). Throttled; call `tick` while a packet may be waiting. */
  presence(p: PresenceIn, now = this.now()): void {
    this.presenceCh.presence(p, now);
  }

  /** Send the waiting presence if it is time. True while something is still waiting. */
  tick(now = this.now()): boolean {
    return this.presenceCh.tick(now);
  }

  /** A presence packet from the other player on the channel that may lose packets. Refused with a line when it is not one. */
  receivePresence(payload: string): string | null {
    return this.state === "ended" ? null : this.presenceCh.receive(payload, false);
  }
}

function cleanName(name: string): string {
  // (no control characters; a blank name is no name)
  return name.replace(/[\u0000-\u001f]/g, "").trim().slice(0, MAX_DISPLAY_NAME);
}

