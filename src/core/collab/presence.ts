// Presence: where a player is and what they are doing (docs/COLLAB-BRIEF.md §6). Cursor, tool, camera and a stroke before release,
// as bounded quarter-tile integers, at most PRESENCE_HZ packets a second with the latest winning; a stroke's start and end (and
// its cancel) go on the ordered channel as well so the other player never sees a stroke that does not end. It never touches the
// map, so the page runs it on the main thread beside the transport (src/collab/client.ts): a cursor does not wait behind a
// force's plan or an edit in the worker. The peer holds one too, for the headless tests.

import type { Role } from "./claims";
import {
  MAX_PACKET_POINTS,
  MAX_STROKE_POINTS,
  PLAYER_COLOURS,
  PRESENCE_HZ,
  decode,
  encode,
  type Presence,
  type View,
} from "./wire";

export interface PresenceIn {
  cursor?: [number, number] | null;
  tool?: string | null;
  view?: View | null;
  /** The stroke being drawn: its id (new for every stroke), the points since the last call (tiles), and whether it just ended. */
  stroke?: { id: number; points: [number, number][]; end?: boolean } | null;
}

export type PresenceEvent =
  /** Where the other player is: only what changed is set (a null cursor hides it). The page keeps it until it is null or the session pauses. */
  | { type: "presence"; who: Role; name: string; colour: string; at: number; cursor?: [number, number] | null; tool?: string | null; view?: View | null }
  /** A stroke being drawn by the other player: the points new since the last event (in tiles), `fresh` when it is a new stroke. */
  | { type: "stroke"; who: Role; name: string; colour: string; id: number; fresh: boolean; points: [number, number][]; ended: boolean; gap: boolean };

export interface PresenceOptions {
  /** This player's role; the other's is the one shown. */
  role: Role;
  now: () => number;
  /** Send one encoded packet: on the ordered channel (`reliable`) or the one that may lose packets. */
  send: (payload: string, reliable: boolean) => void;
  emit: (e: PresenceEvent) => void;
  /** Whether there is someone to tell (connected and live). */
  active: () => boolean;
  /** The other player's name. */
  otherName: () => string;
}

/** How many ended strokes' ids are remembered, so a point that arrives late is not drawn as a new stroke. */
const ENDED_KEPT = 16;

export class PresenceChannel {
  private outN = 0;
  private lastSent = -Infinity;
  private wanted: PresenceIn | null = null;
  private strokeQueue: [number, number][] = [];
  private strokePart = 0;
  private strokeId = 0;
  private strokeEnd = false;
  private strokeDirty = false;
  private strokeCancel = false;
  private inN = -1;
  private inStroke: { id: number; part: number } | null = null;
  private ended: number[] = [];

  constructor(private readonly o: PresenceOptions) {}

  /** A new connection: the other side counts from the start again. */
  reset(): void {
    this.outN = 0;
    this.lastSent = -Infinity;
    this.wanted = null;
    this.strokeQueue = [];
    this.strokeId = 0;
    this.strokeEnd = this.strokeDirty = this.strokeCancel = false;
    this.inN = -1;
    this.inStroke = null;
    this.ended = [];
  }

  /** Say where this player is and what they are doing. Throttled; call `tick` while a packet may be waiting. */
  presence(p: PresenceIn, now = this.o.now()): void {
    if (!this.o.active()) return;
    if (p.cursor !== undefined || p.tool !== undefined || p.view !== undefined) {
      const w = (this.wanted ??= {});
      if (p.cursor !== undefined) w.cursor = p.cursor;
      if (p.tool !== undefined) w.tool = p.tool;
      if (p.view !== undefined) w.view = p.view;
    }
    if (p.stroke === null) {
      this.strokeCancel = this.strokeId > 0;
      this.strokeId = 0;
      this.strokeQueue = [];
      this.strokeEnd = false;
      this.strokeDirty = false;
    } else if (p.stroke) {
      if (p.stroke.id !== this.strokeId) {
        this.strokeId = p.stroke.id;
        this.strokePart = 0;
        this.strokeQueue = [];
        this.strokeEnd = false;
      }
      for (const pt of p.stroke.points) this.strokeQueue.push(pt);
      // (a long stroke keeps what the other can still draw)
      if (this.strokeQueue.length > MAX_STROKE_POINTS) this.strokeQueue.splice(0, this.strokeQueue.length - MAX_STROKE_POINTS);
      if (p.stroke.end) this.strokeEnd = true;
      this.strokeDirty = true;
    }
    this.tick(now);
  }

  /** Send the waiting presence if it is time (a stroke's end goes at once). True while something is still waiting. */
  tick(now = this.o.now()): boolean {
    const waiting = this.wanted !== null || this.strokeDirty || this.strokeCancel;
    if (!waiting) return false;
    if (!this.o.active()) {
      this.wanted = null;
      this.strokeDirty = this.strokeCancel = false;
      return false;
    }
    const due = now - this.lastSent >= 1000 / PRESENCE_HZ;
    if (!due && !(this.strokeDirty && this.strokeEnd && this.strokeQueue.length <= MAX_PACKET_POINTS)) return true;
    this.lastSent = now;
    const w = this.wanted ?? {};
    this.wanted = null;
    const msg: Presence = { kind: "presence", n: ++this.outN };
    if (w.cursor !== undefined) msg.cursor = w.cursor === null ? null : [quarter(w.cursor[0]), quarter(w.cursor[1])];
    if (w.tool !== undefined) msg.tool = w.tool === null ? null : w.tool.replace(/[^A-Za-z0-9 _.+-]/g, "").slice(0, 40) || null;
    if (w.view !== undefined) msg.view = w.view && finiteView(w.view) ? w.view : null;
    let reliable = false;
    if (this.strokeCancel) {
      msg.stroke = null;
      this.strokeCancel = false;
      reliable = true;
    } else if (this.strokeDirty) {
      const take = this.strokeQueue.splice(0, MAX_PACKET_POINTS);
      const end = this.strokeEnd && this.strokeQueue.length === 0;
      const part = this.strokePart++;
      msg.stroke = { id: this.strokeId, part, pts: take.flatMap(([x, y]) => [quarter(x), quarter(y)]), ...(end ? { end: true } : {}) };
      reliable = end || part === 0;
      this.strokeDirty = this.strokeQueue.length > 0;
      if (end) {
        this.strokeId = 0;
        this.strokeEnd = false;
      }
    }
    // (a cursor taken off the map goes reliably: the cursor stays until then, and a lost packet would leave it stuck)
    if (msg.cursor === null) reliable = true;
    this.o.send(encode(msg), reliable);
    return this.wanted !== null || this.strokeDirty;
  }

  /** A packet from the other player. `ordered` says which channel it came on: the ordered channel never reorders, so its
   *  packets are never dropped as late; the other may, and a packet older than one already seen is dropped. Refused with a line
   *  when it is not a presence packet; never edits the map. */
  receive(payload: string, ordered: boolean): string | null {
    const d = decode(payload);
    if (!d.ok) return d.reason;
    if (d.message.kind !== "presence") return "Only presence travels on this channel";
    return this.accept(d.message, ordered);
  }

  /** A packet already decoded and checked. */
  accept(m: Presence, ordered: boolean): string | null {
    if (!ordered) {
      if (m.n <= this.inN) return null;
      this.inN = m.n;
    } else if (m.n > this.inN) this.inN = m.n;
    const who: Role = this.o.role === "host" ? "guest" : "host";
    const name = this.o.otherName() || (who === "host" ? "Host" : "Guest");
    const colour = PLAYER_COLOURS[who];
    if (m.stroke) {
      const s = m.stroke;
      // (a point of a stroke that has ended, arriving late, is not a new stroke)
      if (this.ended.includes(s.id) && !(ordered && s.part === 0 && !s.end)) return null;
      const fresh = !this.inStroke || this.inStroke.id !== s.id;
      const gap = !fresh && s.part !== this.inStroke!.part + 1;
      this.inStroke = { id: s.id, part: s.part };
      const points: [number, number][] = [];
      for (let i = 0; i + 1 < s.pts.length; i += 2) points.push([s.pts[i] / 4, s.pts[i + 1] / 4]);
      this.o.emit({ type: "stroke", who, name, colour, id: s.id, fresh, points, ended: !!s.end, gap });
      if (s.end) {
        this.inStroke = null;
        this.ended.push(s.id);
        if (this.ended.length > ENDED_KEPT) this.ended.shift();
      }
    } else if (m.stroke === null) {
      if (this.inStroke) this.ended.push(this.inStroke.id);
      this.inStroke = null;
    }
    if (m.cursor !== undefined || m.tool !== undefined || m.view !== undefined) {
      this.o.emit({
        type: "presence",
        who,
        name,
        colour,
        at: this.o.now(),
        ...(m.cursor !== undefined ? { cursor: m.cursor && ([m.cursor[0] / 4, m.cursor[1] / 4] as [number, number]) } : {}),
        ...(m.tool !== undefined ? { tool: m.tool } : {}),
        ...(m.view !== undefined ? { view: m.view } : {}),
      });
    }
    return null;
  }
}

function quarter(v: number): number {
  return Math.max(-64, Math.min(20000, Math.round((Number.isFinite(v) ? v : 0) * 4)));
}

function finiteView(v: View): boolean {
  return [v.x, v.y, v.z, v.dist, v.yaw, v.pitch].every((n) => Number.isFinite(n));
}
