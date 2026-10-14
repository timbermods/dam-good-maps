// One command applied to a peer's map as one atomic step, with its record: the literal patch (before
// and after values), what it wrote (W) and what it touched (T). The host and every replica run the
// same code on the same ordered entries, so they hold the same records as well as the same map.

import type { EditOp } from "../doc/ops";
import type { MapSession } from "../doc/session";
import { applySelection } from "../doc/start";
import { newRampedStroke } from "../doc/strokes";
import { applyForce } from "./forceStep";
import { captureState, patchIsEmpty, stateHash, type MapState, type Patch } from "./mapState";
import { Mask } from "./mask";
import { touchesOf } from "./touches";
import type { Command, LogEntry, PlayerId } from "./types";

/** What an applied entry left behind: the record undo with two players is built on. */
export interface TransactionRecord {
  seq: number;
  epoch: number;
  author: PlayerId;
  label: string;
  /** The literal before and after values of everything the step changed. */
  patch: Patch;
  /** Tiles directly written. */
  writes: Mask;
  /** Tiles touched: written, read or reached (the whole map for a force). */
  touch: Mask;
  /** Identity keys: "entity:<id>", "lakes", "feature-order", "action:<seq>". */
  keys: string[];
  /** Whether the step changed anything at all (a stroke that found nothing to change still touched the ground). */
  changed: boolean;
}

export type Applied = { ok: true; record: TransactionRecord; hash: string; state: MapState } | { ok: false; reason: string };

/** The JSON form of a record (masks as runs of tile indices). */
export interface RecordJson extends Omit<TransactionRecord, "writes" | "touch"> {
  writes: [number, number][];
  touch: [number, number][];
}

export const recordToJson = (r: TransactionRecord): RecordJson => ({ ...r, writes: r.writes.toRuns(), touch: r.touch.toRuns() });
export const recordFromJson = (N: number, j: RecordJson): TransactionRecord => ({ ...j, writes: Mask.fromRuns(N, j.writes), touch: Mask.fromRuns(N, j.touch) });

const plainOps = (s: MapSession): EditOp[] => s.lastStepOps().map((o) => ({ op: o.op, params: o.params }) as EditOp);

/** Applies commands to one session, keeping the map's last captured state so a record needs one capture per step.
 *
 *  A record is taken on the settled map: the objects the map keeps (which resources stand, which are dead) follow
 *  from the settled water, so the water settles after every step, here, on every peer, before the map is captured
 *  or hashed. That is a barrier, and it costs one canonical settle per entry (INTEGRATION.md measured the
 *  from-scratch settle at 256² near 9 s; the live water's animation stays local and is not part of it). */
export class MapApplier {
  private seen: { built: object; state: MapState } | null = null;

  constructor(readonly session: MapSession) {}

  /** The map as it stands, its water settled. */
  state(): MapState {
    if (this.session.waterPending) this.session.settleCanonical();
    const built = this.session.built;
    if (!this.seen || this.seen.built !== built) this.seen = { built, state: captureState(this.session) };
    return this.seen.state;
  }

  /** The hash of the map as it stands. */
  hash(): string {
    return stateHash(this.state());
  }

  /** Apply `command` as `entry` (its place in the log and its author); the session is unchanged when it is refused. */
  apply(entry: Pick<LogEntry, "seq" | "epoch" | "author" | "command">): Applied {
    const s = this.session;
    const command: Command = entry.command;
    const before = this.state();
    let label: string;
    switch (command.kind) {
      case "edit":
      case "select": {
        label = command.label;
        for (const op of command.ops) {
          const refused = newRampedStroke(op);
          if (refused) return { ok: false, reason: refused };
        }
        const r =
          command.kind === "select"
            ? applySelection(s, command.ops, command.label, command.tiles)
            : command.ops.length === 1
              ? s.apply(command.ops[0], "user", command.label)
              : s.applyAll(command.ops, "user", command.label);
        if (!r.ok) return { ok: false, reason: r.errors[0] ?? "The edit could not be applied" };
        break;
      }
      case "force": {
        label = command.gesture.request.verb;
        const r = applyForce(s, command.gesture);
        if (!r.ok) return { ok: false, reason: r.reason };
        break;
      }
      case "newMap":
        return { ok: false, reason: "A whole-map change is the host's, and arrives as a new map" };
    }
    if (s.waterPending) s.settleCanonical();
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
    };
    return { ok: true, record, hash: stateHash(after), state: after };
  }
}
