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
  maxIceFetches: 3,
  /** At most this many sockets (two players, plus a replaced one in flight) per room. */
  maxSockets: 4,
  /** Per address: rooms made and join tries, per minute. */
  roomsPerMinute: 6,
  joinsPerMinute: 30,
  /** Relay logins asked for (by room key or session token) and sockets opened, per minute per address. */
  icePerMinute: 20,
  socketsPerMinute: 30,
  /** Relay logins handed out in a day, all addresses together (the bill's ceiling); the Worker's MAX_DAILY_MINTS overrides it. */
  dailyMints: 3000,
  /** ... and from one address (an IPv6 /64) in a day: a household needs a handful, an abuser should not reach the day's total. */
  mintsPerAddressPerDay: 60,
  /** A session token can fetch this many fresh relay logins (a 24-hour session renews about every 2 hours). */
  tokenRenewals: 12,
  /** A session token (to refresh the relay's login during a long session) lasts this long. */
  tokenTtlMs: 24 * 60 * 60_000,
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
  | "not-ready"
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
  "not-ready": 409,
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

/** Relay credentials are about to be handed out: only once the guest has joined, and only a few times per room. */
export function noteIceFetch(room: RoomRecord): Result<{ room: RoomRecord }> {
  if (room.guestHash === null) return err("not-ready", "The other player hasn't joined yet.");
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

/**
 * Pages must come from the site (or, in local development, localhost). A request with no Origin is not from a page:
 * CORS would not keep it out anyway, but it cannot get relay logins from the deployed function (only local development,
 * where tests and tools call it directly, accepts it).
 */
export function originAllowed(origin: string | null, cfg: OriginConfig): boolean {
  if (origin === null) return cfg.allowLocal;
  if (cfg.allowed.split(",").map((s) => s.trim()).filter(Boolean).includes(origin)) return true;
  return cfg.allowLocal && /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
}

// ---- the setup messages: offer, answer and relayed candidates, nothing else ----

/** A candidate line (the text after "candidate:" or a whole `a=candidate:` line): relayed, and with no address of the sender's. */
export function relayedCandidate(line: string): boolean {
  if (!/ typ relay(?: |$)/.test(line)) return false;
  const raddr = / raddr (\S+)/.exec(line);
  return !raddr || raddr[1] === "0.0.0.0" || raddr[1] === "::";
}

export type SignalKind = "offer" | "answer" | "cand";

/** What may pass between the two players. Anything else, and any candidate that is not relayed, is refused. */
export function checkSignal(data: string): Result<{ kind: SignalKind }> {
  let v: { k?: unknown; sdp?: unknown; c?: unknown };
  try {
    v = JSON.parse(data) as typeof v;
  } catch {
    return err("bad-request", "Not a valid setup message.");
  }
  if (!v || typeof v !== "object") return err("bad-request", "Not a valid setup message.");
  if (v.k === "offer" || v.k === "answer") {
    if (typeof v.sdp !== "string") return err("bad-request", "Not a valid setup message.");
    for (const line of v.sdp.split(/\r?\n/)) if (line.startsWith("a=candidate:") && !relayedCandidate(line)) return err("bad-request", "Only relayed connections may pass.");
    return { ok: true, kind: v.k };
  }
  if (v.k === "cand") {
    if (v.c === null) return { ok: true, kind: "cand" };
    const c = v.c as { candidate?: unknown } | undefined;
    if (!c || typeof c.candidate !== "string") return err("bad-request", "Not a valid setup message.");
    if (c.candidate !== "" && !relayedCandidate(c.candidate)) return err("bad-request", "Only relayed connections may pass.");
    return { ok: true, kind: "cand" };
  }
  return err("bad-request", "Not a valid setup message.");
}

// ---- addresses ----

/** The key an address is counted under: an IPv6 address by its /64 (one household has the whole range). */
export function ipKey(ip: string): string {
  // an IPv4 address in IPv6 clothes is that IPv4 address
  if (ip.toLowerCase().startsWith("::ffff:") && ip.includes(".")) return ip.slice(7);
  if (!ip.includes(":")) return ip;
  const [head, tail = ""] = ip.split("::");
  const a = head ? head.split(":") : [];
  const b = tail ? tail.split(":") : [];
  const groups = ip.includes("::") ? [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill("0"), ...b] : a;
  return groups.slice(0, 4).map((g) => g.toLowerCase().replace(/^0+(?=.)/, "")).join(":") + "::/64";
}

// ---- the day's budget ----

export interface DayCount {
  day: string;
  count: number;
}

/** One more relay login today, or not: the whole function hands out at most `cap` a day. */
export function takeDaily(state: DayCount | undefined, now: number, cap: number): { allowed: boolean; state: DayCount } {
  const day = new Date(now).toISOString().slice(0, 10);
  const cur = state && state.day === day ? state : { day, count: 0 };
  if (cur.count >= cap) return { allowed: false, state: cur };
  return { allowed: true, state: { day, count: cur.count + 1 } };
}

/** Counts per key (an address) for one day. */
export interface KeyedDay {
  day: string;
  counts: Record<string, number>;
}

/** One more for this key today, or not. */
export function takeKeyed(state: KeyedDay | undefined, now: number, key: string, cap: number): { allowed: boolean; state: KeyedDay } {
  const day = new Date(now).toISOString().slice(0, 10);
  const cur: KeyedDay = state && state.day === day ? state : { day, counts: {} };
  const n = cur.counts[key] ?? 0;
  if (n >= cap) return { allowed: false, state: cur };
  return { allowed: true, state: { day, counts: { ...cur.counts, [key]: n + 1 } } };
}

/** What each session token has used: its id, how many renewals, and when the token ends (then it is forgotten). */
export type Renewals = Record<string, { n: number; exp: number }>;

/** One more renewal for this token, or not. */
export function takeRenewal(state: Renewals | undefined, jti: string, exp: number, now: number, max: number): { allowed: boolean; state: Renewals } {
  const live: Renewals = {};
  for (const [id, v] of Object.entries(state ?? {})) if (v.exp > now) live[id] = v;
  const n = live[jti]?.n ?? 0;
  if (n >= max) return { allowed: false, state: live };
  live[jti] = { n: n + 1, exp };
  return { allowed: true, state: live };
}

// ---- session tokens ----

const b64url = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string): Uint8Array => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function hmacKey(secret: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", secret as Uint8Array<ArrayBuffer>, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

/** A token that lets a connected player fetch fresh relay logins for the session: "st1.<payload>.<mac>". */
export async function signToken(secret: Uint8Array, sessionId: string, now: number, ttlMs: number = LIMITS.tokenTtlMs): Promise<string> {
  const payload = b64url(new TextEncoder().encode(JSON.stringify({ sid: sessionId.slice(0, 64), exp: now + ttlMs, jti: b64url(crypto.getRandomValues(new Uint8Array(9))) })));
  const mac = await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(payload));
  return `st1.${payload}.${b64url(new Uint8Array(mac))}`;
}

export async function verifyToken(secret: Uint8Array, token: string, now: number): Promise<Result<{ sessionId: string; jti: string; exp: number }>> {
  const m = /^st1\.([A-Za-z0-9_-]{1,300})\.([A-Za-z0-9_-]{20,100})$/.exec(token);
  if (!m) return err("unauthorized", "That session key isn't right.");
  let ok = false;
  try {
    ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), fromB64url(m[2]) as Uint8Array<ArrayBuffer>, new TextEncoder().encode(m[1]));
  } catch {
    ok = false;
  }
  if (!ok) return err("unauthorized", "That session key isn't right.");
  const body = JSON.parse(new TextDecoder().decode(fromB64url(m[1]))) as { sid: string; exp: number; jti?: string };
  if (!(body.exp > now)) return err("expired", "This session's key has run out.");
  return { ok: true, sessionId: body.sid, jti: String(body.jti ?? ""), exp: body.exp };
}
