// The client of the room-code function (collab-worker/): make a room, join one, get the relay's credentials, and
// pass the connection setup to the other browser through the room's socket. Nothing here touches map data.
import { CollabError, MESSAGES, fromServer } from "./errors";

export interface RoomInfo {
  code: string;
  /** This player's key to the room; never shown, never stored. */
  secret: string;
  expiresAt: number;
  /** How long the code works, from now (the function's own count; the client's clock is not compared with the server's). */
  ttlMs: number;
}

export interface IceServers {
  iceServers: RTCIceServer[];
  ttl: number;
}

async function call<T>(baseUrl: string, path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new CollabError("unavailable", MESSAGES.unavailable);
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* not JSON: a failure page */
  }
  if (!res.ok) {
    const e = (body as { error?: { kind?: string; message?: string } } | null)?.error;
    throw fromServer(e?.kind, e?.message, res.status);
  }
  if (!body || typeof body !== "object") throw new CollabError("unavailable", MESSAGES.unavailable);
  return body as T;
}

/** The host: a new room and its short code. */
export async function createRoom(baseUrl: string): Promise<RoomInfo> {
  const r = await call<{ code: string; hostSecret: string; expiresAt: number; codeTtlMs: number }>(baseUrl, "/rooms", { method: "POST" });
  return { code: r.code, secret: r.hostSecret, expiresAt: r.expiresAt, ttlMs: r.codeTtlMs };
}

/** The guest: spends the code a player typed or pasted. */
export async function joinRoom(baseUrl: string, code: string): Promise<RoomInfo> {
  const r = await call<{ code: string; guestSecret: string; expiresAt: number }>(baseUrl, `/rooms/${encodeURIComponent(code.trim())}/join`, { method: "POST" });
  return { code: r.code, secret: r.guestSecret, expiresAt: r.expiresAt, ttlMs: 0 };
}

/** Short-lived relay logins, for a holder of a room key. */
export async function fetchIceServers(baseUrl: string, room: RoomInfo): Promise<IceServers> {
  return call<IceServers>(baseUrl, `/rooms/${encodeURIComponent(room.code)}/ice`, { method: "POST", headers: { Authorization: `Bearer ${room.secret}` } });
}

/** Fresh relay logins during a long session, for the holder of the session token the room gave at connect. */
export async function fetchSessionIceServers(baseUrl: string, token: string): Promise<IceServers> {
  return call<IceServers>(baseUrl, "/session/ice", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
}

/** A candidate that goes through the relay and shows no address of the sender's (the only kind that may be sent or accepted). */
export function relayedCandidate(candidate: string): boolean {
  if (!/ typ relay(?: |$)/.test(candidate)) return false;
  const raddr = / raddr (\S+)/.exec(candidate);
  return !raddr || raddr[1] === "0.0.0.0" || raddr[1] === "::";
}

/** Every candidate line in an offer or answer is relayed. */
export function sdpRelayOnly(sdp: string): boolean {
  return sdp.split(/\r?\n/).every((line) => !line.startsWith("a=candidate:") || relayedCandidate(line));
}

/** Asks whether collaboration can work at all (the function is up and the relay is set up). */
export async function checkAvailable(baseUrl: string): Promise<void> {
  const r = await call<{ ok: boolean; relay: boolean }>(baseUrl, "/health", { method: "GET" });
  if (!r.relay) throw new CollabError("relay-unavailable", MESSAGES.relayUnavailable);
}

export type SignalMessage =
  | { k: "offer"; sdp: string }
  | { k: "answer"; sdp: string }
  | { k: "cand"; c: RTCIceCandidateInit | null };

export function parseSignal(data: string): SignalMessage {
  let v: unknown;
  try {
    v = JSON.parse(data);
  } catch {
    throw new CollabError("protocol", "The other player sent something unreadable.");
  }
  const m = v as { k?: unknown; sdp?: unknown; c?: unknown };
  if ((m.k === "offer" || m.k === "answer") && typeof m.sdp === "string") return { k: m.k, sdp: m.sdp };
  if (m.k === "cand") {
    if (m.c === null) return { k: "cand", c: null };
    const c = m.c as RTCIceCandidateInit | undefined;
    if (c && typeof c.candidate === "string") {
      return { k: "cand", c: { candidate: c.candidate, sdpMid: c.sdpMid ?? null, sdpMLineIndex: c.sdpMLineIndex ?? null } };
    }
  }
  throw new CollabError("protocol", "The other player sent something unreadable.");
}

export interface RoomSocketHandlers {
  /** Both players are in the room: the host may send its offer. */
  ready: () => void;
  signal: (m: SignalMessage) => void;
  /** The room is gone (done, expired) or the socket broke. */
  closed: (reason: string, sessionToken?: string) => void;
  error: (e: CollabError) => void;
}

/** The room's socket: setup messages between the two players. */
export class RoomSocket {
  private ws: WebSocket | null = null;
  private finished = false;
  private keepalive: ReturnType<typeof setInterval> | null = null;

  constructor(
    readonly baseUrl: string,
    readonly room: RoomInfo,
    private readonly on: RoomSocketHandlers,
  ) {}

  /** Opens the socket and proves this player's key; resolves once the room accepts it. */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(`${this.baseUrl.replace(/^http/, "ws")}/rooms/${encodeURIComponent(this.room.code)}/ws`);
      } catch {
        return reject(new CollabError("unavailable", MESSAGES.unavailable));
      }
      this.ws = ws;
      let authed = false;
      ws.onopen = () => ws.send(JSON.stringify({ t: "auth", secret: this.room.secret }));
      ws.onerror = () => {
        if (!authed) reject(new CollabError("unavailable", MESSAGES.unavailable));
      };
      ws.onclose = () => {
        if (this.keepalive) clearInterval(this.keepalive);
        if (!authed) reject(new CollabError("unavailable", MESSAGES.unavailable));
        else if (!this.finished) this.on.closed("socket");
      };
      ws.onmessage = (ev) => {
        let m: { t?: string; data?: string; reason?: string; kind?: string; message?: string; token?: string };
        try {
          m = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        switch (m.t) {
          case "authed":
            authed = true;
            // a host waiting for a guest keeps the room's socket alive for the code's few minutes
            this.keepalive = setInterval(() => {
              try {
                ws.send("ping");
              } catch {
                /* closing */
              }
            }, 20_000);
            resolve();
            break;
          case "ready":
            this.on.ready();
            break;
          case "signal":
            try {
              this.on.signal(parseSignal(String(m.data)));
            } catch (e) {
              this.on.error(e as CollabError);
            }
            break;
          case "closed":
            this.finished = true;
            this.on.closed(m.reason ?? "closed", m.token);
            break;
          case "error": {
            const e = fromServer(m.kind, m.message, 400);
            if (!authed) reject(e);
            else this.on.error(e);
            break;
          }
        }
      };
    });
  }

  send(m: SignalMessage): void {
    this.ws?.send(JSON.stringify({ t: "signal", data: JSON.stringify(m) }));
  }

  /** This player's side of the connection is up; when both say so the room is deleted. */
  reportConnected(sessionId: string | null): void {
    try {
      this.ws?.send(JSON.stringify({ t: "connected", ...(sessionId ? { sessionId } : {}) }));
    } catch {
      /* the room expires by itself */
    }
  }

  close(): void {
    this.finished = true;
    if (this.keepalive) clearInterval(this.keepalive);
    try {
      this.ws?.close();
    } catch {
      /* already closed */
    }
    this.ws = null;
  }
}
