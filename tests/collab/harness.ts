// Runs inside each browser of the connection test: wraps one CollabTransport and records what happens, so the
// test (Node) can drive it with page.evaluate and check the results. Bundled by localStack.ts.
import { CollabTransport, hostSession, joinSession } from "../../src/collab/transport";
import type { DropReason } from "../../src/collab/transport";
import { makePayload, sha256Hex } from "./payload";

export interface Received {
  kind: "text" | "binary";
  size: number;
  /** text itself for short text, otherwise the SHA-256 of the bytes */
  value: string;
}

class Harness {
  t: CollabTransport | null = null;
  received: Received[] = [];
  presence: string[] = [];
  statuses: string[] = [];
  dropped: DropReason | null = null;
  error: { kind: string; message: string } | null = null;
  private connected: Promise<{ sessionId: string; peerEpoch: string; pair: { local: string; remote: string } | null }> | null = null;

  private wire(t: CollabTransport): void {
    this.t = t;
    this.received = [];
    this.presence = [];
    this.statuses = [];
    this.dropped = null;
    this.error = null;
    t.on("status", (s) => this.statuses.push(s));
    t.on("message", async (m) => {
      if (typeof m === "string") this.received.push({ kind: "text", size: m.length, value: m.length < 200 ? m : await sha256Hex(new TextEncoder().encode(m)) });
      else this.received.push({ kind: "binary", size: m.length, value: await sha256Hex(m) });
    });
    t.on("presence", (p) => this.presence.push(typeof p === "string" ? p : `binary:${p.length}`));
    t.on("dropped", (d) => (this.dropped = d.reason));
    t.on("error", (e) => (this.error = { kind: e.kind, message: e.message }));
    this.connected = new Promise((resolve) =>
      t.on("connected", async (c) => resolve({ sessionId: c.sessionId, peerEpoch: c.peer.epoch, pair: await t.selectedPair() })),
    );
  }

  /** Starts hosting; resolves with the room code as soon as the function hands it out. */
  async host(baseUrl: string, sessionId?: string): Promise<{ code: string; sessionId: string }> {
    const t = hostSession({ baseUrl, ...(sessionId ? { sessionId } : {}), name: "Host", heartbeatMs: 500, deadAfterMs: 3000 });
    this.wire(t);
    const code = new Promise<string>((resolve) => t.on("code", (c) => resolve(c.code)));
    t.connect().catch(() => {});
    return { code: await code, sessionId: t.sessionId! };
  }

  /** Joins; resolves with the failure's kind and message instead of throwing, so the test can look at it. */
  async join(baseUrl: string, code: string, sessionId?: string): Promise<{ ok: true } | { ok: false; kind: string; message: string }> {
    const t = joinSession(code, { baseUrl, ...(sessionId ? { sessionId } : {}), name: "Guest", heartbeatMs: 500, deadAfterMs: 3000 });
    this.wire(t);
    try {
      void t.connect().catch(() => {});
      await new Promise<void>((resolve, reject) => {
        t.on("connected", () => resolve());
        t.on("error", (e) => reject(e));
      });
      return { ok: true };
    } catch (e) {
      const err = e as { kind?: string; message?: string };
      return { ok: false, kind: err.kind ?? "unknown", message: err.message ?? String(e) };
    }
  }

  whenConnected() {
    return this.connected!;
  }

  /** Sends a list of messages in order: text, or `size`/`seed` binary payloads. */
  async sendAll(items: ({ text: string } | { size: number; seed: number })[]): Promise<void> {
    for (const item of items) await this.t!.send("text" in item ? item.text : makePayload(item.size, item.seed));
  }

  sendPresence(text: string): boolean {
    return this.t!.sendPresence(text);
  }

  candidateTypes() {
    return this.t!.candidateTypes();
  }

  state() {
    return { received: this.received, presence: this.presence, statuses: this.statuses, dropped: this.dropped, error: this.error, status: this.t?.status ?? "idle" };
  }

  close() {
    this.t?.close();
  }
}

(window as unknown as { harness: Harness }).harness = new Harness();
