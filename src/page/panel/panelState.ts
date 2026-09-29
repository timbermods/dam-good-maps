// The side panel's state (docs/UI-BRIEF.md §3, PLAN §20 D330): collapsible to a thin strip, open on
// the first visit, then as it was left. Kept in localStorage like the editor's other small
// preferences (the sound, the brush); browser storage can be missing (private windows, blocked site
// data), and then the panel simply opens.

/** The switch at the panel's top: Generate · Real places · Pick a place. */
export type PanelMode = "generate" | "places" | "pick";

export const PANEL_MODES: readonly { mode: PanelMode; label: string }[] = [
  { mode: "generate", label: "Generate" },
  { mode: "places", label: "Real places" },
  { mode: "pick", label: "Pick a place" },
];

export const PANEL_KEY = "dgm.panel";

interface Store {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

function store(): Store | null {
  try {
    return (globalThis as { localStorage?: Store }).localStorage ?? null;
  } catch {
    return null;
  }
}

/** Whether the panel is open: open on the first visit (nothing stored), then as it was left. */
export function loadPanelOpen(): boolean {
  try {
    return store()?.getItem(PANEL_KEY) !== "collapsed";
  } catch {
    return true;
  }
}

export function savePanelOpen(open: boolean): void {
  try {
    store()?.setItem(PANEL_KEY, open ? "open" : "collapsed");
  } catch {
    // not remembered; the panel still works
  }
}
