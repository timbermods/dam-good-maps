// The keyboard shortcuts as data: the one list the shortcuts panel shows (File → Keyboard shortcuts, or ?). The
// tools' keys are read from the lists that pick them (`BRUSHES`, `FORCES`), so a new tool or force appears here by
// itself; the other keys are listed once below, beside the code that handles them (keyboard/useKeyboard.ts, the
// camera in render3d/renderer.ts, the pointer in editor/select.ts and sources/useSourcePointer.ts). The panel only
// shows them: no key's behaviour is read from this list.

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

/** The panel's own key. */
export const SHORTCUTS_KEY = "?";

/** A force's line: its name as the bar shows it, then what it does ("Carve: a river"). */
const forceWhat = (name: string, hint?: string) => {
  const rest = hint?.toLowerCase().startsWith(`${name.toLowerCase()} `) ? hint.slice(name.length + 1) : hint;
  return rest ? `${name}: ${rest}` : name;
};

/** The groups, in the panel's order: the tools, holding them, the mouse, the view and editing. */
export function shortcutGroups(): readonly ShortcutGroup[] {
  return [
    {
      title: "Tools",
      rows: [
        { what: "Select", keys: ["1"] },
        ...BRUSHES.map((b) => ({ what: b.name, keys: [b.key] })),
        ...SHOWN_FORCES.map((f) => ({ what: forceWhat(f.name, f.hint), keys: [f.key ?? ""] })).filter((r) => r.keys[0]),
        { what: "Put the tool down", keys: ["X", "Esc"] },
      ],
    },
    {
      title: "Brushes, forces and items",
      rows: [
        { what: "Size", keys: [...SIZE_KEYS] },
        { what: "Strength or power", keys: STRENGTH_KEYS.filter((k) => k !== "F+scroll") },
        { what: "Turn the item in hand", keys: ["R"] },
        { what: "Flip the fault's side (Quake)", keys: ["V"] },
        { what: "Pause or resume a force at work", keys: ["Space"] },
        { what: "Skip a force to its end", keys: ["Esc"] },
      ],
    },
    {
      title: "With the mouse",
      rows: [
        { what: "Set the strength or power", keys: ["F+scroll"] },
        { what: "Set the level", keys: ["Shift+scroll", "Ctrl+click"] },
        { what: "Swap Raise and Lower as you paint", keys: ["Shift"] },
        { what: "Set a source's strength", keys: ["Ctrl+scroll"] },
        { what: "Add to the selection", keys: ["Shift+drag"] },
        { what: "Take from the selection", keys: ["Alt+drag"] },
        { what: "Hide the levels above a layer", keys: ["Alt+scroll"] },
        { what: "Jump to a tile's layer", keys: ["Alt+click"] },
      ],
    },
    {
      title: "View",
      rows: [
        { what: "Move the view", keys: ["W", "A", "S", "D", "\u2191", "\u2193", "\u2190", "\u2192"] },
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
        { what: "Selection up or down a level", keys: ["↑", "↓"] },
        { what: "Carve a river from a picked source", keys: ["U"] },
        { what: "Show this list", keys: [SHORTCUTS_KEY] },
      ],
    },
  ];
}
