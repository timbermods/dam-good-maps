// The connection between two players (D431, D486): a WebRTC peer connection that may only use the relay
// (`iceTransportPolicy: "relay"`, only the function's servers), so neither player sees the other's address and
// no direct path exists. One reliable ordered data channel carries operations (cut into frames, with
// backpressure); one unordered, unreliable channel carries presence. Heartbeats notice a dropped peer within
// seconds. Long sessions refresh the relay's login before it runs out (an ICE restart over the data channel).
// No UI: the page listens to the events and shows the errors' messages.
import { Emitter } from "./emitter";
import { CollabError, MESSAGES } from "./errors";
import type { CollabErrorKind } from "./errors";
import { COLLAB_WORKER_URL } from "./config";
import { FRAME_MAX, FramingError, Reassembler, encodeControl, encodeMessage, parseControl } from "./framing";
import type { Control, Payload } from "./framing";
import { RoomSocket, createRoom, fetchIceServers, fetchSessionIceServers, joinRoom, relayedCandidate, sdpRelayOnly } from "./signal";
import type { IceServers, RoomInfo, SignalMessage } from "./signal";

export const PROTOCOL = 1;

export type Role = "host" | "guest";

export type TransportStatus = "idle" | "making-room" | "waiting-for-guest" | "connecting" | "connected" | "dropped" | "closed";

/**
 * Why a connected peer is gone: they left on purpose, the connection broke, or it broke after the relay's login had run
 * out without a refresh (a session longer than the login, or the function unreachable at refresh time).
 */
export type DropReason = "left" | "timeout" | "channel-closed" | "connection-failed" | "credentials-expired";

export interface PeerInfo {
  name?: string;
  /** Changes with every connection; a reconnect carries the same session id but a new epoch. */
  epoch: string;
}

export interface TransportEvents {
  status: TransportStatus;
  /** The host's room code, ready to show: it works once, for `expiresInMs` (counted from now on this machine). */
  code: { code: string; expiresAt: number; expiresInMs: number };
  /** Connected through the relay and the peer's hello accepted. */
  connected: { peer: PeerInfo; sessionId: string };
  /** An operation or snapshot from the peer, whole (reliable, in order). */
  message: Payload;
  /** A presence packet from the peer (unordered, may be lost). */
  presence: Payload;
  /** The relay's login was renewed and the connection moved onto it, without interruption. */
  refreshed: { ttlSeconds: number };
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
  /** Keep a copy of every setup message sent and received in `signalLog` (the tests check what crossed). */
  recordSignals?: boolean;
}

const HIGH_WATER = 256 * 1024;
const LOW_WATER = 64 * 1024;
/** How long a connected player keeps the room's socket open for the session token. */
const TOKEN_WAIT_MS = 30_000;

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
  /** Every setup message ("out"/"in") when `recordSignals` is set. */
  readonly signalLog: string[] = [];

  private readonly baseUrl: string;
  private readonly opts: Required<Pick<TransportOptions, "heartbeatMs" | "deadAfterMs" | "setupTimeoutMs" | "maxMessageBytes">>;
  private readonly recordSignals: boolean;
  private started = false;
  private pc: RTCPeerConnection | null = null;
  private rtcConfig: RTCConfiguration = {};
  private socket: RoomSocket | null = null;
  private ops: RTCDataChannel | null = null;
  private presenceChannel: RTCDataChannel | null = null;
  private reassembler: Reassembler;
  private nextMessageId = 1;
  private sendQueue: Promise<void> = Promise.resolve();
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private lastRx = 0;
  private lastTick = 0;
  private pingN = 0;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private negotiation: Promise<void> = Promise.resolve();
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private haveRemote = false;
  private offered = false;
  /** Messages that arrived between the peer's hello and our being connected; handed over in order once we are. */
  private early: Payload[] = [];
  private earlyBytes = 0;
  // the relay's login and its renewal
  private sessionToken: string | null = null;
  private tokenWait: ReturnType<typeof setTimeout> | null = null;
  private loginTtlMs = 0;
  private loginFetchedAt = 0;
  private loginExpired = false;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private expireTimer: ReturnType<typeof setTimeout> | null = null;
  private settle!: { resolve: () => void; reject: (e: CollabError) => void };
  private readonly settled: Promise<void>;
  private done = false;
  private readonly code: string | undefined;
  private readonly name: string | undefined;

  constructor(options: TransportOptions) {
    super();
    this.role = options.role;
    this.baseUrl = (options.baseUrl ?? COLLAB_WORKER_URL).replace(/\/+$/, "");
    this.sessionId = options.sessionId ?? (options.role === "host" ? crypto.randomUUID() : null);
    this.opts = {
      heartbeatMs: options.heartbeatMs ?? 1000,
      // long enough to ride out a stalled page; a closed channel or a failed connection is noticed at once anyway
      deadAfterMs: options.deadAfterMs ?? 10_000,
      setupTimeoutMs: options.setupTimeoutMs ?? 45_000,
      maxMessageBytes: options.maxMessageBytes ?? 64 * 1024 * 1024,
    };
    this.recordSignals = options.recordSignals ?? false;
    this.code = options.code;
    this.name = options.name;
    this.reassembler = new Reassembler(this.opts.maxMessageBytes);
    this.settled = new Promise((resolve, reject) => {
      this.settle = { resolve, reject };
    });
    this.settled.catch(() => {}); // the failure is also an event
  }

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
        this.emit("code", { code: room.code, expiresAt: room.expiresAt, expiresInMs: room.ttlMs });
        this.setStatus("waiting-for-guest");
        // the code is good for a few minutes, counted here from now (not against the server's clock)
        this.later(room.ttlMs, () => {
          if (this.status === "waiting-for-guest") this.fail(new CollabError("code-expired", "Nobody joined in time. Make a new code."));
        });
      } else {
        this.setStatus("connecting");
        this.startSetupTimer();
      }
      this.socket = new RoomSocket(this.baseUrl, room, {
        ready: () => this.onRoomReady(),
        signal: (m) => this.enqueue(() => this.onSignal(m)),
        closed: (reason, token) => {
          if (token) this.sessionToken = token;
          if (!this.done && this.status !== "connected" && reason !== "done") this.fail(new CollabError("unavailable", MESSAGES.unavailable));
        },
        // a problem with the room once the connection is up is no concern of the connection
        error: (e) => {
          if (this.status !== "connected") this.fail(e);
        },
      });
      // the guest's relay login is fetched while the host is still setting up; the host's, once the guest is in the room
      if (this.role === "guest") this.enqueue(() => this.startPeerConnection());
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

  /** Asks for the relay's login (the room hands it out once both players are in) and makes the peer connection. */
  private async startPeerConnection(): Promise<void> {
    this.assertOpen();
    const ice = await fetchIceServers(this.baseUrl, this.room!);
    this.assertOpen();
    this.noteLogin(ice);
    this.makePeerConnection(ice.iceServers);
  }

  private makePeerConnection(iceServers: RTCIceServer[]): void {
    // relay only, and only the function's servers: no direct path, no address shown to the other player
    this.rtcConfig = { iceServers, iceTransportPolicy: "relay", bundlePolicy: "max-bundle" };
    const pc = new RTCPeerConnection(this.rtcConfig);
    this.pc = pc;
    pc.onicecandidate = (e) => {
      // only relayed candidates leave this browser (the room refuses the others as well)
      if (!e.candidate || !relayedCandidate(e.candidate.candidate)) return;
      const init = e.candidate.toJSON();
      this.log("out", { k: "cand", c: init });
      if (this.status === "connected" && this.ops?.readyState === "open") {
        this.sendControl({ t: "cand", c: { candidate: init.candidate ?? "", sdpMid: init.sdpMid ?? null, sdpMLineIndex: init.sdpMLineIndex ?? null } });
      } else {
        this.socket?.send({ k: "cand", c: init });
      }
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

  /** Runs a step of the negotiation after the ones before it. A failure ends a connection being set up, never a working one. */
  private enqueue(job: () => Promise<void>): void {
    this.negotiation = this.negotiation.then(job).catch((e) => {
      if (this.done || this.status === "connected") return;
      this.fail(e instanceof CollabError ? e : new CollabError("connect-failed", MESSAGES.connectFailed));
    });
  }

  private log(direction: "in" | "out", m: unknown): void {
    if (this.recordSignals) this.signalLog.push(`${direction} ${JSON.stringify(m)}`);
  }

  private onRoomReady(): void {
    if (this.done) return;
    this.startSetupTimer();
    if (this.role !== "host" || this.offered) return;
    this.offered = true;
    this.setStatus("connecting");
    this.enqueue(async () => {
      await this.startPeerConnection();
      const pc = this.pc!;
      await pc.setLocalDescription(await pc.createOffer());
      const m: SignalMessage = { k: "offer", sdp: pc.localDescription!.sdp };
      this.log("out", m);
      this.socket?.send(m);
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
    this.log("in", m);
    if ((m.k === "offer" || m.k === "answer") && !sdpRelayOnly(m.sdp)) throw new CollabError("not-relayed", "The other player's connection wasn't through the relay, so it was refused.");
    if (m.k === "offer" && this.role === "guest" && !this.haveRemote) {
      await pc.setRemoteDescription({ type: "offer", sdp: m.sdp });
      await this.flushCandidates();
      await pc.setLocalDescription(await pc.createAnswer());
      const answer: SignalMessage = { k: "answer", sdp: pc.localDescription!.sdp };
      this.log("out", answer);
      this.socket?.send(answer);
    } else if (m.k === "answer" && this.role === "host" && !this.haveRemote) {
      await pc.setRemoteDescription({ type: "answer", sdp: m.sdp });
      await this.flushCandidates();
    } else if (m.k === "cand" && m.c && relayedCandidate(m.c.candidate ?? "")) {
      if (this.haveRemote) await this.addCandidate(m.c);
      else this.pendingCandidates.push(m.c);
    }
  }

  private async addCandidate(c: RTCIceCandidateInit): Promise<void> {
    try {
      await this.pc?.addIceCandidate(c);
    } catch (e) {
      // a stray candidate (late, or for an earlier attempt) must not end a connection that is working
      if (this.status !== "connected") throw e;
    }
  }

  private async flushCandidates(): Promise<void> {
    this.haveRemote = true;
    for (const c of this.pendingCandidates.splice(0)) await this.addCandidate(c);
  }

  // ---- frames in ----

  private onFrame(data: unknown): void {
    if (!(data instanceof ArrayBuffer) || this.done) return;
    this.lastRx = Date.now();
    const frame = new Uint8Array(data);
    try {
      if (frame[0] === 0) {
        const whole = this.reassembler.push(frame);
        if (whole !== null) this.deliver(whole);
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

  /** A whole message from the peer. One that arrives while we are still checking the relay waits, and goes out in order. */
  private deliver(message: Payload): void {
    if (this.status === "connected") return void this.emit("message", message);
    this.early.push(message);
    this.earlyBytes += typeof message === "string" ? message.length * 3 : message.length;
    if (this.earlyBytes > this.opts.maxMessageBytes) this.protocolFailure("protocol", "The other player's browser sent too much too early.");
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
      case "renego":
        this.enqueue(() => this.onRenegotiate(c));
        break;
      case "cand":
        if (relayedCandidate(c.c.candidate)) {
          this.log("in", { k: "cand", c: c.c });
          this.enqueue(() => this.addCandidate(c.c));
        }
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
    // the connection must really run through the relay (D431), at both ends
    const pair = await this.selectedPair();
    if (this.done) return;
    if (!pair || pair.local !== "relay" || pair.remote !== "relay") return this.protocolFailure("not-relayed", "The connection didn't go through the relay, so it was closed.");
    this.setStatus("connected");
    this.startHeartbeat();
    this.socket?.reportConnected(this.sessionId);
    // setup timers are over; the room's socket stays open a little for the session token (it closes when the room is done)
    this.clearTimers();
    this.tokenWait = setTimeout(() => this.socket?.close(), TOKEN_WAIT_MS);
    this.scheduleLoginTimers();
    this.settle.resolve();
    this.emit("connected", { peer: this.peer, sessionId: this.sessionId! });
    const waiting = this.early.splice(0);
    this.earlyBytes = 0;
    for (const message of waiting) this.emit("message", message);
  }

  private protocolFailure(kind: CollabErrorKind, message: string): void {
    this.sendControl({ t: "bye", reason: kind });
    this.fail(new CollabError(kind, message));
  }

  // ---- the relay's login, renewed during a long session ----

  private noteLogin(ice: IceServers): void {
    this.loginTtlMs = ice.ttl * 1000;
    this.loginFetchedAt = Date.now();
    this.loginExpired = false;
    if (this.status === "connected") this.scheduleLoginTimers();
  }

  private scheduleLoginTimers(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    if (this.expireTimer) clearTimeout(this.expireTimer);
    if (!this.loginTtlMs) return;
    const margin = Math.min(10 * 60_000, this.loginTtlMs / 4);
    const left = this.loginFetchedAt + this.loginTtlMs - Date.now();
    this.refreshTimer = setTimeout(() => void this.refreshLogin(), Math.max(0, left - margin));
    this.expireTimer = setTimeout(() => (this.loginExpired = true), Math.max(0, left));
  }

  /** A fresh login from the function, for this player's own relay allocation; false if it can't be had. */
  private async fetchFreshLogin(): Promise<boolean> {
    if (!this.sessionToken || !this.pc) return false;
    try {
      const ice = await fetchSessionIceServers(this.baseUrl, this.sessionToken);
      this.rtcConfig = { ...this.rtcConfig, iceServers: ice.iceServers };
      this.pc.setConfiguration(this.rtcConfig);
      this.noteLogin(ice);
      return true;
    } catch {
      return false;
    }
  }

  /** The host's turn: fresh logins on both sides, then an ICE restart whose offer and answer go over the data channel. */
  private async refreshLogin(): Promise<void> {
    if (this.status !== "connected" || this.done) return;
    if (!(await this.fetchFreshLogin())) {
      // try again shortly while there is time; the guest's side cannot start it
      this.refreshTimer = setTimeout(() => void this.refreshLogin(), 15_000);
      return;
    }
    if (this.role !== "host") return;
    this.enqueue(async () => {
      const pc = this.pc;
      if (!pc || this.status !== "connected") return;
      await pc.setLocalDescription(await pc.createOffer({ iceRestart: true }));
      this.log("out", { k: "offer", sdp: pc.localDescription!.sdp });
      this.sendControl({ t: "renego", kind: "offer", sdp: pc.localDescription!.sdp });
    });
  }

  private async onRenegotiate(c: Extract<Control, { t: "renego" }>): Promise<void> {
    const pc = this.pc;
    if (!pc || this.status !== "connected") return;
    this.log("in", { k: c.kind, sdp: c.sdp });
    if (!sdpRelayOnly(c.sdp)) throw new CollabError("not-relayed", "The other player's connection wasn't through the relay, so it was refused.");
    if (c.kind === "offer" && this.role === "guest") {
      // our own relay allocation moves to a fresh login before we answer
      if (Date.now() - this.loginFetchedAt > this.loginTtlMs / 2) await this.fetchFreshLogin();
      await pc.setRemoteDescription({ type: "offer", sdp: c.sdp });
      await pc.setLocalDescription(await pc.createAnswer());
      this.log("out", { k: "answer", sdp: pc.localDescription!.sdp });
      this.sendControl({ t: "renego", kind: "answer", sdp: pc.localDescription!.sdp });
      this.emit("refreshed", { ttlSeconds: this.loginTtlMs / 1000 });
    } else if (c.kind === "answer" && this.role === "host") {
      await pc.setRemoteDescription({ type: "answer", sdp: c.sdp });
      this.emit("refreshed", { ttlSeconds: this.loginTtlMs / 1000 });
    }
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
    this.lastRx = this.lastTick = Date.now();
    this.heartbeat = setInterval(() => {
      if (this.status !== "connected") return;
      const now = Date.now();
      // a page that was stalled (a long task, a suspended tab) did not hear anything because it was not listening
      if (now - this.lastTick > this.opts.heartbeatMs * 2) this.lastRx = now;
      this.lastTick = now;
      if (now - this.lastRx > this.opts.deadAfterMs) return this.drop("timeout");
      this.sendControl({ t: "ping", n: ++this.pingN });
    }, this.opts.heartbeatMs);
  }

  private drop(reason: DropReason): void {
    if (this.status !== "connected") return;
    // a break after the relay's login ran out is told apart from a plain break (but not from a goodbye)
    const why: DropReason = reason !== "left" && this.loginExpired ? "credentials-expired" : reason;
    this.teardown();
    this.setStatus("dropped");
    this.emit("dropped", { reason: why });
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
    for (const t of [this.refreshTimer, this.expireTimer, this.tokenWait]) if (t) clearTimeout(t);
    this.refreshTimer = this.expireTimer = this.tokenWait = null;
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
