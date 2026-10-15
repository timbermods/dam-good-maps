// What two players' sessions say to each other besides the ordered log's own messages (types.ts): joining,
// claims ordered through the host, desync reports, leaving and presence. Plain JSON, versioned, and every
// message checked on arrival with one plain line of reason (D342: never clamp, never guess). The shapes are in
// session.schema.json; the ordered log's messages (request, commit, reject, settled, map-opening) are
// collab.schema.json's and are checked by `messageProblem`.

import type { ClaimsSnapshot, ClaimCommand, Role } from "./claims";
import { checkSchema } from "../spec/schema";
import type { Reject, Request, Commit, MapOpening, Settled, SnapshotHeader } from "./types";
import { messageProblem } from "./validate";
import schema from "./session.schema.json" with { type: "json" };

/** The session protocol's number. A hello or welcome with another is refused as incompatible. */
export const SESSION_VERSION = 1;

/** The two players' ids in the log: the player who hosts, and the one who joined (stable for a session, across rejoins). */
export const HOST_ID = "host";
export const GUEST_ID = "guest";
export const idOf = (role: Role): string => (role === "host" ? HOST_ID : GUEST_ID);
export const roleOfId = (id: string): Role => (id === HOST_ID ? "host" : "guest");

/** The colours the session gives the players (outlines, cursors, strokes): decided here, not sent. */
export const PLAYER_COLOURS: Record<Role, string> = { host: "#e8833a", guest: "#3a8fe8" };

/** At most this many presence packets a second leave a player; the latest wins. */
export const PRESENCE_HZ = 15;
/** A stroke packet carries at most this many points (two numbers each); the receiver keeps the last `MAX_STROKE_POINTS`. */
export const MAX_PACKET_POINTS = 72;
export const MAX_STROKE_POINTS = 4096;
/** The longest display name. */
export const MAX_DISPLAY_NAME = 40;

export interface Hello {
  kind: "hello";
  v: number;
  name: string;
}
export interface Welcome {
  kind: "welcome";
  v: number;
  sessionId: string;
  hostName: string;
  guestName: string;
  /** The map's snapshot header; its project bytes are the next message. */
  snapshot: SnapshotHeader;
  claims: ClaimsSnapshot;
  /** How the host answered the guest's last requests (a seq, or 0 and why not), for a rejoining guest whose answer was lost. */
  answered?: { counter: number; seq: number; reason?: string }[];
}
export interface Ready {
  kind: "ready";
  seq: number;
  hash: string;
}
export interface ClaimAsk {
  kind: "claim";
  id: number;
  command: ClaimCommand;
}
export interface ClaimsApplied {
  kind: "claims";
  by: Role;
  id?: number;
  command: ClaimCommand;
  revision: number;
}
export interface ClaimRefused {
  kind: "claim-reject";
  id: number;
  reason: string;
}
export interface Desync {
  kind: "desync";
  reason: string;
  seq: number;
}
export interface Resync {
  kind: "resync";
}
export interface Bye {
  kind: "bye";
}

/** The camera: its target, its distance and its angles. */
export interface View {
  x: number;
  y: number;
  z: number;
  dist: number;
  yaw: number;
  pitch: number;
}

/** A stroke being drawn, before release: points since the last packet (quarter-tile x, y pairs, flat). */
export interface StrokePacket {
  id: number;
  part: number;
  pts: number[];
  end?: boolean;
}

export interface Presence {
  kind: "presence";
  n: number;
  /** Quarter-tile x, y; null hides it. */
  cursor?: [number, number] | null;
  tool?: string | null;
  view?: View | null;
  stroke?: StrokePacket | null;
}

export type SessionMessage = Hello | Welcome | Ready | ClaimAsk | ClaimsApplied | ClaimRefused | Desync | Resync | Bye | Presence;
export type LogMessage = Request | Commit | Reject | MapOpening | Settled;
export type Wire = SessionMessage | LogMessage;

const OWN: Record<string, string> = {
  hello: "hello",
  welcome: "welcome",
  ready: "ready",
  claim: "claim",
  claims: "claims",
  "claim-reject": "claimReject",
  desync: "desync",
  resync: "resync",
  bye: "bye",
  presence: "presence",
};

const DEFS = (schema as { $defs: unknown }).$defs;

function problemOf(def: string, value: unknown, what: string): string | null {
  const errors = checkSchema({ $defs: DEFS, $ref: `#/$defs/${def}` } as Record<string, unknown>, value);
  if (!errors.length) return null;
  const e = errors[0];
  return `${what} is not valid: ${e.path ? `${e.path.slice(1).replace(/\//g, " > ")} ` : ""}${e.message}`;
}

/** Why a message that arrived is not one the session takes (one line), or null. The ordered log's messages are
 *  checked the way the log checks them. A `snapshot` header travels inside a welcome, never alone. */
export function wireProblem(value: unknown): string | null {
  const kind = typeof value === "object" && value !== null ? (value as { kind?: unknown }).kind : undefined;
  if (typeof kind !== "string") return "The message is not one the session knows";
  const own = OWN[kind];
  if (!own) return kind === "snapshot" || kind === "entry" ? "That message does not travel alone" : messageProblem(value);
  const bad = problemOf(own, value, `The ${kind} message`);
  if (bad) return bad;
  const m = value as Record<string, unknown>;
  if (kind === "welcome") return (m.snapshot as { kind?: string }).kind === "snapshot" ? messageProblem(m.snapshot) : "The welcome has no snapshot";
  if (kind === "presence") {
    const s = (m as unknown as Presence).stroke;
    if (s && (s.pts.length % 2 !== 0 || s.pts.length > MAX_PACKET_POINTS * 2)) return `A stroke packet holds at most ${MAX_PACKET_POINTS} points`;
  }
  return null;
}

/** A message to the connection: text, or (for a project) bytes. */
export type Payload = string | Uint8Array;

export const encode = (m: Wire): string => JSON.stringify(m);

/** The JSON a payload holds, or why it is not. */
export function decode(payload: string): { ok: true; message: Wire } | { ok: false; reason: string } {
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    return { ok: false, reason: "The message is not readable" };
  }
  const problem = wireProblem(value);
  return problem ? { ok: false, reason: problem } : { ok: true, message: value as Wire };
}

/** The line a hello or welcome of another version gets. */
export const incompatible = (v: number): string | null =>
  v === SESSION_VERSION ? null : v > SESSION_VERSION ? "The other player has a newer version of Dam Good Maps. Reload the page to update." : "The other player has an older version of Dam Good Maps. They need to reload the page to update.";
