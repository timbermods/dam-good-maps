// The keyboard shortcuts as data: the one list the shortcuts panel shows (File → Keyboard shortcuts, or ?). The
// tools' keys are read from the lists that pick them (`BRUSHES`, `FORCES`), so a new tool or force appears here by
// itself; the other keys are listed once below, beside the code that handles them (keyboard/useKeyboard.ts, the
// camera in render3d/renderer.ts). The panel only shows them: no key's behaviour is read from this list.

import { BRUSHES } from "../brushes";
import { SHOWN_FORCES, SIZE_KEYS, STRENGTH_KEYS } from "../TopBar";

/** One line of the panel: what the key does, and the keys that do it (any one of them; each shows as a key cap). */
export interface Shortcut {
  what: string;
  keys: readonly string[];
}

export interface ShortcutGroup {
  title: string;
  rows: readonly Shortcut[];
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The panel's own key. */
export const SHORTCUTS_KEY = "?";

/** The groups, in the panel's order: the tools, then holding them, the view and editing. */
export function shortcutGroups(): readonly ShortcutGroup[] {
  return [
    {
      title: "Tools",
      rows: [
        { what: "Mark an area to change", keys: ["1"] },
        ...BRUSHES.map((b) => ({ what: capital(b.hint), keys: [b.key] })),
        ...SHOWN_FORCES.map((f) => ({ what: capital(f.hint ?? f.name), keys: [f.key ?? ""] })).filter((r) => r.keys[0]),
        { what: "Put the tool down", keys: ["X", "Esc"] },
      ],
    },
    {
      title: "Brushes, forces and objects",
      rows: [
        { what: "Size", keys: [...SIZE_KEYS] },
        { what: "Strength or power", keys: [...STRENGTH_KEYS] },
        { what: "Turn the object in hand", keys: ["R"] },
        { what: "Flip the fault's side (Quake)", keys: ["V"] },
        { what: "Pause or resume a force at work", keys: ["Space"] },
        { what: "Skip a force to its end", keys: ["Esc"] },
      ],
    },
    {
      title: "View",
      rows: [
        { what: "Move the view", keys: ["W", "A", "S", "D", "Arrows"] },
        { what: "Turn the view", keys: ["Q", "E"] },
        { what: "Move faster", keys: ["Shift"] },
        { what: "Zoom", keys: ["+", "-"] },
        { what: "Show markers", keys: ["M"] },
        { what: "See through the water", keys: ["T"] },
        { what: "Keep this view in a slot", keys: ["Ctrl+Shift+1–9"] },
        { what: "Go back to a kept view", keys: ["Alt+1–9"] },
        { what: "Step a weather day back or on", keys: ["←", "→"] },
      ],
    },
    {
      title: "Editing",
      rows: [
        { what: "Undo", keys: ["Z", "Ctrl+Z"] },
        { what: "Redo", keys: ["C", "Ctrl+Y"] },
        { what: "Delete what you point at", keys: ["Delete"] },
        { what: "Select the whole map", keys: ["Ctrl+A"] },
        { what: "Selection up or down a level", keys: ["Up", "Down"] },
        { what: "Carve a river from a picked source", keys: ["U"] },
        { what: "Show this list", keys: [SHORTCUTS_KEY] },
      ],
    },
  ];
}
