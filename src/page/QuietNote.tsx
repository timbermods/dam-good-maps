// A quiet note for a few seconds (docs/UI-BRIEF.md §6; PLAN §20 D234 (3)): never a dialog, never in
// the way. §6's note when an edited map is replaced ("<map name> is in Your maps. Undo to bring it
// back."), Your maps' undoable delete, and the candidates strip's short notification use it.

import { useEffect } from "preact/hooks";
import "./page.css";

/** How long a note stays, in ms. */
export const NOTE_MS = 5000;

export interface QuietNoteProps {
  text: string;
  /** A button after the text (Your maps' delete: "Undo"). */
  action?: { label: string; onClick(): void };
  ms?: number;
  /** The note's time is up (or its action was taken): the page removes it. */
  onDone(): void;
}

export function QuietNote(p: QuietNoteProps) {
  useEffect(() => {
    const t = setTimeout(p.onDone, p.ms ?? NOTE_MS);
    return () => clearTimeout(t);
  }, [p.text]);
  return (
    <div class="pg-note" role="status">
      <span>{p.text}</span>
      {p.action ? (
        <button
          type="button"
          class="ghost pg-note-action"
          onClick={() => {
            p.action!.onClick();
            p.onDone();
          }}
        >
          {p.action.label}
        </button>
      ) : null}
    </div>
  );
}

/** §6's words when an edited map is replaced. */
export function replacedText(name: string): string {
  return `${name} is in Your maps. Undo to bring it back.`;
}

/** §6: an edited map was replaced; it is kept in Your maps, and undo (the page's own) brings it
 *  back from memory. */
export function ReplacedNote({ name, onDone, ms }: { name: string; onDone(): void; ms?: number }) {
  return <QuietNote text={replacedText(name)} onDone={onDone} ms={ms} />;
}
