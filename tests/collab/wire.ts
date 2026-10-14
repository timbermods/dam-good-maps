// Calls to the room-code function and its room sockets, for the tests that talk to it directly (no browser).
import { expect } from "@playwright/test";
import type { Stack } from "./localStack";

export interface Api {
  create(): Promise<Response>;
  join(code: string): Promise<Response>;
  ice(code: string, secret?: string): Promise<Response>;
  sessionIce(token?: string): Promise<Response>;
  ws(code: string): WebSocket;
}

/** The function's calls as a page on the site's origin would make them, from the given "address". */
export function makeApi(stack: Stack, ip: string): Api {
  const headers: Record<string, string> = { "CF-Connecting-IP": ip, Origin: stack.pageUrl.replace(/\/$/, "") };
  const auth = (secret?: string): Record<string, string> => (secret ? { Authorization: `Bearer ${secret}` } : {});
  return {
    create: () => fetch(`${stack.workerUrl}/rooms`, { method: "POST", headers }),
    join: (code) => fetch(`${stack.workerUrl}/rooms/${code}/join`, { method: "POST", headers }),
    ice: (code, secret) => fetch(`${stack.workerUrl}/rooms/${code}/ice`, { method: "POST", headers: { ...headers, ...auth(secret) } }),
    sessionIce: (token) => fetch(`${stack.workerUrl}/session/ice`, { method: "POST", headers: { ...headers, ...auth(token) } }),
    ws: (code) => new WebSocket(`${stack.workerUrl.replace("http", "ws")}/rooms/${code}/ws`),
  };
}

/** A socket that records what arrives and lets a test wait for the next message of a kind. */
export class Wire {
  messages: { t: string; [k: string]: unknown }[] = [];
  closed: { code: number; reason: string } | null = null;
  constructor(readonly ws: WebSocket) {
    ws.onmessage = (e) => {
      try {
        this.messages.push(JSON.parse(String(e.data)));
      } catch {
        this.messages.push({ t: "raw", data: String(e.data) });
      }
    };
    ws.onclose = (e) => (this.closed = { code: e.code, reason: e.reason });
  }
  open() {
    return new Promise<void>((resolve, reject) => {
      this.ws.onopen = () => resolve();
      this.ws.onerror = () => reject(new Error("socket error"));
    });
  }
  send(o: unknown) {
    this.ws.send(JSON.stringify(o));
  }
  async next(t: string, after = 0) {
    await expect.poll(() => this.messages.slice(after).some((m) => m.t === t), { timeout: 10_000 }).toBe(true);
    return this.messages.slice(after).find((m) => m.t === t)!;
  }
}

/** Two players "connect" through a room with nothing but sockets (no WebRTC), as a script could; returns their session tokens. */
export async function sessionTokens(a: Api, sessionId = "session-x"): Promise<string[]> {
  const room = (await (await a.create()).json()) as { code: string; hostSecret: string };
  const guestKey = ((await (await a.join(room.code)).json()) as { guestSecret: string }).guestSecret;
  const host = new Wire(a.ws(room.code));
  const guest = new Wire(a.ws(room.code));
  await Promise.all([host.open(), guest.open()]);
  host.send({ t: "auth", secret: room.hostSecret });
  guest.send({ t: "auth", secret: guestKey });
  await host.next("ready");
  host.send({ t: "connected", sessionId });
  guest.send({ t: "connected", sessionId });
  return [(await host.next("closed")).token, (await guest.next("closed")).token] as string[];
}
