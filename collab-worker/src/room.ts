// The room's rules, as plain functions over plain data: no Cloudflare types, so the tests
// (tests/unit/collabRoom.test.ts) run them in Node. The Durable Object (roomObject.ts) only
// stores the record and moves sockets around; every decision is made here.

/** No 0/O/1/I/L: nothing a player reads aloud or types can be mistaken for something else. */
export const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const CODE_LENGTH = 6;

export const LIMITS = {
  /** How long a code can be used to join (single use inside this time). */
  codeTtlMs: 5 * 60_000,
  /** Once the guest has joined, the pair gets at least this long to finish connecting. */
  setupMs: 2 * 60_000,
  /** One setup message (an offer, an answer or a candidate) is at most this many bytes. */
  maxMessageBytes: 16 * 1024,
  /** A whole room passes at most this many setup messages (an offer, an answer and a few dozen candidates). */
  maxSignalMessages: 120,
  /** TURN credentials are handed out at most this often per room. */
  maxIceFetches: 6,
  /** At most this many sockets (two players, plus a replaced one in flight) per room. */
  maxSockets: 4,
  /** Per address: rooms made and join tries, per minute. */
  roomsPerMinute: 6,
  joinsPerMinute: 30,
} as const;

export type Role = "host" | "guest";

export type RoomErrorKind =
  | "not-found"
  | "expired"
  | "taken"
  | "unauthorized"
  | "rate-limited"
  | "too-large"
  | "too-many"
  | "relay-unavailable"
  | "bad-request"
  | "forbidden-origin";

export interface RoomError {
  kind: RoomErrorKind;
  message: string;
}

/** HTTP status for each kind of error. */
export const ERROR_STATUS: Record<RoomErrorKind, number> = {
  "not-found": 404,
  expired: 410,
  taken: 409,
  unauthorized: 401,
  "rate-limited": 429,
  "too-large": 413,
  "too-many": 429,
  "relay-unavailable": 503,
  "bad-request": 400,
  "forbidden-origin": 403,
};

/** What a player is told for a code that isn't any room's (never made, spent, run out, or mistyped). */
export const NOT_FOUND_MESSAGE = "That code isn't right, or it has already been used or run out.";

export const err = (kind: RoomErrorKind, message: string): { ok: false; error: RoomError } => ({ ok: false, error: { kind, message } });

export type Result<T> = ({ ok: true } & T) | { ok: false; error: RoomError };

/** Everything the function keeps about a room. No addresses, no setup content, no map data. */
export interface RoomRecord {
  v: 1;
  code: string;
  createdAt: number;
  expiresAt: number;
  /** SHA-256 of the secrets, never the secrets. */
  hostHash: string;
  guestHash: string | null;
  joinedAt: number | null;
  connected: { host: boolean; guest: boolean };
  signalCount: number;
  iceFetches: number;
}

// ---- codes and secrets ----

/** `random(n)` returns n random bytes. */
export type RandomBytes = (n: number) => Uint8Array;

export const cryptoRandom: RandomBytes = (n) => crypto.getRandomValues(new Uint8Array(n));

export function newCode(random: RandomBytes = cryptoRandom): string {
  let code = "";
  // 248 = 31 * 8: bytes at or above it are skipped, so every letter is equally likely
  while (code.length < CODE_LENGTH) {
    for (const b of random(CODE_LENGTH * 2)) {
      if (b < 248 && code.length < CODE_LENGTH) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
    }
  }
  return code;
}

/** What a player typed or pasted, as a code: case, spaces and dashes are forgiven; anything else is not a code. */
export function normalizeCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== CODE_LENGTH) return null;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return null;
  return code;
}

export function newSecret(random: RandomBytes = cryptoRandom): string {
  const bytes = random(18);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_");
}

export async function hashSecret(secret: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ---- the room ----

export function createRoom(now: number, code: string, hostHash: string): RoomRecord {
  return {
    v: 1,
    code,
    createdAt: now,
    expiresAt: now + LIMITS.codeTtlMs,
    hostHash,
    guestHash: null,
    joinedAt: null,
    connected: { host: false, guest: false },
    signalCount: 0,
    iceFetches: 0,
  };
}

export const isExpired = (room: RoomRecord, now: number): boolean => now >= room.expiresAt;

/** The guest uses the code: it is spent, whatever happens next. */
export function joinRoom(room: RoomRecord | null, now: number, guestHash: string): Result<{ room: RoomRecord }> {
  if (!room) return err("not-found", NOT_FOUND_MESSAGE);
  if (isExpired(room, now)) return err("expired", "That code has run out. Ask for a new one.");
  if (room.guestHash !== null) return err("taken", "That code has already been used. Ask for a new one.");
  return { ok: true, room: { ...room, guestHash, joinedAt: now, expiresAt: Math.max(room.expiresAt, now + LIMITS.setupMs) } };
}

/** Which role this secret opens, if any. */
export function roleOf(room: RoomRecord, now: number, secretHash: string): Result<{ role: Role }> {
  if (isExpired(room, now)) return err("expired", "This room has run out.");
  if (sameHash(secretHash, room.hostHash)) return { ok: true, role: "host" };
  if (room.guestHash !== null && sameHash(secretHash, room.guestHash)) return { ok: true, role: "guest" };
  return err("unauthorized", "That room's key isn't right.");
}

/** A setup message is about to pass through: counts it, or refuses it. */
export function noteSignal(room: RoomRecord, bytes: number): Result<{ room: RoomRecord }> {
  if (bytes > LIMITS.maxMessageBytes) return err("too-large", "That setup message is too large.");
  if (room.signalCount >= LIMITS.maxSignalMessages) return err("too-many", "Too many setup messages for one room.");
  return { ok: true, room: { ...room, signalCount: room.signalCount + 1 } };
}

/** Relay credentials are about to be handed out. */
export function noteIceFetch(room: RoomRecord): Result<{ room: RoomRecord }> {
  if (room.iceFetches >= LIMITS.maxIceFetches) return err("too-many", "The relay credentials were already handed out for this room.");
  return { ok: true, room: { ...room, iceFetches: room.iceFetches + 1 } };
}

/** A player reports the connection is up; when both have, the room's work is done and everything is deleted. */
export function markConnected(room: RoomRecord, role: Role): { room: RoomRecord; done: boolean } {
  const connected = { ...room.connected, [role]: true };
  return { room: { ...room, connected }, done: connected.host && connected.guest };
}

// ---- limits per address ----

/** Counts events per key inside a sliding window. Best effort: it lives in one object's memory. */
export class SlidingWindow {
  private hits = new Map<string, number[]>();
  constructor(
    readonly limit: number,
    readonly windowMs: number,
  ) {}
  /** True if this event is allowed (and counted). */
  allow(key: string, now: number): boolean {
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}

// ---- who may call from a browser ----

export interface OriginConfig {
  /** Comma-separated list of exact origins. */
  allowed: string;
  /** Also accept localhost, 127.0.0.1 and [::1] on any port (local development). */
  allowLocal: boolean;
}

/** A request with no Origin (not from a page) passes: CORS keeps pages out, it is not a key. */
export function originAllowed(origin: string | null, cfg: OriginConfig): boolean {
  if (origin === null) return true;
  if (cfg.allowed.split(",").map((s) => s.trim()).filter(Boolean).includes(origin)) return true;
  return cfg.allowLocal && /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
}
