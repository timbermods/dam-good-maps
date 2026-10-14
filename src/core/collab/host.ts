// The host: the one player who keeps the order. Requests from any player (the host's own too) come
// to `submit`; each is checked, applied to the host's map and, if it stands, numbered and returned as
// the commit everyone applies in the same order. A refusal is one plain line and changes nothing
// (the sequence does not advance). Whole-map changes are the host's alone (docs/COLLAB-BRIEF.md §9).

import type { MapSession } from "../doc/session";
import { MapApplier } from "./transaction";
import { RecordLog } from "./records";
import type { Command, Commit, LogEntry, MapOpening, PlayerId, Reject, Request, Snapshot } from "./types";
import { commandProblem, messageProblem } from "./validate";

/** What the claims check (and anything else that may refuse an entry) can read, never change. */
export interface HostView {
  readonly hostId: PlayerId;
  readonly epoch: number;
  /** The sequence of the last entry ordered. */
  readonly seq: number;
  readonly players: readonly PlayerId[];
  /** The host's map (read it; the host applies the entry itself). */
  readonly session: MapSession;
  /** The records of the entries applied (each player's last 50). */
  readonly records: Pick<RecordLog, "all" | "byAuthor" | "get">;
}

/** The seam for claims: called with each entry before it is ordered (its `seq` is the one it would take);
 *  a string is the one-line reason it is refused, null lets it through. The default allows everything. */
export type EntryCheck = (entry: LogEntry, state: HostView) => string | null;

export interface HostOptions {
  hostId: PlayerId;
  check?: EntryCheck;
  /** Take a new checkpoint (settle the water, save the project) after this many entries; a rejoin sends the latest and the entries since. */
  checkpointEvery?: number;
  /** The map's number in this session; a whole-map change starts the next. */
  epoch?: number;
  /** Each player's request counter, for a host restarting a session. */
  counters?: Record<PlayerId, number>;
}

export const CHECKPOINT_EVERY = 100;

export class CollabHost implements HostView {
  readonly hostId: PlayerId;
  session: MapSession;
  epoch: number;
  seq = 0;
  readonly records = new RecordLog();
  private check: EntryCheck;
  private every: number;
  private applier: MapApplier;
  private roster = new Set<PlayerId>();
  private counters = new Map<PlayerId, number>();
  private tail: LogEntry[] = [];
  private saved: { seq: number; project: Uint8Array };
  /** The sequence of the last entry that changed the map (a force planned before it is stale). */
  private changedAt = 0;

  constructor(session: MapSession, opts: HostOptions) {
    this.hostId = opts.hostId;
    this.session = session;
    this.epoch = opts.epoch ?? 0;
    this.check = opts.check ?? (() => null);
    this.every = opts.checkpointEvery ?? CHECKPOINT_EVERY;
    this.applier = new MapApplier(session);
    this.roster.add(opts.hostId);
    for (const [p, n] of Object.entries(opts.counters ?? {})) this.counters.set(p, n);
    this.saved = this.checkpointNow();
  }

  get players(): readonly PlayerId[] {
    return [...this.roster];
  }

  /** The seam for claims can be set (or replaced) after the host is made. */
  setCheck(check: EntryCheck): void {
    this.check = check;
  }

  join(player: PlayerId): void {
    this.roster.add(player);
  }

  /** The hash of the host's map now. */
  hash(): string {
    return this.applier.hash();
  }

  /** The host's own next request for `command`, as the guests' pages make theirs. */
  request(command: Command, author: PlayerId = this.hostId, baseSeq = this.seq): Request {
    return { kind: "request", epoch: this.epoch, counter: (this.counters.get(author) ?? 0) + 1, baseSeq, command };
  }

  /** Order a request from `author` (the player the channel it came on belongs to; a request never names its own author). */
  submit(author: PlayerId, request: unknown): Commit | Reject {
    const asked = typeof request === "object" && request !== null ? (request as { counter?: unknown }).counter : undefined;
    const refuse = (reason: string): Reject => ({ kind: "reject", counter: typeof asked === "number" && Number.isInteger(asked) && asked >= 0 ? asked : 0, reason });
    const problem = typeof request === "object" && request !== null && (request as { kind?: unknown }).kind === "request" ? messageProblem(request) : "That is not a request";
    if (problem) return refuse(problem);
    const req = request as Request;
    if (!this.roster.has(author)) return refuse("You are not in this session");
    if (req.epoch !== this.epoch) return refuse("The host opened another map: wait for it to load");
    const last = this.counters.get(author) ?? 0;
    if (req.counter <= last) return refuse("That request was already received");
    if (req.counter > last + 1) return refuse("An earlier request is missing");
    // (a refused request uses its number too, and is never retried under it)
    this.counters.set(author, req.counter);
    if (req.baseSeq > this.seq) return refuse("Your view is ahead of the host's");
    const c = req.command;
    if (c.kind === "newMap") return refuse(author === this.hostId ? "Open the new map with openMap" : "Only the host can open a new map");
    if (c.kind === "force" && this.changedAt > req.baseSeq) return refuse("The map changed while you were drawing: draw the force again on the map as it is now");
    const entry: LogEntry = { kind: "entry", seq: this.seq + 1, epoch: this.epoch, author, baseSeq: req.baseSeq, counter: req.counter, command: c };
    const blocked = this.check(entry, this);
    if (blocked) return refuse(blocked);
    const done = this.applier.apply(entry);
    if (!done.ok) return refuse(done.reason);
    this.seq = entry.seq;
    this.tail.push(entry);
    this.records.add(done.record);
    if (done.record.changed) this.changedAt = entry.seq;
    if (this.seq - this.saved.seq >= this.every) {
      this.saved = this.checkpointNow();
      this.tail = [];
    }
    return { kind: "commit", entry, hash: done.hash };
  }

  /** Save the map as a checkpoint: its water settled, then the project (the map as it stands). */
  private checkpointNow(): { seq: number; project: Uint8Array } {
    this.session.settleCanonical();
    return { seq: this.seq, project: this.session.project() };
  }

  /** The map a rejoining player gets: the latest checkpoint and the entries since, never the whole history. */
  snapshot(): Snapshot {
    return {
      epoch: this.epoch,
      checkpointSeq: this.saved.seq,
      project: this.saved.project,
      tail: this.tail.slice(),
      endHash: this.hash(),
      counters: Object.fromEntries(this.counters),
    };
  }

  /** Open another map (Generate, a real place, a file): the host's alone. The guests get `opening` first, so their pages can
   *  say "<name> is opening a new map", then `commit`, then fetch `snapshot()` of the new map. The old map's project is returned for Your maps. */
  openMap(name: string, session: MapSession): { opening: MapOpening; commit: Commit; previousProject: Uint8Array } {
    const bad = commandProblem({ kind: "newMap", name });
    if (bad) throw new Error(bad);
    this.session.settleCanonical();
    const previousProject = this.session.project();
    const entry: LogEntry = { kind: "entry", seq: this.seq + 1, epoch: this.epoch, author: this.hostId, baseSeq: this.seq, counter: (this.counters.get(this.hostId) ?? 0) + 1, command: { kind: "newMap", name } };
    this.counters.set(this.hostId, entry.counter);
    this.session = session;
    this.applier = new MapApplier(session);
    this.epoch += 1;
    this.seq = 0;
    this.changedAt = 0;
    this.tail = [];
    this.records.clear();
    this.saved = this.checkpointNow();
    return { opening: { kind: "map-opening", author: this.hostId, name }, commit: { kind: "commit", entry, hash: this.hash() }, previousProject };
  }
}
