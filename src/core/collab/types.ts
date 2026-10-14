// The collaboration protocol's data (docs/COLLAB-BRIEF.md, D362, D486): what a player proposes, what
// the host orders and what everyone applies. Plain JSON; collab.schema.json describes the same shapes.

import type { EditOp } from "../doc/ops";
import type { ForceRequest } from "../forces/start";

export type PlayerId = string;

/** A force as it travels: the page's request with its seed, and the ids it needs that no run can
 *  derive (a Carve's source). Each peer computes the result on the agreed map; no heights cross. */
export interface ForceGesture {
  id: string;
  /** A Carve's river source (a lowercase GUID); absent for the other forces. */
  sourceId?: string;
  request: ForceRequest;
}

export type Command =
  /** Operations applied as one step: a brush stroke, a placement, a group. */
  | { kind: "edit"; ops: EditOp[]; label: string }
  /** A Select action: one step with the start carried when its ground broke (doc/start.ts `applySelection`); `tiles` are the tiles it changed. */
  | { kind: "select"; ops: EditOp[]; label: string; tiles: number[] }
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
  /** The hash of the map after the tail. */
  endHash: string;
  /** Each player's request counter, so a rejoining player carries on. */
  counters: Record<PlayerId, number>;
}

export type SnapshotHeader = { kind: "snapshot" } & Omit<Snapshot, "project">;

export type Message = LogEntry | Request | Commit | Reject | MapOpening | SnapshotHeader;
