// Undo and redo with two players (docs/COLLAB-BRIEF.md §5): each player takes back only their own actions, the last 50
// of them. Where another action has been built on the same ground since (a later active action, either player's, whose
// touch meets this one's write, or with the same identity), taking it back is refused, naming that action, and it stays
// in the history until its blocker is taken back. The rule itself is `RecordLog.blocker` (records.ts).
//
// An undo or a redo is an entry of the ordered log like any other: `{ kind: "undo" | "redo", target }` names the record
// of the player's own action, the host decides, and every peer decides the same from the same records. It restores the
// action's stored values: the action's operations leave the document (or return to it, at their place in its order),
// and the map that results is compared with the stored patch put on the map as it stood; a difference is refused, so an
// undo never leaves the map anything but the stored values (`MapApplier`).

import { nameOf, RECORD_LIMIT, type Block, type RecordLog } from "./records";
import type { TransactionRecord } from "./transaction";
import type { PlayerId } from "./types";

/** How a player is called in a sentence (the page knows names; the core knows ids). */
export type Names = (id: PlayerId) => string;

/** The one line a refusal is: "Emma's Raise in the north-east is on top of this". `viewer` is the player who reads it. */
export function blockLine(b: Block, viewer: PlayerId, names: Names = (id) => id): string {
  // (an action that is no longer in the records has no one to name)
  if (!b.label) return b.why === "on-top" ? "An older edit is on top of this" : "An earlier edit under this has changed for good";
  const what = `${b.author === viewer ? "Your" : `${names(b.author)}'s`} ${b.label}${b.where ? ` ${b.where}` : ""}`;
  return b.why === "on-top" ? `${what} is on top of this` : `${what}, which this was made on, has changed since`;
}

export type Found = { record: TransactionRecord } | { reason: string; block?: Block };

/** The record an undo (or a redo) names, or why the player cannot ask for it. Blocked ones are refused with their blocker. */
export function historyProblem(records: RecordLog, author: PlayerId, redo: boolean, target: number, names?: Names): Found {
  const r = records.all().find((x) => x.seq === target);
  if (!r) return { reason: `That action is not in your history (the last ${RECORD_LIMIT} of yours are kept)` };
  if (r.author !== author) return { reason: redo ? "You can only bring back your own actions" : "You can only take back your own actions" };
  if (!redo && r.undoneAt !== undefined) return { reason: `${nameOf(r)} is already taken back` };
  if (redo && r.undoneAt === undefined) return { reason: `${nameOf(r)} has not been taken back` };
  const b = records.blocker(r);
  return b ? { reason: blockLine(b, author, names), block: b } : { record: r };
}

export interface Skipped {
  seq: number;
  label: string;
  where: string;
  /** The refusal's line, naming what is in the way. */
  reason: string;
  /** What is in the way (author id, tool, place, sequence and the box of tiles it wrote), for the page to word with display names; absent when it was
   *  the veto that skipped it. */
  block?: Block;
}

/** Another reason to skip an action, asked of each candidate: claims (a mask test of `r.writes`), or a refusal the host already made for it.
 *  A line, or null to let it through. */
export type Veto = (r: TransactionRecord) => string | null;

/** What Undo (or Redo) does for a player now: the action it takes (null when none can be), and the ones it skipped on the way,
 *  each with what is in its way. */
export interface HistoryPlan {
  target: number | null;
  skipped: Skipped[];
  /** Why there is no target (one line), or null. */
  reason: string | null;
}

function plan(records: RecordLog, list: TransactionRecord[], redo: boolean, author: PlayerId, names?: Names, veto?: Veto): HistoryPlan {
  const skipped: Skipped[] = [];
  for (const r of list) {
    const found = historyProblem(records, author, redo, r.seq, names);
    if ("record" in found) {
      const refused = veto?.(r) ?? null;
      if (refused === null) return { target: r.seq, skipped, reason: null };
      skipped.push({ seq: r.seq, label: nameOf(r), where: r.where, reason: refused });
    } else skipped.push({ seq: r.seq, label: nameOf(r), where: r.where, reason: found.reason, ...(found.block ? { block: found.block } : {}) });
  }
  return { target: null, skipped, reason: skipped[0]?.reason ?? (redo ? "You have nothing to redo" : "You have nothing to undo") };
}

/** The player's action still standing that was done last (made, or brought back) and that nothing is built on; the ones above it
 *  that are blocked, or that `veto` refuses, are skipped. */
export function undoPlan(records: RecordLog, author: PlayerId, names?: Names, veto?: Veto): HistoryPlan {
  const own = records
    .byAuthor(author)
    .filter((r) => r.undoneAt === undefined)
    .sort((a, b) => (b.redoneAt ?? b.seq) - (a.redoneAt ?? a.seq));
  return plan(records, own, false, author, names, veto);
}

/** The action the player took back last that can come back; the ones before it that are blocked are skipped. */
export function redoPlan(records: RecordLog, author: PlayerId, names?: Names, veto?: Veto): HistoryPlan {
  const own = records
    .byAuthor(author)
    .filter((r) => r.undoneAt !== undefined)
    .sort((a, b) => b.undoneAt! - a.undoneAt!);
  return plan(records, own, true, author, names, veto);
}
