// Enter in the Generate panel (docs/UI-BRIEF.md §5, PLAN §20 D330): Generate runs only when its
// button is pressed, or Enter in the panel; a settings change never regenerates. Whether the settings
// differ from the shown map's is a core question (src/core/spec/differ.ts).

/** What `generateOnEnter` reads of a keyboard event. */
export interface EnterEvent {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  metaKey: boolean;
  isComposing?: boolean;
  repeat?: boolean;
  target: EventTarget | null;
}

/** Elements where Enter already means something of their own: a button or link presses, a
 *  section opens, a text area takes a new line. */
const OWN_ENTER = new Set(["BUTTON", "A", "SUMMARY", "TEXTAREA", "SELECT"]);

/** Whether a key press in the Generate panel is its Enter: plain Enter, not while composing text
 *  (an IME), not held down, and not on an element where Enter does something of its own. */
export function generateOnEnter(e: EnterEvent): boolean {
  if (e.key !== "Enter" || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.isComposing || e.repeat) return false;
  const t = e.target as { tagName?: string; isContentEditable?: boolean; type?: string } | null;
  if (!t || typeof t.tagName !== "string") return true;
  if (OWN_ENTER.has(t.tagName.toUpperCase()) || t.isContentEditable) return false;
  // an <input type="button|submit|reset|checkbox|radio"> acts on Enter or Space itself
  if (t.tagName.toUpperCase() === "INPUT" && /^(button|submit|reset|image)$/i.test(t.type ?? "")) return false;
  return true;
}
