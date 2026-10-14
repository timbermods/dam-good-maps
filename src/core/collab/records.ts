// The records of applied entries, kept by the host and every replica alike, and the history of each
// player's actions that undo with two players is built on (docs/COLLAB-BRIEF.md §5, undo.ts). Each
// player's last RECORD_LIMIT actions stay in it, undone ones too; an older one leaves, and if it was still
// standing its reach becomes a permanent fence: it can no longer be taken back, and neither can anything
// earlier that lies under it.
//
// An action is built on the same ground as an earlier one when the earlier one's write mask meets its
// touch mask, or their identity keys overlap (INTEGRATION.md, "What built on the same ground means").
// Taking an action back (or bringing it back) is blocked while an active later action is built on it.

import { forceLabel } from "../forces/op";
import type { Box } from "./place";
import type { TransactionRecord } from "./transaction";
import type { PlayerId } from "./types";

/** How many actions of each player stay undoable (docs/COLLAB-BRIEF.md §5). */
export const RECORD_LIMIT = 50;
/** What names an action in a refusal. */
export interface Who {
  author: PlayerId;
  /** The tool's on-screen name. */
  label: string;
  /** "at the north lake", "in the north-east", or "". */
  where: string;
  /** The box of tiles [x0, y0, x1, y1] the action wrote (null when it reached the whole map or wrote nothing), for the page to show. */
  box: Box | null;
}

/** Nobody in particular: the action is no longer in the records, so the line has no one to name. */
const UNKNOWN: Who = { author: "", label: "", where: "", box: null };

/** Why an action cannot be taken back or brought back now. `on-top`: a later action is built on its ground. `changed`: the
 *  earlier action it was made on has been taken back or brought back since. */
export interface Block extends Who {
  why: "on-top" | "changed";
  seq: number;
}

/** The permanent fences of the actions that have left the history, as they travel. */
export interface FencesJson {
  /** Runs of tiles [first, last, sequence of the latest evicted action that touched them]. */
  tiles: [number, number, number][];
  keys: [string, number][];
  who: [number, Who][];
}

/** The name a record goes by: the tool's on-screen name. */
export const nameOf = (r: TransactionRecord): string => {
  const f = r.ops[0];
  return f?.op === "forceResult" ? forceLabel(f.params) : r.label;
};

/** Whether `later` is built on `earlier`'s ground: its write mask meets the other's touch mask, or their identity keys overlap. */
export const builtOn = (earlier: TransactionRecord, later: TransactionRecord): boolean => earlier.writes.intersects(later.touch) || earlier.keys.some((k) => later.keys.includes(k));

const whoOf = (r: TransactionRecord): Who => ({ author: r.author, label: nameOf(r), where: r.where, box: r.box });

export class RecordLog {
  private list: TransactionRecord[] = [];
  private effectList: TransactionRecord[] = [];
  private fenceTile: Int32Array | null = null;
  private fenceKey = new Map<string, number>();
  private fenceWho = new Map<number, Who>();

  constructor(
    readonly limit = RECORD_LIMIT,
    readonly onEvict?: (r: TransactionRecord) => void,
  ) {}

  add(r: TransactionRecord): void {
    this.list.push(r);
    const own = this.list.filter((x) => x.author === r.author);
    if (own.length > this.limit) {
      const old = own[0];
      this.list.splice(this.list.indexOf(old), 1);
      if (old.undoneAt === undefined) this.fence(old);
      this.pruneFences();
      this.onEvict?.(old);
    }
  }

  /** The records kept, oldest first. */
  all(): readonly TransactionRecord[] {
    return this.list;
  }

  byAuthor(author: PlayerId): TransactionRecord[] {
    return this.list.filter((r) => r.author === author);
  }

  /** An action's record, or the record of an undo's or redo's effect (which is not an action of its own). */
  get(seq: number): TransactionRecord | undefined {
    return this.list.find((r) => r.seq === seq) ?? this.effectList.find((r) => r.seq === seq);
  }

  /** What an undo or a redo changed, kept for the water notes of the batch it settles with. */
  addEffect(r: TransactionRecord): void {
    this.effectList.push(r);
  }

  /** The water settled for the entries after `since`: the effects of that batch were the water note's to name, and the ones
   *  before it are not needed any more. Until a settle is announced they are all kept. */
  settled(since: number): void {
    this.effectList = this.effectList.filter((r) => r.seq > since);
  }

  clear(): void {
    this.list = [];
    this.effectList = [];
    this.fenceTile = null;
    this.fenceKey.clear();
    this.fenceWho.clear();
  }

  // ------------------------------------------------------------------------------------ taking back

  /** What stops `r` from being taken back (or, if it was, brought back), or null. Another player's block is named before one's
   *  own. Actions that left the history still block, through their fences. */
  blocker(r: TransactionRecord): Block | null {
    let own: Block | null = null;
    for (const l of this.list) {
      if (l.seq <= r.seq || l.undoneAt !== undefined || !builtOn(r, l)) continue;
      const b: Block = { why: "on-top", seq: l.seq, ...whoOf(l) };
      if (l.author !== r.author) return b;
      own ??= b;
    }
    if (own) return own;
    const gone = this.fenced(r);
    if (gone) return gone;
    if (r.undoneAt !== undefined && r.shifted?.length) {
      const x = this.get(r.shifted[0]);
      return { why: "changed", seq: r.shifted[0], ...(x ? whoOf(x) : UNKNOWN) };
    }
    return null;
  }

  /** `r` was taken back (`redo` false) or brought back (`redo` true) by the entry `at`. The actions made later on the same ground that
   *  are themselves taken back now rest on ground that changed: they can no longer be brought back unless it changes back. */
  setUndone(r: TransactionRecord, at: number, redo: boolean): void {
    if (redo) {
      delete r.undoneAt;
      r.redoneAt = at;
    } else r.undoneAt = at;
    delete r.shifted;
    for (const e of this.list) {
      if (e.seq <= r.seq || e.undoneAt === undefined || !builtOn(r, e)) continue;
      const now = new Set(e.shifted ?? []);
      if (!now.delete(r.seq)) now.add(r.seq);
      if (now.size) e.shifted = [...now].sort((a, b) => a - b);
      else delete e.shifted;
    }
  }

  // ------------------------------------------------------------------------------------ fences

  private fence(old: TransactionRecord): void {
    const N = old.touch.N;
    const tiles = (this.fenceTile ??= new Int32Array(N));
    for (const i of old.touch.tiles()) if (tiles[i] < old.seq) tiles[i] = old.seq;
    for (const k of old.keys) if ((this.fenceKey.get(k) ?? 0) < old.seq) this.fenceKey.set(k, old.seq);
    this.fenceWho.set(old.seq, whoOf(old));
  }

  /** A fence blocks only what is earlier than it: once every record kept is later, it can never block anything, so it goes (and
   *  with it who it was, once nothing refers to it). */
  private pruneFences(): void {
    const oldest = this.list.reduce((m, r) => Math.min(m, r.seq), Infinity);
    const tiles = this.fenceTile;
    if (tiles) for (let i = 0; i < tiles.length; i++) if (tiles[i] && tiles[i] < oldest) tiles[i] = 0;
    for (const [k, s] of [...this.fenceKey]) if (s < oldest) this.fenceKey.delete(k);
    const live = new Set<number>(this.fenceKey.values());
    for (const v of tiles ?? []) if (v) live.add(v);
    for (const s of [...this.fenceWho.keys()]) if (!live.has(s)) this.fenceWho.delete(s);
  }

  private fenced(r: TransactionRecord): Block | null {
    const tiles = this.fenceTile;
    let hit = 0;
    if (tiles) for (const i of r.writes.tiles()) if (tiles[i] > r.seq) hit = Math.max(hit, tiles[i]);
    for (const k of r.keys) {
      const s = this.fenceKey.get(k) ?? 0;
      if (s > r.seq) hit = Math.max(hit, s);
    }
    if (!hit) return null;
    return { why: "on-top", seq: hit, ...(this.fenceWho.get(hit) ?? UNKNOWN) };
  }

  fences(): FencesJson {
    const tiles: [number, number, number][] = [];
    const t = this.fenceTile;
    if (t) {
      let start = -1;
      for (let i = 0; i <= t.length; i++) {
        if (start >= 0 && (i === t.length || t[i] !== t[start])) {
          tiles.push([start, i - 1, t[start]]);
          start = -1;
        }
        if (start < 0 && i < t.length && t[i]) start = i;
      }
    }
    return { tiles, keys: [...this.fenceKey].sort((a, b) => (a[0] < b[0] ? -1 : 1)), who: [...this.fenceWho].sort((a, b) => a[0] - b[0]).map(([s, w]) => [s, { ...w }]) };
  }

  /** Take the fences of a snapshot (a map of `N` tiles). */
  restoreFences(N: number, j: FencesJson): void {
    this.fenceTile = j.tiles.length ? new Int32Array(N) : null;
    for (const [a, b, s] of j.tiles) {
      if (a < 0 || b >= N || a > b) throw new Error(`the fence [${a}, ${b}] is outside the map`);
      this.fenceTile!.fill(s, a, b + 1);
    }
    this.fenceKey = new Map(j.keys);
    this.fenceWho = new Map(j.who.map(([s, w]) => [s, { ...w }]));
  }
}
