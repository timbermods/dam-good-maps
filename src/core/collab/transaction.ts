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
import { captureState, patchIsEmpty, stateHash, type MapState, type Patch } from "./mapState";
import { Mask } from "./mask";
import { touchesOf } from "./touches";
import type { Command, LogEntry, PlayerId } from "./types";
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
  /** Whether the step changed anything the players made directly (a stroke that found nothing to change still touched the ground). */
  changed: boolean;
  /** The step's operations as the document keeps them, with their undo data: an undo can turn the record into
   *  operations (D342). The first and last operation numbers are `ops[0].seq` and `ops.at(-1).seq`. Feature
   *  state (features and their order) is in these undo data (`before`, `index`), not in the patch. */
  ops: AppliedOp[];
}

export type Applied =
  | { ok: true; record: TransactionRecord; hash: string; state: MapState; applied?: EditOp[] }
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

/** Whether the host needs the water settled to apply a command. */
export function hostNeedsWater(c: Command): boolean {
  return c.kind === "force" || c.kind === "select" || (c.kind === "edit" && c.ops.some(readsWaterOp));
}

/** Whether a replica needs the water settled to apply an entry: a force plans on it; Remove unfed water and Fill
 *  are checked against it; a weathering stroke reads it. Every other entry is applied from its literal operations. */
function replicaNeedsWater(e: Pick<LogEntry, "command" | "applied">): boolean {
  if (e.command.kind === "force" || e.command.kind === "select") return true;
  return (e.applied ?? []).some((o) => o.op === "removeUnfedWater" || o.op === "fillHollow" || weathering(o));
}

export interface ApplyOptions {
  /** `host`: refuse as busy until the water has settled when the command needs it. `replica`: settle first, apply the host's literal operations. */
  role: "host" | "replica";
  /** The host's last look, after the step is applied and its record made: a reason takes the step back (the claims seam). */
  check?: (record: TransactionRecord) => string | null;
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

  apply(entry: Pick<LogEntry, "seq" | "epoch" | "author" | "command" | "applied">, opts: ApplyOptions): Applied {
    const s = this.session;
    const command: Command = entry.command;
    const host = opts.role === "host";
    if (command.kind === "newMap") return { ok: false, reason: "A whole-map change is the host's, and arrives as a new map" };
    if (host ? hostNeedsWater(command) : replicaNeedsWater(entry)) {
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
    return { ok: true, record, hash: stateHash(after), state: after, ...(applied ? { applied } : {}) };
  }
}
