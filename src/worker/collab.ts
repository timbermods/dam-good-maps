// Collaborative editing's side in the worker (docs/COLLAB-BRIEF.md, D362, D431, D486): the host or the replica lives beside the
// editor's open map (`session.ts`), because the map lives here; the connection (RTCPeerConnection) lives on the main thread
// (`src/collab/`). The two talk through this module: the page's client forwards the transport's messages in (`receive`) and
// sends what comes out (`send` events). All the logic is the core's `CollabPeer` (D342); this only binds it to the worker's map,
// paces the water's background settle between messages, and hands the page what changed.
//
// While a session is live, the page orders every edit through `submit` (and Undo/Redo through `undo`/`redo`) instead of
// applying it to the map itself; the answer is the map changing, as an `update` event, once the host has ordered it.

import { transfer } from "comlink";
import { CollabPeer, type ClaimCommand, type Command, type ForceGesture, type PeerEvent, type Role } from "../core/collab";
import type { EditOp } from "../core/doc/ops";
import { viewBuffers } from "../render3d/model";
import * as ed from "./session";

/** Everything the worker tells the page about collaboration, in order. */
export type CollabWorkerEvent =
  | PeerEvent
  /** Send this to the other player (the transport's ordered channel). */
  | { type: "send"; payload: string | Uint8Array }
  /** The map changed (an entry applied, the water settled): the page takes the update like an edit's answer. */
  | { type: "update"; update: ed.SessionUpdate }
  /** A whole other map is open (a guest's copy of the host's map, or the host's after a rejoin): the page takes it as it takes an opened map. */
  | { type: "open"; open: ed.SessionOpen };

/** How long one slice of the background settle runs before the worker lets messages through again. */
const SLICE_MS = 12;
/** Ticks of the water's clock a slice asks for at a time. */
const SLICE_TICKS = 20;

let peer: CollabPeer | null = null;
let listener: ((e: CollabWorkerEvent) => void) | null = null;
let pumpTimer: ReturnType<typeof setTimeout> | null = null;
let updateQueued = false;

function buffersOf(e: CollabWorkerEvent): Transferable[] {
  switch (e.type) {
    case "send":
      return typeof e.payload === "string" ? [] : [e.payload.buffer as ArrayBuffer];
    case "keep":
      return [e.project.buffer as ArrayBuffer];
    case "update":
      return viewBuffers(e.update.view) as Transferable[];
    case "open":
      return viewBuffers({ ...e.open.view, terrain: e.open.terrain }) as Transferable[];
    default:
      return [];
  }
}

function emit(e: CollabWorkerEvent): void {
  listener?.(transfer(e, buffersOf(e)));
}

/** The page hears about the map's change once, however many entries came in the same turn. */
function changed(): void {
  if (updateQueued) return;
  updateQueued = true;
  setTimeout(() => {
    updateQueued = false;
    if (peer && ed.hasSession()) emit({ type: "update", update: ed.collabChanged() });
  }, 0);
}

function pace(): void {
  const p = peer;
  if (!p) return;
  if (p.settling && !pumpTimer) {
    pumpTimer = setTimeout(() => {
      pumpTimer = null;
      const t0 = performance.now();
      while (peer && performance.now() - t0 < SLICE_MS) if (peer.pump(SLICE_TICKS)) break;
      pace();
    }, 0);
  }
}

function need(): CollabPeer {
  if (!peer) throw new Error("no collaboration session is open");
  return peer;
}

/** What the page calls through the worker's Comlink API (`api.collab`). */
export const collabApi = {
  /** Where the worker sends collaboration news (a Comlink proxy), or nowhere (null). */
  listen(fn: ((e: CollabWorkerEvent) => void) | null): void {
    listener = fn;
  },

  /** Start (or restart) this player's side. The host's session is the open map: its water is settled first (a few seconds on a
   *  big map) so the first checkpoint is the map a guest sees. A rejoining host passes the same session id; a guest passes the
   *  one it had, or null. Returns the session id, or why it can't start. */
  begin(role: Role, name: string, sessionId: string | null): { ok: true; sessionId: string | null } | { ok: false; reason: string } {
    if (role === "host" && !ed.collabSession()) return { ok: false, reason: "Open a map first" };
    stop();
    peer = new CollabPeer({
      role,
      name,
      sessionId: sessionId ?? (role === "host" ? crypto.randomUUID() : null),
      port: {
        session: () => ed.collabSession(),
        adopt: (s) => emit({ type: "open", open: ed.collabOpen(s) }),
        changed,
      },
      events: (e) => emit(e),
    });
    // (a direct edit of the map would diverge from the host's log: the session says when the map is read-only or edited only through it)
    ed.collabGate((wholeMap) => peer?.editBlocked(wholeMap) ?? null);
    if (role === "host") peer.startHosting();
    return { ok: true, sessionId: peer.sessionId };
  },

  /** The connection is up (the transport's `connected`). */
  attach(): void {
    need().attach({
      send: (payload) => emit({ type: "send", payload }),
      // (presence runs on the page's thread beside the transport, src/collab/client.ts: nothing of it comes through here)
      sendPresence: () => undefined,
    });
    pace();
  },

  /** The connection is gone: the session pauses. */
  detach(reason: string): void {
    peer?.detach(reason);
  },

  /** A message from the other player (the transport's ordered channel). Returns one line when it could not be used. */
  receive(payload: string | Uint8Array): string | null {
    const line = need().receive(payload);
    pace();
    return line;
  },

  async submit(command: Command) {
    const r = need().submit(command);
    pace();
    return r;
  },

  async undo() {
    const r = need().undo();
    pace();
    return r;
  },

  async redo() {
    const r = need().redo();
    pace();
    return r;
  },

  /** What Undo (or Redo) would do now. */
  plan: (redo = false) => need().plan(redo),

  async claim(command: ClaimCommand) {
    return need().claim(command);
  },

  claimsView: () => need().claimsView(),

  /** The line for an edit about to be released that would reach into the other player's area, or null (shown before release). */
  reachRefusal: (ops: EditOp[]) => need().reachRefusal(ops),

  /** The tiles of the other player's area the edit's quick band reaches (drawn in their colour while the stroke is drawn). */
  reachBand: (ops: EditOp[]) => need().reachBand(ops),

  previewForce: (gesture: ForceGesture) => need().previewForce(gesture),

  /** The host: tell the guest a new map is coming (before it is generated or loaded). */
  announceNewMap: (name: string) => need().announceNewMap(name),

  /** The host: the new map will not be opened after all; the guest carries on with the map as it is. */
  cancelNewMap: () => need().cancelNewMap(),

  /** The host: another map is open in the editor now; the guest is sent it and the old one is kept. */
  newMap(name: string): void {
    need().newMap(name);
    pace();
  },

  /** The guest: ask the host for the map again after a desync. */
  resync: () => need().resync(),

  /** The session's map as a project, to save a copy while paused. */
  project: () => {
    const bytes = peer?.project() ?? null;
    return bytes ? transfer(bytes, [bytes.buffer as ArrayBuffer]) : null;
  },

  /** Leave on purpose: the other player is told, and the session is kept as a project (a `keep` event). */
  leave(): void {
    peer?.leave();
    stop();
  },

  state: () => (peer ? { state: peer.state, role: peer.role, name: peer.name, otherName: peer.otherName, sessionId: peer.sessionId, seq: peer.seq, hash: peer.hash() } : null),
};

function stop(): void {
  if (pumpTimer) clearTimeout(pumpTimer);
  pumpTimer = null;
  peer = null;
  ed.collabGate(null);
}

export type CollabApi = typeof collabApi;
