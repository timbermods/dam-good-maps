// Collaborative editing's core (docs/COLLAB-BRIEF.md, D362, D486): the host-ordered log and the
// replicas that rebuild the map from it. Headless; the transport, claims, undo with two players and
// the page come in later pieces (README.md).

export { CollabHost, CHECKPOINT_EVERY, type EntryCheck, type HostOptions, type HostView } from "./host";
export { CollabReplica, snapshotProblem, type Received, type ReplicaEvents, type ReplicaStatus } from "./replica";
export { MapApplier, recordFromJson, recordToJson, type Applied, type RecordJson, type TransactionRecord } from "./transaction";
export { RecordLog, RECORD_LIMIT } from "./records";
export { applyPatch, captureState, cloneState, difference, patchIsEmpty, stable, stateHash, type MapState, type Patch } from "./mapState";
export { Mask } from "./mask";
export { touchesOf, type Touches } from "./touches";
export { applyForce, forceMapOfSession } from "./forceStep";
export { commandProblem, messageProblem } from "./validate";
export type { Command, Commit, ForceGesture, LogEntry, MapOpening, Message, PlayerId, Reject, Request, Snapshot, SnapshotHeader } from "./types";
