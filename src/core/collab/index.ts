// Collaborative editing's core (docs/COLLAB-BRIEF.md, D362, D486): the host-ordered log and the
// replicas that rebuild the map from it. Headless; the transport, claims, undo with two players and
// the page come in later pieces (README.md).

export { CollabHost, CHECKPOINT_EVERY, type EntryCheck, type HostOptions, type HostView } from "./host";
export { CollabReplica, snapshotProblem, type Received, type ReplicaEvents, type ReplicaStatus } from "./replica";
export { BUSY, hostNeedsWater, MapApplier, recordFromJson, recordToJson, type Applied, type RecordJson, type TransactionRecord } from "./transaction";
export { builtOn, nameOf, RecordLog, RECORD_LIMIT, type Block, type FencesJson, type Who } from "./records";
export { blockLine, historyProblem, redoPlan, undoPlan, type HistoryPlan, type Names, type Skipped } from "./undo";
export { placeWords } from "./place";
export { applyPatch, captureState, cloneState, difference, invertPatch, patchIsEmpty, stable, stateHash, type MapState, type Patch } from "./mapState";
export { Mask } from "./mask";
export { touchesOf, type Touches } from "./touches";
export { applyForce, forceBasis, forceHash, forceMapOfSession, keepForce, planKeptForce, STALE, type PlannedForce } from "./forceStep";
export { settledHash, WaterBarrier } from "./water";
export { commandProblem, messageProblem } from "./validate";
export type { Command, Commit, ForceGesture, LogEntry, MapOpening, Message, PlayerId, Reject, Request, Settled, Snapshot, SnapshotHeader } from "./types";
