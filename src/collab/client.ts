// The page's side of collaborative editing (D431, D486): one object the editor's page uses. It owns the connection
// (`CollabTransport`, on the main thread because RTCPeerConnection lives here) and talks to the session in the worker
// (`worker/collab.ts`, where the map lives), forwarding messages between them. No UI: the page listens to the events and
// shows the words they carry.
//
//   const collab = new CollabClient(api.collab);            // api: the generator worker's Comlink proxy
//   collab.on("code", ({ code }) => showInvite(code));
//   collab.on("paused", ({ message }) => show(message));    // "Bo has left. Waiting to reconnect."
//   await collab.startHosting({ name: "Emma" });            // or: await collab.join(code, { name: "Bo" })
//   await collab.submit({ kind: "edit", ops, label: "Raise" });
//
// Everything the page needs of a session is a method here or an event (README.md in this folder).

import { proxy, transfer, type Remote } from "comlink";
import { PresenceChannel, type ClaimCommand, type ClaimOutcome, type Command, type ForceGesture, type PeerEvent, type PresenceIn, type Role, type SubmitResult } from "../core/collab";
import type { EditOp } from "../core/doc/ops";
import type { SessionOpen, SessionUpdate } from "../worker/session";
import type { CollabApi, CollabWorkerEvent } from "../worker/collab";
import { COLLAB_WORKER_URL, collabConfigured } from "./config";
import { Emitter } from "./emitter";
import { CollabError, MESSAGES } from "./errors";
import { hostSession, joinSession, type CollabTransport, type DropReason, type TransportOptions } from "./transport";

type PeerEventMap = { [E in PeerEvent as E["type"]]: E };

export interface ClientEvents extends PeerEventMap {
  /** The host's Invite: a short single-use code, good for `expiresInMs` (counted here). */
  code: { code: string; expiresInMs: number };
  /** The map changed (an entry applied, the water settled): take it as an edit's answer. */
  update: SessionUpdate;
  /** A whole other map is open: a guest's copy of the host's map, or after a rejoin. Take it as an opened map. */
  open: SessionOpen;
  /** The relay or the room-code function is down, or this site has no function address yet: collaboration is unavailable;
   *  editing alone is unaffected. `message` is a sentence for the player. */
  unavailable: { message: string };
  /** A connection that could not be made or kept, with a sentence for the player and its kind (see `CollabError`). */
  failed: { message: string; kind: string };
}

export interface ClientOptions {
  /** The room-code function's address (the deployed one by default). */
  baseUrl?: string;
  /** Tests only: heartbeat and drop timing and the like, passed to every transport. */
  transport?: Partial<TransportOptions>;
}

export interface HostingOptions {
  /** The host's display name. */
  name: string;
  /** Carry on a session (a new code after a drop). The client remembers it while the page stays; pass it after a reload with the map reopened from Your maps. */
  sessionId?: string;
}

export interface JoiningOptions {
  name: string;
  /** The session this guest had (to carry on after a drop); a new guest has none. */
  sessionId?: string;
}

export class CollabClient extends Emitter<ClientEvents> {
  private transport: CollabTransport | null = null;
  private role: Role | null = null;
  private sessionId: string | null = null;
  private begun = false;
  private listening = false;
  // presence never touches the map, so it runs here beside the transport and not through the worker: a cursor does not wait behind
  // a force's plan or an edit being applied
  private presenceCh: PresenceChannel | null = null;
  private presenceTimer: ReturnType<typeof setTimeout> | null = null;
  private live = false;
  private otherName = "";

  constructor(
    private readonly worker: Remote<CollabApi>,
    private readonly options: ClientOptions = {},
  ) {
    super();
  }

  private get baseUrl(): string {
    return this.options.baseUrl ?? COLLAB_WORKER_URL;
  }

  /** Emit for the base class (protected there). */
  private fire<K extends keyof ClientEvents>(event: K, value: ClientEvents[K]): void {
    this.emit(event, value);
  }

  private async listen(): Promise<void> {
    if (this.listening) return;
    this.listening = true;
    await this.worker.listen(proxy((e: CollabWorkerEvent) => this.fromWorker(e)));
  }

  private fromWorker(e: CollabWorkerEvent): void {
    switch (e.type) {
      case "send":
        void this.transport?.send(e.payload).catch(() => undefined);
        return;
      default:
        this.noticed(e);
        this.fire(e.type as keyof ClientEvents, e as never);
    }
  }

  /** What the worker says that the page-thread presence needs to know: whether the session is live, and the other's name. */
  private noticed(e: CollabWorkerEvent): void {
    if (e.type === "state") this.live = e.state === "live";
    else if (e.type === "joined" || e.type === "resumed" || e.type === "paused") this.otherName = e.name;
    if (e.type === "paused" || (e.type === "state" && e.state !== "live")) this.presenceCh?.reset();
  }

  private makePresence(role: Role): void {
    this.presenceCh = new PresenceChannel({
      role,
      now: () => Date.now(),
      active: () => this.live && !!this.transport,
      send: (payload, reliable) => {
        if (reliable) void this.transport?.send(payload).catch(() => undefined);
        else this.transport?.sendPresence(payload);
      },
      emit: (e) => this.fire(e.type, e as never),
      otherName: () => this.otherName,
    });
  }

  private unavailable(): CollabError {
    const e = new CollabError("unavailable", MESSAGES.unavailable);
    this.fire("unavailable", { message: e.message });
    return e;
  }

  private wire(t: CollabTransport): void {
    this.transport = t;
    // (a message that outlives the session, after Leave, finds no one to take it: nothing to do)
    const quiet = (p: Promise<unknown>) => void p.catch(() => undefined);
    t.on("connected", () => {
      this.presenceCh?.reset();
      quiet(this.worker.attach());
    });
    t.on("message", (p) => {
      // (presence on the ordered channel: a stroke's start and end; it stays on this thread)
      if (typeof p === "string" && p.startsWith('{"kind":"presence"')) {
        this.presenceCh?.receive(p, true);
        return;
      }
      quiet(typeof p === "string" ? this.worker.receive(p) : this.worker.receive(transfer(p, [p.buffer as ArrayBuffer])));
    });
    t.on("presence", (p) => {
      if (typeof p === "string") this.presenceCh?.receive(p, false);
    });
    t.on("dropped", ({ reason }: { reason: DropReason }) => {
      if (this.transport === t) quiet(this.worker.detach(reason));
    });
    t.on("error", (e) => {
      if (this.transport !== t) return;
      this.fire("failed", { message: e.message, kind: e.kind });
      if (e.kind === "unavailable" || e.kind === "relay-unavailable") this.fire("unavailable", { message: e.message });
    });
  }

  /** Invite: make a room and a short code (the `code` event, and the result), and wait for the guest in the background. The map
   *  open in the editor is the session's. Called again after a drop it makes a new code for the same session. */
  async startHosting(opts: HostingOptions): Promise<{ code: string; sessionId: string }> {
    if (!collabConfigured(this.baseUrl)) throw this.unavailable();
    await this.listen();
    this.closeTransport();
    const t = hostSession({ ...this.options.transport, baseUrl: this.baseUrl, name: opts.name, sessionId: this.role === "host" ? (this.sessionId ?? undefined) : opts.sessionId });
    const begun = this.role === "host" && this.begun ? null : this.worker.begin("host", opts.name, t.sessionId);
    this.wire(t);
    const code = new Promise<{ code: string; expiresInMs: number }>((resolve, reject) => {
      t.on("code", resolve);
      t.on("error", reject);
    });
    t.connect().catch(() => undefined);
    const started = await begun;
    if (started && !started.ok) {
      this.closeTransport();
      throw new CollabError("closed", started.reason);
    }
    this.role = "host";
    this.makePresence("host");
    this.begun = true;
    this.sessionId = t.sessionId;
    const c = await code;
    this.fire("code", c);
    return { code: c.code, sessionId: t.sessionId! };
  }

  /** Join with the code the host gave. Resolves once the host's map is open here (the `open` and `joined` events); rejects with
   *  the failure's sentence. A guest who dropped joins again with the new code and `sessionId`: the map carries on. */
  async join(code: string, opts: JoiningOptions): Promise<void> {
    if (!collabConfigured(this.baseUrl)) throw this.unavailable();
    await this.listen();
    this.closeTransport();
    const sessionId = opts.sessionId ?? (this.role === "guest" ? this.sessionId : null) ?? undefined;
    if (!(this.role === "guest" && this.begun)) {
      const started = await this.worker.begin("guest", opts.name, sessionId ?? null);
      if (!started.ok) throw new CollabError("closed", started.reason);
    }
    this.role = "guest";
    this.makePresence("guest");
    this.begun = true;
    const t = joinSession(code, { ...this.options.transport, baseUrl: this.baseUrl, name: opts.name, ...(sessionId ? { sessionId } : {}) });
    this.wire(t);
    const off: (() => void)[] = [];
    const joined = new Promise<void>((resolve, reject) => {
      off.push(
        this.on("joined", () => resolve()),
        this.on("resumed", () => resolve()),
        this.on("error", (e) => reject(new CollabError("incompatible", e.message))),
        this.on("failed", (f) => reject(new CollabError("connect-failed", f.message))),
        this.on("desync", (d) => reject(new CollabError("protocol", d.reason))),
      );
    }).finally(() => off.forEach((f) => f()));
    joined.catch(() => undefined);
    try {
      await t.connect();
    } catch (e) {
      this.closeTransport();
      throw e;
    }
    this.sessionId = t.sessionId;
    await joined;
  }

  /** Leave on purpose: the other player sees it at once; the session is kept in Your maps (a `keep` event). */
  async leave(): Promise<void> {
    await this.worker.leave();
    this.closeTransport();
    this.role = null;
    this.begun = false;
    this.sessionId = null;
  }

  private closeTransport(): void {
    const t = this.transport;
    this.transport = null;
    t?.close();
  }

  // ---- the session (all answered by the worker's peer)

  /** Order an edit, a Select action, a force, an undo or a redo; the answer is the host's: ordered, or one plain line. */
  submit(command: Command): Promise<SubmitResult> {
    return this.worker.submit(command);
  }
  undo() {
    return this.worker.undo();
  }
  redo() {
    return this.worker.redo();
  }
  /** What Undo (or Redo) would do now, and which blocked actions it skips (each named). */
  plan(redo = false) {
    return this.worker.plan(redo);
  }
  /** Claim, release, offer, accept or decline ground (ordered through the host). */
  claim(command: ClaimCommand): Promise<ClaimOutcome> {
    return this.worker.claim(command);
  }
  claimsView() {
    return this.worker.claimsView();
  }
  /** The line for an edit about to be released that would reach into the other's area, or null (§3). */
  reachRefusal(ops: EditOp[]) {
    return this.worker.reachRefusal(ops);
  }
  /** The tiles of the other's area the edit's quick band reaches, to draw in their colour while the stroke is drawn. */
  reachBand(ops: EditOp[]) {
    return this.worker.reachBand(ops);
  }
  previewForce(gesture: ForceGesture) {
    return this.worker.previewForce(gesture);
  }
  /** Cursor, tool, camera and the stroke being drawn, in tiles; throttled to 15 a second in the worker. */
  presence(p: PresenceIn): void {
    const ch = this.presenceCh;
    if (!ch) return;
    ch.presence(p);
    if (!this.presenceTimer && ch.tick()) this.pacePresence();
  }

  /** (a packet waiting for its time goes when it comes) */
  private pacePresence(): void {
    this.presenceTimer = setTimeout(() => {
      this.presenceTimer = null;
      if (this.presenceCh?.tick()) this.pacePresence();
    }, 70);
  }
  /** The host: tell the guest a new map is coming ("<name> is opening a new map"); call it before generating or loading one. */
  announceNewMap(name: string) {
    return this.worker.announceNewMap(name);
  }
  /** The host: the new map will not be opened after all (a generation that failed): the guest carries on with the map as it is. */
  cancelNewMap() {
    return this.worker.cancelNewMap();
  }
  /** The host: the new map is open in the editor; the guest is sent it and both keep the previous one. */
  newMap(name: string) {
    return this.worker.newMap(name);
  }
  /** The guest: ask for the host's map again after a `desync`. */
  resync() {
    return this.worker.resync();
  }
  /** The session's map as a project, to save a copy while the session is paused. */
  project() {
    return this.worker.project();
  }
  state() {
    return this.worker.state();
  }
}
