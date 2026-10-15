// What the page knows of a shared session (docs/COLLAB-BRIEF.md, D486): one object the page holds for as long as it lives,
// beside the editor (a new map remounts the editor; the session goes on). It owns the `CollabClient`, turns its events into one
// plain state the Together panel and the header read, and hands the editor what it must show: the map's updates, the other
// player's cursor, the notes. No UI and no DOM: `src/editor/collab/` draws it.

import type { Remote } from "comlink";
import type { CollabApi } from "../worker/collab";
import type { SessionOpen, SessionUpdate } from "../worker/session";
import { PLAYER_COLOURS, type PeerEvent, type PeerState, type Role, type View } from "../core/collab";
import { CollabClient, type ClientEvents } from "./client";
import { collabBaseUrl } from "./config";
import { CollabError } from "./errors";
import { MAX_DISPLAY_NAME } from "../core/collab/wire";

export type Phase =
  /** No session. */
  | "alone"
  /** The host has made a code and waits for the guest. */
  | "inviting"
  /** A guest is joining. */
  | "joining"
  | "live"
  /** The other has left or the connection dropped: the map is read-only until they come back. */
  | "paused";

export interface Person {
  name: string;
  colour: string;
  role: Role;
}

export interface TogetherState {
  phase: Phase;
  role: Role | null;
  me: Person;
  other: Person | null;
  /** The Invite's code while it can be used. */
  code: string | null;
  /** What is being done now ("Making a code…", "Joining…"), or null. */
  working: string | null;
  /** The last thing that went wrong, plainly (a code that was wrong, collaboration unavailable). Editing alone is unaffected. */
  problem: string | null;
  /** "<name> has left. Waiting to reconnect." while paused. */
  paused: string | null;
  /** "<name> is opening a new map" while the host loads another. */
  opening: string | null;
  /** This copy of the map is out of step with the host's (the guest can ask for it again). */
  desync: string | null;
  /** The other player's camera is known ("Go to" works). */
  hasView: boolean;
  /** Undo and Redo have something to do for this player (their own actions only). */
  canUndo: boolean;
  canRedo: boolean;
}

/** A note for the page's usual note line. */
export interface Note {
  kind: "info" | "error";
  text: string;
  /** "See it": where to take the camera (a tile). */
  see?: { x: number; y: number };
}

/** The other player's cursor, as last heard. */
export interface Presence {
  name: string;
  colour: string;
  role: Role;
  /** Tile position (fractions allowed), or null when their pointer is off the map. */
  cursor: [number, number] | null;
  tool: string | null;
  /** When the last cursor packet came (ms, the page's clock). */
  at: number;
}

/** The editor that is open now: the controller hands it the map's updates, a camera move and the notes. */
export interface EditorBinding {
  update(u: SessionUpdate): void;
  goTo(view: View): void;
  note(n: Note): void;
}

/** What the controller uses of the client (the tests give it a stand-in). */
export type ClientLike = Pick<CollabClient, "on" | "startHosting" | "join" | "leave" | "plan" | "resync" | "announceNewMap" | "cancelNewMap" | "newMap" | "presence">;

export interface TogetherDeps {
  /** The generator worker's collaboration API as it is now. */
  worker(): Remote<CollabApi>;
  /** Whether a map is open to share (an Invite needs one). */
  hasMap(): boolean;
  /** The host's map arrived (a guest's copy, a rejoin): open it like any map. */
  open(data: SessionOpen): void;
  /** The session is kept in Your maps (§8): at a pause, when someone leaves, and the old map when the host opens another. */
  keep(k: Keep): void;
  /** Before a guest joins: the map it has now is saved, for the host's map takes its place. */
  prepare?(): Promise<void>;
  /** The tests' own function and timings. */
  options?: ConstructorParameters<typeof CollabClient>[1];
  /** The client, made on first use (the tests give a stand-in). */
  client?(): ClientLike;
}

/** A session kept as a project (§8): why, the project and what it is called. */
export type Keep = Extract<PeerEvent, { type: "keep" }>;

const NAME_KEY = "dgm.collab.name";
export const DEFAULT_NAME = "Player";

/** The player's name, kept in this browser (default "Player"). */
export function savedName(): string {
  try {
    return cleanName(localStorage.getItem(NAME_KEY) ?? "") || DEFAULT_NAME;
  } catch {
    return DEFAULT_NAME;
  }
}

export function cleanName(name: string): string {
  return name.replace(/[\u0000-\u001f]/g, "").trim().slice(0, MAX_DISPLAY_NAME);
}

const other = (r: Role): Role => (r === "host" ? "guest" : "host");

/** How long a cursor stays after its last packet (ms). */
export const CURSOR_FADE_MS = 1500;

export class Together {
  private client: ClientLike | null = null;
  private binding: EditorBinding | null = null;
  private waiting: SessionUpdate[] = [];
  private listeners = new Set<() => void>();
  private presenceNow: Presence | null = null;
  private theirView: View | null = null;
  private joinedEver = false;
  private name = savedName();
  private s: TogetherState;
  private historyTimer: ReturnType<typeof setTimeout> | null = null;
  private presenceListeners = new Set<() => void>();

  constructor(private readonly deps: TogetherDeps) {
    this.s = this.blank();
  }

  private blank(): TogetherState {
    return { phase: "alone", role: null, me: { name: this.name, colour: PLAYER_COLOURS.host, role: "host" }, other: null, code: null, working: null, problem: null, paused: null, opening: null, desync: null, hasView: false, canUndo: false, canRedo: false };
  }

  // ---- the state

  get state(): TogetherState {
    return this.s;
  }

  /** A session exists (an Invite waiting counts): every edit goes through it. */
  get active(): boolean {
    return this.s.phase !== "alone";
  }

  get isGuest(): boolean {
    return this.active && this.s.role === "guest";
  }

  get isHost(): boolean {
    return this.active && this.s.role === "host";
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  private set(patch: Partial<TogetherState>): void {
    this.s = { ...this.s, ...patch };
    for (const fn of [...this.listeners]) fn();
  }

  /** The other player's cursor (null: none, or it has faded). */
  presence(now = Date.now()): Presence | null {
    const p = this.presenceNow;
    return p && now - p.at <= CURSOR_FADE_MS ? p : null;
  }

  onPresence(fn: () => void): () => void {
    this.presenceListeners.add(fn);
    return () => void this.presenceListeners.delete(fn);
  }

  // ---- the editor

  /** The editor that is open: it gets the map's updates (those that came while none was open first), the camera moves and the notes. */
  attach(b: EditorBinding): () => void {
    this.binding = b;
    const late = this.waiting;
    this.waiting = [];
    for (const u of late) b.update(u);
    return () => {
      if (this.binding === b) this.binding = null;
    };
  }

  private say(n: Note): void {
    this.binding?.note(n);
  }

  // ---- the client

  private connection(): ClientLike {
    if (this.client) return this.client;
    const c = this.deps.client?.() ?? new CollabClient(this.deps.worker(), { baseUrl: collabBaseUrl(), ...this.deps.options });
    this.client = c;
    this.wire(c);
    return c;
  }

  /** The client, for the page's edits that need it (presence, the whole-map change). Null while there is no session. */
  get live(): ClientLike | null {
    return this.active ? this.client : null;
  }

  private wire(c: ClientLike): void {
    const on = <K extends keyof ClientEvents>(e: K, fn: (v: ClientEvents[K]) => void) => c.on(e, fn);
    on("code", ({ code }) => this.set({ code, working: null, phase: this.s.phase === "paused" ? "paused" : "inviting", problem: null }));
    on("joined", (e) => this.joined(e.name, false));
    on("resumed", (e) => this.joined(e.name, true));
    on("paused", (e) => this.set({ phase: "paused", paused: e.message, code: null, working: null, hasView: false }));
    on("state", (e) => this.peerState(e.state));
    on("update", (e) => {
      const u = e.update;
      if (this.binding) this.binding.update(u);
      else this.waiting.push(u);
      this.history();
    });
    on("open", (e) => {
      // (a whole other map: updates after it are differences from it, so none that came before may reach the editor that replaces this one)
      this.waiting = [];
      this.binding = null;
      this.deps.open(e.open);
    });
    on("keep", (k) => {
      // (a session nobody joined is not kept)
      if (this.joinedEver) this.deps.keep(k);
    });
    on("presence", (e) => {
      const keep = this.presenceNow;
      const p: Presence = { name: e.name, colour: e.colour, role: e.who, cursor: e.cursor !== undefined ? e.cursor : (keep?.cursor ?? null), tool: e.tool !== undefined ? e.tool : (keep?.tool ?? null), at: e.at };
      this.presenceNow = p;
      if (e.view) {
        this.theirView = e.view;
        if (!this.s.hasView) this.set({ hasView: true });
      }
      for (const fn of [...this.presenceListeners]) fn();
    });
    on("presence-cleared", () => {
      this.presenceNow = null;
      for (const fn of [...this.presenceListeners]) fn();
    });
    on("note", (e) => this.say({ kind: "info", text: e.text, see: { x: e.note.centre.x, y: e.note.centre.y } }));
    on("refused", (e) => this.say({ kind: "error", text: e.reason }));
    on("opening", (e) => {
      this.set({ opening: e.message });
      this.say({ kind: "info", text: e.message });
    });
    on("new-map", () => this.set({ opening: null }));
    on("desync", (e) => this.set({ desync: e.reason }));
    on("unavailable", (e) => this.set({ problem: e.message, working: null }));
    on("failed", (e) => this.failed(e.message));
    on("error", (e) => this.say({ kind: "error", text: e.message }));
    on("applied", () => this.history());
  }

  /** A connection that could not be made or kept: said plainly. An Invite that failed is no Invite; a pause carries on. */
  private failed(message: string): void {
    const waiting = this.s.phase === "inviting" && !this.joinedEver;
    this.set({ problem: message, working: null, ...(this.s.phase === "paused" || waiting ? { code: null } : {}) });
    if (waiting) void this.drop();
  }

  private joined(name: string, back: boolean): void {
    this.joinedEver = true;
    this.set({ phase: "live", other: { name, colour: PLAYER_COLOURS[other(this.s.role ?? "host")], role: other(this.s.role ?? "host") }, code: null, working: null, problem: null, paused: null, opening: null, desync: null });
    void back;
    this.history();
  }

  private peerState(state: PeerState): void {
    if (state === "desynced") return;
    if (state === "live" && this.s.desync) this.set({ desync: null });
  }

  /** What Undo and Redo would do now, asked of the session (they take back only this player's own actions). */
  private history(): void {
    if (!this.active || this.historyTimer) return;
    this.historyTimer = setTimeout(async () => {
      this.historyTimer = null;
      const c = this.client;
      if (!c || !this.active) return;
      try {
        const [u, r] = await Promise.all([c.plan(false), c.plan(true)]);
        if (this.active) this.set({ canUndo: u.target !== null, canRedo: r.target !== null });
      } catch {
        // (the session ended meanwhile)
      }
    }, 40);
  }

  // ---- what the player does

  setName(name: string): void {
    const n = cleanName(name);
    this.name = n || DEFAULT_NAME;
    try {
      localStorage.setItem(NAME_KEY, this.name);
    } catch {
      // (the name is not kept; it still counts for this page)
    }
    this.set({ me: { ...this.s.me, name: this.name } });
  }

  private fail(e: unknown): void {
    const message = e instanceof CollabError ? e.message : e instanceof Error ? e.message : String(e);
    this.set({ problem: message, working: null });
  }

  /** Invite: make a room code and wait for the other player. Called again after a pause it makes a new code for the same session. */
  async invite(): Promise<void> {
    if (!this.deps.hasMap()) return this.set({ problem: "Open a map first" });
    const again = this.s.phase === "paused" && this.s.role === "host";
    this.set({ working: "Making a code…", problem: null, role: "host", me: { name: this.name, colour: PLAYER_COLOURS.host, role: "host" }, ...(again ? {} : { phase: "inviting", other: null }) });
    try {
      await this.connection().startHosting({ name: this.name });
    } catch (e) {
      this.fail(e);
      if (!again && !this.joinedEver) await this.drop();
    }
  }

  /** The host takes the Invite back before anyone has joined. */
  async cancelInvite(): Promise<void> {
    await this.leave();
  }

  /** Join with the code the host gave. A guest who was paused joins again with the new code. */
  async join(code: string): Promise<void> {
    const typed = code.trim();
    if (!typed) return this.set({ problem: "Type the code the other player gave you" });
    const again = this.s.phase === "paused" && this.s.role === "guest";
    this.set({ working: "Joining…", problem: null, role: "guest", me: { name: this.name, colour: PLAYER_COLOURS.guest, role: "guest" }, ...(again ? {} : { phase: "joining" }) });
    try {
      if (!again) await this.deps.prepare?.();
      await this.connection().join(typed, { name: this.name });
    } catch (e) {
      this.fail(e);
      if (!again && !this.joinedEver) await this.drop();
    }
  }

  /** Leave on purpose: the other player is told at once; the map stays here, kept in Your maps. */
  async leave(): Promise<void> {
    const c = this.client;
    if (c) {
      try {
        await c.leave();
      } catch {
        // (already gone)
      }
    }
    this.reset();
  }

  /** A session that never started (a wrong code, an Invite that failed): back to alone, the problem kept for the panel. */
  private async drop(): Promise<void> {
    const problem = this.s.problem;
    try {
      await this.client?.leave();
    } catch {
      // (nothing to leave)
    }
    this.reset();
    this.set({ problem });
  }

  private reset(): void {
    this.joinedEver = false;
    this.presenceNow = null;
    this.theirView = null;
    this.waiting = [];
    this.s = { ...this.blank(), problem: null };
    for (const fn of [...this.listeners]) fn();
    for (const fn of [...this.presenceListeners]) fn();
  }

  /** The camera goes where the other player is looking. Never automatic. */
  goTo(): void {
    if (this.theirView) this.binding?.goTo(this.theirView);
  }

  /** The guest asks the host for the map again after a desync. */
  resync(): void {
    void this.client?.resync();
    this.set({ desync: null });
  }

  /** The host: tell the guest a new map is coming, before it is made or loaded. */
  announce(name: string): void {
    if (this.isHost) void this.client?.announceNewMap(name).catch(() => undefined);
  }

  /** The host: the new map will not be opened after all. */
  cancelAnnounce(): void {
    if (this.isHost) void this.client?.cancelNewMap().catch(() => undefined);
  }

  /** The host: the new map is open here; the guest is sent it and both keep the old one. */
  async newMap(name: string): Promise<void> {
    if (!this.isHost) return;
    // (what the editor is told from here on is the new map's: it waits for the editor that opens it)
    this.binding = null;
    this.waiting = [];
    await this.client?.newMap(name);
  }

  dismissProblem(): void {
    if (this.s.problem) this.set({ problem: null });
  }
}
