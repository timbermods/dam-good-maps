// The collaboration protocol's data (docs/COLLAB-BRIEF.md, D362, D486): what a player proposes, what
// the host orders and what everyone applies. Plain JSON; collab.schema.json describes the same shapes.

import type { EditOp } from "../doc/ops";
import type { ForceRequest } from "../forces/start";
import type { RecordJson } from "./transaction";

export type PlayerId = string;

/** A force as it travels: the page's request with its seed, and the ids it needs that no run can
 *  derive (a Carve's source). Each peer computes the result on the agreed map; no heights cross. */
export interface ForceGesture {
  id: string;
  /** The hash of the operation the author's preview showed (`forceHash`). The host plans the force on its map and
   *  refuses it if its operation differs: the map changed under the force. Absent, a force is refused when any
   *  entry since the sequence it was planned at changed the map. */
  preview?: string;
  /** A Carve's river source (a lowercase GUID); absent for the other forces. */
  sourceId?: string;
  request: ForceRequest;
}

export type Command =
  /** Operations applied as one step: a brush stroke, a placement, a group. */
  | { kind: "edit"; ops: EditOp[]; label: string }
  /** A Select action: one step with the start carried when its ground broke (doc/start.ts `applySelection`; the host works out the tiles it changed). */
  | { kind: "select"; ops: EditOp[]; label: string }
  | { kind: "force"; gesture: ForceGesture }
  /** Generate, a real place or another map: the host's alone. The map itself travels as a snapshot. */
  | { kind: "newMap"; name: string };

export interface LogEntry {
  kind: "entry";
  /** The host's number for it: 1, 2, 3 ... within its map. */
  seq: number;
  /** Which map the entry belongs to (a whole-map change starts the next). */
  epoch: number;
  author: PlayerId;
  /** The sequence the author's view was at when they made it. */
  baseSeq: number;
  /** The author's request counter (their requests count 1, 2, 3 ...; a refused one uses its number too). */
  counter: number;
  command: Command;
  /** The operations every peer applies for an edit: the ones the host applied, literally, so none re-derives a
   *  placement or a riding source from its own water (a placement stroke is its placed objects). A weathering
   *  Naturalize stroke is the stroke as sent: its rim, shore and kept ground are worked out on the settled map.
   *  Absent for a force and a Select action, which every peer plans on the settled map. */
  applied?: EditOp[];
}

export interface Request {
  kind: "request";
  epoch: number;
  counter: number;
  baseSeq: number;
  command: Command;
}

export interface Commit {
  kind: "commit";
  entry: LogEntry;
  /** The map after the entry (state-hash of the ground, objects and kept water). */
  hash: string;
}

export interface Reject {
  kind: "reject";
  counter: number;
  reason: string;
  /** The refusal is only that the water is still settling: ask again in a moment. */
  busy?: boolean;
}

/** The host to everyone: the water has settled for the map as it stands after entry `seq`, and it hashes to `hash`
 *  (everything: the objects the water decides, the water, the contamination). The entries after `since` are the
 *  batch that settled together. A peer compares its own settle at that sequence. */
export interface Settled {
  kind: "settled";
  epoch: number;
  seq: number;
  since: number;
  hash: string;
}

export interface MapOpening {
  kind: "map-opening";
  author: PlayerId;
  name: string;
}

/** A rejoin: the host's map at a checkpoint and the entries since (never the whole history). */
export interface Snapshot {
  epoch: number;
  /** The sequence the project was saved at. */
  checkpointSeq: number;
  /** The project bytes the app saves (`MapSession.project`). */
  project: Uint8Array;
  /** The entries after the checkpoint, in order. */
  tail: LogEntry[];
  /** The hash of what the players made directly (`stateHash`) after the tail. */
  endHash: string;
  /** The records of the entries up to the checkpoint (each player's last 50), so a rejoined peer holds what the host does. */
  records: RecordJson[];
  /** Each player's request counter, so a rejoining player carries on. */
  counters: Record<PlayerId, number>;
}

export type SnapshotHeader = { kind: "snapshot" } & Omit<Snapshot, "project">;

export type Message = LogEntry | Request | Commit | Reject | MapOpening | Settled | SnapshotHeader;
