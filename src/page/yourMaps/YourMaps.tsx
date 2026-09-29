// Your maps in the side panel (PLAN §20 D234, amended by D330; docs/UI-BRIEF.md §3): the recent
// and starred edited maps, newest first, each with its thumbnail, name and when it was last edited.
// A click on the picture reopens a map exactly as it was left; a click on the name renames it; a
// star keeps it for good; Copy makes a copy to try an idea on; Delete is undoable for a few seconds.
// A mark shows a map whose latest version is already saved to Timberborn. It says plainly that it
// lives in this browser, and when storage runs out. No folders, tags or search: a calm list. On a
// phone (view-only, D185) it is only browsed.

import { useRef, useState } from "preact/hooks";
import { QuietNote } from "../QuietNote";
import { whenText } from "./when";
import type { YourMapEntry } from "./store";
import "../page.css";

export interface YourMapsProps {
  /** Newest edit first (`store.list()`). */
  entries: readonly YourMapEntry[];
  /** The map shown now, if it is one of these. */
  currentId?: string | null;
  onOpen(id: string): void;
  onRename(id: string, name: string): void;
  onStar(id: string, starred: boolean): void;
  onCopy(id: string): void;
  /** Delete; `onUndoDelete` brings it back while the note shows. */
  onDelete(id: string): void;
  onUndoDelete(id: string): void;
  /** A storage problem in plain words (`storeProblem`), or null. */
  problem?: string | null;
  /** Phones: browse and open only. */
  browseOnly?: boolean;
  /** The time "now" for "5 minutes ago" (tests pin it). */
  now?: Date;
}

export const LIVES_HERE = "Your maps live in this browser. Download the project file or save to Timberborn to keep a map for good.";

export function YourMaps(p: YourMapsProps) {
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleted, setDeleted] = useState<{ id: string; name: string } | null>(null);
  const cancelRename = useRef(false);
  const now = p.now ?? new Date();
  if (!p.entries.length && !p.problem && !deleted) return null;
  return (
    <section class="pg-your-maps" aria-labelledby="pg-your-maps-title">
      <h2 id="pg-your-maps-title" class="pg-section-title">
        Your maps
      </h2>
      {p.problem ? (
        <p class="pg-problem" role="alert">
          {p.problem}
        </p>
      ) : null}
      <ul class="pg-map-list">
        {p.entries.map((e) => (
          <li key={e.id} class="pg-map" data-id={e.id} aria-current={p.currentId === e.id ? "true" : undefined}>
            <button type="button" class="pg-map-open" title={`Open ${e.name}`} onClick={() => p.onOpen(e.id)}>
              {e.thumbnail ? <img src={e.thumbnail} alt="" width={48} height={48} /> : <span class="pg-thumb-blank" aria-hidden="true" />}
              <span class="pg-sr">Open {e.name}</span>
            </button>
            <div class="pg-map-text">
              {renaming === e.id && !p.browseOnly ? (
                <input
                  class="pg-map-rename"
                  aria-label="Map name"
                  defaultValue={e.name}
                  ref={(el) => el?.focus()}
                  onKeyDown={(ev) => {
                    // Enter keeps the name, Esc keeps the old one; either ends renaming through blur
                    if (ev.key === "Escape") {
                      ev.stopPropagation();
                      cancelRename.current = true;
                    }
                    if (ev.key === "Enter" || ev.key === "Escape") (ev.currentTarget as HTMLInputElement).blur();
                  }}
                  onBlur={(ev) => {
                    const name = (ev.currentTarget as HTMLInputElement).value.trim();
                    if (!cancelRename.current && name && name !== e.name) p.onRename(e.id, name);
                    cancelRename.current = false;
                    setRenaming(null);
                  }}
                />
              ) : p.browseOnly ? (
                <span class="pg-map-name">{e.name}</span>
              ) : (
                <button type="button" class="pg-map-name link" title="Rename" onClick={() => setRenaming(e.id)}>
                  {e.name}
                </button>
              )}
              <span class="pg-muted pg-map-when">
                {whenText(e.editedAt, now)}
                {e.savedToTimberborn !== null && e.savedToTimberborn === e.revision ? <span class="pg-saved-mark"> · saved to Timberborn</span> : null}
              </span>
            </div>
            {p.browseOnly ? null : (
              <div class="pg-map-actions">
                <button type="button" class="ghost pg-star" aria-pressed={e.starred} title={e.starred ? "Starred: kept for good" : "Star: keep for good"} onClick={() => p.onStar(e.id, !e.starred)}>
                  <span aria-hidden="true">{e.starred ? "★" : "☆"}</span>
                  <span class="pg-sr">Star {e.name}</span>
                </button>
                <button type="button" class="ghost" title="Make a copy" onClick={() => p.onCopy(e.id)}>
                  Copy
                </button>
                <button
                  type="button"
                  class="ghost"
                  title="Delete"
                  onClick={() => {
                    setDeleted({ id: e.id, name: e.name });
                    p.onDelete(e.id);
                  }}
                >
                  Delete
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {deleted ? <QuietNote key={deleted.id} text={`${deleted.name} deleted.`} action={{ label: "Undo", onClick: () => p.onUndoDelete(deleted.id) }} onDone={() => setDeleted(null)} /> : null}
      <p class="pg-muted pg-lives-here">{LIVES_HERE}</p>
    </section>
  );
}
