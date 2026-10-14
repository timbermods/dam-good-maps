import { DurableObject } from "cloudflare:workers";
import { LIMITS, createRoom, err, hashSecret, isExpired, joinRoom, markConnected, noteIceFetch, noteSignal, roleOf } from "./room";
import type { Result, Role, RoomRecord } from "./room";
import type { Env } from "./env";

/** What the browser sends over the room's socket. */
type ClientMessage = { t: "auth"; secret: string } | { t: "signal"; data: string } | { t: "connected" };

interface Attachment {
  role: Role | null;
  msgs: number;
}

/** A socket may send this many messages in all: a connection setup needs a few dozen. */
const MAX_SOCKET_MESSAGES = 400;

/**
 * One room (named by its code): the two secrets' hashes, the expiry and a few counters. The two browsers' sockets
 * pass setup messages (offer, answer, candidates) through it, opaque and unstored. When both report connected, or the
 * time runs out, everything is deleted and the sockets closed.
 */
export class Room extends DurableObject<Env> {
  private async load(): Promise<RoomRecord | null> {
    return (await this.ctx.storage.get<RoomRecord>("room")) ?? null;
  }

  private async save(room: RoomRecord): Promise<void> {
    await this.ctx.storage.put("room", room);
  }

  /** Deletes everything and closes every socket. */
  private async destroy(reason: string): Promise<void> {
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(JSON.stringify({ t: "closed", reason }));
        ws.close(1000, reason);
      } catch {
        /* already gone */
      }
    }
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  async alarm(): Promise<void> {
    await this.destroy("expired");
  }

  /** A new room under this code; refused if the code is taken (the Worker then tries another). */
  async create(code: string, hostHash: string): Promise<Result<{ expiresAt: number }>> {
    const existing = await this.load();
    if (existing && !isExpired(existing, Date.now())) return err("taken", "Code in use.");
    const room = createRoom(Date.now(), code, hostHash);
    await this.save(room);
    await this.ctx.storage.setAlarm(room.expiresAt);
    return { ok: true, expiresAt: room.expiresAt };
  }

  /** The guest uses the code. */
  async join(guestHash: string): Promise<Result<{ expiresAt: number }>> {
    const room = await this.load();
    const result = joinRoom(room, Date.now(), guestHash);
    if (!result.ok) {
      if (room && isExpired(room, Date.now())) await this.destroy("expired");
      return result;
    }
    await this.save(result.room);
    await this.ctx.storage.setAlarm(result.room.expiresAt);
    return { ok: true, expiresAt: result.room.expiresAt };
  }

  /** Which role this key opens, counting a relay-credentials request against the room's limit. */
  async takeIce(secretHash: string): Promise<Result<{ role: Role }>> {
    const room = await this.load();
    if (!room) return err("not-found", "No such room.");
    const who = roleOf(room, Date.now(), secretHash);
    if (!who.ok) return who;
    const counted = noteIceFetch(room);
    if (!counted.ok) return counted;
    await this.save(counted.room);
    return { ok: true, role: who.role };
  }

  async fetch(request: Request): Promise<Response> {
    const room = await this.load();
    if (!room) return Response.json({ error: { kind: "not-found", message: "No such room." } }, { status: 404 });
    if (isExpired(room, Date.now())) return Response.json({ error: { kind: "expired", message: "This room has run out." } }, { status: 410 });
    if (this.ctx.getWebSockets().length >= LIMITS.maxSockets)
      return Response.json({ error: { kind: "too-many", message: "Too many connections to this room." } }, { status: 429 });
    if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected a WebSocket", { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ role: null, msgs: 0 } satisfies Attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  private socketsOf(role: Role): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => (ws.deserializeAttachment() as Attachment | null)?.role === role);
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const tell = (obj: unknown) => ws.send(JSON.stringify(obj));
    const att = (ws.deserializeAttachment() as Attachment | null) ?? { role: null, msgs: 0 };
    att.msgs++;
    if (att.msgs > MAX_SOCKET_MESSAGES) return ws.close(1008, "Too many messages");
    ws.serializeAttachment(att);
    if (typeof message !== "string") return ws.close(1003, "Text only");
    if (new TextEncoder().encode(message).length > LIMITS.maxMessageBytes + 256) return ws.close(1009, "Message too large");
    let msg: ClientMessage;
    try {
      msg = JSON.parse(message) as ClientMessage;
    } catch {
      return tell({ t: "error", kind: "bad-request", message: "Not a valid message." });
    }
    const room = await this.load();
    if (!room || isExpired(room, Date.now())) {
      await this.destroy("expired");
      return;
    }
    switch (msg.t) {
      case "auth": {
        if (typeof msg.secret !== "string" || msg.secret.length > 100) return tell({ t: "error", kind: "unauthorized", message: "Bad key." });
        const who = roleOf(room, Date.now(), await hashSecret(msg.secret));
        if (!who.ok) {
          tell({ t: "error", kind: who.error.kind, message: who.error.message });
          return ws.close(1008, "Unauthorized");
        }
        // a player who reconnects replaces their earlier socket
        for (const old of this.socketsOf(who.role)) if (old !== ws) old.close(1000, "Replaced");
        ws.serializeAttachment({ ...att, role: who.role } satisfies Attachment);
        tell({ t: "authed", role: who.role });
        if (this.socketsOf("host").length && this.socketsOf("guest").length) {
          for (const sock of this.ctx.getWebSockets()) sock.send(JSON.stringify({ t: "ready" }));
        }
        return;
      }
      case "signal": {
        if (!att.role) return tell({ t: "error", kind: "unauthorized", message: "Send your key first." });
        if (typeof msg.data !== "string") return tell({ t: "error", kind: "bad-request", message: "Not a valid message." });
        const counted = noteSignal(room, new TextEncoder().encode(msg.data).length);
        if (!counted.ok) return tell({ t: "error", kind: counted.error.kind, message: counted.error.message });
        const peers = this.socketsOf(att.role === "host" ? "guest" : "host");
        if (!peers.length) return tell({ t: "error", kind: "bad-request", message: "The other player isn't in the room." });
        await this.save(counted.room);
        for (const peer of peers) peer.send(JSON.stringify({ t: "signal", data: msg.data }));
        return;
      }
      case "connected": {
        if (!att.role) return tell({ t: "error", kind: "unauthorized", message: "Send your key first." });
        const next = markConnected(room, att.role);
        if (next.done) return this.destroy("done");
        await this.save(next.room);
        return;
      }
      default:
        return tell({ t: "error", kind: "bad-request", message: "Unknown message." });
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    try {
      ws.close(1000);
    } catch {
      /* already closed */
    }
  }
}
