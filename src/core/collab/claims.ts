// Claims (collaborative editing; D362, D486; docs/COLLAB-BRIEF.md §2 and §3). Headless, plain data (D342).
//
// Who holds which ground, over arbitrary shapes: Select's shapes arrive as [y, x0, x1] runs (the same
// runs as ops.schema.json). A player claims only unclaimed ground (any size), releases all or part of
// it, or offers it to the other player, who accepts or declines; an offer dies the moment its ground
// changes hands. Every command is checked against claims.schema.json and refused with a one-line plain
// reason, never silently clamped. Claims are an editing tool only: nothing here is a map, a project or
// a .timber, and nothing in them reaches the saved bytes (tests/contract/collabClaims.test.ts proves it).
//
// An edit reaching into the other player's claim is refused (§3): `refusal` / `check` read the tiles an
// edit writes. The host's record of an applied entry already holds its exact write mask, so `check`
// takes that mask directly; `refusal(ops, ...)` works one out from the operations (footprint.ts) for the
// page, which asks before release. `reachInto` lists the tiles that would land in the other's area, for
// the page to show in that player's colour while the stroke is drawn.
//
// Adapted from investigation/collab-architecture (`architecture.ts` `Claims`), which was built against an
// older commit: its single revision-wide offer reset is replaced by the precise rule above, and its
// refusals are plain sentences.

import type { EditOp } from "../doc/ops";
import type { MapSession } from "../doc/session";
import { checkSchema } from "../spec/schema";
import { footprintOf, type Footprint, type MapView, type TileMask } from "./footprint";
import schema from "./claims.schema.json" with { type: "json" };

export type PlayerId = "host" | "guest";
export const PLAYERS: readonly PlayerId[] = ["host", "guest"];
export const otherPlayer = (p: PlayerId): PlayerId => (p === "host" ? "guest" : "host");
const CODE: Record<PlayerId, number> = { host: 1, guest: 2 };

/** The names the players go by (the session's, not the map's). */
export interface PlayerNames {
  host: string;
  guest: string;
}
export const DEFAULT_NAMES: PlayerNames = { host: "Host", guest: "Guest" };

type Runs = [number, number, number][];

/** What a player asks of the claims. `runs` come from Select's shape; release and offer without `runs`
 *  mean all of the player's own ground. */
export type ClaimCommand =
  | { kind: "claim"; runs: Runs }
  | { kind: "release"; runs?: Runs }
  | { kind: "offer"; runs?: Runs }
  | { kind: "accept"; offer: number }
  | { kind: "decline"; offer: number };

/** An offer waiting for its answer: ground `from` holds, offered to `to`. */
export interface ClaimOffer {
  id: number;
  from: PlayerId;
  to: PlayerId;
  /** y · W + x, ascending. */
  tiles: number[];
}

export type ClaimResult = { ok: true; changed: number[]; offer?: ClaimOffer } | { ok: false; reason: string };

/** The claims' snapshot (claims.schema.json `snapshot`): what a rejoining player is sent. */
export interface ClaimsSnapshot {
  version: 1;
  W: number;
  H: number;
  revision: number;
  nextOffer: number;
  host: Runs;
  guest: Runs;
  offers: { id: number; from: PlayerId; to: PlayerId; runs: Runs }[];
}

const root = (ref: string) => ({ $defs: (schema as { $defs: unknown }).$defs, $ref: `#/$defs/${ref}` }) as Record<string, unknown>;
const MAX_OFFERS = 64;

function oneLine(path: string, message: string, what: string): string {
  const where = path.replace(/^\//, "").replace(/\//g, " ");
  return `${what}: ${where ? `${where} ` : ""}${message}`;
}

/** A command as it arrived (JSON), checked against the schema; one line of reason when it is not one. */
export function parseCommand(json: unknown): { ok: true; command: ClaimCommand } | { ok: false; reason: string } {
  const errors = checkSchema(root("command"), json);
  if (errors.length) return { ok: false, reason: oneLine(errors[0].path, errors[0].message, "Not a claim command") };
  return { ok: true, command: json as ClaimCommand };
}

const tilesToRuns = (tiles: readonly number[], W: number): Runs => {
  const out: Runs = [];
  for (const t of tiles) {
    const x = t % W;
    const y = (t - x) / W;
    const last = out[out.length - 1];
    if (last && last[0] === y && last[2] === x - 1) last[2] = x;
    else out.push([y, x, x]);
  }
  return out;
};

export class ClaimsState {
  /** Per tile: 0 unclaimed, 1 the host's, 2 the guest's. */
  readonly owner: Uint8Array;
  /** Counts every change of who holds what: a force previewed against an older one is stale (§3). */
  revision = 0;
  offers: ClaimOffer[] = [];
  private nextOffer = 1;

  constructor(readonly W: number, readonly H: number) {
    this.owner = new Uint8Array(W * H);
  }

  static code(p: PlayerId): number {
    return CODE[p];
  }

  ownerOf(i: number): PlayerId | null {
    const c = this.owner[i];
    return c === 1 ? "host" : c === 2 ? "guest" : null;
  }

  tilesOf(p: PlayerId): number[] {
    const out: number[] = [];
    const c = CODE[p];
    for (let i = 0; i < this.owner.length; i++) if (this.owner[i] === c) out.push(i);
    return out;
  }

  countOf(p: PlayerId): number {
    let n = 0;
    const c = CODE[p];
    for (let i = 0; i < this.owner.length; i++) if (this.owner[i] === c) n++;
    return n;
  }

  /** The tiles of `runs`, ascending and once each, or why they are not a shape on this map. */
  resolve(runs: unknown): { ok: true; tiles: number[] } | { ok: false; reason: string } {
    const errors = checkSchema(root("runs"), runs);
    if (errors.length) return { ok: false, reason: oneLine(errors[0].path, errors[0].message, "Not a shape") };
    const seen = new Uint8Array(this.W * this.H);
    for (const [y, x0, x1] of runs as Runs) {
      if (x0 > x1 || y >= this.H || x1 >= this.W) return { ok: false, reason: "Part of that shape is off the map" };
      for (let x = x0; x <= x1; x++) seen[y * this.W + x] = 1;
    }
    const tiles: number[] = [];
    for (let i = 0; i < seen.length; i++) if (seen[i]) tiles.push(i);
    return { ok: true, tiles };
  }

  /** Why `by` cannot give `command` now, or null. Changes nothing. */
  refusal(by: PlayerId, command: ClaimCommand, names: PlayerNames = DEFAULT_NAMES): string | null {
    const r = this.plan(by, command, names);
    return r.ok ? null : r.reason;
  }

  /** Give a command. When it is refused nothing changes, and the reason is one plain line. */
  apply(by: PlayerId, command: ClaimCommand, names: PlayerNames = DEFAULT_NAMES): ClaimResult {
    const plan = this.plan(by, command, names);
    if (!plan.ok) return plan;
    const me = CODE[by];
    switch (command.kind) {
      case "claim":
        for (const i of plan.tiles) this.owner[i] = me;
        break;
      case "release":
        for (const i of plan.tiles) this.owner[i] = 0;
        break;
      case "accept":
        for (const i of plan.tiles) this.owner[i] = me;
        this.offers = this.offers.filter((o) => o.id !== plan.offer!.id);
        break;
      case "decline":
        this.offers = this.offers.filter((o) => o.id !== plan.offer!.id);
        return { ok: true, changed: [] };
      case "offer": {
        const offer: ClaimOffer = { id: this.nextOffer++, from: by, to: otherPlayer(by), tiles: plan.tiles };
        this.offers.push(offer);
        return { ok: true, changed: [], offer };
      }
    }
    this.revision++;
    this.dropStaleOffers();
    return { ok: true, changed: plan.tiles };
  }

  /** The offers whose ground is no longer all its offerer's are gone: it changed hands first. */
  private dropStaleOffers(): void {
    this.offers = this.offers.filter((o) => o.tiles.every((i) => this.owner[i] === CODE[o.from]));
  }

  private plan(by: PlayerId, command: ClaimCommand, names: PlayerNames): { ok: true; tiles: number[]; offer?: ClaimOffer } | { ok: false; reason: string } {
    const bad = checkSchema(root("command"), command);
    if (bad.length) return { ok: false, reason: oneLine(bad[0].path, bad[0].message, "Not a claim command") };
    const me = CODE[by];
    const them = otherPlayer(by);
    const fail = (reason: string) => ({ ok: false as const, reason });
    const shape = (runs: Runs | undefined) => (runs ? this.resolve(runs) : { ok: true as const, tiles: this.tilesOf(by) });
    switch (command.kind) {
      case "claim": {
        const s = shape(command.runs);
        if (!s.ok) return s;
        if (s.tiles.some((i) => this.owner[i] === CODE[them])) return fail(`That includes ${names[them]}'s area`);
        if (s.tiles.every((i) => this.owner[i] === me)) return fail("That ground is already yours");
        return { ok: true, tiles: s.tiles.filter((i) => this.owner[i] === 0) };
      }
      case "release": {
        const s = shape(command.runs);
        if (!s.ok) return s;
        if (s.tiles.some((i) => this.owner[i] === CODE[them])) return fail(`That includes ${names[them]}'s area`);
        const own = s.tiles.filter((i) => this.owner[i] === me);
        if (!own.length) return fail(command.runs ? "None of that ground is yours" : "You have no area to release");
        return { ok: true, tiles: own };
      }
      case "offer": {
        const s = shape(command.runs);
        if (!s.ok) return s;
        if (s.tiles.some((i) => this.owner[i] === CODE[them])) return fail(`That includes ${names[them]}'s area`);
        if (!s.tiles.length || s.tiles.some((i) => this.owner[i] !== me)) return fail(command.runs ? "Only ground you have claimed can be offered" : "You have no area to offer");
        if (this.offers.length >= MAX_OFFERS) return fail("Too many offers are waiting");
        return { ok: true, tiles: s.tiles };
      }
      case "accept":
      case "decline": {
        const offer = this.offers.find((o) => o.id === command.offer);
        if (!offer) return fail("That offer is no longer available");
        // (the offerer may take an offer back by declining it)
        if (command.kind === "accept" && offer.to !== by) return fail("That offer is not for you");
        if (command.kind === "decline" && offer.to !== by && offer.from !== by) return fail("That offer is not for you");
        if (!offer.tiles.every((i) => this.owner[i] === CODE[offer.from])) return fail("That ground changed hands first");
        return { ok: true, tiles: offer.tiles, offer };
      }
    }
  }

  clone(): ClaimsState {
    const c = new ClaimsState(this.W, this.H);
    c.owner.set(this.owner);
    c.revision = this.revision;
    c.offers = this.offers.map((o) => ({ ...o, tiles: o.tiles.slice() }));
    c.nextOffer = this.nextOffer;
    return c;
  }

  toSnapshot(): ClaimsSnapshot {
    return {
      version: 1,
      W: this.W,
      H: this.H,
      revision: this.revision,
      nextOffer: this.nextOffer,
      host: tilesToRuns(this.tilesOf("host"), this.W),
      guest: tilesToRuns(this.tilesOf("guest"), this.W),
      offers: this.offers.map((o) => ({ id: o.id, from: o.from, to: o.to, runs: tilesToRuns(o.tiles, this.W) })),
    };
  }

  /** A snapshot a rejoining player was sent, checked: against the schema, the map's size and the claims'
   *  own rules (no tile held by both, an offer only of its offerer's ground). */
  static fromSnapshot(json: unknown, W: number, H: number): { ok: true; claims: ClaimsState } | { ok: false; reason: string } {
    const errors = checkSchema(root("snapshot"), json);
    if (errors.length) return { ok: false, reason: oneLine(errors[0].path, errors[0].message, "Not a claims snapshot") };
    const s = json as ClaimsSnapshot;
    if (s.W !== W || s.H !== H) return { ok: false, reason: "The claims are for a map of another size" };
    const c = new ClaimsState(W, H);
    for (const p of PLAYERS) {
      if (!s[p].length) continue;
      const r = c.resolve(s[p]);
      if (!r.ok) return r;
      for (const i of r.tiles) {
        if (c.owner[i]) return { ok: false, reason: "The claims overlap" };
        c.owner[i] = CODE[p];
      }
    }
    for (const o of s.offers) {
      const r = c.resolve(o.runs);
      if (!r.ok) return r;
      if (o.from === o.to || !r.tiles.every((i) => c.owner[i] === CODE[o.from])) return { ok: false, reason: "An offer is of ground its offerer does not hold" };
      c.offers.push({ id: o.id, from: o.from, to: o.to, tiles: r.tiles });
    }
    c.revision = s.revision;
    c.nextOffer = s.nextOffer;
    return { ok: true, claims: c };
  }
}

// ------------------------------------------------------------------------------------ edits

/** Tiles an edit writes, as a mask: a footprint, a tile mask, a per-tile byte mask (W · H long) or a
 *  list of tiles (y · W + x). */
export type WriteSet = Footprint | { has(i: number): boolean } | Uint8Array | readonly number[];

function hasOf(w: WriteSet, N: number): (i: number) => boolean {
  if (Array.isArray(w)) {
    const set = new Uint8Array(N);
    for (const i of w as readonly number[]) if (i >= 0 && i < N) set[i] = 1;
    return (i) => set[i] === 1;
  }
  if (w instanceof Uint8Array) return (i) => w[i] !== 0;
  const tiles = (w as Footprint).tiles;
  if (tiles && typeof (tiles as TileMask).has === "function") return (i) => (tiles as TileMask).has(i);
  return (i) => (w as { has(i: number): boolean }).has(i);
}

/** The tiles of the other player's area that an edit by `by` would write: what the page shows in that
 *  player's colour ("reaches into <name>'s area"). */
export function reachInto(writes: WriteSet, claims: ClaimsState, by: PlayerId): number[] {
  const has = hasOf(writes, claims.owner.length);
  const theirs = CODE[otherPlayer(by)];
  const out: number[] = [];
  for (let i = 0; i < claims.owner.length; i++) if (claims.owner[i] === theirs && has(i)) out.push(i);
  return out;
}

/** The refusal for an edit that writes `writes`: it may not reach into the other player's area (§3). One
 *  plain line, or null when it does not. */
export function refusalForWrites(writes: WriteSet, claims: ClaimsState, by: PlayerId, names: PlayerNames = DEFAULT_NAMES): string | null {
  const has = hasOf(writes, claims.owner.length);
  const theirs = CODE[otherPlayer(by)];
  for (let i = 0; i < claims.owner.length; i++) if (claims.owner[i] === theirs && has(i)) return `Reaches into ${names[otherPlayer(by)]}'s area`;
  return null;
}

/** The refusal for an edit (one operation, or the operations of a step): its footprint may not reach
 *  into the other player's area. The step is refused whole. Water never counts (it flows across claims,
 *  waterNotes.ts). */
export function refusal(ops: EditOp | readonly EditOp[], claims: ClaimsState, by: PlayerId, map: MapView & Partial<MapSession>, names: PlayerNames = DEFAULT_NAMES): string | null {
  const theirs = CODE[otherPlayer(by)];
  if (!claims.owner.some((c) => c === theirs)) return null;
  return refusalForWrites(footprintOf(ops, map), claims, by, names);
}

/** What the host's check is given about an edit it has applied: the record holds the exact tiles the entry
 *  wrote (`W`, or `writes`). */
export interface WriteRecord {
  W?: WriteSet;
  writes?: WriteSet;
}

/** What the check reads: the claims, and the players' names. */
export interface ClaimsView {
  claims: ClaimsState;
  names?: PlayerNames;
}

/** The seam the host's log calls after applying an entry, with the entry's record: a reason to roll it back
 *  (the entry reaches into the other player's area), or null. `entry.by` is the author. A record without
 *  a write mask (a claim command, a presence note) reaches nowhere. */
export function check(entry: { by: PlayerId }, record: WriteRecord | null | undefined, view: ClaimsView): string | null {
  const writes = record?.W ?? record?.writes;
  if (!writes) return null;
  return refusalForWrites(writes, view.claims, entry.by, view.names ?? DEFAULT_NAMES);
}
