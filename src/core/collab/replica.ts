// A replica: one browser's copy of the map, rebuilt from the host's ordered list. It applies commits
// strictly in order (a gap or a duplicate is refused with its reason and changes nothing), keeps the
// same records the host keeps, and compares the hash of what the players made directly with the host's
// after every entry. The water settles in the background (`pumpWater`), and the host's "settled at seq N"
// is compared with this copy's own settle at that sequence. A whole-map change (the host opening another
// map) tells the page first, then waits for the new map.

import { decodeProject } from "../doc/document";
import { MapSession } from "../doc/session";
import { planKeptForce } from "./forceStep";
import { MapApplier, recordFromJson, BUSY, type TransactionRecord } from "./transaction";
import { RecordLog } from "./records";
import { redoPlan, undoPlan, type HistoryPlan, type Names } from "./undo";
import type { Command, ForceGesture, LogEntry, MapOpening, PlayerId, Reject, Request, Settled, Snapshot } from "./types";
import { messageProblem } from "./validate";
import { settledHash } from "./water";

/** live: edits flow. opening: the host announced a new map. needs-map: the host opened it, adopt its snapshot.
 *  out-of-sync: this copy differs from the host's; ask for a fresh snapshot. */
export type ReplicaStatus = "live" | "opening" | "needs-map" | "out-of-sync";

export interface ReplicaEvents {
  /** The host is about to open another map: "<name> is opening a new map". */
  opening?(e: { author: PlayerId; name: string }): void;
  /** The host opened it: `previousProject` is this copy of the old map, for Your maps. Adopt the new map's snapshot next. */
  newMap?(e: { author: PlayerId; name: string; previousProject: Uint8Array }): void;
  /** An entry was applied (also the player's own, once the host has ordered it). */
  applied?(entry: LogEntry, record: TransactionRecord): void;
  /** The host refused one of this player's requests. */
  rejected?(r: Reject): void;
  /** The water settled for the map after entry `seq` and agrees with the host's. */
  settled?(e: { seq: number; since: number }): void;
  /** This copy differs from the host's. */
  outOfSync?(reason: string): void;
}

export type Received = { ok: true } | { ok: false; reason: string };

/** What the author's preview of a force shows: pass `preview` in the gesture so the host can tell the map changed under it. */
export type Previewed = { ok: true; preview: string; tiles: number } | { ok: false; reason: string; busy?: boolean };

export class CollabReplica {
  session: MapSession;
  status: ReplicaStatus = "live";
  epoch: number;
  /** The sequence of the last entry applied. */
  seq: number;
  readonly records = new RecordLog();
  private applier: MapApplier;
  private counter: number;
  private opening: string | null = null;
  /** This copy's own settle: the sequence the water settled for, and its hash. */
  private own: { seq: number; hash: string } | null = null;
  private announced: Settled | null = null;

  constructor(
    session: MapSession,
    readonly playerId: PlayerId,
    start: { epoch: number; seq: number; counter?: number },
    readonly events: ReplicaEvents = {},
    /** Called on each session this copy opens from a snapshot (the page sets its own options here). */
    readonly configure?: (s: MapSession) => void,
    /** How players are called in an undo's refusal; the ids by default. */
    readonly names?: Names,
  ) {
    this.session = session;
    this.applier = new MapApplier(session);
    this.epoch = start.epoch;
    this.seq = start.seq;
    this.counter = start.counter ?? 0;
  }

  /** A replica restored from a snapshot: the host's checkpoint opened as the project, its records, then the entries since applied. */
  static fromSnapshot(snapshot: Snapshot, playerId: PlayerId, events: ReplicaEvents = {}, configure?: (s: MapSession) => void): CollabReplica {
    const session = MapSession.open(decodeProject(snapshot.project));
    configure?.(session);
    const r = new CollabReplica(session, playerId, { epoch: snapshot.epoch, seq: snapshot.checkpointSeq, counter: snapshot.counters[playerId] ?? 0 }, events, configure);
    const done = r.adopt(snapshot, false);
    if (!done.ok) throw new Error(done.reason);
    return r;
  }

  /** Take a snapshot as this copy: a rejoin, or the new map after a whole-map change. */
  adopt(snapshot: Snapshot, reopen = true): Received {
    const problem = snapshotProblem(snapshot);
    if (problem) return { ok: false, reason: problem };
    if (reopen) {
      this.session = MapSession.open(decodeProject(snapshot.project));
      this.configure?.(this.session);
      this.applier = new MapApplier(this.session);
    }
    this.records.clear();
    const N = this.session.built.W * this.session.built.H;
    for (const j of snapshot.records) this.records.add(recordFromJson(N, j));
    this.records.restoreFences(N, snapshot.fences);
    this.epoch = snapshot.epoch;
    this.seq = snapshot.checkpointSeq;
    this.counter = snapshot.counters[this.playerId] ?? this.counter;
    this.status = "live";
    this.opening = null;
    // (the checkpoint's water is settled: the project was saved only so)
    this.own = { seq: this.seq, hash: settledHash(this.session) };
    this.announced = null;
    for (const entry of snapshot.tail) {
      const r = this.applyInOrder(entry);
      if (!r.ok) return r;
    }
    if (this.applier.hash() !== snapshot.endHash) return this.diverged("This copy of the map differs from the host's after loading it");
    return { ok: true };
  }

  /** What Undo does for this player now: the action it takes back (null when none can be) and the blocked ones it skips, each named. */
  undoPlan(): HistoryPlan {
    return undoPlan(this.records, this.playerId, this.names);
  }

  /** What Redo does for this player now. */
  redoPlan(): HistoryPlan {
    return redoPlan(this.records, this.playerId, this.names);
  }

  /** This player's next request for `command`, or why they can't ask now. */
  request(command: Command): Request | { refused: string } {
    if (this.status === "opening") return { refused: `${this.opening ?? "The host"} is opening a new map` };
    if (this.status !== "live") return { refused: this.status === "needs-map" ? "A new map is loading" : "This copy of the map is out of step with the host's" };
    return { kind: "request", epoch: this.epoch, counter: ++this.counter, baseSeq: this.seq, command };
  }

  /** The author's preview of a force: planned on the canonical water of this copy's map, changing nothing. Busy while the
   *  water is still settling (pump it, then ask again); the page's preview must use this basis, not the live water. */
  previewForce(gesture: ForceGesture): Previewed {
    if (this.status !== "live") return { ok: false, reason: this.status === "opening" ? `${this.opening} is opening a new map` : "This copy of the map is not ready" };
    if (!this.applier.water.settled) return { ok: false, reason: BUSY, busy: true };
    const planned = planKeptForce(this.session, gesture);
    if (!planned.ok) return { ok: false, reason: planned.reason };
    return { ok: true, preview: planned.plan.hash, tiles: planned.plan.params.tiles.length };
  }

  /** Run a slice of the water's settle in the background (`ticks` of its clock; the default runs it to its end). True
   *  once the water has settled for the map as it is. */
  pumpWater(ticks = Infinity): boolean {
    if (this.own?.seq === this.seq) return true;
    if (!this.applier.water.pump(ticks)) return false;
    this.own = { seq: this.seq, hash: settledHash(this.session) };
    this.reconcile();
    return true;
  }

  /** What the host sends: a commit, a refusal of this player's request, the announcement of a new map, or a settle. */
  receive(message: unknown): Received {
    const problem = messageProblem(message);
    if (problem) return { ok: false, reason: problem };
    const m = message as { kind: string };
    switch (m.kind) {
      case "commit": {
        const c = message as { entry: LogEntry; hash: string };
        return this.commit(c.entry, c.hash);
      }
      case "reject":
        this.events.rejected?.(message as Reject);
        return { ok: true };
      case "map-opening": {
        const o = message as MapOpening;
        this.status = "opening";
        this.opening = o.name;
        this.events.opening?.({ author: o.author, name: o.name });
        return { ok: true };
      }
      case "settled": {
        const s = message as Settled;
        if (s.epoch !== this.epoch) return { ok: false, reason: "That settle belongs to another map" };
        this.announced = s;
        return this.reconcile();
      }
      default:
        return { ok: false, reason: "A replica takes commits, refusals, settles and map announcements" };
    }
  }

  /** The hash of what the players made directly, as this copy's map stands. */
  hash(): string {
    return this.applier.hash();
  }

  /** Compare this copy's settle with the host's announcement when both are for the same sequence; an announcement this
   *  copy has moved past can no longer be compared and is dropped (the host announces the next settle). */
  private reconcile(): Received {
    const a = this.announced;
    if (!a) return { ok: true };
    if (this.seq > a.seq) {
      this.announced = null;
      return { ok: true };
    }
    if (!this.own || this.own.seq !== a.seq) return { ok: true };
    this.announced = null;
    if (this.own.hash !== a.hash) return this.diverged(`The water settled differently here than on the host's map after entry ${a.seq}`);
    this.events.settled?.({ seq: a.seq, since: a.since });
    return { ok: true };
  }

  private diverged(reason: string): Received {
    this.status = "out-of-sync";
    this.events.outOfSync?.(reason);
    return { ok: false, reason };
  }

  /** Order check only: the next entry, none before it missing and none twice. */
  private order(entry: LogEntry): Received {
    if (entry.epoch !== this.epoch) return { ok: false, reason: entry.epoch < this.epoch ? "That entry belongs to an earlier map" : "That entry belongs to a map this copy has not loaded yet" };
    if (entry.seq <= this.seq) return { ok: false, reason: `Entry ${entry.seq} was already applied` };
    if (entry.seq > this.seq + 1) return { ok: false, reason: `Entry ${this.seq + 1} is missing: entries must be applied in order` };
    return { ok: true };
  }

  private applyInOrder(entry: LogEntry): Received {
    const ordered = this.order(entry);
    if (!ordered.ok) return ordered;
    const done = this.applier.apply(entry, { role: "replica", records: this.records, names: this.names });
    if (!done.ok) return this.diverged(`Entry ${entry.seq} would not apply here: ${done.reason}`);
    this.seq = entry.seq;
    if (done.effect) this.records.addEffect(done.record);
    else this.records.add(done.record);
    this.events.applied?.(entry, done.record);
    return { ok: true };
  }

  private commit(entry: LogEntry, hash: string): Received {
    if (this.status === "out-of-sync" || this.status === "needs-map") return { ok: false, reason: this.status === "needs-map" ? "A new map is loading" : "This copy of the map is out of step with the host's" };
    const ordered = this.order(entry);
    if (!ordered.ok) return ordered;
    if (entry.command.kind === "newMap") {
      this.seq = entry.seq;
      this.status = "needs-map";
      this.applier.water.settleNow();
      this.events.newMap?.({ author: entry.author, name: entry.command.name, previousProject: this.session.project() });
      return { ok: true };
    }
    const done = this.applyInOrder(entry);
    if (!done.ok) return done;
    if (this.applier.hash() !== hash) return this.diverged(`This copy of the map differs from the host's after entry ${entry.seq}`);
    return { ok: true };
  }
}

/** Why a snapshot can't be used (one line), or null: its entries must follow its checkpoint one by one. */
export function snapshotProblem(s: Snapshot): string | null {
  const { project: _project, ...rest } = s;
  const bad = messageProblem({ kind: "snapshot", ...rest });
  if (bad) return bad;
  if (!(s.project instanceof Uint8Array) || !s.project.length) return "The snapshot has no map";
  for (const [k, e] of s.tail.entries()) if (e.seq !== s.checkpointSeq + k + 1 || e.epoch !== s.epoch) return "The snapshot's entries are not in order after its checkpoint";
  return null;
}
