// First run (PLAN §20 D184): three one-line hints, each gone once it is done (paint the land, place
// things, add water), and never again after the three, or after the ×. Kept in the browser.

import { tip } from "../ui/Tooltip";

const KEY = "dgm.firstRun";

export type FirstStep = "paint" | "place" | "water";

const LINES: [FirstStep, string][] = [
  ["paint", "Shape the land: click the map with Carve below, or drag a brush."],
  ["place", "Place things: pick one on the right, then click the map, or drag it there."],
  ["water", "Add water: pick Water source on the right, then click where the water starts."],
];

/** The steps done so far (all three when the hints are over). */
export function loadFirstRun(): Set<FirstStep> {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "done") return new Set(LINES.map(([k]) => k));
    return new Set((JSON.parse(v ?? "[]") as FirstStep[]).filter((k) => LINES.some(([s]) => s === k)));
  } catch {
    return new Set();
  }
}

export function saveFirstRun(done: Set<FirstStep>): void {
  try {
    localStorage.setItem(KEY, done.size >= LINES.length ? "done" : JSON.stringify([...done]));
  } catch {
    // the hints come back next time
  }
}

/** The hints with all three lines, unseen: the width the hints and every message above the bar share (Kyler,
 *  2026-10-05), measured in the player's own font, whatever lines are left or whether the hints show at all. */
export function FirstRunSizer() {
  return (
    <div class="map-note note-sizer" aria-hidden="true">
      <ul>
        {LINES.map(([k, words]) => (
          <li key={k}>{words}</li>
        ))}
      </ul>
      <span class="icon-close">×</span>
    </div>
  );
}

export function FirstRun(p: { done: Set<FirstStep>; onClose(): void; onHelp(): void }) {
  const left = LINES.filter(([k]) => !p.done.has(k));
  if (!left.length) return null;
  return (
    <div class="map-note first-run" role="status" aria-label="First steps">
      <ul>
        {left.map(([k, words]) => (
          <li key={k}>{words}</li>
        ))}
      </ul>
      {/* Help sits only in File otherwise: the hints say where to find it (usability audits, 2026-10-25) */}
      <div class="first-run-help">
        <button type="button" class="linkish" {...tip("How to make a map and save it")} onClick={p.onHelp}>
          Help and keys
        </button>
      </div>
      <button type="button" class="icon-close" aria-label="No more hints" title="No more hints" onClick={p.onClose}>
        ×
      </button>
    </div>
  );
}
