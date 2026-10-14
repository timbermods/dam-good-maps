// The host: the one player who keeps the order. Requests from any player (the host's own too) come
// to `submit`; each is checked, applied to the host's map and, if it stands, numbered and returned as
// the commit everyone applies in the same order. A refusal is one plain line and changes nothing
// (the sequence does not advance). Whole-map changes are the host's alone (docs/COLLAB-BRIEF.md §9).
//
// Ordering never waits on the water. The water settles in the background (`pumpWater`), for the latest
// sequence only; when it has, the host announces "settled at seq N, hash H" and takes a checkpoint if one
// is due. Only an entry that plans on the settled water (a force, a Select action, a placement stroke,
// Remove unfed water, Fill, a weathering Naturalize stroke) is refused as busy while it has not.

import type { MapSession } from "../doc/session";
import { MapApplier, recordToJson, type RecordJson, type TransactionRecord } from "./transaction";
import { RecordLog } from "./records";
import type { Command, Commit, LogEntry, MapOpening, PlayerId, Reject, Request, Settled, Snapshot } from "./types";
import { commandProblem, messageProblem } from "./validate";
import { settledHash } from "./water";

/** What the claims check (and anything else that may refuse an entry) can read, never change. */
export interface HostView {
  readonly hostId: PlayerId;
  readonly epoch: number;
  /** The sequence of the last entry ordered. */
  readonly seq: number;
  readonly players: readonly PlayerId[];
  /** The host's map. During the check it already shows the entry; the host takes it back if the check refuses. */
  readonly session: MapSession;
  /** The records of the entries applied (each player's last 50). */
  readonly records: Pick<RecordLog, "all" | "byAuthor" | "get">;
}

/** The seam for claims: called with each entry AFTER the host has applied it and made its record, so the
 *  exact footprint is known (`record.writes`, `record.touch`, `record.patch`: for a force the exact result).
 *  A string is the one-line reason it is refused: the host takes the step back as if it had never been
 *  taken and the sequence does not advance. null lets it through. The default allows everything. */
export type EntryCheck = (entry: LogEntry, record: TransactionRecord, state: HostView) => string | null;

export interface HostOptions {
  hostId: PlayerId;
  check?: EntryCheck;
  /** Take a new checkpoint (the project, its water settled) once this many entries have gone by and the water has settled; a rejoin sends the latest and the entries since. */
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
  private saved: { seq: number; project: Uint8Array; records: RecordJson[] };
  /** The sequence of the last entry that changed what the players made (a force with no preview, planned before it, is stale). */
  private changedAt = 0;
  /** The sequence the water last settled for and was announced. */
  private settledAt = 0;

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

  /** The hash of what the players made directly, as the host's map stands. */
  hash(): string {
    return this.applier.hash();
  }

  /** The host's map shows the canonical settle of its ground (a force plans on it). */
  get waterSettled(): boolean {
    return this.applier.water.settled;
  }

  /** The host's own next request for `command`, as the guests' pages make theirs. */
  request(command: Command, author: PlayerId = this.hostId, baseSeq = this.seq): Request {
    return { kind: "request", epoch: this.epoch, counter: (this.counters.get(author) ?? 0) + 1, baseSeq, command };
  }

  /** Order a request from `author` (the player the channel it came on belongs to; a request never names its own author). */
  submit(author: PlayerId, request: unknown): Commit | Reject {
    const asked = typeof request === "object" && request !== null ? (request as { counter?: unknown }).counter : undefined;
    const refuse = (reason: string, busy = false): Reject => ({ kind: "reject", counter: typeof asked === "number" && Number.isInteger(asked) && asked >= 0 ? asked : 0, reason, ...(busy ? { busy: true } : {}) });
    if (!this.roster.has(author)) return refuse("You are not in this session");
    // The request is counted before anything else is checked, so a refused request never leaves the player's
    // next one out of step (the player's page has counted it already); it is not retried under its number.
    if (typeof asked !== "number" || !Number.isInteger(asked) || asked < 1) return refuse("The request is not valid: it has no request number");
    const last = this.counters.get(author) ?? 0;
    if (asked <= last) return refuse("That request was already received");
    if (asked > last + 1) return refuse("An earlier request is missing");
    this.counters.set(author, asked);
    const problem = (request as { kind?: unknown }).kind === "request" ? messageProblem(request) : "That is not a request";
    if (problem) return refuse(problem);
    const req = request as Request;
    if (req.epoch !== this.epoch) return refuse("The host opened another map: wait for it to load");
    if (req.baseSeq > this.seq) return refuse("Your view is ahead of the host's");
    const c = req.command;
    if (c.kind === "newMap") return refuse(author === this.hostId ? "Open the new map with openMap" : "Only the host can open a new map");
    // A force whose preview sent no operation to compare is stale when any entry since its view changed the map;
    // one that did is compared with the operation the host plans, which is exact (a force reads the whole map).
    if (c.kind === "force" && c.gesture.preview === undefined && this.changedAt > req.baseSeq) return refuse("The map changed while you were drawing: draw the force again on the map as it is now");
    const entry: LogEntry = { kind: "entry", seq: this.seq + 1, epoch: this.epoch, author, baseSeq: req.baseSeq, counter: req.counter, command: c };
    const done = this.applier.apply(entry, { role: "host", check: (record) => this.check(entry, record, this) });
    if (!done.ok) return refuse(done.reason, done.busy);
    this.seq = entry.seq;
    if (done.applied) entry.applied = done.applied;
    this.tail.push(entry);
    this.records.add(done.record);
    if (done.record.changed) this.changedAt = entry.seq;
    return { kind: "commit", entry, hash: done.hash };
  }

  /** Run a slice of the water's settle in the background (`ticks` of its clock; the default runs it to its end). When
   *  the water has settled for the map as it now stands, returns the announcement for everyone (once per sequence);
   *  null while it is still settling, or when this sequence has been announced. A due checkpoint is taken here. */
  pumpWater(ticks = Infinity): Settled | null {
    if (this.settledAt === this.seq) return null;
    if (!this.applier.water.pump(ticks)) return null;
    const settled: Settled = { kind: "settled", epoch: this.epoch, seq: this.seq, since: this.settledAt, hash: settledHash(this.session) };
    this.settledAt = this.seq;
    if (this.seq - this.saved.seq >= this.every) {
      this.saved = this.checkpointNow();
      this.tail = [];
    }
    return settled;
  }

  /** Save the map as a checkpoint: the project as it stands, its water settled (a project saved while the water is
   *  settling opens by rebuilding, which is a replay of the whole history). */
  private checkpointNow(): { seq: number; project: Uint8Array; records: RecordJson[] } {
    this.applier.water.settleNow();
    return { seq: this.seq, project: this.session.project(), records: this.records.all().map(recordToJson) };
  }

  /** The map a rejoining player gets: the latest checkpoint, the records up to it and the entries since, never the whole history. */
  snapshot(): Snapshot {
    return {
      epoch: this.epoch,
      checkpointSeq: this.saved.seq,
      project: this.saved.project,
      tail: this.tail.slice(),
      endHash: this.hash(),
      records: this.saved.records,
      counters: Object.fromEntries(this.counters),
    };
  }

  /** Open another map (Generate, a real place, a file): the host's alone. The guests get `opening` first, so their pages can
   *  say "<name> is opening a new map", then `commit`, then fetch `snapshot()` of the new map. The old map's project is returned for Your maps. */
  openMap(name: string, session: MapSession): { opening: MapOpening; commit: Commit; previousProject: Uint8Array } {
    const bad = commandProblem({ kind: "newMap", name });
    if (bad) throw new Error(bad);
    this.applier.water.settleNow();
    const previousProject = this.session.project();
    const entry: LogEntry = { kind: "entry", seq: this.seq + 1, epoch: this.epoch, author: this.hostId, baseSeq: this.seq, counter: (this.counters.get(this.hostId) ?? 0) + 1, command: { kind: "newMap", name } };
    this.counters.set(this.hostId, entry.counter);
    this.session = session;
    this.applier = new MapApplier(session);
    this.epoch += 1;
    this.seq = 0;
    this.changedAt = 0;
    this.settledAt = 0;
    this.tail = [];
    this.records.clear();
    this.saved = this.checkpointNow();
    return { opening: { kind: "map-opening", author: this.hostId, name }, commit: { kind: "commit", entry, hash: this.hash() }, previousProject };
  }
}
