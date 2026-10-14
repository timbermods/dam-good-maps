// The records of applied entries, kept by the host and every replica alike. Undo with two players
// (a later piece) is built on them: each player's last RECORD_LIMIT actions stay undoable, and an
// older one leaves through `onEvict`, where undo turns what it touched into a permanent fence.

import type { TransactionRecord } from "./transaction";
import type { PlayerId } from "./types";

/** How many actions of each player stay undoable (docs/COLLAB-BRIEF.md §5). */
export const RECORD_LIMIT = 50;

export class RecordLog {
  private list: TransactionRecord[] = [];

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

  get(seq: number): TransactionRecord | undefined {
    return this.list.find((r) => r.seq === seq);
  }

  clear(): void {
    this.list = [];
  }
}
