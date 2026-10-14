// One entry applied to a peer's map as one atomic step, with its record: the literal patch (before and
// after values), what it wrote (W) and what it touched (T), and the step's operations with their undo
// data. The host and every replica run the same code on the same ordered entries, so they hold the same
// records as well as the same map.
//
// Applying needs no water: the session stays in the defer mode and the water settles in the background
// (water.ts). Only an entry whose planning reads the settled water waits for it: a force, a Select action
// (its start carry), a placement stroke, Remove unfed water, Fill and a weathering Naturalize stroke. The
// host refuses such an entry as busy until its water has settled for the map as it is; a replica settles
// first (it is normally done already, since the host had to be settled to order the entry).

import type { AppliedOp, EditOp } from "../doc/ops";
import type { MapSession } from "../doc/session";
import { applySelection } from "../doc/start";
import { newRampedStroke } from "../doc/strokes";
import { applyForce } from "./forceStep";
import { applyPatch, captureState, cloneState, invertPatch, patchIsEmpty, stateHash, type MapState, type Patch } from "./mapState";
import { Mask } from "./mask";
import { placeWords } from "./place";
import { nameOf, type RecordLog } from "./records";
import { touchesOf } from "./touches";
import type { Command, LogEntry, PlayerId } from "./types";
import { historyProblem, type Names } from "./undo";
import { WaterBarrier } from "./water";

/** What an applied entry left behind: the record undo with two players is built on. */
export interface TransactionRecord {
  seq: number;
  epoch: number;
  author: PlayerId;
  label: string;
  /** The literal before and after values of everything the players made directly in the step. Not the water, the
   *  soil or the resource objects (trees and bushes), which follow from the settled water. */
  patch: Patch;
  /** Tiles directly written. */
  writes: Mask;
  /** Tiles touched: written, read or reached (the whole map for a force, a feature operation or a water operation). */
  touch: Mask;
  /** Identity keys: "entity:<id>", "lakes", "feature-order", "action:<seq>". */
  keys: string[];
  /** Where it was, in words ("in the north-east"), or "" when it reached the whole map (undo.ts names it in a refusal). */
  where: string;
  /** Set once the action is taken back: the sequence of the entry that took it back (undo.ts). Taken back, it can be brought back. */
  undoneAt?: number;
  /** While taken back: the earlier actions it was made on that have been taken back or brought back since (an odd number of times).
   *  It cannot be brought back until the ground it was made on is as it was. */
  shifted?: number[];
  /** On the record of an undo's or a redo's effect (which is not an action of its own and is never undone): what it took back or brought back. */
  undoes?: { target: number; redo: boolean };
  /** Whether the step changed anything the players made directly (a stroke that found nothing to change still touched the ground). */
  changed: boolean;
  /** The step's operations as the document keeps them, with their undo data: an undo can turn the record into
   *  operations (D342). The first and last operation numbers are `ops[0].seq` and `ops.at(-1).seq`. Feature
   *  state (features and their order) is in these undo data (`before`, `index`), not in the patch. */
  ops: AppliedOp[];
}

export type Applied =
  | { ok: true; record: TransactionRecord; hash: string; state: MapState; applied?: EditOp[]; needsWater: boolean; /** Set for an undo or a redo: the record is its effect, not an action of its own. */ effect?: { target: number; redo: boolean } }
  | { ok: false; reason: string; busy?: boolean; stale?: boolean };

/** The JSON form of a record (masks as runs of tile indices). */
export interface RecordJson extends Omit<TransactionRecord, "writes" | "touch"> {
  writes: [number, number][];
  touch: [number, number][];
}

export const recordToJson = (r: TransactionRecord): RecordJson => structuredClone({ ...r, writes: r.writes.toRuns(), touch: r.touch.toRuns() });
export const recordFromJson = (N: number, j: RecordJson): TransactionRecord => ({ ...structuredClone(j), writes: Mask.fromRuns(N, j.writes), touch: Mask.fromRuns(N, j.touch) });

export const BUSY = "The water is still settling: ask again in a moment";

const plainOps = (s: MapSession): EditOp[] => s.lastStepOps().map((o) => ({ op: o.op, params: structuredClone(o.params) }) as EditOp);

const weathering = (o: EditOp): boolean => o.op === "brush" && o.params.tool === "naturalize" && o.params.weathers === true;
const readsWaterOp = (o: EditOp): boolean => o.op === "paintObjects" || o.op === "removeUnfedWater" || o.op === "fillHollow" || weathering(o);

/** The objects an operation names (the ones it moves, changes or removes). */
const targets = (o: EditOp): string[] => (o.op === "moveEntity" || o.op === "setEntityProps" ? [o.params.id] : o.op === "deleteEntities" ? o.params.entities : []);

/** Whether the host needs the water settled to apply a command: it plans on it (a force, a Select action, a placement
 *  stroke, Remove unfed water, Fill, a weathering stroke), or it names a resource object (`derived`: a generated tree or
 *  bush), whose existence follows from the settled water, so the check on every peer must see the same ones. */
export function hostNeedsWater(c: Command, derived?: ReadonlySet<string>): boolean {
  if (c.kind === "force" || c.kind === "select") return true;
  return c.kind === "edit" && c.ops.some((o) => readsWaterOp(o) || (!!derived && targets(o).some((id) => derived.has(id))));
}

export interface ApplyOptions {
  /** `host`: refuse as busy until the water has settled when the command needs it. `replica`: settle first, apply the host's literal operations. */
  role: "host" | "replica";
  /** The host's last look, after the step is applied and its record made: a reason takes the step back (the claims seam). */
  check?: (record: TransactionRecord) => string | null;
  /** The records an undo or a redo decides by and marks (the host's, or the replica's own); required for those commands. */
  records?: RecordLog;
  /** How players are called in a refusal's line. */
  names?: Names;
}

/** Applies entries to one session, keeping the map's last captured state so a record needs one capture per step. */
export class MapApplier {
  private seen: { built: object; state: MapState } | null = null;
  readonly water: WaterBarrier;

  constructor(readonly session: MapSession) {
    this.water = new WaterBarrier(session);
  }

  /** What the players made directly, as the map stands. */
  state(): MapState {
    const built = this.session.built;
    if (!this.seen || this.seen.built !== built) this.seen = { built, state: captureState(this.session) };
    return this.seen.state;
  }

  /** The hash of what the players made directly. */
  hash(): string {
    return stateHash(this.state());
  }

  apply(entry: Pick<LogEntry, "seq" | "epoch" | "author" | "command" | "applied" | "water">, opts: ApplyOptions): Applied {
    const s = this.session;
    const command: Command = entry.command;
    const host = opts.role === "host";
    if (command.kind === "newMap") return { ok: false, reason: "A whole-map change is the host's, and arrives as a new map" };
    if (command.kind === "undo" || command.kind === "redo") return this.history(entry, command.kind === "redo", command.target, opts);
    // (a replica goes by the host: it settles for every entry the host held for the settled water)
    const needsWater = host ? hostNeedsWater(command, new Set(this.state().derived.map((d) => d[0]))) : entry.water === true || hostNeedsWater(command);
    if (needsWater) {
      if (!this.water.settled) {
        if (host) return { ok: false, reason: BUSY, busy: true };
        this.water.settleNow();
      }
    }
    const before = this.state();
    const mark = s.mark();
    let label: string;
    let applied: EditOp[] | undefined;
    if (command.kind === "force") {
      label = command.gesture.request.verb;
      const r = applyForce(s, command.gesture, host ? command.gesture.preview : undefined);
      if (!r.ok) return { ok: false, reason: r.reason, ...(r.stale ? { stale: true } : {}) };
    } else if (command.kind === "select") {
      // (applied again by every peer on the settled map, like a force: the single-player step takes the carry by applying,
      // undoing and applying again, which leaves a gap in the operations' numbers that a literal replay would not)
      label = command.label;
      for (const op of command.ops) {
        const refused = newRampedStroke(op);
        if (refused) return { ok: false, reason: refused };
      }
      const r = applySelection(s, command.ops, command.label, touchesOf(command.ops, before, before).writes.tiles());
      if (!r.ok) return { ok: false, reason: r.errors[0] ?? "The edit could not be applied" };
    } else {
      label = command.label;
      if (host) {
        for (const op of command.ops) {
          const refused = newRampedStroke(op);
          if (refused) return { ok: false, reason: refused };
        }
        const r = command.ops.length === 1 ? s.apply(command.ops[0], "user", command.label) : s.applyAll(command.ops, "user", command.label);
        if (!r.ok) return { ok: false, reason: r.errors[0] ?? "The edit could not be applied" };
        // (a weathering stroke is applied again on the settled map by every peer: its derived rim, shore and keep stay out)
        applied = command.ops.some(weathering) ? command.ops : plainOps(s);
      } else {
        const ops = entry.applied;
        if (!ops?.length) return { ok: false, reason: "The entry carries no operations" };
        // (a placement stroke is kept as the single-player document keeps it: a batch)
        const stroke = command.ops.some((o) => o.op === "paintObjects");
        const r = stroke ? s.applyBatch(ops, "user", command.label) : s.applyAll(ops, "user", command.label);
        if (!r.ok) return { ok: false, reason: r.errors[0] ?? "The edit could not be applied" };
      }
    }
    this.water.invalidate();
    const after = captureState(s);
    this.seen = { built: s.built, state: after };
    const t = touchesOf(plainOps(s), before, after);
    const record: TransactionRecord = {
      seq: entry.seq,
      epoch: entry.epoch,
      author: entry.author,
      label,
      where: placeWords(before.W, before.H, t.writes.empty ? t.touch : t.writes),
      patch: t.patch,
      writes: t.writes,
      touch: t.touch,
      keys: [...t.keys].sort(),
      changed: !patchIsEmpty(t.patch),
      ops: structuredClone(s.lastStepOps()) as AppliedOp[],
    };
    const blocked = opts.check?.(record) ?? null;
    if (blocked) {
      const step = s.stepSince(mark);
      if (step && s.takeBack(step)) {
        this.seen = { built: s.built, state: before };
        return { ok: false, reason: blocked };
      }
      throw new Error("A refused step could not be taken back");
    }
    return { ok: true, record, hash: stateHash(after), state: after, needsWater, ...(applied ? { applied } : {}) };
  }

  /** An undo or a redo: the action named leaves the document (or returns to it, at its place in the document's order) and the map
   *  that results must be what the stored values put on the map as it stands, or it is refused and nothing changes. Decided from
   *  the records alone, so every peer decides the same. */
  private history(entry: Pick<LogEntry, "seq" | "epoch" | "author">, redo: boolean, target: number, opts: ApplyOptions): Applied {
    const s = this.session;
    const records = opts.records;
    if (!records) throw new Error("An undo needs the records");
    const found = historyProblem(records, entry.author, redo, target, opts.names);
    if ("reason" in found) return { ok: false, reason: found.reason };
    const r = found.record;
    const before = this.state();
    const prev = s.logOps.slice();
    const next = s.nextSeq;
    const seqs = new Set(r.ops.map((o) => o.seq));
    const standing = prev.filter((o) => seqs.has(o.seq)).length;
    if (redo ? standing > 0 : standing !== seqs.size) return { ok: false, reason: `${nameOf(r)} is not in the map as the records say` };
    const log = redo ? [...prev, ...r.ops.map((o) => structuredClone(o))].sort((a, b) => a.seq - b.seq) : prev.filter((o) => !seqs.has(o.seq));
    const revert = () => {
      s.followLog(prev, next);
      this.seen = { built: s.built, state: before };
    };
    s.followLog(log, next);
    const after = captureState(s);
    const expected = cloneState(before);
    applyPatch(expected, r.patch, !redo);
    if (stateHash(expected) !== stateHash(after)) {
      revert();
      return { ok: false, reason: `${nameOf(r)} cannot be ${redo ? "brought back" : "taken back"} without changing ground other edits are on` };
    }
    const effect: TransactionRecord = {
      seq: entry.seq,
      epoch: entry.epoch,
      author: entry.author,
      label: `${redo ? "Redo" : "Undo"} ${nameOf(r)}`,
      where: r.where,
      patch: redo ? structuredClone(r.patch) : invertPatch(r.patch),
      writes: r.writes.clone(),
      touch: r.writes.clone(),
      keys: [...r.keys],
      changed: r.changed,
      ops: [],
      undoes: { target, redo },
    };
    const blocked = opts.check?.(effect) ?? null;
    if (blocked) {
      revert();
      return { ok: false, reason: blocked };
    }
    records.setUndone(r, redo ? undefined : entry.seq);
    this.water.invalidate();
    this.seen = { built: s.built, state: after };
    return { ok: true, record: effect, hash: stateHash(after), state: after, needsWater: false, effect: { target, redo } };
  }
}
