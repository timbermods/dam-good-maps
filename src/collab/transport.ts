// The connection between two players (D431, D486): a WebRTC peer connection that may only use the relay
// (`iceTransportPolicy: "relay"`, only the function's servers), so neither player sees the other's address and
// no direct path exists. One reliable ordered data channel carries operations (cut into frames, with
// backpressure); one unordered, unreliable channel carries presence. Heartbeats notice a dropped peer within
// seconds. No UI: the page listens to the events and shows the errors' messages.
import { Emitter } from "./emitter";
import { CollabError, MESSAGES } from "./errors";
import type { CollabErrorKind } from "./errors";
import { COLLAB_WORKER_URL } from "./config";
import { FRAME_MAX, FramingError, Reassembler, encodeControl, encodeMessage, parseControl } from "./framing";
import type { Control, Payload } from "./framing";
import { RoomSocket, createRoom, fetchIceServers, joinRoom } from "./signal";
import type { RoomInfo, SignalMessage } from "./signal";

export const PROTOCOL = 1;

export type Role = "host" | "guest";

export type TransportStatus = "idle" | "making-room" | "waiting-for-guest" | "connecting" | "connected" | "dropped" | "closed";

/** Why a connected peer is gone: they left on purpose, or the connection broke. */
export type DropReason = "left" | "timeout" | "channel-closed" | "connection-failed";

export interface PeerInfo {
  name?: string;
  /** Changes with every connection; a reconnect carries the same session id but a new epoch. */
  epoch: string;
}

export interface TransportEvents {
  status: TransportStatus;
  /** The host's room code, ready to show: it works once, for a few minutes. */
  code: { code: string; expiresAt: number };
  /** Connected through the relay and the peer's hello accepted. */
  connected: { peer: PeerInfo; sessionId: string };
  /** An operation or snapshot from the peer, whole (reliable, in order). */
  message: Payload;
  /** A presence packet from the peer (unordered, may be lost). */
  presence: Payload;
  /** The peer is gone. The transport is finished; reconnect with a new room code and the same session id. */
  dropped: { reason: DropReason };
  /** A failure; `error.message` is a sentence for the player. */
  error: CollabError;
}

export interface TransportOptions {
  role: Role;
  /** The guest: the code the host gave. */
  code?: string;
  /** The room-code function's address. */
  baseUrl?: string;
  /** Carry on a session: the host's id, or the guest's last one (checked against the host's). */
  sessionId?: string;
  /** Shown to the peer in hello. */
  name?: string;
  /** Heartbeat every this many ms; the peer is gone after `deadAfterMs` without any traffic. */
  heartbeatMs?: number;
  deadAfterMs?: number;
  /** From both players being in the room (or the guest joining) to connected. */
  setupTimeoutMs?: number;
  maxMessageBytes?: number;
}

const HIGH_WATER = 256 * 1024;
const LOW_WATER = 64 * 1024;

const randomId = (): string => [...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(16).padStart(2, "0")).join("");

export class CollabTransport extends Emitter<TransportEvents> {
  readonly role: Role;
  /** The session this connection carries; a guest without one adopts the host's at hello. */
  sessionId: string | null;
  /** This connection's own id. */
  readonly epoch = randomId();
  status: TransportStatus = "idle";
  peer: PeerInfo | null = null;
  room: RoomInfo | null = null;

  /** Relay problems the browser reported while connecting (for diagnosing a failed connection). */
  readonly iceErrors: string[] = [];
  private readonly baseUrl: string;
  private readonly opts: Required<Pick<TransportOptions, "heartbeatMs" | "deadAfterMs" | "setupTimeoutMs" | "maxMessageBytes">>;
  private started = false;
  private pc: RTCPeerConnection | null = null;
  private socket: RoomSocket | null = null;
  private ops: RTCDataChannel | null = null;
  private presenceChannel: RTCDataChannel | null = null;
  private reassembler: Reassembler;
  private nextMessageId = 1;
  private sendQueue: Promise<void> = Promise.resolve();
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private lastRx = 0;
  private pingN = 0;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private negotiation: Promise<void> = Promise.resolve();
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private haveRemote = false;
  private offered = false;
  private settle!: { resolve: () => void; reject: (e: CollabError) => void };
  private readonly settled: Promise<void>;
  private done = false;

  constructor(options: TransportOptions) {
    super();
    this.role = options.role;
    this.baseUrl = (options.baseUrl ?? COLLAB_WORKER_URL).replace(/\/+$/, "");
    this.sessionId = options.sessionId ?? (options.role === "host" ? crypto.randomUUID() : null);
    this.opts = {
      heartbeatMs: options.heartbeatMs ?? 1000,
      deadAfterMs: options.deadAfterMs ?? 4000,
      setupTimeoutMs: options.setupTimeoutMs ?? 45_000,
      maxMessageBytes: options.maxMessageBytes ?? 64 * 1024 * 1024,
    };
    this.code = options.code;
    this.name = options.name;
    this.reassembler = new Reassembler(this.opts.maxMessageBytes);
    this.settled = new Promise((resolve, reject) => {
      this.settle = { resolve, reject };
    });
    this.settled.catch(() => {}); // the failure is also an event
  }

  private readonly code: string | undefined;
  private readonly name: string | undefined;

  private setStatus(s: TransportStatus): void {
    if (this.status === s) return;
    this.status = s;
    this.emit("status", s);
  }

  /**
   * Host: makes a room (the `code` event, then waits for the guest). Guest: joins with the code. Resolves when
   * connected through the relay; rejects with the same CollabError the `error` event carries.
   */
  async connect(): Promise<void> {
    if (this.started) throw new CollabError("closed", "This connection was already started.");
    this.started = true;
    try {
      this.setStatus("making-room");
      const room = this.role === "host" ? await createRoom(this.baseUrl) : await joinRoom(this.baseUrl, this.code ?? "");
      this.room = room;
      this.assertOpen();
      if (this.role === "host") {
        this.emit("code", { code: room.code, expiresAt: room.expiresAt });
        this.setStatus("waiting-for-guest");
        // the code is good for a few minutes
        this.later(room.expiresAt - Date.now(), () => {
          if (this.status === "waiting-for-guest") this.fail(new CollabError("code-expired", "Nobody joined in time. Make a new code."));
        });
      } else {
        this.setStatus("connecting");
        this.startSetupTimer();
      }
      const ice = await fetchIceServers(this.baseUrl, room);
      this.assertOpen();
      this.makePeerConnection(ice.iceServers);
      this.socket = new RoomSocket(this.baseUrl, room, {
        ready: () => this.onRoomReady(),
        signal: (m) => this.enqueue(() => this.onSignal(m)),
        closed: (reason) => {
          if (!this.done && this.status !== "connected" && reason !== "done") this.fail(new CollabError("unavailable", MESSAGES.unavailable));
        },
        error: (e) => this.fail(e),
      });
      await this.socket.connect();
      this.assertOpen();
    } catch (e) {
      this.fail(e instanceof CollabError ? e : new CollabError("unavailable", MESSAGES.unavailable));
    }
    await this.settled;
  }

  private assertOpen(): void {
    if (this.done) throw new CollabError("closed", MESSAGES.closed);
  }

  // ---- the peer connection ----

  private makePeerConnection(iceServers: RTCIceServer[]): void {
    // relay only, and only the function's servers: no direct path, no address shown to the other player
    const pc = new RTCPeerConnection({ iceServers, iceTransportPolicy: "relay", bundlePolicy: "max-bundle" });
    this.pc = pc;
    pc.onicecandidate = (e) => {
      if (e.candidate) this.socket?.send({ k: "cand", c: e.candidate.toJSON() });
    };
    pc.onicecandidateerror = (e) => {
      const ev = e as RTCPeerConnectionIceErrorEvent;
      if (this.iceErrors.length < 10) this.iceErrors.push(`${ev.url ?? "?"}: ${ev.errorCode} ${ev.errorText ?? ""}`.trim());
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState !== "failed") return;
      if (this.status === "connected") this.drop("connection-failed");
      else this.fail(new CollabError("connect-failed", MESSAGES.connectFailed));
    };
    if (this.role === "host") {
      this.attach(pc.createDataChannel("ops", { ordered: true }));
      this.attach(pc.createDataChannel("presence", { ordered: false, maxRetransmits: 0 }));
    } else {
      pc.ondatachannel = (e) => this.attach(e.channel);
    }
  }

  private attach(ch: RTCDataChannel): void {
    ch.binaryType = "arraybuffer";
    if (ch.label === "presence") {
      this.presenceChannel = ch;
      ch.onmessage = (e) => {
        if (this.status === "connected") this.emit("presence", typeof e.data === "string" ? e.data : new Uint8Array(e.data as ArrayBuffer));
      };
      return;
    }
    if (ch.label !== "ops") return;
    this.ops = ch;
    ch.bufferedAmountLowThreshold = LOW_WATER;
    ch.onopen = () => {
      this.lastRx = Date.now();
      this.sendControl({ t: "hello", protocol: PROTOCOL, session: this.sessionId, epoch: this.epoch, ...(this.name ? { name: this.name } : {}) });
    };
    ch.onmessage = (e) => this.onFrame(e.data);
    ch.onclose = () => {
      if (this.done) return;
      if (this.status === "connected") this.drop("channel-closed");
      else this.fail(new CollabError("connect-failed", MESSAGES.connectFailed));
    };
    if (ch.readyState === "open") ch.onopen?.(new Event("open"));
  }

  // ---- setting up through the room ----

  private enqueue(job: () => Promise<void>): void {
    this.negotiation = this.negotiation.then(job).catch(() => this.fail(new CollabError("connect-failed", MESSAGES.connectFailed)));
  }

  private onRoomReady(): void {
    if (this.done) return;
    this.startSetupTimer();
    if (this.role !== "host" || this.offered) return;
    this.offered = true;
    this.setStatus("connecting");
    this.enqueue(async () => {
      const pc = this.pc!;
      await pc.setLocalDescription(await pc.createOffer());
      this.socket?.send({ k: "offer", sdp: pc.localDescription!.sdp });
    });
  }

  private startSetupTimer(): void {
    this.later(this.opts.setupTimeoutMs, () => {
      if (!this.done && this.status !== "connected") this.fail(new CollabError("connect-failed", MESSAGES.connectFailed));
    });
  }

  private async onSignal(m: SignalMessage): Promise<void> {
    const pc = this.pc;
    if (!pc || this.done) return;
    if (m.k === "offer" && this.role === "guest" && !this.haveRemote) {
      await pc.setRemoteDescription({ type: "offer", sdp: m.sdp });
      await this.flushCandidates();
      await pc.setLocalDescription(await pc.createAnswer());
      this.socket?.send({ k: "answer", sdp: pc.localDescription!.sdp });
    } else if (m.k === "answer" && this.role === "host" && !this.haveRemote) {
      await pc.setRemoteDescription({ type: "answer", sdp: m.sdp });
      await this.flushCandidates();
    } else if (m.k === "cand" && m.c) {
      if (this.haveRemote) await pc.addIceCandidate(m.c);
      else this.pendingCandidates.push(m.c);
    }
  }

  private async flushCandidates(): Promise<void> {
    this.haveRemote = true;
    for (const c of this.pendingCandidates.splice(0)) await this.pc!.addIceCandidate(c);
  }

  // ---- frames in ----

  private onFrame(data: unknown): void {
    if (!(data instanceof ArrayBuffer) || this.done) return;
    this.lastRx = Date.now();
    const frame = new Uint8Array(data);
    try {
      if (frame[0] === 0) {
        const whole = this.reassembler.push(frame);
        if (whole !== null && this.status === "connected") this.emit("message", whole);
      } else if (frame[0] === 1) {
        this.onControl(parseControl(frame));
      } else {
        throw new FramingError("unknown frame");
      }
    } catch (e) {
      if (!(e instanceof FramingError)) throw e;
      this.protocolFailure("protocol", "The other player's browser sent something we can't read.");
    }
  }

  private onControl(c: Control): void {
    switch (c.t) {
      case "hello":
        void this.onHello(c);
        break;
      case "ping":
        this.sendControl({ t: "pong", n: c.n });
        break;
      case "bye":
        this.drop("left");
        break;
      default:
        break;
    }
  }

  private async onHello(h: Extract<Control, { t: "hello" }>): Promise<void> {
    if (this.peer || this.done) return;
    if (h.protocol !== PROTOCOL) return this.protocolFailure("incompatible", "The other player is on a different version of Dam Good Maps.");
    if (this.sessionId !== null && h.session !== null && h.session !== this.sessionId)
      return this.protocolFailure("session-mismatch", "That code belongs to a different session.");
    if (this.sessionId === null) this.sessionId = h.session;
    this.peer = { epoch: h.epoch, ...(h.name ? { name: h.name } : {}) };
    // the connection must really run through the relay (D431)
    const pair = await this.selectedPair();
    if (this.done) return;
    if (!pair || pair.local !== "relay") return this.protocolFailure("not-relayed", "The connection didn't go through the relay, so it was closed.");
    this.setStatus("connected");
    this.startHeartbeat();
    this.socket?.reportConnected();
    this.socket?.close();
    this.clearTimers();
    this.settle.resolve();
    this.emit("connected", { peer: this.peer, sessionId: this.sessionId! });
  }

  private protocolFailure(kind: CollabErrorKind, message: string): void {
    this.sendControl({ t: "bye", reason: kind });
    this.fail(new CollabError(kind, message));
  }

  // ---- frames out ----

  private sendControl(c: Control): void {
    try {
      if (this.ops?.readyState === "open") this.ops.send(encodeControl(c) as Uint8Array<ArrayBuffer>);
    } catch {
      /* the channel is going away; the heartbeat or close handler deals with it */
    }
  }

  /** Sends an operation or snapshot whole and in order; resolves when it has been handed to the connection. */
  send(payload: Payload): Promise<void> {
    if (this.status !== "connected") return Promise.reject(new CollabError("closed", MESSAGES.closed));
    const frames = encodeMessage(this.nextMessageId++, payload);
    const run = async () => {
      for (const frame of frames) {
        await this.drain();
        this.ops!.send(frame as Uint8Array<ArrayBuffer>);
      }
    };
    return (this.sendQueue = this.sendQueue.then(run, run));
  }

  /** Waits while too much is buffered (backpressure), so a large snapshot never floods the channel. */
  private async drain(): Promise<void> {
    const ch = this.ops;
    while (ch && ch.readyState === "open" && ch.bufferedAmount > HIGH_WATER) {
      await new Promise<void>((resolve) => {
        const done = () => {
          ch.removeEventListener("bufferedamountlow", done);
          ch.removeEventListener("close", done);
          resolve();
        };
        ch.addEventListener("bufferedamountlow", done);
        ch.addEventListener("close", done);
      });
    }
    if (!ch || ch.readyState !== "open") throw new CollabError("closed", MESSAGES.closed);
  }

  /** A presence packet (cursor, stroke): sent if the channel is free, otherwise dropped; never queued. */
  sendPresence(payload: Payload): boolean {
    const ch = this.presenceChannel;
    const size = typeof payload === "string" ? payload.length * 3 : payload.length;
    if (this.status !== "connected" || !ch || ch.readyState !== "open" || ch.bufferedAmount > LOW_WATER || size > FRAME_MAX) return false;
    try {
      if (typeof payload === "string") ch.send(payload);
      else ch.send(payload as Uint8Array<ArrayBuffer>);
      return true;
    } catch {
      return false;
    }
  }

  // ---- heartbeat and drop ----

  private startHeartbeat(): void {
    this.lastRx = Date.now();
    this.heartbeat = setInterval(() => {
      if (this.status !== "connected") return;
      if (Date.now() - this.lastRx > this.opts.deadAfterMs) return this.drop("timeout");
      this.sendControl({ t: "ping", n: ++this.pingN });
    }, this.opts.heartbeatMs);
  }

  private drop(reason: DropReason): void {
    if (this.status !== "connected") return;
    this.teardown();
    this.setStatus("dropped");
    this.emit("dropped", { reason });
  }

  /** Which kinds of candidates carry the connection ("relay" is the only acceptable answer). */
  async selectedPair(): Promise<{ local: string; remote: string } | null> {
    const pc = this.pc;
    if (!pc) return null;
    const stats = await pc.getStats();
    const byId = new Map<string, Record<string, unknown>>();
    stats.forEach((s) => byId.set(String(s.id), s as Record<string, unknown>));
    let pair: Record<string, unknown> | undefined;
    byId.forEach((s) => {
      if (s.type === "transport" && typeof s.selectedCandidatePairId === "string") pair = byId.get(s.selectedCandidatePairId);
    });
    if (!pair) byId.forEach((s) => (pair ??= s.type === "candidate-pair" && (s.selected === true || (s.nominated === true && s.state === "succeeded")) ? s : undefined));
    if (!pair) return null;
    const local = byId.get(String(pair.localCandidateId));
    const remote = byId.get(String(pair.remoteCandidateId));
    return { local: String(local?.candidateType ?? "unknown"), remote: String(remote?.candidateType ?? "unknown") };
  }

  /** What the browser says about the connection, for diagnosing a failure. */
  diagnostics(): { connectionState: string; iceConnectionState: string; iceGatheringState: string; iceErrors: string[] } {
    const pc = this.pc;
    return { connectionState: pc?.connectionState ?? "none", iceConnectionState: pc?.iceConnectionState ?? "none", iceGatheringState: pc?.iceGatheringState ?? "none", iceErrors: this.iceErrors };
  }

  /** Every kind of candidate gathered or received ("relay" only, by the policy); for diagnostics and the tests. */
  async candidateTypes(): Promise<{ local: string[]; remote: string[] }> {
    const out = { local: new Set<string>(), remote: new Set<string>() };
    if (!this.pc) return { local: [], remote: [] };
    (await this.pc.getStats()).forEach((s) => {
      if (s.type === "local-candidate") out.local.add(String(s.candidateType));
      if (s.type === "remote-candidate") out.remote.add(String(s.candidateType));
    });
    return { local: [...out.local], remote: [...out.remote] };
  }

  // ---- finishing ----

  private fail(e: CollabError): void {
    if (this.done) return;
    this.teardown();
    this.setStatus("closed");
    this.settle.reject(e);
    this.emit("error", e);
  }

  /** Ends the connection; a connected peer is told, so they see "left" and not a drop. Safe to call again. */
  close(): void {
    if (this.done) return;
    if (this.status === "connected") this.sendControl({ t: "bye", reason: "left" });
    this.teardown();
    if (this.status !== "dropped") this.setStatus("closed");
    this.settle.reject(new CollabError("closed", MESSAGES.closed));
  }

  private later(ms: number, fn: () => void): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, Math.max(0, ms));
    this.timers.add(t);
  }

  private clearTimers(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
  }

  private teardown(): void {
    this.done = true;
    this.clearTimers();
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.socket?.close();
    this.socket = null;
    // let a goodbye in flight leave before the connection is closed
    const pc = this.pc;
    const ops = this.ops;
    this.pc = null;
    setTimeout(() => {
      try {
        ops?.close();
        pc?.close();
      } catch {
        /* already closed */
      }
    }, 200);
  }
}

/** A host's transport, not yet started: listen for `code`, then `await transport.connect()`. */
export const hostSession = (options: Omit<TransportOptions, "role" | "code"> = {}): CollabTransport => new CollabTransport({ ...options, role: "host" });

/** A guest's transport for the code a player typed or pasted. */
export const joinSession = (code: string, options: Omit<TransportOptions, "role" | "code"> = {}): CollabTransport =>
  new CollabTransport({ ...options, role: "guest", code });
